import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { clients, intimations, legalProcesses, tasks, type Priority, type ProcessStatus } from "@/db/schema";
import { PROCESS_AREAS, PROCESS_COURTS, normalizeProcessNumber, optionalText, validUrl } from "@/lib/legal";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id < 1) return Response.json({ success: false, error: "Processo inválido." }, { status: 400 });
  const db = getDb();
  const [process] = await db.select().from(legalProcesses).where(eq(legalProcesses.id, id)).limit(1);
  if (!process) return Response.json({ success: false, error: "Processo não encontrado." }, { status: 404 });
  const [client] = process.clientId ? await db.select().from(clients).where(eq(clients.id, process.clientId)).limit(1) : [];
  const publications = await db.select().from(intimations).where(eq(intimations.processId, id)).orderBy(desc(intimations.availabilityDate), desc(intimations.id)).limit(250);
  const processTasks = await db.select().from(tasks).where(eq(tasks.processId, id)).orderBy(tasks.status, tasks.dueDate, desc(tasks.id));
  return Response.json({ success: true, process, client, intimations: publications, tasks: processTasks }, { headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!Number.isInteger(id) || id < 1 || !body) return Response.json({ success: false, error: "Processo inválido." }, { status: 400 });
  const clientId = Number(body.clientId);
  const suppliedNumber = optionalText(body.processNumber, 60);
  if (!suppliedNumber) return Response.json({ success: false, error: "Informe o número do processo." }, { status: 400 });
  if (!Number.isInteger(clientId) || clientId < 1) return Response.json({ success: false, error: "Selecione um cliente." }, { status: 400 });
  const statuses = new Set<ProcessStatus>(["ACTIVE", "SUSPENDED", "ARCHIVED", "CLOSED", "AWAITING_COMPLIANCE", "ON_APPEAL", "UNKNOWN"]);
  const priorities = new Set<Priority>(["LOW", "MEDIUM", "HIGH", "URGENT"]);
  const area = optionalText(body.area, 100);
  const court = optionalText(body.court, 30);
  if (area && !(PROCESS_AREAS as readonly string[]).includes(area)) return Response.json({ success: false, error: "Área inválida." }, { status: 400 });
  if (court && !(PROCESS_COURTS as readonly string[]).includes(court)) return Response.json({ success: false, error: "Tribunal inválido." }, { status: 400 });
  if (!statuses.has(body.status as ProcessStatus) || !priorities.has(body.priority as Priority)) return Response.json({ success: false, error: "Status ou prioridade inválidos." }, { status: 400 });
  const [client] = await getDb().select({ id: clients.id }).from(clients).where(eq(clients.id, clientId)).limit(1);
  if (!client) return Response.json({ success: false, error: "Cliente não encontrado." }, { status: 404 });
  const [process] = await getDb().update(legalProcesses).set({
    clientId, processNumber: normalizeProcessNumber(suppliedNumber),
    title: optionalText(body.title, 300), actionType: optionalText(body.actionType, 200), area, parties: optionalText(body.parties, 1000),
    partiesSource: Object.prototype.hasOwnProperty.call(body, "parties") ? "INTERNAL" : undefined,
    court, judicialBody: optionalText(body.judicialBody, 300), eprocUrl: validUrl(body.eprocUrl), driveUrl: validUrl(body.driveUrl),
    fatalDeadline: optionalText(body.fatalDeadline, 30), status: body.status as ProcessStatus, priority: body.priority as Priority,
    notes: optionalText(body.notes, 5000), updatedAt: new Date().toISOString(),
  }).where(eq(legalProcesses.id, id)).returning();
  return process ? Response.json({ success: true, process }) : Response.json({ success: false, error: "Processo não encontrado." }, { status: 404 });
}
