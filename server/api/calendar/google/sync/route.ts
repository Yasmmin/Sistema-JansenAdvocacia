import { ensureGoogleWatch, syncGoogleCalendar } from "@/lib/google-calendar";
import { calendarContext } from "@server/calendar-scope";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { full?: boolean; calendarId?: string };
  try {
    const context = await calendarContext(request);
    if (!context) return Response.json({ error: "Não autenticado." }, { status: 401 });
    const targetCalendarId = context.source === "SAJULBRA" ? context.calendarId : undefined;
    const result = await syncGoogleCalendar(Boolean(body.full), targetCalendarId, context.ownerKey);
    const watch = await ensureGoogleWatch(false, context.ownerKey, targetCalendarId);
    return Response.json({ success: true, result, watch });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível sincronizar o Google Calendar." }, { status: 502 });
  }
}
