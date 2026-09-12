import { getD1, getDb } from "@/db";
import { clients, type ClientStatus } from "@/db/schema";
import { normalizePersonName, optionalText, validUrl } from "@/lib/legal";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const result = await getD1().prepare(`
      SELECT c.id, c.name, c.cpf, c.phone, c.email, c.drive_folder_url AS driveFolderUrl,
        c.status, c.source, c.updated_at AS updatedAt,
        COUNT(DISTINCT CASE WHEN p.status IN ('ACTIVE','AWAITING_COMPLIANCE','ON_APPEAL') THEN p.id END) AS activeProcessCount,
        MAX(COALESCE(i.availability_date, p.last_movement_at)) AS lastMovementAt,
        MIN(CASE WHEN p.status IN ('ACTIVE','AWAITING_COMPLIANCE','ON_APPEAL') AND p.fatal_deadline >= date('now') THEN p.fatal_deadline END) AS nextDeadline,
        MIN(CASE WHEN p.status IN ('ACTIVE','AWAITING_COMPLIANCE','ON_APPEAL') THEN p.area END) AS mainArea,
        MAX(CASE WHEN i.status NOT IN ('COMPLETED','REVIEWED','NO_ACTION') AND (i.classification = 'POSSIBLE_DEADLINE' OR i.status = 'NEEDS_CONFIRMATION') THEN 1 ELSE 0 END) AS hasAction,
        MAX(CASE WHEN i.status = 'NEW' THEN 1 ELSE 0 END) AS hasNewMovement,
        GROUP_CONCAT(DISTINCT p.process_number) AS processNumbers,
        GROUP_CONCAT(DISTINCT p.status) AS processStatuses,
        GROUP_CONCAT(DISTINCT p.area) AS areas,
        GROUP_CONCAT(DISTINCT p.parties) AS parties,
        GROUP_CONCAT(DISTINCT p.action_type) AS actionTypes
      FROM clients c
      LEFT JOIN legal_processes p ON p.client_id = c.id AND p.source = 'PRIVATE'
      LEFT JOIN intimations i ON i.process_id = p.id
      WHERE c.source = 'PRIVATE'
      GROUP BY c.id
      ORDER BY hasAction DESC, hasNewMovement DESC, lastMovementAt DESC, c.name COLLATE NOCASE
    `).all();
    return Response.json({ success: true, clients: result.results }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[CLIENTS_GET]", error);
    return Response.json({ success: false, error: "Não foi possível carregar os clientes." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (Number(request.headers.get("content-length") || 0) > 20_000) return Response.json({ success: false, error: "Requisição muito grande." }, { status: 413 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const name = optionalText(body?.name, 200);
  if (!name) return Response.json({ success: false, error: "Informe o nome do cliente." }, { status: 400 });
  const allowedStatuses = new Set<ClientStatus>(["ACTIVE", "ATTENTION_REQUIRED", "NO_RECENT_ACTIVITY", "PROSPECT", "CLOSED"]);
  const status = allowedStatuses.has(body?.status as ClientStatus) ? body?.status as ClientStatus : "ACTIVE";
  try {
    const [client] = await getDb().insert(clients).values({
      name, normalizedName: normalizePersonName(name),
      cpf: optionalText(body?.cpf, 30),
      phone: optionalText(body?.phone, 50),
      email: optionalText(body?.email, 200),
      driveFolderUrl: validUrl(body?.driveFolderUrl),
      notes: optionalText(body?.notes, 5000),
      status,
      source: "PRIVATE",
      updatedAt: new Date().toISOString(),
    }).returning();
    return Response.json({ success: true, client }, { status: 201 });
  } catch (error) {
    console.error("[CLIENTS_POST]", error);
    return Response.json({ success: false, error: "Não foi possível cadastrar o cliente." }, { status: 500 });
  }
}
