import { encryptRefreshToken, exchangeAuthorizationCode, getCalendarConnection, saveGoogleConnection, syncGoogleCalendar, verifyGoogleOAuthState } from "@/lib/google-calendar";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const appOrigin = url.origin;
  if (!code || !state) return Response.redirect(`${appOrigin}/calendario?google=erro_oauth`);
  const context = await verifyGoogleOAuthState(state);
  if (!context) return Response.redirect(`${appOrigin}/calendario?google=estado_invalido`);
  try {
    const refreshToken = await exchangeAuthorizationCode(code);
    await saveGoogleConnection(await encryptRefreshToken(refreshToken), context.ownerKey, context.expectedEmail);
    await syncGoogleCalendar(true, context.ownerKey === "SAJULBRA_SHARED" ? context.expectedEmail : undefined, context.ownerKey);
    const connection = await getCalendarConnection(context.ownerKey);
    if (connection?.accountEmail?.toLowerCase() !== context.expectedEmail.toLowerCase()) {
      throw new Error(`Conecte exatamente a conta ${context.expectedEmail}.`);
    }
    return Response.redirect(`${appOrigin}${context.returnPath}?google=conectado`);
  } catch (error) {
    console.error("[GOOGLE_CALENDAR_CALLBACK]", error);
    return Response.redirect(`${appOrigin}${context.returnPath}?google=erro_sincronizacao`);
  }
}
