import { env } from "cloudflare:workers";
import { jwtVerify, SignJWT } from "jose";
import { getDb } from "@/db";
import { ROLE_PERMISSIONS, USER_ROLES, users, type UserRole } from "@/db/schema";
import { and, eq } from "drizzle-orm";

const SESSION_COOKIE = "jansen_session";
const GOOGLE_STATE_COOKIE = "jansen_google_state";
const SESSION_SECONDS = 8 * 60 * 60;

export type AuthSession = { userId: number; role: UserRole };

function runtimeEnv() {
  const cloudflareEnv = typeof env !== "undefined" ? env : {};
  const processEnv = typeof process !== "undefined" ? process.env ?? {} : {};
  return { ...processEnv, ...cloudflareEnv } as Record<string, string | undefined>;
}

export function readServerEnv(name: string) {
  return runtimeEnv()[name]?.trim() ?? "";
}

function signingKey() {
  const secret = readServerEnv("JWT_SECRET");
  if (secret.length < 32) throw new Error("JWT_SECRET deve possuir pelo menos 32 caracteres.");
  return new TextEncoder().encode(secret);
}

function isRole(value: unknown): value is UserRole {
  return typeof value === "string" && (USER_ROLES as readonly string[]).includes(value);
}

function cookieValue(request: Request, name: string) {
  const cookies = request.headers.get("cookie") || "";
  for (const item of cookies.split(";")) {
    const separator = item.indexOf("=");
    if (separator < 0) continue;
    if (item.slice(0, separator).trim() === name) return decodeURIComponent(item.slice(separator + 1).trim());
  }
  return null;
}

function cookieSecurity(request: Request) {
  return new URL(request.url).protocol === "https:" ? "; Secure" : "";
}

export async function createSessionToken(userId: number, role: UserRole) {
  return new SignJWT({ role })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(String(userId))
    .setIssuer("jansen-auth")
    .setAudience("jansen-app")
    .setIssuedAt()
    .setExpirationTime(`${SESSION_SECONDS}s`)
    .sign(signingKey());
}

export async function readSession(request: Request): Promise<AuthSession | null> {
  const token = cookieValue(request, SESSION_COOKIE);
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, signingKey(), {
      algorithms: ["HS256"],
      issuer: "jansen-auth",
      audience: "jansen-app",
    });
    const userId = Number(payload.sub);
    if (!Number.isInteger(userId) || userId < 1 || !isRole(payload.role)) return null;
    return { userId, role: payload.role };
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("JWT_SECRET")) throw error;
    return null;
  }
}

export async function authenticatedUser(request: Request) {
  const session = await readSession(request);
  if (!session) return null;
  const [user] = await getDb().select({ id: users.id, name: users.name, email: users.email, role: users.role })
    .from(users).where(and(eq(users.id, session.userId), eq(users.isActive, true))).limit(1);
  return user || null;
}

export function activityOwnerName(user: { name: string; role: UserRole }) {
  if (user.role === "FRANCISCO") return "Francisco Jansen";
  if (user.role === "BRUNO") return "Bruno Boff";
  if (user.role === "YASMIN") return "Yasmmin Flávia";
  return user.name;
}

export function hasPermission(role: UserRole, permission: string) {
  const permissions = ROLE_PERMISSIONS[role];
  return permissions.includes("*") || (permissions as readonly string[]).includes(permission);
}

export function sessionCookie(request: Request, token: string) {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${SESSION_SECONDS}${cookieSecurity(request)}`;
}

export function clearSessionCookie(request: Request) {
  return `${SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${cookieSecurity(request)}`;
}

export function createGoogleStateCookie(request: Request, state: string) {
  return `${GOOGLE_STATE_COOKIE}=${encodeURIComponent(state)}; HttpOnly; Path=/api/auth/google; SameSite=Lax; Max-Age=600${cookieSecurity(request)}`;
}

export function clearGoogleStateCookie(request: Request) {
  return `${GOOGLE_STATE_COOKIE}=; HttpOnly; Path=/api/auth/google; SameSite=Lax; Max-Age=0${cookieSecurity(request)}`;
}

export function googleStateFromCookie(request: Request) {
  return cookieValue(request, GOOGLE_STATE_COOKIE);
}

export function googleAuthConfig() {
  const clientId = readServerEnv("GOOGLE_CLIENT_ID");
  const clientSecret = readServerEnv("GOOGLE_CLIENT_SECRET");
  const redirectUri = readServerEnv("GOOGLE_REDIRECT_URI");
  const allowedDomain = (readServerEnv("GOOGLE_ALLOWED_DOMAIN") || "jansenadvocacia.com.br").toLowerCase();
  if (!clientId || !clientSecret || !redirectUri) throw new Error("Login com Google não configurado.");
  return { clientId, clientSecret, redirectUri, allowedDomain };
}
