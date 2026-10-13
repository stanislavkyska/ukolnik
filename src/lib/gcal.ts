// Převody mezi úkoly a událostmi Google Kalendáře + obousměrná synchronizace
// úkolů s kalendářem „Úkoly“. Bez přístupu k síti a databázi, aby šlo testovat.

import { addDays, todayISO } from "./dates.ts";
import { normalize } from "./text.ts";
import { localDate, localTime, localToISO } from "./time.ts";
import type { Task } from "./types.ts";

export interface GEventTime {
  date?: string; // celodenní: YYYY-MM-DD
  dateTime?: string; // ISO
  timeZone?: string;
}

export interface GEvent {
  id: string;
  etag?: string;
  status?: string;
  summary?: string;
  description?: string;
  location?: string;
  htmlLink?: string;
  updated?: string;
  start: GEventTime;
  end: GEventTime;
  extendedProperties?: { private?: Record<string, string> };
}

/** Úkol s poli pro synchronizaci */
export interface SyncTask extends Task {
  gcal_event_id: string | null;
  gcal_etag: string | null;
  gcal_dirty: boolean;
}

export const TASK_SYNC_COLUMNS =
  "id,title,notes,due_date,due_time,deadline,tags,important,done,done_at,created_at,updated_at,gcal_event_id,gcal_etag,gcal_dirty";

const TAG_RE = /#([\p{L}\p{N}_\-/]+)/gu;
const TIMED_MINUTES = 30;
const DL_MARK = "⚑ ";

/** Stálé id události pro úkol (Google povoluje znaky a–v a 0–9). */
export function eventIdFor(taskId: string): string {
  return "uk" + taskId.replace(/-/g, "").toLowerCase();
}

export function extractTags(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(TAG_RE)) {
    const t = m[1].toLowerCase();
    if (!out.some((x) => normalize(x) === normalize(t))) out.push(t);
  }
  return out;
}

export function stripTags(text: string): string {
  return text.replace(TAG_RE, "").replace(/\s{2,}/g, " ").trim();
}

/** Den, kdy úkol v kalendáři leží: naplánovaný den, jinak deadline. */
export function taskDay(t: Pick<Task, "due_date" | "deadline">): string | null {
  return t.due_date ?? t.deadline;
}

export function taskToEvent(t: Task): Omit<GEvent, "id"> & { status: string } {
  const day = taskDay(t)!;
  const deadlineOnly = !t.due_date && !!t.deadline;
  const lines: string[] = [];
  if (t.tags.length) lines.push(t.tags.map((g) => `#${g}`).join(" "));
  if (t.due_date && t.deadline) {
    const [, m, d] = t.deadline.split("-").map(Number);
    lines.push(`Deadline: ${d}. ${m}.`);
  }
  if (t.notes) lines.push("", t.notes);
  lines.push("", "Z Úkolníku – přesun události přesune i úkol.");

  let start: GEventTime;
  let end: GEventTime;
  if (t.due_time && !deadlineOnly) {
    const s = localToISO(day, t.due_time.slice(0, 5));
    start = { dateTime: s, timeZone: "Europe/Prague" };
    end = { dateTime: new Date(Date.parse(s) + TIMED_MINUTES * 60000).toISOString(), timeZone: "Europe/Prague" };
  } else {
    start = { date: day };
    end = { date: addDays(day, 1) };
  }
  return {
    status: "confirmed",
    summary: (deadlineOnly ? DL_MARK : "") + (t.important ? "❗ " : "") + t.title,
    description: lines.join("\n").trim(),
    start,
    end,
    extendedProperties: { private: { ukolnikTaskId: t.id } },
  };
}

export interface EventFields {
  date: string;
  time: string | null;
  title: string;
  tags: string[];
}

export function eventStartDate(e: GEvent): string {
  return e.start.date ?? localDate(e.start.dateTime!);
}

export function eventToFields(e: GEvent): EventFields {
  const summary = (e.summary ?? "").replace(/^⚑\s*/, "").replace(/^❗\s*/, "");
  const tags = extractTags(`${summary}\n${e.description ?? ""}`);
  return {
    date: eventStartDate(e),
    time: e.start.dateTime ? localTime(e.start.dateTime) : null,
    title: stripTags(summary) || "Bez názvu",
    tags,
  };
}

export function taskIdOf(e: GEvent): string | null {
  return e.extendedProperties?.private?.ukolnikTaskId ?? null;
}

/** Rozhraní ke kalendáři – v aplikaci Google API, v testech napodobenina. */
export interface CalendarPort {
  list(timeMin: string, timeMax: string): Promise<GEvent[]>;
  /** vytvoří nebo přepíše událost s daným id */
  upsert(id: string, body: Omit<GEvent, "id">): Promise<GEvent>;
  patch(id: string, body: Partial<GEvent>): Promise<GEvent>;
  remove(id: string): Promise<void>;
}

export interface TaskPatchWithSync {
  id: string;
  patch: Record<string, unknown>;
}

export interface NewTaskFromEvent {
  id: string;
  title: string;
  due_date: string;
  due_time: string | null;
  tags: string[];
  gcal_event_id: string;
  gcal_etag: string | null;
  gcal_synced_at: string;
}

export interface SyncResult {
  updates: TaskPatchWithSync[];
  creates: NewTaskFromEvent[];
  pushed: number;
  pulled: number;
  removed: number;
  /** zbývají úkoly k zápisu (limit na jeden běh) */
  more: boolean;
}

export const SYNC_PAST_DAYS = 60;
export const SYNC_FUTURE_DAYS = 400;
const MAX_WRITES = 40;

/**
 * Obousměrná synchronizace úkolů s kalendářem „Úkoly“.
 * - změněný úkol (gcal_dirty) → zapsat / smazat událost
 * - změněná událost (jiný etag) → upravit úkol (datum, čas, název, štítky)
 * - smazaná událost → úkol přijde o datum
 * - nová událost bez vazby → nový úkol
 * Při změně na obou stranách vyhrává novější.
 */
export async function syncTasks(
  tasks: SyncTask[],
  cal: CalendarPort,
  opts: { now?: Date; newId?: () => string; write?: boolean } = {},
): Promise<SyncResult> {
  const now = opts.now ?? new Date();
  const nowIso = now.toISOString();
  const today = todayISO(now);
  const from = addDays(today, -SYNC_PAST_DAYS);
  const to = addDays(today, SYNC_FUTURE_DAYS);
  const write = opts.write ?? true;
  const res: SyncResult = { updates: [], creates: [], pushed: 0, pulled: 0, removed: 0, more: false };

  const events = await cal.list(localToISO(from, "00:00"), localToISO(to, "00:00"));
  const byTask = new Map<string, GEvent>();
  const orphans: GEvent[] = [];
  for (const e of events) {
    const id = taskIdOf(e);
    if (id) byTask.set(id, e);
    else orphans.push(e);
  }
  const taskIds = new Set(tasks.map((t) => t.id));
  const inWindow = (d: string | null) => !!d && d >= from && d < to;
  let writes = 0;

  for (const t of tasks) {
    const day = taskDay(t);
    const ev = byTask.get(t.id);
    const wantEvent = write && !t.done && inWindow(day);
    const calendarChanged = !!ev && ev.etag !== t.gcal_etag;
    const calendarNewer = calendarChanged && (!t.gcal_dirty || Date.parse(ev!.updated ?? "0") > Date.parse(t.updated_at));

    // 1) změna v kalendáři má přednost, pokud je novější
    if (calendarNewer && !t.done) {
      const f = eventToFields(ev!);
      const patch: Record<string, unknown> = { gcal_event_id: ev!.id, gcal_etag: ev!.etag ?? null, gcal_synced_at: nowIso };
      const useDeadline = !t.due_date && !!t.deadline;
      if (useDeadline) {
        if (f.date !== t.deadline) patch.deadline = f.date;
      } else {
        if (f.date !== t.due_date) patch.due_date = f.date;
        if ((f.time ?? null) !== (t.due_time?.slice(0, 5) ?? null)) patch.due_time = f.time;
      }
      if (f.title !== t.title) patch.title = f.title;
      if (f.tags.join(",") !== t.tags.join(",") && (f.tags.length || t.tags.length)) patch.tags = f.tags;
      res.updates.push({ id: t.id, patch });
      res.pulled++;
      continue;
    }

    // 2) událost v kalendáři zmizela (smazaná uživatelem) → úkol bez data
    if (!ev && t.gcal_event_id && !t.gcal_dirty && wantEvent) {
      const patch: Record<string, unknown> = { gcal_event_id: null, gcal_etag: null, gcal_synced_at: nowIso };
      if (t.due_date) {
        patch.due_date = null;
        patch.due_time = null;
      } else patch.deadline = null;
      res.updates.push({ id: t.id, patch });
      res.pulled++;
      continue;
    }

    // 3) úkol se změnil (nebo ještě nemá událost) → zapsat
    const needsPush = t.gcal_dirty || (wantEvent && !ev && !t.gcal_event_id);
    if (!needsPush) continue;
    if (writes >= MAX_WRITES) {
      res.more = true;
      continue;
    }
    if (wantEvent) {
      const saved = await cal.upsert(ev?.id ?? t.gcal_event_id ?? eventIdFor(t.id), taskToEvent(t));
      writes++;
      res.pushed++;
      res.updates.push({ id: t.id, patch: { gcal_event_id: saved.id, gcal_etag: saved.etag ?? null, gcal_synced_at: nowIso } });
    } else if (ev || (t.gcal_event_id && inWindow(day))) {
      // hotovo, bez data nebo zápis vypnutý → událost pryč
      await cal.remove(ev?.id ?? t.gcal_event_id!);
      writes++;
      res.removed++;
      res.updates.push({ id: t.id, patch: { gcal_event_id: null, gcal_etag: null, gcal_synced_at: nowIso } });
    } else if (t.gcal_dirty) {
      res.updates.push({ id: t.id, patch: { gcal_synced_at: nowIso } });
    }
  }

  // události, ke kterým úkol neexistuje
  for (const [taskId, ev] of byTask) {
    if (taskIds.has(taskId)) continue;
    if (writes >= MAX_WRITES) {
      res.more = true;
      break;
    }
    // úkol smazaný v aplikaci (nebo jiný účet) → smazat událost
    await cal.remove(ev.id);
    writes++;
    res.removed++;
  }

  // nové události přidané rovnou do kalendáře „Úkoly“ → nové úkoly
  if (write) {
    for (const ev of orphans) {
      if (ev.status === "cancelled") continue;
      if (writes >= MAX_WRITES) {
        res.more = true;
        break;
      }
      const id = (opts.newId ?? (() => crypto.randomUUID()))();
      const f = eventToFields(ev);
      const linked = await cal.patch(ev.id, { extendedProperties: { private: { ukolnikTaskId: id } } });
      writes++;
      res.creates.push({
        id,
        title: f.title,
        due_date: f.date,
        due_time: f.time,
        tags: f.tags,
        gcal_event_id: ev.id,
        gcal_etag: linked.etag ?? null,
        gcal_synced_at: nowIso,
      });
      res.pulled++;
    }
  }

  return res;
}

/** Událost pro zobrazení v aplikaci */
export interface CalEvent {
  id: string;
  calendarId: string;
  calendar: string;
  color: string;
  title: string;
  tags: string[];
  allDay: boolean;
  /** dny (YYYY-MM-DD), přes které událost vede */
  days: string[];
  start: string; // datum nebo ISO
  end: string;
  location: string | null;
  link: string | null;
}

export function toCalEvent(e: GEvent, cal: { id: string; name: string; color: string }, from: string, to: string): CalEvent {
  const allDay = !!e.start.date;
  const first = eventStartDate(e);
  // poslední den: u celodenních je konec exkluzivní, u časových minuta před koncem
  const last = allDay
    ? addDays(e.end.date ?? first, -1)
    : localDate(new Date(Math.max(Date.parse(e.start.dateTime!), Date.parse(e.end.dateTime ?? e.start.dateTime!) - 60000)).toISOString());
  const days: string[] = [];
  for (let d = first < from ? from : first; d <= last && d <= to; d = addDays(d, 1)) days.push(d);
  const summary = e.summary ?? "(bez názvu)";
  return {
    id: e.id,
    calendarId: cal.id,
    calendar: cal.name,
    color: cal.color,
    title: stripTags(summary) || summary,
    tags: extractTags(`${summary}\n${e.description ?? ""}`),
    allDay,
    days,
    start: e.start.date ?? e.start.dateTime!,
    end: e.end.date ?? e.end.dateTime ?? e.start.dateTime!,
    location: e.location ?? null,
    link: e.htmlLink ?? null,
  };
}

/** „09:00–10:30“, u vícedenních „od 18:00“ / „do 12:00“ / „celý den“ */
export function eventTimeLabel(e: CalEvent, day: string): string {
  if (e.allDay) return "celý den";
  const sd = localDate(e.start);
  const ed = localDate(new Date(Date.parse(e.end) - 1).toISOString());
  if (sd === day && ed === day) return `${localTime(e.start)}–${localTime(e.end)}`;
  if (sd === day) return `od ${localTime(e.start)}`;
  if (ed === day) return `do ${localTime(e.end)}`;
  return "celý den";
}
