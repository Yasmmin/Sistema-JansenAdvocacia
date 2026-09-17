import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { googleCalendars } from "@/db/schema";
import { canWatchGoogleCalendarEvents, getCalendarConnection, googleCalendarConfigured, isGoogleCalendarIncluded } from "@/lib/google-calendar";

export const dynamic = "force-dynamic";

export async function GET() {
  const connection = await getCalendarConnection();
  const calendars = connection
    ? (await getDb().select().from(googleCalendars).where(and(eq(googleCalendars.connectionId, connection.id), eq(googleCalendars.active, true))))
      .filter((calendar) => isGoogleCalendarIncluded(calendar.calendarId))
    : [];
  const watchableCalendars = calendars.filter((calendar) => canWatchGoogleCalendarEvents(calendar.accessRole));
  const activeWatches = watchableCalendars.filter((calendar) => calendar.channelExpiresAt && new Date(calendar.channelExpiresAt).getTime() > Date.now());
  const earliestExpiration = activeWatches.map((calendar) => calendar.channelExpiresAt!).sort()[0] || null;
  return Response.json({
    configured: googleCalendarConfigured(),
    connected: Boolean(connection),
    status: connection?.syncStatus || "DISCONNECTED",
    calendarId: connection?.calendarId || null,
    accountEmail: connection?.accountEmail || null,
    lastSyncAt: connection?.lastIncrementalSyncAt || connection?.lastFullSyncAt || null,
    lastSyncError: connection?.lastSyncError || null,
    calendarsCount: calendars.length,
    synchronizedCalendarsCount: watchableCalendars.length,
    webhookActive: watchableCalendars.length > 0 && activeWatches.length === watchableCalendars.length,
    webhookExpiresAt: earliestExpiration,
  }, { headers: { "Cache-Control": "no-store" } });
}
