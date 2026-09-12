import type { Priority, RecurrenceEndType, RecurrenceFrequency, TaskAssignee, TaskStatus } from "@/db/schema";

export const TEAM_MEMBERS = ["Bruno Boff", "Yasmmin Flávia", "Francisco Jansen"] as const satisfies readonly TaskAssignee[];
export const TASK_STATUSES = ["TODO", "IN_PROGRESS", "COMPLETED"] as const satisfies readonly TaskStatus[];
export const TASK_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const satisfies readonly Priority[];
export const RECURRENCE_FREQUENCIES = ["NONE", "DAILY", "WEEKLY", "MONTHLY"] as const satisfies readonly RecurrenceFrequency[];
export const RECURRENCE_END_TYPES = ["NEVER", "DATE", "COUNT"] as const satisfies readonly RecurrenceEndType[];

export const TASK_STATUS_LABELS: Record<TaskStatus | "NOT_STARTED", string> = {
  TODO: "A fazer",
  NOT_STARTED: "A fazer",
  IN_PROGRESS: "Em andamento",
  COMPLETED: "Concluída",
};

export type TaskRecord = {
  id: number;
  title: string;
  description: string | null;
  status: TaskStatus | "NOT_STARTED";
  priority: Priority;
  dueDate: string | null;
  dueTime: string | null;
  assignee: TaskAssignee | null;
  isRecurring: boolean;
  recurrenceFrequency: RecurrenceFrequency;
  recurrenceInterval: number;
  recurrenceDaysOfWeek: string | null;
  recurrenceDayOfMonth: number | null;
  recurrenceEndType: RecurrenceEndType;
  recurrenceEndDate: string | null;
  recurrenceCount: number | null;
  recurrenceOccurrence: number;
  recurrenceSeriesId: string | null;
  parentOccurrenceId: number | null;
  clientId: number | null;
  processId: number | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

export function isTime(value: unknown): value is string {
  return typeof value === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function parseWeekDays(value: unknown): number[] {
  const values = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  return [...new Set(values.map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))].sort((a, b) => a - b);
}

function utcDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function dateValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

export function nextOccurrenceDate(task: Pick<TaskRecord, "dueDate" | "recurrenceFrequency" | "recurrenceInterval" | "recurrenceDaysOfWeek" | "recurrenceDayOfMonth" | "recurrenceEndType" | "recurrenceEndDate" | "recurrenceCount" | "recurrenceOccurrence">): string | null {
  if (!task.dueDate || task.recurrenceFrequency === "NONE") return null;
  const interval = Math.max(1, Math.min(365, Number(task.recurrenceInterval) || 1));
  const current = utcDate(task.dueDate);
  let next: Date;

  if (task.recurrenceFrequency === "DAILY") {
    next = new Date(current);
    next.setUTCDate(next.getUTCDate() + interval);
  } else if (task.recurrenceFrequency === "WEEKLY") {
    const selected = parseWeekDays(task.recurrenceDaysOfWeek);
    const days = selected.length ? selected : [current.getUTCDay()];
    const laterThisWeek = days.find((day) => day > current.getUTCDay());
    const delta = laterThisWeek !== undefined
      ? laterThisWeek - current.getUTCDay()
      : (7 - current.getUTCDay() + days[0]) + ((interval - 1) * 7);
    next = new Date(current);
    next.setUTCDate(next.getUTCDate() + delta);
  } else {
    const targetMonth = current.getUTCMonth() + interval;
    const targetYear = current.getUTCFullYear() + Math.floor(targetMonth / 12);
    const normalizedMonth = ((targetMonth % 12) + 12) % 12;
    const requestedDay = Math.max(1, Math.min(31, task.recurrenceDayOfMonth || current.getUTCDate()));
    next = new Date(Date.UTC(targetYear, normalizedMonth, Math.min(requestedDay, daysInMonth(targetYear, normalizedMonth))));
  }

  const result = dateValue(next);
  if (task.recurrenceEndType === "DATE" && task.recurrenceEndDate && result > task.recurrenceEndDate) return null;
  if (task.recurrenceEndType === "COUNT" && task.recurrenceCount && task.recurrenceOccurrence >= task.recurrenceCount) return null;
  return result;
}

export function recurrenceLabel(task: Pick<TaskRecord, "isRecurring" | "recurrenceFrequency" | "recurrenceInterval" | "recurrenceDaysOfWeek" | "recurrenceDayOfMonth">) {
  if (!task.isRecurring || task.recurrenceFrequency === "NONE") return "";
  const interval = Math.max(1, task.recurrenceInterval || 1);
  if (task.recurrenceFrequency === "DAILY") return interval === 1 ? "Repete diariamente" : `Repete a cada ${interval} dias`;
  if (task.recurrenceFrequency === "MONTHLY") return interval === 1 ? `Repete todo mês no dia ${task.recurrenceDayOfMonth}` : `Repete a cada ${interval} meses no dia ${task.recurrenceDayOfMonth}`;
  const names = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
  const days = parseWeekDays(task.recurrenceDaysOfWeek).map((day) => names[day]).join(" e ");
  return interval === 1 ? `Repete semanalmente${days ? `: ${days}` : ""}` : `Repete a cada ${interval} semanas${days ? `: ${days}` : ""}`;
}
