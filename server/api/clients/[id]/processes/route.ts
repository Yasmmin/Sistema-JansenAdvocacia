import { and, eq } from "drizzle-orm";
import { getD1, getDb } from "@/db";
import { clients, legalProcesses, type Priority, type ProcessStatus } from "@/db/schema";
import { PROCESS_AREAS, PROCESS_COURTS, allowedCourt, inferArea, normalizeProcessNumber, optionalText, processDigits, validUrl } from "@/lib/legal";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const clientId = Number((await params).id);
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const suppliedNumber = optionalText(body?.processNumber, 60);
  if (!Number.isInteger(clientId) || clientId < 1 || !suppliedNumber) return Response.json({ success: false, error: "Informe o número do processo." }, { status: 400 });
  const processNumber = normalizeProcessNumber(suppliedNumber);
  const statusAllowed = new Set<ProcessStatus>(["ACTIVE", "SUSPENDED", "ARCHIVED", "CLOSED", "AWAITING_COMPLIANCE", "ON_APPEAL", "UNKNOWN"]);
  const priorityAllowed = new Set<Priority>(["LOW", "MEDIUM", "HIGH", "URGENT"]);
  const status = statusAllowed.has(body?.status as ProcessStatus) ? body?.status as ProcessStatus : "ACTIVE";
  const priority = priorityAllowed.has(body?.priority as Priority) ? body?.priority as Priority : "MEDIUM";
  try {
    const db = getDb();
    const [client] = await db.select({ id: clients.id }).from(clients).where(and(eq(clients.id, clientId), eq(clients.source, "PRIVATE"))).limit(1);
    if (!client) return Response.json({ success: false, error: "Cliente não encontrado." }, { status: 404 });
    const digits = processDigits(processNumber);
    const latest = await getD1().prepare(`SELECT court, judicial_body, recipient, action_type, availability_date, summary FROM intimations WHERE replace(replace(replace(replace(replace(process_number, '-', ''), '.', ''), '/', ''), ' ', ''), '_', '') = ? ORDER BY availability_date DESC, id DESC LIMIT 1`).bind(digits).first<{ court: string | null; judicial_body: string | null; recipient: string | null; action_type: string | null; availability_date: string | null; summary: string | null }>();
    const area = optionalText(body?.area, 100) || inferArea(latest?.action_type, latest?.judicial_body);
    const court = optionalText(body?.court, 30) || allowedCourt(latest?.court);
    if (area && !(PROCESS_AREAS as readonly string[]).includes(area)) return Response.json({ success: false, error: "Área inválida." }, { status: 400 });
    if (court && !(PROCESS_COURTS as readonly string[]).includes(court)) return Response.json({ success: false, error: "Tribunal inválido." }, { status: 400 });
    const [existingProcess] = await db.select().from(legalProcesses).where(eq(legalProcesses.processNumber, processNumber)).limit(1);
    if (existingProcess) {
      const [attached] = await db.update(legalProcesses).set({
        clientId,
        title: optionalText(body?.title, 300) || existingProcess.title || latest?.action_type || null,
        parties: optionalText(body?.parties, 1000) || existingProcess.parties || latest?.recipient || null,
        court: optionalText(body?.court, 30) || existingProcess.court || court,
        judicialBody: optionalText(body?.judicialBody, 300) || existingProcess.judicialBody || latest?.judicial_body || null,
        area: optionalText(body?.area, 100) || existingProcess.area || area,
        actionType: optionalText(body?.actionType, 200) || existingProcess.actionType || latest?.action_type || null,
        status, priority, eprocUrl: validUrl(body?.eprocUrl) || existingProcess.eprocUrl, driveUrl: validUrl(body?.driveUrl) || existingProcess.driveUrl,
        fatalDeadline: optionalText(body?.fatalDeadline, 30) || existingProcess.fatalDeadline,
        notes: optionalText(body?.notes, 5000) || existingProcess.notes, updatedAt: new Date().toISOString(),
      }).where(eq(legalProcesses.id, existingProcess.id)).returning();
      const d1 = getD1();
      await d1.batch([
        d1.prepare(`UPDATE intimations SET process_id = ?, updated_at = CURRENT_TIMESTAMP WHERE replace(replace(replace(replace(replace(process_number, '-', ''), '.', ''), '/', ''), ' ', ''), '_', '') = ?`).bind(attached.id, digits),
        d1.prepare("DELETE FROM pending_legal_processes WHERE process_number = ?").bind(processNumber),
        d1.prepare("DELETE FROM ignored_imports WHERE kind = 'PROCESS' AND normalized_value = ?").bind(digits),
      ]);
      return Response.json({ success: true, process: attached });
    }
    const [process] = await db.insert(legalProcesses).values({
      clientId, processNumber, title: optionalText(body?.title, 300) || latest?.action_type || null, parties: optionalText(body?.parties, 1000) || latest?.recipient || null,
      court, judicialBody: optionalText(body?.judicialBody, 300) || latest?.judicial_body || null, area,
      actionType: optionalText(body?.actionType, 200) || latest?.action_type || null, status, priority, eprocUrl: validUrl(body?.eprocUrl), driveUrl: validUrl(body?.driveUrl),
      fatalDeadline: optionalText(body?.fatalDeadline, 30), notes: optionalText(body?.notes, 5000), source: "PRIVATE",
      lastMovementAt: latest?.availability_date || null, lastMovementDescription: latest?.summary || null, updatedAt: new Date().toISOString(),
    }).returning();
    const d1 = getD1();
    await d1.batch([
      d1.prepare(`UPDATE intimations SET process_id = ?, updated_at = CURRENT_TIMESTAMP WHERE replace(replace(replace(replace(replace(process_number, '-', ''), '.', ''), '/', ''), ' ', ''), '_', '') = ?`).bind(process.id, digits),
      d1.prepare("DELETE FROM pending_legal_processes WHERE process_number = ?").bind(processNumber),
      d1.prepare("DELETE FROM ignored_imports WHERE kind = 'PROCESS' AND normalized_value = ?").bind(digits),
    ]);
    const linkedLatest = await d1.prepare(`SELECT availability_date, summary FROM intimations WHERE process_id = ? ORDER BY availability_date DESC, id DESC LIMIT 1`).bind(process.id).first<{ availability_date: string | null; summary: string | null }>();
    if (linkedLatest) await db.update(legalProcesses).set({ lastMovementAt: linkedLatest.availability_date, lastMovementDescription: linkedLatest.summary, updatedAt: new Date().toISOString() }).where(eq(legalProcesses.id, process.id));
    return Response.json({ success: true, process }, { status: 201 });
  } catch (error) {
    console.error("[PROCESS_POST]", error);
    const message = error instanceof Error && /unique/i.test(error.message) ? "Este processo já está cadastrado." : "Não foi possível cadastrar o processo.";
    return Response.json({ success: false, error: message }, { status: 500 });
  }
}
