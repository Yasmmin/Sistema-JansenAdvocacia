import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { clients, legalProcesses, tasks, type Priority, type RecurrenceEndType, type RecurrenceFrequency, type TaskAssignee } from "@/db/schema";
import { optionalText } from "@/lib/legal";
import { RECURRENCE_END_TYPES, RECURRENCE_FREQUENCIES, TASK_PRIORITIES, TEAM_MEMBERS, isIsoDate, isTime, parseWeekDays } from "@/lib/tasks";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const clientId = Number((await params).id);
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const title = optionalText(body?.title, 300);
  if (!Number.isInteger(clientId) || clientId < 1 || !title) return Response.json({ success: false, error: "Informe o título da tarefa." }, { status: 400 });

  const processId = body?.processId ? Number(body.processId) : null;
  if (processId !== null && (!Number.isInteger(processId) || processId < 1)) return Response.json({ success: false, error: "Processo inválido para este cliente." }, { status: 400 });
  const suppliedPriority = optionalText(body?.priority, 20);
  if (suppliedPriority && !TASK_PRIORITIES.includes(suppliedPriority as Priority)) return Response.json({ success: false, error: "Prioridade inválida." }, { status: 400 });
  const priority = (suppliedPriority || "MEDIUM") as Priority;
  const suppliedAssignee = optionalText(body?.assignee, 100);
  if (suppliedAssignee && !TEAM_MEMBERS.includes(suppliedAssignee as TaskAssignee)) return Response.json({ success: false, error: "Responsável inválido." }, { status: 400 });
  const assignee = suppliedAssignee as TaskAssignee | null;
  const suppliedDueDate = optionalText(body?.dueDate, 30);
  const suppliedDueTime = optionalText(body?.dueTime, 10);
  if (suppliedDueDate && !isIsoDate(suppliedDueDate)) return Response.json({ success: false, error: "Data inválida." }, { status: 400 });
  if (suppliedDueTime && (!suppliedDueDate || !isTime(suppliedDueTime))) return Response.json({ success: false, error: "Defina uma data e hora válidas." }, { status: 400 });
  const dueDate = suppliedDueDate;
  const dueTime = suppliedDueTime;
  const recurrenceFrequency = RECURRENCE_FREQUENCIES.includes(body?.recurrenceFrequency as RecurrenceFrequency) ? body?.recurrenceFrequency as RecurrenceFrequency : "NONE";
  const isRecurring = recurrenceFrequency !== "NONE";
  if (isRecurring && !dueDate) return Response.json({ success: false, error: "Defina uma data para a tarefa recorrente." }, { status: 400 });
  const recurrenceInterval = Math.max(1, Math.min(365, Number(body?.recurrenceInterval) || 1));
  const recurrenceDays = recurrenceFrequency === "WEEKLY" ? parseWeekDays(body?.recurrenceDaysOfWeek) : [];
  const recurrenceDayOfMonth = recurrenceFrequency === "MONTHLY" && dueDate
    ? Math.max(1, Math.min(31, Number(body?.recurrenceDayOfMonth) || Number(dueDate.slice(8, 10))))
    : null;
  const requestedEndType = RECURRENCE_END_TYPES.includes(body?.recurrenceEndType as RecurrenceEndType) ? body?.recurrenceEndType as RecurrenceEndType : "NEVER";
  const recurrenceEndType = isRecurring ? requestedEndType : "NEVER";
  if (recurrenceEndType === "DATE" && !isIsoDate(body?.recurrenceEndDate)) return Response.json({ success: false, error: "Informe a data final da recorrência." }, { status: 400 });
  const recurrenceEndDate = recurrenceEndType === "DATE" && isIsoDate(body?.recurrenceEndDate) ? body.recurrenceEndDate : null;
  const recurrenceCount = recurrenceEndType === "COUNT" ? Math.max(1, Math.min(1000, Number(body?.recurrenceCount) || 1)) : null;

  const db = getDb();
  const [client] = await db.select({ id: clients.id }).from(clients).where(and(eq(clients.id, clientId), eq(clients.source, "PRIVATE"))).limit(1);
  if (!client) return Response.json({ success: false, error: "Cliente não encontrado." }, { status: 404 });
  if (processId) {
    const [process] = await db.select({ id: legalProcesses.id }).from(legalProcesses).where(and(eq(legalProcesses.id, processId), eq(legalProcesses.clientId, clientId))).limit(1);
    if (!process) return Response.json({ success: false, error: "Processo inválido para este cliente." }, { status: 400 });
  }

  const [task] = await db.insert(tasks).values({
    title,
    description: optionalText(body?.description, 5000),
    status: "TODO",
    priority,
    dueDate,
    dueTime,
    assignee,
    isRecurring,
    recurrenceFrequency,
    recurrenceInterval,
    recurrenceDaysOfWeek: recurrenceDays.length ? recurrenceDays.join(",") : null,
    recurrenceDayOfMonth,
    recurrenceEndType,
    recurrenceEndDate,
    recurrenceCount,
    recurrenceOccurrence: 1,
    recurrenceSeriesId: isRecurring ? crypto.randomUUID() : null,
    clientId,
    processId,
    updatedAt: new Date().toISOString(),
  }).returning();
  return Response.json({ success: true, task }, { status: 201 });
}
