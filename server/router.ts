import * as portfolioSync from "@server/api/portfolio-sync/route";
import * as auth from "@server/api/auth/route";
import * as djenTest from "@server/api/djen/test/route";
import * as intimations from "@server/api/intimations/route";
import * as pendingIntimationsCount from "@server/api/intimations/pending-count/route";
import * as tasks from "@server/api/tasks/route";
import * as syncStatus from "@server/api/sync/status/route";
import * as taskById from "@server/api/tasks/[id]/route";
import * as sync from "@server/api/sync/route";
import * as dashboard from "@server/api/dashboard/route";
import * as djen from "@server/api/djen/route";
import * as calendarEventById from "@server/api/calendar/events/[id]/route";
import * as calendarEvents from "@server/api/calendar/events/route";
import * as clients from "@server/api/clients/route";
import * as calendarOptions from "@server/api/calendar/options/route";
import * as intimationClassification from "@server/api/intimations/[id]/classification/route";
import * as calendarWebhook from "@server/api/calendar/google/webhook/route";
import * as calendarSync from "@server/api/calendar/google/sync/route";
import * as calendarStatus from "@server/api/calendar/google/status/route";
import * as calendarMaintenance from "@server/api/calendar/google/maintenance/route";
import * as calendarConnect from "@server/api/calendar/google/connect/route";
import * as calendarCallback from "@server/api/calendar/google/callback/route";
import * as processEnrich from "@server/api/processes/[id]/enrich/route";
import * as pendingProcessById from "@server/api/pending-processes/[id]/route";
import * as processById from "@server/api/processes/[id]/route";
import * as intimationById from "@server/api/intimations/[id]/route";
import * as clientProcesses from "@server/api/clients/[id]/processes/route";
import * as clientById from "@server/api/clients/[id]/route";
import * as clientTasks from "@server/api/clients/[id]/tasks/route";
import * as intimationStatus from "@server/api/intimations/[id]/status/route";
import * as eprocVerification from "@server/api/eproc/verification/route";

type RouteModule = Record<string, unknown>;
type RouteHandler = (request: Request, context: { params: Promise<Record<string, string>> }) => Response | Promise<Response>;

type ApiRoute = {
  pattern: RegExp;
  params?: readonly string[];
  module: RouteModule;
};

const apiRoutes: ApiRoute[] = [
  { pattern: /^\/api\/auth\/login\/?$/, module: { POST: auth.login } },
  { pattern: /^\/api\/auth\/google\/callback\/?$/, module: { GET: auth.googleCallback } },
  { pattern: /^\/api\/auth\/google\/?$/, module: { GET: auth.google } },
  { pattern: /^\/api\/auth\/me\/?$/, module: { GET: auth.me } },
  { pattern: /^\/api\/auth\/logout\/?$/, module: { POST: auth.logout } },
  { pattern: /^\/api\/eproc\/verification\/?$/, module: eprocVerification },
  { pattern: /^\/api\/portfolio-sync\/?$/, module: portfolioSync },
  { pattern: /^\/api\/djen\/test\/?$/, module: djenTest },
  { pattern: /^\/api\/intimations\/pending-count\/?$/, module: pendingIntimationsCount },
  { pattern: /^\/api\/intimations\/?$/, module: intimations },
  { pattern: /^\/api\/tasks\/?$/, module: tasks },
  { pattern: /^\/api\/sync\/status\/?$/, module: syncStatus },
  { pattern: /^\/api\/tasks\/([^/]+)\/?$/, params: ["id"], module: taskById },
  { pattern: /^\/api\/sync\/?$/, module: sync },
  { pattern: /^\/api\/dashboard\/?$/, module: dashboard },
  { pattern: /^\/api\/djen\/?$/, module: djen },
  { pattern: /^\/api\/calendar\/events\/([^/]+)\/?$/, params: ["id"], module: calendarEventById },
  { pattern: /^\/api\/calendar\/events\/?$/, module: calendarEvents },
  { pattern: /^\/api\/clients\/?$/, module: clients },
  { pattern: /^\/api\/calendar\/options\/?$/, module: calendarOptions },
  { pattern: /^\/api\/intimations\/([^/]+)\/classification\/?$/, params: ["id"], module: intimationClassification },
  { pattern: /^\/api\/calendar\/google\/webhook\/?$/, module: calendarWebhook },
  { pattern: /^\/api\/calendar\/google\/sync\/?$/, module: calendarSync },
  { pattern: /^\/api\/calendar\/google\/status\/?$/, module: calendarStatus },
  { pattern: /^\/api\/calendar\/google\/maintenance\/?$/, module: calendarMaintenance },
  { pattern: /^\/api\/calendar\/google\/connect\/?$/, module: calendarConnect },
  { pattern: /^\/api\/calendar\/google\/callback\/?$/, module: calendarCallback },
  { pattern: /^\/api\/processes\/([^/]+)\/enrich\/?$/, params: ["id"], module: processEnrich },
  { pattern: /^\/api\/pending-processes\/([^/]+)\/?$/, params: ["id"], module: pendingProcessById },
  { pattern: /^\/api\/processes\/([^/]+)\/?$/, params: ["id"], module: processById },
  { pattern: /^\/api\/intimations\/([^/]+)\/?$/, params: ["id"], module: intimationById },
  { pattern: /^\/api\/clients\/([^/]+)\/processes\/?$/, params: ["id"], module: clientProcesses },
  { pattern: /^\/api\/clients\/([^/]+)\/tasks\/?$/, params: ["id"], module: clientTasks },
  { pattern: /^\/api\/clients\/([^/]+)\/?$/, params: ["id"], module: clientById },
  { pattern: /^\/api\/intimations\/([^/]+)\/status\/?$/, params: ["id"], module: intimationStatus },
];

export async function handleApiRequest(request: Request) {
  const pathname = new URL(request.url).pathname;

  for (const route of apiRoutes) {
    const match = route.pattern.exec(pathname);
    if (!match) continue;

    const handler = route.module[request.method.toUpperCase()] as RouteHandler | undefined;
    if (!handler) {
      const allowed = ["GET", "POST", "PATCH", "DELETE"].filter((method) => typeof route.module[method] === "function");
      return Response.json({ error: "Método não permitido." }, { status: 405, headers: { Allow: allowed.join(", ") } });
    }

    const params = Object.fromEntries((route.params ?? []).map((name, index) => [name, decodeURIComponent(match[index + 1])]));
    return handler(request, { params: Promise.resolve(params) });
  }

  return Response.json({ error: "Rota de API não encontrada." }, { status: 404 });
}
