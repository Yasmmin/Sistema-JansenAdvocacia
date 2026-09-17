// The vinext build creates this module before Wrangler bundles the Worker.
import application from "./dist/server/index.js";

type JansenEnv = Cloudflare.Env & {
  CALENDAR_CRON_SECRET?: string;
  GOOGLE_CALENDAR_WEBHOOK_URL?: string;
  GOOGLE_CALENDAR_INCLUDED_IDS?: string;
  GOOGLE_CALENDAR_DEFAULT_ID?: string;
};

export default {
  fetch(request: Request, env: JansenEnv, context: ExecutionContext) {
    return application.fetch(request, env, context);
  },

  scheduled(_controller: ScheduledController, env: JansenEnv, context: ExecutionContext) {
    const secret = env.CALENDAR_CRON_SECRET?.trim();
    const webhookUrl = env.GOOGLE_CALENDAR_WEBHOOK_URL?.trim();
    if (!secret || !webhookUrl) {
      console.error("[CALENDAR_MAINTENANCE] Cron ou webhook nao configurado.");
      return;
    }

    const maintenanceUrl = new URL("/api/calendar/google/maintenance", webhookUrl).toString();
    context.waitUntil(
      application.fetch(new Request(maintenanceUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${secret}` },
      }), env, context).then(async (response: Response) => {
        if (!response.ok) throw new Error(`[CALENDAR_MAINTENANCE] HTTP ${response.status}: ${await response.text()}`);
      }),
    );
  },
};
