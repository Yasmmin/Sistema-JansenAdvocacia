import { env } from "cloudflare:workers";
import { ensureAllGoogleWatches, syncAllGoogleCalendarConnections } from "@/lib/google-calendar";

export async function POST(request: Request) {
  const secret = env.CALENDAR_CRON_SECRET?.trim();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ error: "Não autorizado." }, { status: 401 });
  try {
    const sync = await syncAllGoogleCalendarConnections(false);
    const watch = await ensureAllGoogleWatches();
    return Response.json({ success: true, sync, watch });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Falha na manutenção do calendário." }, { status: 502 });
  }
}
