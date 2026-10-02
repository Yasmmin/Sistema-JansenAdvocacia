import { and, eq, inArray, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { calendarEvents, clients, legalProcesses } from "@/db/schema";
import { parseCalendarEventInput } from "@/lib/calendar";
import { getCalendarConnection, pushCalendarEventToGoogle } from "@/lib/google-calendar";
import { activityOwnerName } from "@server/auth";
import { calendarContext, readableCalendarIds, writableCalendarIds } from "@server/calendar-scope";

export const dynamic = "force-dynamic";

function parseJson<T>(value: string, fallback: T): T {
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

export async function GET(request: Request) {
  try {
    const context = await calendarContext(request);
    if (!context) return Response.json({ error: "Não autenticado." }, { status: 401 });
    const calendarIds = await readableCalendarIds(context);
    const rows = await getDb().select({
      event: calendarEvents,
      clientName: clients.name,
      processNumber: legalProcesses.processNumber,
    }).from(calendarEvents)
      .leftJoin(clients, eq(calendarEvents.clientId, clients.id))
      .leftJoin(legalProcesses, eq(calendarEvents.processId, legalProcesses.id))
      .where(and(
        isNull(calendarEvents.deletedAt),
        inArray(calendarEvents.calendarId, calendarIds),
      ));
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
    const context = await calendarContext(request);
    if (!context) return Response.json({ error: "Não autenticado." }, { status: 401 });
    const actor = context.actor;
    const values = { ...parseCalendarEventInput(body), responsible: activityOwnerName(actor) };
    const db = getDb();
    const requestedCalendarId = typeof body.calendarId === "string" ? body.calendarId : context.calendarId;
    const writableIds = await writableCalendarIds(context);
    if (!writableIds.includes(requestedCalendarId)) {
      return Response.json({ error: "A agenda selecionada não permite criar eventos." }, { status: 403 });
    }
    if (values.processId) {
      const [process] = await db.select({ id: legalProcesses.id, clientId: legalProcesses.clientId }).from(legalProcesses).where(and(eq(legalProcesses.id, values.processId), eq(legalProcesses.source, context.source), values.clientId ? eq(legalProcesses.clientId, values.clientId) : eq(legalProcesses.id, values.processId))).limit(1);
      if (!process) return Response.json({ error: "Processo inválido para o cliente selecionado." }, { status: 400 });
    }
    const connection = await getCalendarConnection(context.ownerKey);
    const connected = Boolean(connection);
    const [event] = await db.insert(calendarEvents).values({ ...values, createdByUserId: actor.id, updatedByUserId: actor.id, calendarId: requestedCalendarId, status: "confirmed", lastChangeOrigin: "JANSEN", syncStatus: "PENDING", updatedAt: new Date().toISOString() }).returning();
    let syncWarning: string | null = connected ? null : "Evento salvo no Jansen e pendente até o Google Calendar ser conectado.";
    if (connected) {
      try { await pushCalendarEventToGoogle(event.id, connection!); }
      catch (error) { syncWarning = error instanceof Error ? error.message : "Evento salvo, mas ainda não sincronizado com o Google."; }
    }
    const [saved] = await db.select().from(calendarEvents).where(eq(calendarEvents.id, event.id)).limit(1);
    return Response.json({ event: saved, syncWarning }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível criar o agendamento." }, { status: 400 });
  }
}
