import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { googleCalendars } from "@/db/schema";
import { canReadGoogleCalendarEvents, canWatchGoogleCalendarEvents, getCalendarConnection, googleCalendarConfigured } from "@/lib/google-calendar";
import { calendarContext, SAJULBRA_CALENDAR_EMAIL } from "@server/calendar-scope";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const context = await calendarContext(request);
  if (!context) return Response.json({ error: "Não autenticado." }, { status: 401 });
  const connection = await getCalendarConnection(context.ownerKey);
  const calendars = connection
    ? (await getDb().select().from(googleCalendars).where(and(eq(googleCalendars.connectionId, connection.id), eq(googleCalendars.active, true))))
      .filter((calendar) => canReadGoogleCalendarEvents(calendar.accessRole))
      .filter((calendar) => context.source === "SAJULBRA"
        ? calendar.calendarId.toLowerCase() === SAJULBRA_CALENDAR_EMAIL
        : calendar.calendarId.toLowerCase() !== SAJULBRA_CALENDAR_EMAIL)
    : [];
  const watchableCalendars = calendars.filter((calendar) => canWatchGoogleCalendarEvents(calendar.accessRole));
  const accountMatches = connection?.accountEmail?.toLowerCase() === context.accountEmail.toLowerCase();
  const connected = Boolean(connection && accountMatches && watchableCalendars.length > 0);
  const activeWatches = watchableCalendars.filter((calendar) => calendar.channelExpiresAt && new Date(calendar.channelExpiresAt).getTime() > Date.now());
  const earliestExpiration = activeWatches.map((calendar) => calendar.channelExpiresAt!).sort()[0] || null;
  return Response.json({
    configured: googleCalendarConfigured(),
    connected,
    status: connection?.syncStatus || "DISCONNECTED",
    calendarId: connection?.calendarId || null,
    accountEmail: connection?.accountEmail || null,
    expectedAccountEmail: context.accountEmail,
    accessRole: calendars[0]?.accessRole || null,
    lastSyncAt: connection?.lastIncrementalSyncAt || connection?.lastFullSyncAt || null,
    lastSyncError: connection?.lastSyncError || null,
    calendarsCount: calendars.length,
    synchronizedCalendarsCount: watchableCalendars.length,
    calendars: calendars.map((calendar) => ({
      id: calendar.calendarId,
      summary: calendar.summary || calendar.calendarId,
      primary: calendar.primary,
      accessRole: calendar.accessRole,
      backgroundColor: calendar.backgroundColor,
      foregroundColor: calendar.foregroundColor,
    })),
    webhookActive: watchableCalendars.length > 0 && activeWatches.length === watchableCalendars.length,
    webhookExpiresAt: earliestExpiration,
  }, { headers: { "Cache-Control": "no-store" } });
}
