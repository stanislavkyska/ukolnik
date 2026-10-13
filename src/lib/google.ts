// Google Calendar API na serveru: OAuth, tokeny a volání API.
// Tokeny leží v tabulce google_accounts a čte je jen server přes service role.

import { supabaseAdmin } from "./supabase/server";

export const GOOGLE_SCOPES = ["openid", "email", "https://www.googleapis.com/auth/calendar"];
const API = "https://www.googleapis.com/calendar/v3";

export interface GoogleAccount {
  user_id: string;
  email: string | null;
  refresh_token: string;
  access_token: string | null;
  access_expires_at: string | null;
  tasks_calendar_id: string | null;
  show_calendars: string[] | null;
  write_tasks: boolean;
  last_sync_at: string | null;
}

export class GoogleAuthError extends Error {}

export function googleConfigured(): boolean {
  return !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET;
}

export function redirectUri(origin: string): string {
  return `${origin}/api/google/callback`;
}

export function authUrl(origin: string, state: string, loginHint?: string): string {
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri(origin),
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  if (loginHint) p.set("login_hint", loginHint);
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

export async function exchangeCode(code: string, origin: string) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri(origin),
      grant_type: "authorization_code",
    }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(j.error_description ?? j.error ?? "Výměna kódu selhala");
  let email: string | null = null;
  if (j.id_token) {
    try {
      email = JSON.parse(Buffer.from(j.id_token.split(".")[1], "base64url").toString()).email ?? null;
    } catch {
      /* e-mail není nutný */
    }
  }
  return {
    refresh_token: j.refresh_token as string | undefined,
    access_token: j.access_token as string,
    expires_in: j.expires_in as number,
    email,
  };
}

const ACCOUNT_COLUMNS =
  "user_id,email,refresh_token,access_token,access_expires_at,tasks_calendar_id,show_calendars,write_tasks,last_sync_at";

export async function getAccount(userId: string): Promise<GoogleAccount | null> {
  const { data, error } = await supabaseAdmin().from("google_accounts").select(ACCOUNT_COLUMNS).eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return data as GoogleAccount | null;
}

export async function updateAccount(userId: string, patch: Partial<GoogleAccount>) {
  const { error } = await supabaseAdmin()
    .from("google_accounts")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("user_id", userId);
  if (error) throw error;
}

async function accessToken(acc: GoogleAccount, force = false): Promise<string> {
  const valid = acc.access_token && acc.access_expires_at && Date.parse(acc.access_expires_at) - Date.now() > 60_000;
  if (valid && !force) return acc.access_token!;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: acc.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  const j = await res.json();
  if (!res.ok) {
    // invalid_grant = přístup odvolán nebo vypršel → je potřeba připojit znovu
    throw new GoogleAuthError(j.error_description ?? j.error ?? "Obnovení přístupu selhalo");
  }
  acc.access_token = j.access_token;
  acc.access_expires_at = new Date(Date.now() + j.expires_in * 1000).toISOString();
  await updateAccount(acc.user_id, { access_token: acc.access_token, access_expires_at: acc.access_expires_at });
  return acc.access_token!;
}

export class GoogleApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Volání Calendar API s automatickou obnovou přístupu. */
export async function gapi<T = unknown>(acc: GoogleAccount, path: string, init: RequestInit = {}): Promise<T> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = await accessToken(acc, attempt > 0);
    const res = await fetch(path.startsWith("http") ? path : API + path, {
      ...init,
      headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}`, ...(init.body ? { "Content-Type": "application/json" } : {}) },
    });
    if (res.status === 401 && attempt === 0) continue;
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    const j = text ? JSON.parse(text) : undefined;
    if (!res.ok) throw new GoogleApiError(res.status, j?.error?.message ?? `Google API ${res.status}`);
    return j as T;
  }
  throw new GoogleAuthError("Přístup ke kalendáři vypršel");
}

export interface GCalendar {
  id: string;
  summary: string;
  summaryOverride?: string;
  description?: string;
  backgroundColor?: string;
  primary?: boolean;
  selected?: boolean;
  accessRole: string;
}

export async function listCalendars(acc: GoogleAccount): Promise<GCalendar[]> {
  const j = await gapi<{ items: GCalendar[] }>(acc, "/users/me/calendarList?maxResults=250");
  return j.items ?? [];
}

/** Najde nebo založí kalendář „Úkoly“ pro úkoly s datem. */
export async function ensureTasksCalendar(acc: GoogleAccount): Promise<string> {
  if (acc.tasks_calendar_id) {
    try {
      await gapi(acc, `/calendars/${encodeURIComponent(acc.tasks_calendar_id)}`);
      return acc.tasks_calendar_id;
    } catch (e) {
      if (!(e instanceof GoogleApiError && (e.status === 404 || e.status === 410))) throw e;
    }
  }
  // jen náš dřívější kalendář (podle popisu), ne jakýkoli kalendář jménem „Úkoly“
  const existing = (await listCalendars(acc)).find((c) => c.accessRole === "owner" && (c.description ?? "").includes("Úkolník"));
  const id =
    existing?.id ??
    (
      await gapi<{ id: string }>(acc, "/calendars", {
        method: "POST",
        body: JSON.stringify({ summary: "Úkoly", description: "Úkoly z Úkolníku. Přesun události přesune i úkol.", timeZone: "Europe/Prague" }),
      })
    ).id;
  acc.tasks_calendar_id = id;
  await updateAccount(acc.user_id, { tasks_calendar_id: id });
  return id;
}

export async function revoke(acc: GoogleAccount) {
  await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(acc.refresh_token)}`, { method: "POST" }).catch(() => {});
}
