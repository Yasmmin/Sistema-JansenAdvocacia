import { authenticatedUser } from "@server/auth";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { googleCalendars } from "@/db/schema";
import { canReadGoogleCalendarEvents, getCalendarConnection } from "@/lib/google-calendar";

export const SAJULBRA_CALENDAR_EMAIL = "francisco.jansen@ulbra.br";
export const SAJULBRA_CALENDAR_OWNER = "SAJULBRA_SHARED";

export type CalendarSource = "PRIVATE" | "SAJULBRA";

export function calendarOwnerForUser(email: string) {
  return `USER:${email.trim().toLowerCase()}`;
}

export function calendarIdForOwner(ownerKey: string) {
  if (ownerKey === SAJULBRA_CALENDAR_OWNER) return SAJULBRA_CALENDAR_EMAIL;
  if (ownerKey.startsWith("USER:")) return ownerKey.slice(5);
  return "primary";
}

export async function calendarContext(request: Request) {
  const actor = await authenticatedUser(request);
  if (!actor) return null;
  const source: CalendarSource = new URL(request.url).searchParams.get("source") === "SAJULBRA" ? "SAJULBRA" : "PRIVATE";
  const accountEmail = source === "SAJULBRA" ? SAJULBRA_CALENDAR_EMAIL : actor.email.trim().toLowerCase();
  return {
    actor,
    source,
    accountEmail,
    calendarId: accountEmail,
    ownerKey: source === "SAJULBRA" ? SAJULBRA_CALENDAR_OWNER : calendarOwnerForUser(accountEmail),
    returnPath: source === "SAJULBRA" ? "/sajulbra/calendario" : "/calendario",
  };
}

export type CalendarContext = NonNullable<Awaited<ReturnType<typeof calendarContext>>>;

export async function readableCalendarIds(context: CalendarContext) {
  if (context.source === "SAJULBRA") return [SAJULBRA_CALENDAR_EMAIL];
  const connection = await getCalendarConnection(context.ownerKey);
  if (!connection) return [context.calendarId];
  const calendars = await getDb().select().from(googleCalendars).where(and(
    eq(googleCalendars.connectionId, connection.id),
    eq(googleCalendars.active, true),
  ));
  const linked = calendars
    .filter((calendar) => canReadGoogleCalendarEvents(calendar.accessRole))
    .map((calendar) => calendar.calendarId)
    .filter((calendarId) => calendarId.toLowerCase() !== SAJULBRA_CALENDAR_EMAIL);
  return [...new Set([context.calendarId, ...linked])];
}

export async function writableCalendarIds(context: CalendarContext) {
  if (context.source === "SAJULBRA") return [context.calendarId];
  const connection = await getCalendarConnection(context.ownerKey);
  if (!connection) return [context.calendarId];
  const calendars = await getDb().select().from(googleCalendars).where(and(
    eq(googleCalendars.connectionId, connection.id),
    eq(googleCalendars.active, true),
  ));
  const linked = calendars
    .filter((calendar) => calendar.accessRole === "owner" || calendar.accessRole === "writer")
    .map((calendar) => calendar.calendarId)
    .filter((calendarId) => calendarId.toLowerCase() !== SAJULBRA_CALENDAR_EMAIL);
  return [...new Set([context.calendarId, ...linked])];
}
