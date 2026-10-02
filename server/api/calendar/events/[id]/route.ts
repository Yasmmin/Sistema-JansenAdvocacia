import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { calendarEvents, legalProcesses } from "@/db/schema";
import { parseCalendarEventInput } from "@/lib/calendar";
import { deleteCalendarEventFromGoogle, getCalendarConnection, GoogleCalendarError, pushCalendarEventToGoogle, syncGoogleCalendar } from "@/lib/google-calendar";
import { activityOwnerName } from "@server/auth";
import { calendarContext, readableCalendarIds } from "@server/calendar-scope";

function parseId(value: string) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = parseId((await params).id);
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!id || !body) return Response.json({ error: "Agendamento inválido." }, { status: 400 });
  const db = getDb();
  const context = await calendarContext(request);
  if (!context) return Response.json({ error: "Não autenticado." }, { status: 401 });
  const actor = context.actor;
  const [existing] = await db.select().from(calendarEvents).where(eq(calendarEvents.id, id)).limit(1);
  const calendarIds = await readableCalendarIds(context);
  if (!existing || existing.deletedAt || !calendarIds.includes(existing.calendarId)) return Response.json({ error: "Agendamento não encontrado neste calendário." }, { status: 404 });
  try {
    const timingOnly = !Object.prototype.hasOwnProperty.call(body, "title");
    const merged = { ...existing, ...body };
    let values: Partial<typeof calendarEvents.$inferInsert> = timingOnly
      ? {
          startAt: String(merged.startAt || ""),
          endAt: String(merged.endAt || ""),
          allDay: Boolean(merged.allDay),
        }
      : parseCalendarEventInput(merged);
    if (!values.startAt || !values.endAt || Number.isNaN(Date.parse(values.startAt)) || Number.isNaN(Date.parse(values.endAt)) || Date.parse(values.endAt) <= Date.parse(values.startAt)) return Response.json({ error: "Período inválido." }, { status: 400 });
    if (!timingOnly) {
      const parsed = parseCalendarEventInput(merged);
      values = parsed;
      if (!parsed.processId) {
        // Sem processo vinculado.
      } else {
      const [process] = await db.select({ id: legalProcesses.id }).from(legalProcesses).where(and(eq(legalProcesses.id, parsed.processId), parsed.clientId ? eq(legalProcesses.clientId, parsed.clientId) : eq(legalProcesses.id, parsed.processId))).limit(1);
      if (!process) return Response.json({ error: "Processo inválido para o cliente selecionado." }, { status: 400 });
      }
    }
    await db.update(calendarEvents).set({ ...values, responsible: activityOwnerName(actor), updatedByUserId: actor.id, lastChangeOrigin: "JANSEN", syncStatus: "PENDING", syncError: null, updatedAt: new Date().toISOString() }).where(eq(calendarEvents.id, id));
    const connection = await getCalendarConnection(context.ownerKey);
    if (!connection) return Response.json({ pending: true, error: "Alteração salva no Jansen e pendente até o Google Calendar ser conectado." }, { status: 202 });
    try { await pushCalendarEventToGoogle(id, connection); }
    catch (error) {
      if (error instanceof GoogleCalendarError && error.status === 412) {
        await syncGoogleCalendar(false, context.source === "SAJULBRA" ? context.calendarId : undefined, context.ownerKey);
        return Response.json({ error: "O evento foi alterado no Google. O calendário foi atualizado; revise antes de salvar novamente." }, { status: 409 });
      }
      return Response.json({ error: error instanceof Error ? error.message : "Alteração salva, mas ainda não sincronizada.", pending: true }, { status: 202 });
    }
    const [event] = await db.select().from(calendarEvents).where(eq(calendarEvents.id, id)).limit(1);
    return Response.json({ event });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível atualizar o agendamento." }, { status: 400 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = parseId((await params).id);
  if (!id) return Response.json({ error: "Agendamento inválido." }, { status: 400 });
  const db = getDb();
  const context = await calendarContext(request);
  if (!context) return Response.json({ error: "Não autenticado." }, { status: 401 });
  const actor = context.actor;
  const [event] = await db.select().from(calendarEvents).where(eq(calendarEvents.id, id)).limit(1);
  const calendarIds = await readableCalendarIds(context);
  if (!event || event.deletedAt || !calendarIds.includes(event.calendarId)) return Response.json({ error: "Agendamento não encontrado neste calendário." }, { status: 404 });
  try {
    await deleteCalendarEventFromGoogle(event, await getCalendarConnection(context.ownerKey) || undefined);
    await db.update(calendarEvents).set({ status: "cancelled", deletedAt: new Date().toISOString(), responsible: activityOwnerName(actor), updatedByUserId: actor.id, lastChangeOrigin: "JANSEN", syncStatus: "SYNCED", syncError: null, updatedAt: new Date().toISOString() }).where(eq(calendarEvents.id, id));
    return Response.json({ success: true });
  } catch (error) {
    await db.update(calendarEvents).set({ syncStatus: "ERROR", syncError: error instanceof Error ? error.message : "Falha ao excluir no Google." }).where(eq(calendarEvents.id, id));
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível excluir o agendamento no Google." }, { status: 502 });
  }
}
