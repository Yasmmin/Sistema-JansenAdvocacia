import { env } from "cloudflare:workers";
import { and, eq, inArray, isNotNull, isNull, or } from "drizzle-orm";
import { getDb } from "@/db";
import { calendarConnections, calendarEvents, googleCalendars } from "@/db/schema";
import { calendarColorByBackground } from "@/lib/calendar";

const OWNER_KEY = "JANSEN_OFFICE";
const DEFAULT_CALENDAR = "primary";
const TIME_ZONE = "America/Sao_Paulo";
const GOOGLE_API = "https://www.googleapis.com/calendar/v3";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const FULL_PAGE_PREFIX = "full-page:";

function runtimeEnv() {
  const cloudflareEnv = typeof env !== "undefined" ? env : {};
  const processEnv = typeof process !== "undefined" ? process.env ?? {} : {};
  const viteEnv = typeof import.meta !== "undefined" ? (((import.meta as unknown) as { env?: Record<string, string | undefined> }).env ?? {}) : {};
  return { ...viteEnv, ...processEnv, ...cloudflareEnv } as Record<string, string | undefined>;
}

function readEnv(name: string) {
  return runtimeEnv()[name]?.trim() ?? "";
}

type CalendarConnection = typeof calendarConnections.$inferSelect;
type CalendarEvent = typeof calendarEvents.$inferSelect;
type GoogleEvent = {
  id: string;
  status?: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: { date?: string; dateTime?: string; timeZone?: string };
  end?: { date?: string; dateTime?: string; timeZone?: string };
  attendees?: Array<{ email?: string }>;
  organizer?: { email?: string; self?: boolean };
  recurrence?: string[];
  reminders?: { useDefault?: boolean; overrides?: Array<{ method: string; minutes: number }> };
  updated?: string;
  htmlLink?: string;
  etag?: string;
  colorId?: string;
  extendedProperties?: { private?: Record<string, string> };
};

type GoogleEventList = { items?: GoogleEvent[]; nextPageToken?: string; nextSyncToken?: string };
type GoogleCalendarListItem = {
  id: string;
  summary?: string;
  primary?: boolean;
  accessRole?: string;
  backgroundColor?: string;
  foregroundColor?: string;
  deleted?: boolean;
  hidden?: boolean;
};
type GoogleCalendarList = { items?: GoogleCalendarListItem[]; nextPageToken?: string };
type GoogleColors = {
  calendar?: Record<string, { background?: string; foreground?: string }>;
  event?: Record<string, { background?: string; foreground?: string }>;
};

export function canReadGoogleCalendarEvents(accessRole: string) {
  return accessRole !== "freeBusyReader" && accessRole !== "none";
}

export function canWatchGoogleCalendarEvents(accessRole: string) {
  return accessRole === "owner" || accessRole === "writer";
}

function configuredCalendarIds() {
  return new Set((readEnv("GOOGLE_CALENDAR_INCLUDED_IDS") || "").split(",").map((id) => id.trim()).filter(Boolean));
}

export function isGoogleCalendarIncluded(calendarId: string) {
  const included = configuredCalendarIds();
  return included.size === 0 || included.has(calendarId);
}

export function getDefaultGoogleCalendarId() {
  return readEnv("GOOGLE_CALENDAR_DEFAULT_ID") || DEFAULT_CALENDAR;
}

export class GoogleCalendarError extends Error {
  constructor(message: string, public status: number, public details?: string) {
    super(message);
  }
}

function requireConfig() {
  const clientId = readEnv("GOOGLE_CLIENT_ID");
  const clientSecret = readEnv("GOOGLE_CLIENT_SECRET");
  const redirectUri = readEnv("GOOGLE_OAUTH_REDIRECT_URI");
  const encryptionKey = readEnv("GOOGLE_TOKEN_ENCRYPTION_KEY");
  if (!clientId || !clientSecret || !redirectUri || !encryptionKey) {
    throw new Error("A integração com o Google Calendar ainda não foi configurada no servidor.");
  }
  return { clientId, clientSecret, redirectUri, encryptionKey };
}

export function googleCalendarConfigured() {
  return Boolean(readEnv("GOOGLE_CLIENT_ID") && readEnv("GOOGLE_CLIENT_SECRET") && readEnv("GOOGLE_OAUTH_REDIRECT_URI") && readEnv("GOOGLE_TOKEN_ENCRYPTION_KEY"));
}

function bytesToBase64(value: Uint8Array) {
  return Buffer.from(value).toString("base64url");
}

function base64ToBytes(value: string) {
  return new Uint8Array(Buffer.from(value, "base64url"));
}

async function cryptoKey(secret: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptRefreshToken(token: string) {
  const { encryptionKey } = requireConfig();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await cryptoKey(encryptionKey), new TextEncoder().encode(token));
  return `${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(encrypted))}`;
}

async function decryptRefreshToken(value: string) {
  const { encryptionKey } = requireConfig();
  const [iv, payload] = value.split(".");
  if (!iv || !payload) throw new Error("Credencial do Google Calendar inválida.");
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64ToBytes(iv) }, await cryptoKey(encryptionKey), base64ToBytes(payload));
  return new TextDecoder().decode(decrypted);
}

export async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return bytesToBase64(new Uint8Array(digest));
}

async function oauthStateSignature(payload: string) {
  const { encryptionKey } = requireConfig();
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(encryptionKey), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return bytesToBase64(new Uint8Array(signature));
}

export async function createGoogleOAuthState() {
  const payload = `${Date.now()}.${crypto.randomUUID()}${crypto.randomUUID()}`;
  return `${payload}.${await oauthStateSignature(payload)}`;
}

export async function verifyGoogleOAuthState(state: string) {
  const parts = state.split(".");
  if (parts.length !== 3) return false;
  const [timestamp, nonce, receivedSignature] = parts;
  const issuedAt = Number(timestamp);
  if (!nonce || !receivedSignature || !Number.isFinite(issuedAt) || issuedAt > Date.now() + 60_000 || Date.now() - issuedAt > 10 * 60_000) return false;
  const expectedSignature = await oauthStateSignature(`${timestamp}.${nonce}`);
  if (expectedSignature.length !== receivedSignature.length) return false;
  let difference = 0;
  for (let index = 0; index < expectedSignature.length; index += 1) difference |= expectedSignature.charCodeAt(index) ^ receivedSignature.charCodeAt(index);
  return difference === 0;
}

export function buildGoogleAuthorizationUrl(state: string) {
  const { clientId, redirectUri } = requireConfig();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "consent",
    scope: "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.calendarlist.readonly",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export async function exchangeAuthorizationCode(code: string) {
  const { clientId, clientSecret, redirectUri } = requireConfig();
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code" }),
  });
  const data = await response.json() as { refresh_token?: string; error_description?: string };
  if (!response.ok || !data.refresh_token) throw new GoogleCalendarError(data.error_description || "O Google não retornou uma credencial permanente. Tente conectar novamente.", response.status);
  return data.refresh_token;
}

async function getAccessToken(connection: CalendarConnection) {
  const { clientId, clientSecret } = requireConfig();
  const refreshToken = await decryptRefreshToken(connection.encryptedRefreshToken);
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ refresh_token: refreshToken, client_id: clientId, client_secret: clientSecret, grant_type: "refresh_token" }),
  });
  const data = await response.json() as { access_token?: string; error_description?: string };
  if (!response.ok || !data.access_token) throw new GoogleCalendarError(data.error_description || "Não foi possível renovar o acesso ao Google Calendar.", response.status);
  return data.access_token;
}

async function googleRequest<T>(connection: CalendarConnection, path: string, init: RequestInit = {}) {
  const response = await fetch(`${GOOGLE_API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${await getAccessToken(connection)}`, "Content-Type": "application/json", ...init.headers },
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) as T & { error?: { message?: string } } : {} as T & { error?: { message?: string } };
  if (!response.ok) throw new GoogleCalendarError(data.error?.message || "Falha na comunicação com o Google Calendar.", response.status, text);
  return data;
}

export async function getCalendarConnection() {
  const [connection] = await getDb().select().from(calendarConnections).where(eq(calendarConnections.ownerKey, OWNER_KEY)).limit(1);
  return connection || null;
}

function safeJson<T>(value: string, fallback: T): T {
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

function internalEventToGoogle(event: CalendarEvent) {
  const start = event.allDay ? { date: event.startAt.slice(0, 10) } : { dateTime: event.startAt, timeZone: event.timeZone };
  const end = event.allDay ? { date: event.endAt.slice(0, 10) } : { dateTime: event.endAt, timeZone: event.timeZone };
  return {
    summary: event.title,
    description: event.description || undefined,
    location: event.location || undefined,
    start,
    end,
    attendees: safeJson<string[]>(event.attendees, []).filter(Boolean).map((email) => ({ email })),
    recurrence: safeJson<string[]>(event.recurrence, []),
    reminders: safeJson<Record<string, unknown>>(event.reminders, { useDefault: true }),
    colorId: calendarColorByBackground(event.googleColor).id,
    extendedProperties: { private: {
      jansenEventId: String(event.id),
      jansenResponsible: event.responsible || "",
      jansenClientId: event.clientId ? String(event.clientId) : "",
      jansenProcessId: event.processId ? String(event.processId) : "",
      jansenCnj: event.cnj || "",
      jansenEprocUrl: event.eprocUrl || "",
      jansenLegalType: event.legalType,
    } },
  };
}

function privateNumber(value?: string) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

async function applyGoogleEvent(connection: CalendarConnection, calendarId: string, googleEvent: GoogleEvent, googleColor?: string | null, googleForegroundColor?: string | null) {
  const db = getDb();
  const privateData = googleEvent.extendedProperties?.private || {};
  const [byGoogle] = await db.select().from(calendarEvents).where(and(eq(calendarEvents.calendarId, calendarId), eq(calendarEvents.googleEventId, googleEvent.id))).limit(1);
  const jansenId = privateNumber(privateData.jansenEventId);
  const [byJansen] = !byGoogle && jansenId ? await db.select().from(calendarEvents).where(eq(calendarEvents.id, jansenId)).limit(1) : [];
  const existing = byGoogle || byJansen;
  if (googleEvent.status === "cancelled") {
    if (existing) await db.update(calendarEvents).set({ status: "cancelled", deletedAt: new Date().toISOString(), googleUpdatedAt: googleEvent.updated || null, lastChangeOrigin: "GOOGLE", syncStatus: "SYNCED", syncError: null, updatedAt: new Date().toISOString() }).where(eq(calendarEvents.id, existing.id));
    return "deleted" as const;
  }
  if (!googleEvent.start || !googleEvent.end) return "ignored" as const;
  const allDay = Boolean(googleEvent.start.date);
  const startAt = googleEvent.start.date || googleEvent.start.dateTime;
  const endAt = googleEvent.end.date || googleEvent.end.dateTime;
  if (!startAt || !endAt) return "ignored" as const;
  const values = {
    googleEventId: googleEvent.id,
    calendarId,
    responsible: privateData.jansenResponsible || existing?.responsible || null,
    title: googleEvent.summary?.trim() || "Evento sem título",
    description: googleEvent.description || null,
    location: googleEvent.location || null,
    startAt,
    endAt,
    allDay,
    timeZone: googleEvent.start.timeZone || existing?.timeZone || TIME_ZONE,
    status: googleEvent.status || "confirmed",
    legalType: (privateData.jansenLegalType || existing?.legalType || "OTHER") as CalendarEvent["legalType"],
    attendees: JSON.stringify((googleEvent.attendees || []).flatMap((person) => person.email ? [person.email] : [])),
    recurrence: JSON.stringify(googleEvent.recurrence || []),
    reminders: JSON.stringify(googleEvent.reminders || { useDefault: true }),
    clientId: privateNumber(privateData.jansenClientId) || existing?.clientId || null,
    processId: privateNumber(privateData.jansenProcessId) || existing?.processId || null,
    cnj: privateData.jansenCnj || existing?.cnj || null,
    eprocUrl: privateData.jansenEprocUrl || existing?.eprocUrl || null,
    googleUpdatedAt: googleEvent.updated || null,
    googleHtmlLink: googleEvent.htmlLink || null,
    googleEtag: googleEvent.etag || null,
    googleColor: googleColor || null,
    googleForegroundColor: googleForegroundColor || null,
    lastChangeOrigin: "GOOGLE" as const,
    syncStatus: "SYNCED" as const,
    syncError: null,
    deletedAt: null,
    updatedAt: new Date().toISOString(),
  };
  if (existing) await db.update(calendarEvents).set(values).where(eq(calendarEvents.id, existing.id));
  else await db.insert(calendarEvents).values(values);
  return existing ? "updated" as const : "created" as const;
}

async function listGoogleEvents(connection: CalendarConnection, calendarId: string, syncToken?: string | null, pageToken?: string | null) {
  const params = new URLSearchParams({ showDeleted: "true", maxResults: "2500" });
  if (syncToken) params.set("syncToken", syncToken);
  if (pageToken) params.set("pageToken", pageToken);
  const page = await googleRequest<GoogleEventList>(connection, `/calendars/${encodeURIComponent(calendarId)}/events?${params}`);
  return { items: page.items || [], nextPageToken: page.nextPageToken, nextSyncToken: page.nextSyncToken };
}

async function listGoogleCalendars(connection: CalendarConnection) {
  const items: GoogleCalendarListItem[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({ maxResults: "250" });
    if (pageToken) params.set("pageToken", pageToken);
    const page = await googleRequest<GoogleCalendarList>(connection, `/users/me/calendarList?${params}`);
    items.push(...(page.items || []));
    pageToken = page.nextPageToken;
  } while (pageToken);
  return items.filter((calendar) => calendar.id && !calendar.deleted);
}

async function getGoogleColors(connection: CalendarConnection) {
  return googleRequest<GoogleColors>(connection, "/colors");
}

async function refreshGoogleCalendars(connection: CalendarConnection) {
  const db = getDb();
  const now = new Date().toISOString();
  const remoteCalendars = await listGoogleCalendars(connection);
  await db.update(googleCalendars).set({ active: false, updatedAt: now }).where(eq(googleCalendars.connectionId, connection.id));
  for (const calendar of remoteCalendars) {
    await db.insert(googleCalendars).values({
      connectionId: connection.id,
      calendarId: calendar.id,
      summary: calendar.summary || calendar.id,
      primary: Boolean(calendar.primary),
      accessRole: calendar.accessRole || "reader",
      backgroundColor: calendar.backgroundColor || null,
      foregroundColor: calendar.foregroundColor || null,
      active: true,
      updatedAt: now,
    }).onConflictDoUpdate({
      target: [googleCalendars.connectionId, googleCalendars.calendarId],
      set: {
        summary: calendar.summary || calendar.id,
        primary: Boolean(calendar.primary),
        accessRole: calendar.accessRole || "reader",
        backgroundColor: calendar.backgroundColor || null,
        foregroundColor: calendar.foregroundColor || null,
        active: true,
        updatedAt: now,
      },
    });
  }
  return db.select().from(googleCalendars).where(and(eq(googleCalendars.connectionId, connection.id), eq(googleCalendars.active, true)));
}

async function flushPendingJansenEvents(connection: CalendarConnection) {
  const pending = await getDb().select().from(calendarEvents).where(and(eq(calendarEvents.lastChangeOrigin, "JANSEN"), or(eq(calendarEvents.syncStatus, "PENDING"), eq(calendarEvents.syncStatus, "ERROR")), isNull(calendarEvents.deletedAt)));
  for (const event of pending) if (isGoogleCalendarIncluded(event.calendarId)) await pushCalendarEventToGoogle(event.id, connection);
}

export async function syncGoogleCalendar(forceFull = false, targetCalendarId?: string) {
  const connection = await getCalendarConnection();
  if (!connection) throw new Error("Conecte o Google Calendar antes de sincronizar.");
  const db = getDb();
  await db.update(calendarConnections).set({ syncStatus: "SYNCING", lastSyncError: null, updatedAt: new Date().toISOString() }).where(eq(calendarConnections.id, connection.id));
  try {
    await flushPendingJansenEvents(connection);
    const [calendars, colors] = await Promise.all([refreshGoogleCalendars(connection), getGoogleColors(connection)]);
    let anyFull = false;
    let accountEmail = calendars.find((calendar) => calendar.primary)?.calendarId || connection.accountEmail;
    const counters = { created: 0, updated: 0, deleted: 0, ignored: 0 };
    const syncableCalendars = calendars.filter((calendar) =>
      canReadGoogleCalendarEvents(calendar.accessRole) && isGoogleCalendarIncluded(calendar.calendarId) && (!targetCalendarId || calendar.calendarId === targetCalendarId)
    );
    for (const calendar of syncableCalendars) {
      const storageCalendarId = calendar.primary ? DEFAULT_CALENDAR : calendar.calendarId;
      const savedFullPageToken = !forceFull && calendar.nextSyncToken?.startsWith(FULL_PAGE_PREFIX)
        ? calendar.nextSyncToken.slice(FULL_PAGE_PREFIX.length)
        : null;
      let full = forceFull || !calendar.nextSyncToken || Boolean(savedFullPageToken);
      const seen = new Set<string>();
      let pageToken: string | null = savedFullPageToken;
      let completedSyncToken = full ? null : calendar.nextSyncToken;
      let canReconcileFullSync = full && !savedFullPageToken;
      do {
        let result: Awaited<ReturnType<typeof listGoogleEvents>>;
        try {
          result = await listGoogleEvents(connection, calendar.calendarId, full ? null : calendar.nextSyncToken, pageToken);
        } catch (error) {
          if (!(error instanceof GoogleCalendarError) || error.status !== 410) throw error;
          full = true;
          pageToken = null;
          completedSyncToken = null;
          canReconcileFullSync = true;
          seen.clear();
          result = await listGoogleEvents(connection, calendar.calendarId, null);
        }
        anyFull ||= full;
        const googleIds = result.items.map((event) => event.id);
        const linkedJansenIds = result.items.flatMap((event) => {
          const id = privateNumber(event.extendedProperties?.private?.jansenEventId);
          return id ? [id] : [];
        });
        const [storedByGoogle, storedByJansen] = await Promise.all([
          googleIds.length ? db.select().from(calendarEvents).where(and(eq(calendarEvents.calendarId, storageCalendarId), inArray(calendarEvents.googleEventId, googleIds))) : [],
          linkedJansenIds.length ? db.select().from(calendarEvents).where(inArray(calendarEvents.id, linkedJansenIds)) : [],
        ]);
        const storedEvents = [...storedByGoogle, ...storedByJansen];
        const storedByGoogleId = new Map(storedEvents.flatMap((event) => event.googleEventId ? [[event.googleEventId, event] as const] : []));
        const storedById = new Map(storedEvents.map((event) => [event.id, event] as const));
        for (const event of result.items) {
          seen.add(event.id);
          if (!accountEmail && event.organizer?.self && event.organizer.email) accountEmail = event.organizer.email;
          const eventColors = event.colorId ? colors.event?.[event.colorId] : null;
          const effectiveBackground = eventColors?.background || calendar.backgroundColor || null;
          const effectiveForeground = eventColors?.foreground || calendar.foregroundColor || null;
          const linkedJansenId = privateNumber(event.extendedProperties?.private?.jansenEventId);
          const stored = storedByGoogleId.get(event.id) || (linkedJansenId ? storedById.get(linkedJansenId) : undefined);
          if (
            stored && event.status !== "cancelled" && !stored.deletedAt &&
            stored.googleUpdatedAt === (event.updated || null) &&
            stored.googleColor === effectiveBackground &&
            stored.googleForegroundColor === effectiveForeground
          ) {
            counters.ignored += 1;
            continue;
          }
          counters[await applyGoogleEvent(connection, storageCalendarId, event, effectiveBackground, effectiveForeground)] += 1;
        }
        pageToken = result.nextPageToken || null;
        completedSyncToken = result.nextSyncToken || completedSyncToken;
        if (pageToken) {
          const progressAt = new Date().toISOString();
          await db.update(googleCalendars).set({ nextSyncToken: `${FULL_PAGE_PREFIX}${pageToken}`, lastSyncError: null, updatedAt: progressAt }).where(eq(googleCalendars.id, calendar.id));
        }
      } while (pageToken);

      if (full && canReconcileFullSync) {
        const linked = await db.select({ id: calendarEvents.id, googleEventId: calendarEvents.googleEventId }).from(calendarEvents).where(and(eq(calendarEvents.calendarId, storageCalendarId), isNotNull(calendarEvents.googleEventId), isNull(calendarEvents.deletedAt)));
        for (const event of linked) if (event.googleEventId && !seen.has(event.googleEventId)) {
          await db.update(calendarEvents).set({ status: "cancelled", deletedAt: new Date().toISOString(), lastChangeOrigin: "GOOGLE", syncStatus: "SYNCED", updatedAt: new Date().toISOString() }).where(eq(calendarEvents.id, event.id));
          counters.deleted += 1;
        }
      }
      const calendarNow = new Date().toISOString();
      await db.update(googleCalendars).set({
        nextSyncToken: completedSyncToken || calendar.nextSyncToken,
        lastSyncError: null,
        lastFullSyncAt: full ? calendarNow : calendar.lastFullSyncAt,
        lastIncrementalSyncAt: calendarNow,
        updatedAt: calendarNow,
      }).where(eq(googleCalendars.id, calendar.id));
    }
    const now = new Date().toISOString();
    await db.update(calendarConnections).set({ accountEmail, syncStatus: "CONNECTED", lastSyncError: null, lastFullSyncAt: anyFull ? now : connection.lastFullSyncAt, lastIncrementalSyncAt: now, updatedAt: now }).where(eq(calendarConnections.id, connection.id));
    await ensureGoogleWatch();
    return { full: anyFull, calendars: syncableCalendars.length, discoveredCalendars: calendars.length, ...counters };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao sincronizar com o Google Calendar.";
    await db.update(calendarConnections).set({ syncStatus: "ERROR", lastSyncError: message, updatedAt: new Date().toISOString() }).where(eq(calendarConnections.id, connection.id));
    throw error;
  }
}

export async function pushCalendarEventToGoogle(id: number, suppliedConnection?: CalendarConnection) {
  const connection = suppliedConnection || await getCalendarConnection();
  if (!connection) return null;
  const db = getDb();
  const [event] = await db.select().from(calendarEvents).where(eq(calendarEvents.id, id)).limit(1);
  if (!event || event.deletedAt) return null;
  try {
    let googleEvent: GoogleEvent;
    const calendarId = event.calendarId || DEFAULT_CALENDAR;
    if (event.googleEventId) {
      googleEvent = await googleRequest<GoogleEvent>(connection, `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(event.googleEventId)}?sendUpdates=all`, { method: "PATCH", headers: event.googleEtag ? { "If-Match": event.googleEtag } : undefined, body: JSON.stringify(internalEventToGoogle(event)) });
    } else {
      const lookup = new URLSearchParams({ privateExtendedProperty: `jansenEventId=${event.id}`, showDeleted: "false", maxResults: "1" });
      const found = await googleRequest<GoogleEventList>(connection, `/calendars/${encodeURIComponent(calendarId)}/events?${lookup}`);
      googleEvent = found.items?.[0] || await googleRequest<GoogleEvent>(connection, `/calendars/${encodeURIComponent(calendarId)}/events?sendUpdates=all`, { method: "POST", body: JSON.stringify(internalEventToGoogle(event)) });
    }
    await db.update(calendarEvents).set({ googleEventId: googleEvent.id, googleUpdatedAt: googleEvent.updated || null, googleHtmlLink: googleEvent.htmlLink || null, googleEtag: googleEvent.etag || null, syncStatus: "SYNCED", syncError: null, lastChangeOrigin: "JANSEN", updatedAt: new Date().toISOString() }).where(eq(calendarEvents.id, id));
    return googleEvent;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao enviar evento ao Google.";
    await db.update(calendarEvents).set({ syncStatus: "ERROR", syncError: message, updatedAt: new Date().toISOString() }).where(eq(calendarEvents.id, id));
    throw error;
  }
}

export async function deleteCalendarEventFromGoogle(event: CalendarEvent) {
  const connection = await getCalendarConnection();
  if (!event.googleEventId) return;
  if (!connection) throw new Error("Reconecte o Google Calendar antes de excluir este evento sincronizado.");
  try {
    await googleRequest<Record<string, never>>(connection, `/calendars/${encodeURIComponent(event.calendarId || DEFAULT_CALENDAR)}/events/${encodeURIComponent(event.googleEventId)}?sendUpdates=all`, { method: "DELETE" });
  } catch (error) {
    if (!(error instanceof GoogleCalendarError) || error.status !== 410) throw error;
  }
}

export async function ensureGoogleWatch(force = false) {
  const connection = await getCalendarConnection();
  const address = env.GOOGLE_CALENDAR_WEBHOOK_URL?.trim();
  if (!connection || !address?.startsWith("https://")) return { active: false, reason: "WEBHOOK_NOT_CONFIGURED" };
  const calendars = (await getDb().select().from(googleCalendars).where(and(eq(googleCalendars.connectionId, connection.id), eq(googleCalendars.active, true))))
    .filter((calendar) => isGoogleCalendarIncluded(calendar.calendarId) && canWatchGoogleCalendarEvents(calendar.accessRole));
  const expirations: string[] = [];
  for (const calendar of calendars) {
    const expiresAt = calendar.channelExpiresAt ? new Date(calendar.channelExpiresAt).getTime() : 0;
    if (!force && expiresAt > Date.now() + 24 * 60 * 60 * 1000) {
      expirations.push(calendar.channelExpiresAt!);
      continue;
    }
    const channelId = crypto.randomUUID();
    const channelToken = crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "");
    const requestedExpiration = Date.now() + 6 * 24 * 60 * 60 * 1000;
    const watch = await googleRequest<{ id: string; resourceId: string; expiration?: string }>(connection, `/calendars/${encodeURIComponent(calendar.calendarId)}/events/watch`, { method: "POST", body: JSON.stringify({ id: channelId, type: "web_hook", address, token: channelToken, expiration: String(requestedExpiration) }) });
    const expiration = watch.expiration ? new Date(Number(watch.expiration)).toISOString() : new Date(requestedExpiration).toISOString();
    await getDb().update(googleCalendars).set({ channelId: watch.id, channelResourceId: watch.resourceId, channelTokenHash: await sha256(channelToken), channelExpiresAt: expiration, updatedAt: new Date().toISOString() }).where(eq(googleCalendars.id, calendar.id));
    expirations.push(expiration);
    if (calendar.channelId && calendar.channelResourceId) {
      try { await googleRequest(connection, "/channels/stop", { method: "POST", body: JSON.stringify({ id: calendar.channelId, resourceId: calendar.channelResourceId }) }); } catch { /* O canal antigo expira sozinho. */ }
    }
  }
  return { active: calendars.length > 0 && expirations.length === calendars.length, calendars: calendars.length, expiresAt: expirations.sort()[0] || null };
}

export async function saveGoogleConnection(encryptedRefreshToken: string, calendarId = DEFAULT_CALENDAR) {
  const db = getDb();
  const existing = await getCalendarConnection();
  const now = new Date().toISOString();
  if (existing) {
    const [connection] = await db.update(calendarConnections).set({ encryptedRefreshToken, calendarId, nextSyncToken: null, syncStatus: "CONNECTED", lastSyncError: null, updatedAt: now }).where(eq(calendarConnections.id, existing.id)).returning();
    await db.update(googleCalendars).set({ nextSyncToken: null, active: false, updatedAt: now }).where(eq(googleCalendars.connectionId, existing.id));
    return connection;
  }
  const [connection] = await db.insert(calendarConnections).values({ ownerKey: OWNER_KEY, calendarId, encryptedRefreshToken, updatedAt: now }).returning();
  return connection;
}
