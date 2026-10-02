import bcrypt from "bcryptjs";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { users, type UserRole } from "@/db/schema";
import {
  clearGoogleStateCookie,
  clearSessionCookie,
  createGoogleStateCookie,
  createSessionToken,
  googleAuthConfig,
  googleStateFromCookie,
  readSession,
  sessionCookie,
} from "@server/auth";

const publicUserFields = { id: users.id, name: users.name, email: users.email, role: users.role };

function roleFromCorporateEmail(email: string): UserRole {
  const account = email.split("@", 1)[0].replace(/[^a-z]/g, "");
  if (account.includes("francisco")) return "FRANCISCO";
  if (account.includes("bruno")) return "BRUNO";
  if (account.includes("yasmin") || account.includes("yasmmin")) return "YASMIN";
  return "ADMIN";
}

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

function loginRedirect(request: Request, error: string) {
  const headers = new Headers({ Location: new URL(`/login?error=${encodeURIComponent(error)}`, request.url).toString() });
  headers.append("Set-Cookie", clearGoogleStateCookie(request));
  return new Response(null, { status: 302, headers });
}

export async function login(request: Request) {
  try {
    const rawBody = await request.text();
    if (rawBody.length > 4096) return jsonError("Requisição muito grande.", 413);
    const body = JSON.parse(rawBody) as { email?: unknown; password?: unknown };
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!email || !password || email.length > 254 || password.length > 200) return jsonError("E-mail ou senha incorretos.", 401);

    const [user] = await getDb().select().from(users).where(eq(users.email, email)).limit(1);
    const validPassword = Boolean(user?.passwordHash) && await bcrypt.compare(password, user!.passwordHash!);
    if (!user || !user.isActive || !validPassword) return jsonError("E-mail ou senha incorretos.", 401);

    const token = await createSessionToken(user.id, user.role);
    const { passwordHash: _passwordHash, googleId: _googleId, avatarUrl: _avatarUrl, isActive: _isActive, createdAt: _createdAt, updatedAt: _updatedAt, ...publicUser } = user;
    return Response.json({ user: publicUser }, {
      headers: { "Cache-Control": "no-store", "Set-Cookie": sessionCookie(request, token) },
    });
  } catch {
    return jsonError("Não foi possível entrar. Tente novamente.", 500);
  }
}

export async function me(request: Request) {
  try {
    const session = await readSession(request);
    if (!session) return jsonError("Não autenticado.", 401);
    const [user] = await getDb().select(publicUserFields).from(users)
      .where(and(eq(users.id, session.userId), eq(users.isActive, true))).limit(1);
    return user ? Response.json(user, { headers: { "Cache-Control": "no-store" } }) : jsonError("Não autenticado.", 401);
  } catch {
    return jsonError("Não foi possível validar a sessão.", 500);
  }
}

export function logout(request: Request) {
  return Response.json({ success: true }, {
    headers: { "Cache-Control": "no-store", "Set-Cookie": clearSessionCookie(request) },
  });
}

export function google(request: Request) {
  try {
    const { clientId, redirectUri, allowedDomain } = googleAuthConfig();
    const state = `${crypto.randomUUID()}${crypto.randomUUID()}`;
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "openid email profile",
      state,
      prompt: "select_account",
      hd: allowedDomain,
    });
    return new Response(null, {
      status: 302,
      headers: {
        Location: `https://accounts.google.com/o/oauth2/v2/auth?${params}`,
        "Set-Cookie": createGoogleStateCookie(request, state),
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return loginRedirect(request, "google_not_configured");
  }
}

export async function googleCallback(request: Request) {
  try {
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const expectedState = googleStateFromCookie(request);
    if (!code || !state || !expectedState || state !== expectedState) return loginRedirect(request, "google_invalid");

    const { clientId, clientSecret, redirectUri, allowedDomain } = googleAuthConfig();
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code" }),
    });
    const tokenData = await tokenResponse.json() as { access_token?: string };
    if (!tokenResponse.ok || !tokenData.access_token) return loginRedirect(request, "google_invalid");

    const profileResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const profile = await profileResponse.json() as { sub?: string; email?: string; email_verified?: boolean; picture?: string; hd?: string; name?: string };
    if (!profileResponse.ok || !profile.sub || !profile.email || profile.email_verified !== true) return loginRedirect(request, "google_invalid");

    const email = profile.email.trim().toLowerCase();
    const emailDomain = email.slice(email.lastIndexOf("@") + 1);
    if (emailDomain !== allowedDomain || (profile.hd && profile.hd.toLowerCase() !== allowedDomain)) {
      return loginRedirect(request, "google_domain_denied");
    }
    const db = getDb();
    let [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (!user) {
      [user] = await db.insert(users).values({
        name: profile.name?.trim() || email.split("@", 1)[0],
        email,
        role: roleFromCorporateEmail(email),
        googleId: profile.sub,
        avatarUrl: profile.picture || null,
        isActive: true,
      }).returning();
    }
    if (!user?.isActive || (user.googleId && user.googleId !== profile.sub)) return loginRedirect(request, "google_denied");

    if (!user.googleId || user.avatarUrl !== (profile.picture || null)) {
      await db.update(users).set({
        googleId: user.googleId || profile.sub,
        avatarUrl: profile.picture || null,
        updatedAt: new Date().toISOString(),
      }).where(eq(users.id, user.id));
    }

    const token = await createSessionToken(user.id, user.role);
    const headers = new Headers({ Location: new URL("/painel", request.url).toString(), "Cache-Control": "no-store" });
    headers.append("Set-Cookie", sessionCookie(request, token));
    headers.append("Set-Cookie", clearGoogleStateCookie(request));
    return new Response(null, { status: 302, headers });
  } catch {
    return loginRedirect(request, "google_invalid");
  }
}
