import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { googleCalendars } from "@/db/schema";
import { sha256, syncGoogleCalendar } from "@/lib/google-calendar";

export async function POST(request: Request) {
  const channelId = request.headers.get("x-goog-channel-id");
  const resourceId = request.headers.get("x-goog-resource-id");
  const channelToken = request.headers.get("x-goog-channel-token");
  if (!channelId || !resourceId || !channelToken) return new Response(null, { status: 400 });
  const [calendar] = await getDb().select().from(googleCalendars).where(eq(googleCalendars.channelId, channelId)).limit(1);
  if (!calendar || calendar.channelResourceId !== resourceId || calendar.channelTokenHash !== await sha256(channelToken)) return new Response(null, { status: 403 });
  try {
    await syncGoogleCalendar(false, calendar.calendarId);
    return new Response(null, { status: 204 });
  } catch (error) {
    console.error("[GOOGLE_CALENDAR_WEBHOOK]", error);
    return new Response(null, { status: 500 });
  }
}
