import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { calendarEvents, clients, legalProcesses } from "@/db/schema";
import { parseCalendarEventInput } from "@/lib/calendar";
import { getCalendarConnection, getDefaultGoogleCalendarId, pushCalendarEventToGoogle } from "@/lib/google-calendar";

export const dynamic = "force-dynamic";

function parseJson<T>(value: string, fallback: T): T {
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

export async function GET() {
  try {
    const rows = await getDb().select({
      event: calendarEvents,
      clientName: clients.name,
      processNumber: legalProcesses.processNumber,
    }).from(calendarEvents)
      .leftJoin(clients, eq(calendarEvents.clientId, clients.id))
      .leftJoin(legalProcesses, eq(calendarEvents.processId, legalProcesses.id))
      .where(and(isNull(calendarEvents.deletedAt), eq(calendarEvents.calendarId, getDefaultGoogleCalendarId())));
    return Response.json({ events: rows.map(({ event, ...relations }) => ({ ...event, ...relations, attendees: parseJson(event.attendees, []), recurrence: parseJson(event.recurrence, []), reminders: parseJson(event.reminders, {}) })) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[CALENDAR_EVENTS_GET]", error);
    return Response.json({ error: "Não foi possível carregar os agendamentos." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return Response.json({ error: "Agendamento inválido." }, { status: 400 });
  try {
    const values = parseCalendarEventInput(body);
    const db = getDb();
    if (values.processId) {
      const [process] = await db.select({ id: legalProcesses.id, clientId: legalProcesses.clientId }).from(legalProcesses).where(and(eq(legalProcesses.id, values.processId), values.clientId ? eq(legalProcesses.clientId, values.clientId) : eq(legalProcesses.id, values.processId))).limit(1);
      if (!process) return Response.json({ error: "Processo inválido para o cliente selecionado." }, { status: 400 });
    }
    const connected = Boolean(await getCalendarConnection());
    const [event] = await db.insert(calendarEvents).values({ ...values, calendarId: getDefaultGoogleCalendarId(), status: "confirmed", lastChangeOrigin: "JANSEN", syncStatus: "PENDING", updatedAt: new Date().toISOString() }).returning();
    let syncWarning: string | null = connected ? null : "Evento salvo no Jansen e pendente até o Google Calendar ser conectado.";
    if (connected) {
      try { await pushCalendarEventToGoogle(event.id); }
      catch (error) { syncWarning = error instanceof Error ? error.message : "Evento salvo, mas ainda não sincronizado com o Google."; }
    }
    const [saved] = await db.select().from(calendarEvents).where(eq(calendarEvents.id, event.id)).limit(1);
    return Response.json({ event: saved, syncWarning }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível criar o agendamento." }, { status: 400 });
  }
}
