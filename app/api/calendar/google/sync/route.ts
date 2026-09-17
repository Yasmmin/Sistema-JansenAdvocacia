import { ensureGoogleWatch, syncGoogleCalendar } from "@/lib/google-calendar";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { full?: boolean; calendarId?: string };
  try {
    const result = await syncGoogleCalendar(Boolean(body.full), body.calendarId?.trim() || undefined);
    const watch = await ensureGoogleWatch();
    return Response.json({ success: true, result, watch });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível sincronizar o Google Calendar." }, { status: 502 });
  }
}
