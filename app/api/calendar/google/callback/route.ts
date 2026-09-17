import { encryptRefreshToken, exchangeAuthorizationCode, saveGoogleConnection, syncGoogleCalendar, verifyGoogleOAuthState } from "@/lib/google-calendar";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const appOrigin = url.origin;
  if (!code || !state) return Response.redirect(`${appOrigin}/calendario?google=erro_oauth`);
  if (!await verifyGoogleOAuthState(state)) return Response.redirect(`${appOrigin}/calendario?google=estado_invalido`);
  try {
    const refreshToken = await exchangeAuthorizationCode(code);
    await saveGoogleConnection(await encryptRefreshToken(refreshToken));
    await syncGoogleCalendar(true);
    return Response.redirect(`${appOrigin}/calendario?google=conectado`);
  } catch (error) {
    console.error("[GOOGLE_CALENDAR_CALLBACK]", error);
    return Response.redirect(`${appOrigin}/calendario?google=erro_sincronizacao`);
  }
}
