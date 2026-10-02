import type { CalendarEventType } from "@/db/schema";
import { optionalText, validUrl } from "@/lib/legal";

export const CALENDAR_EVENT_TYPES: CalendarEventType[] = ["HEARING", "DEADLINE", "MEETING", "DILIGENCE", "EXPERT_EXAM", "ORAL_ARGUMENT", "CLIENT_SERVICE", "OTHER"];

export const CALENDAR_EVENT_COLORS = [
  { id: "1", name: "Lavanda", background: "#7986cb", foreground: "#ffffff" },
  { id: "2", name: "Sálvia", background: "#33b679", foreground: "#ffffff" },
  { id: "3", name: "Uva", background: "#8e24aa", foreground: "#ffffff" },
  { id: "4", name: "Coral", background: "#e67c73", foreground: "#ffffff" },
  { id: "5", name: "Amarelo", background: "#f6c026", foreground: "#202124" },
  { id: "6", name: "Laranja", background: "#f5511d", foreground: "#ffffff" },
  { id: "7", name: "Azul-céu", background: "#039be5", foreground: "#ffffff" },
  { id: "8", name: "Grafite", background: "#616161", foreground: "#ffffff" },
  { id: "9", name: "Azul", background: "#3f51b5", foreground: "#ffffff" },
  { id: "10", name: "Verde", background: "#0b8043", foreground: "#ffffff" },
  { id: "11", name: "Vermelho", background: "#d60000", foreground: "#ffffff" },
] as const;

export const DEFAULT_CALENDAR_EVENT_COLOR = "#039be5";

export function calendarColorByBackground(value: unknown) {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  return CALENDAR_EVENT_COLORS.find((color) => color.background === normalized) || CALENDAR_EVENT_COLORS.find((color) => color.background === DEFAULT_CALENDAR_EVENT_COLOR)!;
}

export const CALENDAR_TYPE_LABELS: Record<CalendarEventType, string> = {
  HEARING: "Audiência",
  DEADLINE: "Prazo",
  MEETING: "Reunião",
  DILIGENCE: "Diligência",
  EXPERT_EXAM: "Perícia",
  ORAL_ARGUMENT: "Sustentação",
  CLIENT_SERVICE: "Atendimento",
  OTHER: "Outro",
};

function integerOrNull(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function validDateOrDateTime(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  const normalized = value.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) || !Number.isNaN(Date.parse(normalized)) ? normalized : null;
}

function emails(value: unknown) {
  const source = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[,;\n]/) : [];
  return [...new Set(source.map((item) => String(item).trim().toLowerCase()).filter((item) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item)))].slice(0, 100);
}

function buildRecurrence(body: Record<string, unknown>) {
  const frequency = ["DAILY", "WEEKLY", "MONTHLY"].includes(String(body.recurrenceFrequency)) ? String(body.recurrenceFrequency) : "NONE";
  if (frequency === "NONE") return [];
  const interval = Math.max(1, Math.min(365, Number(body.recurrenceInterval) || 1));
  let rule = `RRULE:FREQ=${frequency};INTERVAL=${interval}`;
  const days = Array.isArray(body.recurrenceDays) ? body.recurrenceDays.map(String).filter((day) => ["MO", "TU", "WE", "TH", "FR", "SA", "SU"].includes(day)) : [];
  if (frequency === "WEEKLY" && days.length) rule += `;BYDAY=${days.join(",")}`;
  if (body.recurrenceEndDate && /^\d{4}-\d{2}-\d{2}$/.test(String(body.recurrenceEndDate))) rule += `;UNTIL=${String(body.recurrenceEndDate).replaceAll("-", "")}T235959Z`;
  else if (Number(body.recurrenceCount) > 0) rule += `;COUNT=${Math.min(1000, Number(body.recurrenceCount))}`;
  return [rule];
}

export function parseCalendarEventInput(body: Record<string, unknown>) {
  const title = optionalText(body.title, 300);
  const startAt = validDateOrDateTime(body.startAt);
  const endAt = validDateOrDateTime(body.endAt);
  if (!title) throw new Error("Informe o título do agendamento.");
  if (!startAt || !endAt || Date.parse(endAt) <= Date.parse(startAt)) throw new Error("Informe um período válido para o agendamento.");
  const requestedType = String(body.legalType || "OTHER") as CalendarEventType;
  const legalType = CALENDAR_EVENT_TYPES.includes(requestedType) ? requestedType : "OTHER";
  const color = calendarColorByBackground(body.googleColor);
  const reminderMinutes = Number(body.reminderMinutes);
  return {
    title,
    description: optionalText(body.description, 10_000),
    location: optionalText(body.location, 500),
    startAt,
    endAt,
    allDay: Boolean(body.allDay),
    timeZone: optionalText(body.timeZone, 100) || "America/Sao_Paulo",
    responsible: optionalText(body.responsible, 150),
    legalType,
    googleColor: color.background,
    googleForegroundColor: color.foreground,
    attendees: JSON.stringify(emails(body.attendees)),
    recurrence: JSON.stringify(buildRecurrence(body)),
    reminders: JSON.stringify(Number.isFinite(reminderMinutes) && reminderMinutes >= 0 ? { useDefault: false, overrides: [{ method: "popup", minutes: Math.min(40320, reminderMinutes) }] } : { useDefault: true }),
    clientId: integerOrNull(body.clientId),
    processId: integerOrNull(body.processId),
    cnj: optionalText(body.cnj, 60),
    eprocUrl: validUrl(body.eprocUrl),
  };
}
