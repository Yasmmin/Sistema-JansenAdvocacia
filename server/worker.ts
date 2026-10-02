import { handleApiRequest } from "@server/router";
import { authenticatedUser, hasPermission } from "@server/auth";
import { getDb } from "@/db";
import { auditLogs } from "@/db/schema";
import { ensureAllGoogleWatches, syncAllGoogleCalendarConnections } from "@/lib/google-calendar";
import { syncDjen } from "@/lib/sync";

type JansenEnv = Cloudflare.Env & {
  ASSETS: Fetcher;
};

export default {
  async fetch(request: Request, env: JansenEnv) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);

    const publicPaths = new Set([
      "/api/auth/login",
      "/api/auth/google",
      "/api/auth/google/callback",
      "/api/auth/logout",
      "/api/auth/me",
      "/api/calendar/google/webhook",
      "/api/calendar/google/maintenance",
      "/api/eproc/verification",
    ]);
    const normalizedPath = url.pathname.replace(/\/$/, "") || "/";
    if (normalizedPath === "/api/eproc/verification" && request.method === "OPTIONS") {
      const origin = request.headers.get("Origin") || "*";
      return new Response(null, { status: 204, headers: {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, X-Eproc-Automation-Key, X-Eproc-Extension",
        "Access-Control-Max-Age": "86400",
      } });
    }
    let actor: Awaited<ReturnType<typeof authenticatedUser>> = null;
    if (!publicPaths.has(normalizedPath)) {
      try {
        actor = await authenticatedUser(request);
        if (!actor || !hasPermission(actor.role, "*")) {
          return Response.json({ error: "Não autenticado." }, { status: 401, headers: { "Cache-Control": "no-store" } });
        }
      } catch (error) {
        console.error("[AUTH_MIDDLEWARE]", error instanceof Error ? error.message : "Falha ao validar sessão.");
        return Response.json({ error: "Autenticação indisponível." }, { status: 503, headers: { "Cache-Control": "no-store" } });
      }
    }

    let response = await handleApiRequest(request);
    if (normalizedPath === "/api/eproc/verification") {
      const headers = new Headers(response.headers);
      headers.set("Access-Control-Allow-Origin", request.headers.get("Origin") || "*");
      headers.set("Access-Control-Allow-Credentials", "true");
      response = new Response(response.body, { status: response.status, statusText: response.statusText, headers });
    }
    if (actor && ["POST", "PUT", "PATCH", "DELETE"].includes(request.method) && response.status < 400) {
      try {
        await getDb().insert(auditLogs).values({
          userId: actor.id,
          userName: actor.name,
          userEmail: actor.email,
          method: request.method,
          path: normalizedPath,
          responseStatus: response.status,
        });
      } catch (error) {
        console.error("[AUDIT_LOG] Falha ao registrar ação.", error);
      }
    }
    return response;
  },

  scheduled(controller: ScheduledController, _env: JansenEnv, context: ExecutionContext) {
    context.waitUntil((async () => {
      try {
        if (controller.cron === "0 * * * *") {
          const result = await syncDjen();
          console.log("[OAB_CRON] Sincronização concluída.", { cron: controller.cron, result });
          return;
        }

        const sync = await syncAllGoogleCalendarConnections(false);
        const watch = await ensureAllGoogleWatches();
        console.log("[CALENDAR_CRON] Sincronização concluída.", { cron: controller.cron, sync, watch });
      } catch (error) {
        console.error("[SCHEDULED_SYNC] Falha na sincronização automática.", { cron: controller.cron, error: error instanceof Error ? error.message : error });
        throw error;
      }
    })());
  },
} satisfies ExportedHandler<JansenEnv>;
