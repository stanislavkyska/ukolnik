// Serverová část kalendáře: přístup k Google API pro synchronizaci a zobrazení.

import { NextResponse } from "next/server";
import { addDays } from "./dates";
import { toCalEvent, type CalendarPort, type CalEvent, type GEvent } from "./gcal";
import { gapi, GoogleApiError, GoogleAuthError, listCalendars, type GoogleAccount } from "./google";
import { supabaseServer } from "./supabase/server";
import { localToISO } from "./time";

export async function requireUser() {
  const sb = await supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return { sb, user: null, denied: NextResponse.json({ error: "Nepřihlášen" }, { status: 401 }) };
  return { sb, user, denied: null };
}

export function googleError(e: unknown) {
  if (e instanceof GoogleAuthError) {
    return NextResponse.json({ error: "Přístup ke kalendáři vypršel. Připoj kalendář znovu.", reconnect: true }, { status: 409 });
  }
  console.error(e);
  const msg = e instanceof Error ? e.message : "Chyba kalendáře";
  return NextResponse.json({ error: msg }, { status: e instanceof GoogleApiError ? 502 : 500 });
}

const enc = encodeURIComponent;

async function listEvents(acc: GoogleAccount, calendarId: string, timeMin: string, timeMax: string, ordered = false): Promise<GEvent[]> {
  const out: GEvent[] = [];
  let page: string | undefined;
  do {
    const q = new URLSearchParams({ timeMin, timeMax, singleEvents: "true", maxResults: "2500" });
    if (ordered) q.set("orderBy", "startTime");
    if (page) q.set("pageToken", page);
    const j = await gapi<{ items?: GEvent[]; nextPageToken?: string }>(acc, `/calendars/${enc(calendarId)}/events?${q}`);
    out.push(...(j.items ?? []));
    page = j.nextPageToken;
  } while (page);
  return out;
}

/** Kalendář „Úkoly“ jako CalendarPort pro synchronizaci */
export function googlePort(acc: GoogleAccount, calendarId: string): CalendarPort {
  const base = `/calendars/${enc(calendarId)}/events`;
  return {
    list: (timeMin, timeMax) => listEvents(acc, calendarId, timeMin, timeMax),
    async upsert(id, body) {
      try {
        return await gapi<GEvent>(acc, `${base}/${enc(id)}`, { method: "PUT", body: JSON.stringify(body) });
      } catch (e) {
        if (!(e instanceof GoogleApiError && (e.status === 404 || e.status === 410))) throw e;
        return await gapi<GEvent>(acc, base, { method: "POST", body: JSON.stringify({ ...body, id }) });
      }
    },
    patch: (id, body) => gapi<GEvent>(acc, `${base}/${enc(id)}`, { method: "PATCH", body: JSON.stringify(body) }),
    async remove(id) {
      try {
        await gapi(acc, `${base}/${enc(id)}`, { method: "DELETE" });
      } catch (e) {
        if (!(e instanceof GoogleApiError && (e.status === 404 || e.status === 410))) throw e;
      }
    },
  };
}

export interface ShownCalendar {
  id: string;
  name: string;
  color: string;
  shown: boolean;
  isTasks: boolean;
  primary: boolean;
}

export async function shownCalendars(acc: GoogleAccount): Promise<ShownCalendar[]> {
  const list = await listCalendars(acc);
  return list
    .map((c) => {
      const isTasks = c.id === acc.tasks_calendar_id;
      const shown = isTasks ? false : acc.show_calendars ? acc.show_calendars.includes(c.id) : !!c.selected || !!c.primary;
      return {
        id: c.id,
        name: c.summaryOverride ?? c.summary,
        color: c.backgroundColor ?? "#888888",
        shown,
        isTasks,
        primary: !!c.primary,
      };
    })
    .sort((a, b) => Number(b.primary) - Number(a.primary) || a.name.localeCompare(b.name, "cs"));
}

/** Události ze zobrazených kalendářů (bez kalendáře Úkoly – ty jsou úkoly) */
export async function eventsInRange(acc: GoogleAccount, from: string, to: string): Promise<CalEvent[]> {
  const cals = (await shownCalendars(acc)).filter((c) => c.shown);
  const timeMin = localToISO(from, "00:00");
  const timeMax = localToISO(addDays(to, 1), "00:00");
  const lists = await Promise.all(
    cals.map(async (c) => {
      try {
        const evs = await listEvents(acc, c.id, timeMin, timeMax, true);
        return evs
          .filter((e) => e.status !== "cancelled")
          .map((e) => toCalEvent(e, { id: c.id, name: c.name, color: c.color }, from, to));
      } catch (e) {
        if (e instanceof GoogleAuthError) throw e;
        console.error(`Kalendář ${c.name}:`, e);
        return [];
      }
    }),
  );
  return lists.flat().sort((a, b) => (a.allDay !== b.allDay ? (a.allDay ? -1 : 1) : a.start < b.start ? -1 : 1));
}
