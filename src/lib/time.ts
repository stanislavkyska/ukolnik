// Měření času: formátování, převody na pražský čas a součty podle štítků.

import { addDays, startOfWeek, TZ, todayISO } from "./dates.ts";
import { normalize } from "./text.ts";

export interface TimeEntry {
  id: string;
  title: string;
  tags: string[];
  task_id: string | null;
  started_at: string; // ISO
  ended_at: string | null; // null = běží
  created_at: string;
}

export type TimeEntryPatch = Partial<Pick<TimeEntry, "title" | "tags" | "task_id" | "started_at" | "ended_at">>;

export const TIME_COLUMNS = "id,title,tags,task_id,started_at,ended_at,created_at";

export function durationMs(e: Pick<TimeEntry, "started_at" | "ended_at">, now: number = Date.now()): number {
  const end = e.ended_at ? Date.parse(e.ended_at) : now;
  return Math.max(0, end - Date.parse(e.started_at));
}

/** 1 h 25 min / 25 min / 0 min */
export function fmtDuration(ms: number): string {
  const min = Math.round(ms / 60000);
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** Stopky: 0:07:42 */
export function fmtClock(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

/** Desetinné hodiny pro export: 1,25 */
export function hoursDecimal(ms: number): string {
  return (Math.round((ms / 3600000) * 100) / 100).toString().replace(".", ",");
}

/** Pražské datum okamžiku */
export function localDate(iso: string): string {
  return todayISO(new Date(iso));
}

/** Pražský čas okamžiku HH:MM */
export function localTime(iso: string): string {
  return new Intl.DateTimeFormat("cs-CZ", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
}

function tzOffsetMinutes(ts: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(ts));
  const g = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const asUTC = Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second"));
  return Math.round((asUTC - ts) / 60000);
}

/** Pražské datum + čas → ISO okamžik (správně přes letní/zimní čas). */
export function localToISO(date: string, time: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  let ts = guess - tzOffsetMinutes(guess) * 60000;
  const off2 = tzOffsetMinutes(ts);
  ts = guess - off2 * 60000;
  return new Date(ts).toISOString();
}

export type RangeKey = "today" | "week" | "month";

/** Rozsah dnů [from, to] včetně */
export function rangeDates(key: RangeKey, today: string): { from: string; to: string } {
  if (key === "today") return { from: today, to: today };
  if (key === "week") {
    const from = startOfWeek(today);
    return { from, to: addDays(from, 6) };
  }
  const from = today.slice(0, 8) + "01";
  const [y, m] = today.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from, to: today.slice(0, 8) + String(last).padStart(2, "0") };
}

export function inRange(e: TimeEntry, from: string, to: string): boolean {
  const d = localDate(e.started_at);
  return d >= from && d <= to;
}

export interface TagTotal {
  tag: string; // "" = bez štítku
  ms: number;
  children: TagTotal[];
}

/**
 * Součty podle štítků. Štítky s lomítkem (projekce/rd-senov) se sečtou i do
 * nadřazeného (projekce). Záznam s více štítky se počítá u každého z nich,
 * celkový součet ale jen jednou.
 */
export function totalsByTag(entries: TimeEntry[], now: number = Date.now()): { total: number; tags: TagTotal[] } {
  let total = 0;
  const parents = new Map<string, { tag: string; ms: number; children: Map<string, TagTotal> }>();

  for (const e of entries) {
    const ms = durationMs(e, now);
    total += ms;
    const tags = e.tags.length ? e.tags : [""];
    const seenParents = new Set<string>();
    for (const tag of tags) {
      const [parent, ...rest] = tag.split("/");
      const pkey = normalize(parent);
      let p = parents.get(pkey);
      if (!p) parents.set(pkey, (p = { tag: parent, ms: 0, children: new Map() }));
      if (!seenParents.has(pkey)) {
        p.ms += ms;
        seenParents.add(pkey);
      }
      if (rest.length) {
        const ckey = normalize(tag);
        const c = p.children.get(ckey);
        if (c) c.ms += ms;
        else p.children.set(ckey, { tag, ms, children: [] });
      }
    }
  }

  const tags = [...parents.values()]
    .map((p) => ({ tag: p.tag, ms: p.ms, children: [...p.children.values()].sort((a, b) => b.ms - a.ms) }))
    .sort((a, b) => (a.tag === "" ? 1 : b.tag === "" ? -1 : b.ms - a.ms));
  return { total, tags };
}

export function groupByDay(entries: TimeEntry[]): { date: string; entries: TimeEntry[] }[] {
  const map = new Map<string, TimeEntry[]>();
  for (const e of [...entries].sort((a, b) => (a.started_at < b.started_at ? 1 : -1))) {
    const d = localDate(e.started_at);
    const list = map.get(d);
    if (list) list.push(e);
    else map.set(d, [e]);
  }
  return [...map.entries()].map(([date, entries]) => ({ date, entries }));
}

/** CSV pro Excel (středník, desetinná čárka, UTF-8 s BOM) */
export function toCSV(entries: TimeEntry[]): string {
  const esc = (s: string) => (/[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const rows = [["Datum", "Od", "Do", "Hodiny", "Činnost", "Štítky"].join(";")];
  for (const e of [...entries].sort((a, b) => (a.started_at < b.started_at ? -1 : 1))) {
    if (!e.ended_at) continue;
    rows.push(
      [
        localDate(e.started_at),
        localTime(e.started_at),
        localTime(e.ended_at),
        hoursDecimal(durationMs(e)),
        esc(e.title),
        esc(e.tags.join(", ")),
      ].join(";"),
    );
  }
  return "﻿" + rows.join("\r\n");
}

export interface ParsedDuration {
  ms: number;
  /** text bez délky a „včera“ */
  rest: string;
  yesterday: boolean;
}

/**
 * Délka v textu pro dopsání času: „2h“, „1,5h“, „45min“, „45m“, „1h30“, „1h 30m“, „2:30h“.
 * „včera“ = záznam patří ke včerejšku. Bez délky vrací ms = 0.
 */
export function parseDuration(text: string): ParsedDuration {
  let ms = 0;
  let yesterday = false;
  const keep: string[] = [];
  for (const raw of text.trim().split(/\s+/).filter(Boolean)) {
    const t = raw.toLowerCase().replace(",", ".");
    let m: RegExpMatchArray | null;
    if ((m = t.match(/^(\d+(?:\.\d+)?)(h|hod|hodin|hodiny)$/))) ms += Number(m[1]) * 3600000;
    else if ((m = t.match(/^(\d+)h(\d{1,2})(m|min)?$/))) ms += Number(m[1]) * 3600000 + Number(m[2]) * 60000;
    else if ((m = t.match(/^(\d+):(\d{2})h$/))) ms += Number(m[1]) * 3600000 + Number(m[2]) * 60000;
    else if ((m = t.match(/^(\d+)(m|min|minut)$/))) ms += Number(m[1]) * 60000;
    else if (t === "vcera" || t === "včera") yesterday = true;
    else keep.push(raw);
  }
  return { ms: Math.round(ms), rest: keep.join(" "), yesterday };
}
