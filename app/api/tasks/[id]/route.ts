import { and, eq, ne, or } from "drizzle-orm";
import { getDb } from "@/db";
import { legalProcesses, tasks, type Priority, type RecurrenceEndType, type RecurrenceFrequency, type TaskAssignee, type TaskStatus } from "@/db/schema";
import { optionalText } from "@/lib/legal";
import { RECURRENCE_END_TYPES, RECURRENCE_FREQUENCIES, TASK_PRIORITIES, TASK_STATUSES, TEAM_MEMBERS, isIsoDate, isTime, nextOccurrenceDate, parseWeekDays, type TaskRecord } from "@/lib/tasks";

function parseId(value: string) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

async function createNextOccurrence(current: TaskRecord) {
  if (!current.isRecurring || current.recurrenceFrequency === "NONE") return null;
  const dueDate = nextOccurrenceDate(current);
  if (!dueDate) return null;
  const [next] = await getDb().insert(tasks).values({
    title: current.title,
    description: current.description,
    status: "TODO",
    priority: current.priority,
    dueDate,
    dueTime: current.dueTime,
    assignee: current.assignee,
    isRecurring: true,
    recurrenceFrequency: current.recurrenceFrequency,
    recurrenceInterval: current.recurrenceInterval,
    recurrenceDaysOfWeek: current.recurrenceDaysOfWeek,
    recurrenceDayOfMonth: current.recurrenceDayOfMonth,
    recurrenceEndType: current.recurrenceEndType,
    recurrenceEndDate: current.recurrenceEndDate,
    recurrenceCount: current.recurrenceCount,
    recurrenceOccurrence: current.recurrenceOccurrence + 1,
    recurrenceSeriesId: current.recurrenceSeriesId || crypto.randomUUID(),
    parentOccurrenceId: current.id,
    clientId: current.clientId,
    processId: current.processId,
    updatedAt: new Date().toISOString(),
  }).onConflictDoNothing().returning();
  return next || null;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = parseId((await params).id);
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!id || !body) return Response.json({ success: false, error: "Tarefa inválida." }, { status: 400 });
  const db = getDb();
  const [existing] = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1) as TaskRecord[];
  if (!existing) return Response.json({ success: false, error: "Tarefa não encontrada." }, { status: 404 });

  const requestedStatus = body.status === "NOT_STARTED" ? "TODO" : body.status;
  type CurrentTaskStatus = Exclude<TaskStatus, "NOT_STARTED">;
  if (Object.prototype.hasOwnProperty.call(body, "status") && !TASK_STATUSES.includes(requestedStatus as CurrentTaskStatus)) return Response.json({ success: false, error: "Status inválido." }, { status: 400 });
  const normalizedExisting = (existing.status === "NOT_STARTED" ? "TODO" : existing.status) as CurrentTaskStatus;
  const status = TASK_STATUSES.includes(requestedStatus as CurrentTaskStatus) ? requestedStatus as CurrentTaskStatus : normalizedExisting;
  const now = new Date().toISOString();
  const fullEdit = Object.prototype.hasOwnProperty.call(body, "title");
  let values: Partial<typeof tasks.$inferInsert> = {
    status,
    completedAt: status === "COMPLETED" ? existing.completedAt || now : null,
    updatedAt: now,
  };

  if (fullEdit) {
    const title = optionalText(body.title, 300);
    if (!title) return Response.json({ success: false, error: "Informe o título da tarefa." }, { status: 400 });
    const processId = body.processId ? Number(body.processId) : null;
    if (processId !== null && (!Number.isInteger(processId) || processId < 1)) return Response.json({ success: false, error: "Processo inválido para este cliente." }, { status: 400 });
    if (processId) {
      const [process] = await db.select({ id: legalProcesses.id }).from(legalProcesses).where(and(eq(legalProcesses.id, processId), eq(legalProcesses.clientId, existing.clientId!))).limit(1);
      if (!process) return Response.json({ success: false, error: "Processo inválido para este cliente." }, { status: 400 });
    }
    const suppliedDueDate = optionalText(body.dueDate, 30);
    const suppliedDueTime = optionalText(body.dueTime, 10);
    if (suppliedDueDate && !isIsoDate(suppliedDueDate)) return Response.json({ success: false, error: "Data inválida." }, { status: 400 });
    if (suppliedDueTime && (!suppliedDueDate || !isTime(suppliedDueTime))) return Response.json({ success: false, error: "Defina uma data e hora válidas." }, { status: 400 });
    const dueDate = suppliedDueDate;
    const dueTime = suppliedDueTime;
    const recurrenceFrequency = RECURRENCE_FREQUENCIES.includes(body.recurrenceFrequency as RecurrenceFrequency) ? body.recurrenceFrequency as RecurrenceFrequency : "NONE";
    const isRecurring = recurrenceFrequency !== "NONE";
    if (isRecurring && !dueDate) return Response.json({ success: false, error: "Defina uma data para a tarefa recorrente." }, { status: 400 });
    const recurrenceInterval = Math.max(1, Math.min(365, Number(body.recurrenceInterval) || 1));
    const recurrenceDays = recurrenceFrequency === "WEEKLY" ? parseWeekDays(body.recurrenceDaysOfWeek) : [];
    const recurrenceDayOfMonth = recurrenceFrequency === "MONTHLY" && dueDate
      ? Math.max(1, Math.min(31, Number(body.recurrenceDayOfMonth) || Number(dueDate.slice(8, 10))))
      : null;
    const requestedEndType = RECURRENCE_END_TYPES.includes(body.recurrenceEndType as RecurrenceEndType) ? body.recurrenceEndType as RecurrenceEndType : "NEVER";
    const recurrenceEndType = isRecurring ? requestedEndType : "NEVER";
    const suppliedAssignee = optionalText(body.assignee, 100);
    if (suppliedAssignee && !TEAM_MEMBERS.includes(suppliedAssignee as TaskAssignee)) return Response.json({ success: false, error: "Responsável inválido." }, { status: 400 });
    if (recurrenceEndType === "DATE" && !isIsoDate(body.recurrenceEndDate)) return Response.json({ success: false, error: "Informe a data final da recorrência." }, { status: 400 });
    const suppliedPriority = optionalText(body.priority, 20);
    if (suppliedPriority && !TASK_PRIORITIES.includes(suppliedPriority as Priority)) return Response.json({ success: false, error: "Prioridade inválida." }, { status: 400 });
    values = {
      ...values,
      title,
      description: optionalText(body.description, 5000),
      processId,
      priority: (suppliedPriority || "MEDIUM") as Priority,
      dueDate,
      dueTime,
      assignee: suppliedAssignee as TaskAssignee | null,
      isRecurring,
      recurrenceFrequency,
      recurrenceInterval,
      recurrenceDaysOfWeek: recurrenceDays.length ? recurrenceDays.join(",") : null,
      recurrenceDayOfMonth,
      recurrenceEndType,
      recurrenceEndDate: recurrenceEndType === "DATE" && isIsoDate(body.recurrenceEndDate) ? body.recurrenceEndDate : null,
      recurrenceCount: recurrenceEndType === "COUNT" ? Math.max(1, Math.min(1000, Number(body.recurrenceCount) || 1)) : null,
      recurrenceSeriesId: isRecurring ? existing.recurrenceSeriesId || crypto.randomUUID() : null,
    };
  }

  const [task] = await db.update(tasks).set(values).where(eq(tasks.id, id)).returning() as TaskRecord[];
  const next = status === "COMPLETED" ? await createNextOccurrence(task) : null;
  return Response.json({ success: true, task, nextOccurrence: next });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = parseId((await params).id);
  if (!id) return Response.json({ success: false, error: "Tarefa inválida." }, { status: 400 });
  const body = await request.json().catch(() => ({})) as { scope?: "THIS" | "FUTURE" };
  const db = getDb();
  const [task] = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1) as TaskRecord[];
  if (!task) return Response.json({ success: false, error: "Tarefa não encontrada." }, { status: 404 });

  if (body.scope === "FUTURE" && task.recurrenceSeriesId) {
    await db.delete(tasks).where(and(
      eq(tasks.recurrenceSeriesId, task.recurrenceSeriesId),
      or(eq(tasks.id, task.id), ne(tasks.status, "COMPLETED")),
    ));
    return Response.json({ success: true, scope: "FUTURE" });
  }

  if (task.isRecurring && task.status !== "COMPLETED") await createNextOccurrence(task);
  await db.delete(tasks).where(eq(tasks.id, id));
  return Response.json({ success: true, scope: "THIS" });
}
