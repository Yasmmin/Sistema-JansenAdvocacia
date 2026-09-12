import { and, desc, eq, or } from "drizzle-orm";
import { getD1, getDb } from "@/db";
import { clients, intimations, legalProcesses, tasks, type ClientStatus } from "@/db/schema";
import { normalizePersonName, optionalText, validUrl } from "@/lib/legal";

export const dynamic = "force-dynamic";

function parseId(value: string) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = parseId((await params).id);
  if (!id) return Response.json({ success: false, error: "Cliente inválido." }, { status: 400 });
  try {
    const db = getDb();
    const [client] = await db.select().from(clients).where(and(eq(clients.id, id), eq(clients.source, "PRIVATE"))).limit(1);
    if (!client) return Response.json({ success: false, error: "Cliente não encontrado." }, { status: 404 });
    const processes = await db.select().from(legalProcesses).where(and(eq(legalProcesses.clientId, id), eq(legalProcesses.source, "PRIVATE"))).orderBy(desc(legalProcesses.lastMovementAt), desc(legalProcesses.id));
    const processIds = processes.map((process) => process.id);
    const clientTasks = await db.select().from(tasks).where(or(eq(tasks.clientId, id), ...(processIds.map((processId) => eq(tasks.processId, processId))))).orderBy(tasks.status, tasks.dueDate, desc(tasks.id));
    const publications = processIds.length ? await db.select().from(intimations).where(or(...processIds.map((processId) => eq(intimations.processId, processId)))).orderBy(desc(intimations.availabilityDate), desc(intimations.id)).limit(250) : [];
    return Response.json({ success: true, client, processes, tasks: clientTasks, intimations: publications }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[CLIENT_GET]", error);
    return Response.json({ success: false, error: "Não foi possível carregar a ficha do cliente." }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = parseId((await params).id);
  if (!id) return Response.json({ success: false, error: "Cliente inválido." }, { status: 400 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const name = optionalText(body?.name, 200);
  if (!body || !name) return Response.json({ success: false, error: "Informe o nome do cliente." }, { status: 400 });
  const allowedStatuses = new Set<ClientStatus>(["ACTIVE", "ATTENTION_REQUIRED", "NO_RECENT_ACTIVITY", "PROSPECT", "CLOSED"]);
  if (!allowedStatuses.has(body.status as ClientStatus)) return Response.json({ success: false, error: "Status inválido." }, { status: 400 });
  const [client] = await getDb().update(clients).set({
    name, normalizedName: normalizePersonName(name),
    cpf: optionalText(body.cpf, 30), rg: optionalText(body.rg, 30), birthDate: optionalText(body.birthDate, 20),
    phone: optionalText(body.phone, 50), email: optionalText(body.email, 200), nationality: optionalText(body.nationality, 100),
    driveFolderUrl: validUrl(body.driveFolderUrl), notes: optionalText(body.notes, 5000), status: body.status as ClientStatus,
    updatedAt: new Date().toISOString(),
  }).where(and(eq(clients.id, id), eq(clients.source, "PRIVATE"))).returning();
  return client ? Response.json({ success: true, client }) : Response.json({ success: false, error: "Cliente não encontrado." }, { status: 404 });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = parseId((await params).id);
  if (!id) return Response.json({ success: false, error: "Cliente inválido." }, { status: 400 });
  const body = await request.json().catch(() => ({})) as { ignoreFutureImports?: boolean };
  const db = getDb();
  const [client] = await db.select().from(clients).where(and(eq(clients.id, id), eq(clients.source, "PRIVATE"))).limit(1);
  if (!client) return Response.json({ success: false, error: "Cliente não encontrado." }, { status: 404 });
  const processes = await db.select({ id: legalProcesses.id, processNumber: legalProcesses.processNumber }).from(legalProcesses).where(eq(legalProcesses.clientId, id));
  const d1 = getD1();
  const statements = [
    ...processes.map((process) => d1.prepare("UPDATE intimations SET process_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE process_id = ?").bind(process.id)),
    ...(body.ignoreFutureImports ? [
      d1.prepare("INSERT INTO ignored_imports(kind, normalized_value, reason) VALUES('CLIENT', ?, 'MANUAL_DELETE') ON CONFLICT(kind, normalized_value) DO NOTHING").bind(client.normalizedName || normalizePersonName(client.name)),
      ...processes.map((process) => d1.prepare("INSERT INTO ignored_imports(kind, normalized_value, reason) VALUES('PROCESS', ?, 'MANUAL_DELETE') ON CONFLICT(kind, normalized_value) DO NOTHING").bind(process.processNumber.replace(/\D/g, ""))),
    ] : []),
    d1.prepare("DELETE FROM clients WHERE id = ?").bind(id),
  ];
  for (let index = 0; index < statements.length; index += 50) await d1.batch(statements.slice(index, index + 50));
  return Response.json({ success: true, ignoredFutureImports: Boolean(body.ignoreFutureImports), preservedPublications: true });
}
