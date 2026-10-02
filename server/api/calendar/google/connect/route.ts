import { buildGoogleAuthorizationUrl, createGoogleOAuthState, googleCalendarConfigured } from "@/lib/google-calendar";
import { calendarContext } from "@server/calendar-scope";

export async function GET(request: Request) {
  if (!googleCalendarConfigured()) return Response.json({ error: "Configure as credenciais OAuth do Google no servidor." }, { status: 503 });
  const context = await calendarContext(request);
  if (!context) return Response.json({ error: "Não autenticado." }, { status: 401 });
  const state = await createGoogleOAuthState({ ownerKey: context.ownerKey, expectedEmail: context.accountEmail, returnPath: context.returnPath });
  return Response.redirect(buildGoogleAuthorizationUrl(state, context.accountEmail));
}
