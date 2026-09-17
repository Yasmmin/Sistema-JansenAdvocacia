import { buildGoogleAuthorizationUrl, createGoogleOAuthState, googleCalendarConfigured } from "@/lib/google-calendar";

export async function GET() {
  if (!googleCalendarConfigured()) return Response.json({ error: "Configure as credenciais OAuth do Google no servidor." }, { status: 503 });
  const state = await createGoogleOAuthState();
  return Response.redirect(buildGoogleAuthorizationUrl(state));
}
