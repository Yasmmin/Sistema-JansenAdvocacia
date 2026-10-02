import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { clients, legalProcesses, tasks, type Priority, type RecurrenceEndType, type RecurrenceFrequency, type TaskAssignee, type TaskStatus } from "@/db/schema";
import { optionalText } from "@/lib/legal";
import { RECURRENCE_END_TYPES, RECURRENCE_FREQUENCIES, TASK_PRIORITIES, TASK_STATUSES, TEAM_MEMBERS, isIsoDate, isTime, parseTaskAttachments, parseTaskTags, parseWeekDays } from "@/lib/tasks";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = getDb();
  const rows = await db.select({
    id: tasks.id, title: tasks.title, description: tasks.description, status: tasks.status, priority: tasks.priority,
    dueDate: tasks.dueDate, dueTime: tasks.dueTime, assignee: tasks.assignee, isRecurring: tasks.isRecurring,
    recurrenceFrequency: tasks.recurrenceFrequency, recurrenceInterval: tasks.recurrenceInterval,
    recurrenceDaysOfWeek: tasks.recurrenceDaysOfWeek, recurrenceDayOfMonth: tasks.recurrenceDayOfMonth,
    recurrenceEndType: tasks.recurrenceEndType, recurrenceEndDate: tasks.recurrenceEndDate,
    recurrenceCount: tasks.recurrenceCount, recurrenceOccurrence: tasks.recurrenceOccurrence,
    recurrenceSeriesId: tasks.recurrenceSeriesId, parentOccurrenceId: tasks.parentOccurrenceId,
    clientId: tasks.clientId, clientName: clients.name, processId: tasks.processId,
    processNumber: legalProcesses.processNumber, processTitle: legalProcesses.title, eprocUrl: legalProcesses.eprocUrl,
    tags: tasks.tags, attachments: tasks.attachments, createdAt: tasks.createdAt, updatedAt: tasks.updatedAt,
    completedAt: tasks.completedAt,
  }).from(tasks)
    .leftJoin(clients, eq(tasks.clientId, clients.id))
    .leftJoin(legalProcesses, eq(tasks.processId, legalProcesses.id))
    .orderBy(asc(tasks.id));

  return Response.json({
    tasks: rows.map((task) => ({ ...task, tags: parseTaskTags(task.tags), attachments: parseTaskAttachments(task.attachments) })),
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const title = optionalText(body?.title, 300);
  if (!body || !title) return Response.json({ success: false, error: "Informe o título da tarefa." }, { status: 400 });
  const db = getDb();
  let clientId = body.clientId ? Number(body.clientId) : null;
  const processId = body.processId ? Number(body.processId) : null;
  if (clientId !== null && (!Number.isInteger(clientId) || clientId < 1)) return Response.json({ success: false, error: "Cliente inválido." }, { status: 400 });
  if (processId !== null && (!Number.isInteger(processId) || processId < 1)) return Response.json({ success: false, error: "Processo inválido." }, { status: 400 });
  if (processId) {
    const [process] = await db.select({ clientId: legalProcesses.clientId }).from(legalProcesses).where(and(eq(legalProcesses.id, processId), eq(legalProcesses.source, "PRIVATE"))).limit(1);
    if (!process) return Response.json({ success: false, error: "Processo não encontrado." }, { status: 404 });
    if (clientId && clientId !== process.clientId) return Response.json({ success: false, error: "O processo não pertence ao cliente selecionado." }, { status: 400 });
    clientId = process.clientId;
  } else if (clientId) {
    const [client] = await db.select({ id: clients.id }).from(clients).where(and(eq(clients.id, clientId), eq(clients.source, "PRIVATE"))).limit(1);
    if (!client) return Response.json({ success: false, error: "Cliente não encontrado." }, { status: 404 });
  }

  const priority = TASK_PRIORITIES.includes(body.priority as Priority) ? body.priority as Priority : "MEDIUM";
  const requestedStatus = body.status === "NOT_STARTED" ? "TODO" : body.status;
  const status = TASK_STATUSES.includes(requestedStatus as Exclude<TaskStatus, "NOT_STARTED">) ? requestedStatus as Exclude<TaskStatus, "NOT_STARTED"> : "TODO";
  const assignee = optionalText(body.assignee, 100);
  if (assignee && !TEAM_MEMBERS.includes(assignee as TaskAssignee)) return Response.json({ success: false, error: "Responsável inválido." }, { status: 400 });
  const dueDate = optionalText(body.dueDate, 30);
  const dueTime = optionalText(body.dueTime, 10);
  if (dueDate && !isIsoDate(dueDate)) return Response.json({ success: false, error: "Data inválida." }, { status: 400 });
  if (dueTime && (!dueDate || !isTime(dueTime))) return Response.json({ success: false, error: "Defina uma data e hora válidas." }, { status: 400 });
  const recurrenceFrequency = RECURRENCE_FREQUENCIES.includes(body.recurrenceFrequency as RecurrenceFrequency) ? body.recurrenceFrequency as RecurrenceFrequency : "NONE";
  const isRecurring = recurrenceFrequency !== "NONE";
  if (isRecurring && !dueDate) return Response.json({ success: false, error: "Defina uma data para a tarefa recorrente." }, { status: 400 });
  const recurrenceDays = recurrenceFrequency === "WEEKLY" ? parseWeekDays(body.recurrenceDaysOfWeek) : [];
  const requestedEndType = RECURRENCE_END_TYPES.includes(body.recurrenceEndType as RecurrenceEndType) ? body.recurrenceEndType as RecurrenceEndType : "NEVER";
  const recurrenceEndType = isRecurring ? requestedEndType : "NEVER";

  const [task] = await db.insert(tasks).values({
    title, description: optionalText(body.description, 5000), status, priority, dueDate, dueTime,
    completedAt: status === "COMPLETED" ? new Date().toISOString() : null,
    assignee: assignee as TaskAssignee | null, isRecurring, recurrenceFrequency,
    recurrenceInterval: Math.max(1, Math.min(365, Number(body.recurrenceInterval) || 1)),
    recurrenceDaysOfWeek: recurrenceDays.length ? recurrenceDays.join(",") : null,
    recurrenceDayOfMonth: recurrenceFrequency === "MONTHLY" && dueDate ? Number(dueDate.slice(8, 10)) : null,
    recurrenceEndType,
    recurrenceEndDate: recurrenceEndType === "DATE" && isIsoDate(body.recurrenceEndDate) ? body.recurrenceEndDate : null,
    recurrenceCount: recurrenceEndType === "COUNT" ? Math.max(1, Math.min(1000, Number(body.recurrenceCount) || 1)) : null,
    recurrenceOccurrence: 1, recurrenceSeriesId: isRecurring ? crypto.randomUUID() : null,
    clientId, processId, tags: JSON.stringify(parseTaskTags(body.tags)), attachments: JSON.stringify(parseTaskAttachments(body.attachments)),
    updatedAt: new Date().toISOString(),
  }).returning();
  return Response.json({ success: true, task: { ...task, tags: parseTaskTags(task.tags), attachments: parseTaskAttachments(task.attachments) } }, { status: 201 });
}
