// Rychlý start, týdenní výkaz a import z Togglu – logika bez UI, aby šla testovat.

import { addDays, weekday } from "./dates.ts";
import { normalize } from "./text.ts";
import { durationMs, localDate, localToISO, type TimeEntry } from "./time.ts";

/* ---------- Rychlý start ---------- */

export interface Favorite {
  title: string;
  tags: string[];
  count: number;
  last: string;
}

/** Nejčastější kombinace název + štítky za posledních `days` dní (častěji a nedávno = výš). */
export function favorites(entries: TimeEntry[], now: number = Date.now(), limit = 6, days = 30): Favorite[] {
  const since = new Date(now - days * 86400000).toISOString();
  const map = new Map<string, Favorite>();
  for (const e of entries) {
    if (e.started_at < since) continue;
    if (!e.tags.length && !e.title) continue;
    const key = normalize(e.title.trim()) + "|" + e.tags.map(normalize).sort().join(",");
    const f = map.get(key);
    if (f) {
      f.count++;
      if (e.started_at > f.last) f.last = e.started_at;
    } else map.set(key, { title: e.title.trim(), tags: e.tags, count: 1, last: e.started_at });
  }
  const score = (f: Favorite) => f.count + 3 * Math.max(0, 1 - (now - Date.parse(f.last)) / (7 * 86400000));
  return [...map.values()].sort((a, b) => score(b) - score(a)).slice(0, limit);
}

/* ---------- Týdenní výkaz ---------- */

export interface SheetRow {
  tag: string;
  cells: number[]; // ms po–ne
  total: number;
  /** v buňce je běžící záznam → nejde upravit */
  running: boolean[];
}

export interface Sheet {
  days: string[]; // 7 dat od pondělí
  rows: SheetRow[];
  dayTotals: number[];
  total: number;
}

export const NO_TAG = "";

/**
 * Výkaz za týden: řádek = štítek (záznam s více štítky se ukáže v každém z nich),
 * záznam bez štítku v řádku „bez štítku“. Součty dnů počítají každý záznam jednou.
 */
export function buildSheet(entries: TimeEntry[], weekStart: string, extraTags: string[] = [], now: number = Date.now()): Sheet {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const rows = new Map<string, SheetRow>();
  const row = (tag: string) => {
    const k = normalize(tag);
    let r = rows.get(k);
    if (!r) rows.set(k, (r = { tag, cells: Array(7).fill(0), total: 0, running: Array(7).fill(false) }));
    return r;
  };
  for (const t of extraTags) row(t);
  const dayTotals = Array(7).fill(0);
  for (const e of entries) {
    const i = days.indexOf(localDate(e.started_at));
    if (i < 0) continue;
    const ms = durationMs(e, now);
    dayTotals[i] += ms;
    for (const t of e.tags.length ? e.tags : [NO_TAG]) {
      const r = row(t);
      r.cells[i] += ms;
      r.total += ms;
      if (!e.ended_at) r.running[i] = true;
    }
  }
  const list = [...rows.values()].sort((a, b) => (a.tag === NO_TAG ? 1 : b.tag === NO_TAG ? -1 : a.tag.localeCompare(b.tag, "cs")));
  return { days, rows: list, dayTotals, total: dayTotals.reduce((s, x) => s + x, 0) };
}

export interface CellPlan {
  create: { title: string; tags: string[]; started_at: string; ended_at: string } | null;
  shorten: { id: string; ended_at: string }[];
  remove: string[];
}

/**
 * Co udělat, aby buňka výkazu (štítek × den) měla `target` ms.
 * Přidání: nový záznam navazující na poslední záznam dne (jinak od 8:00).
 * Ubrání: zkracuje / maže záznamy s tímto štítkem od nejpozdějšího.
 */
export function planCell(entries: TimeEntry[], tag: string, day: string, target: number, now: number = Date.now()): CellPlan {
  const plan: CellPlan = { create: null, shorten: [], remove: [] };
  const k = normalize(tag);
  const mine = entries
    .filter((e) => localDate(e.started_at) === day && e.ended_at)
    .filter((e) => (tag === NO_TAG ? !e.tags.length : e.tags.some((t) => normalize(t) === k)));
  const current = mine.reduce((s, e) => s + durationMs(e, now), 0);
  const diff = Math.round(target / 60000) * 60000 - current;
  if (Math.abs(diff) < 60000) return plan;

  if (diff > 0) {
    const dayEntries = entries.filter((e) => localDate(e.started_at) === day && e.ended_at);
    const lastEnd = dayEntries.reduce((m, e) => (e.ended_at! > m ? e.ended_at! : m), "");
    const start = new Date(lastEnd || localToISO(day, "08:00")).toISOString();
    plan.create = {
      title: "Výkaz",
      tags: tag === NO_TAG ? [] : [tag],
      started_at: start,
      ended_at: new Date(Date.parse(start) + diff).toISOString(),
    };
    return plan;
  }

  let cut = -diff;
  for (const e of [...mine].sort((a, b) => (a.started_at < b.started_at ? 1 : -1))) {
    if (cut <= 0) break;
    const len = durationMs(e, now);
    if (len <= cut) {
      plan.remove.push(e.id);
      cut -= len;
    } else {
      plan.shorten.push({ id: e.id, ended_at: new Date(Date.parse(e.ended_at!) - cut).toISOString() });
      cut = 0;
    }
  }
  return plan;
}

/** „1:30“, „1,5“, „1.5“, „90m“, „2h“ → ms; prázdné = 0; nesmysl = null */
export function parseCell(text: string): number | null {
  const t = text.trim().toLowerCase().replace(",", ".").replace(/\s/g, "");
  if (!t) return 0;
  let m = t.match(/^(\d{1,2}):(\d{2})$/);
  if (m && Number(m[2]) < 60) return (Number(m[1]) * 60 + Number(m[2])) * 60000;
  m = t.match(/^(\d+(?:\.\d+)?)h?$/);
  if (m && Number(m[1]) <= 24) return Math.round(Number(m[1]) * 60) * 60000;
  m = t.match(/^(\d+)(m|min)$/);
  if (m && Number(m[1]) <= 1440) return Number(m[1]) * 60000;
  return null;
}

export function cellText(ms: number): string {
  if (!ms) return "";
  const min = Math.round(ms / 60000);
  return `${Math.floor(min / 60)}:${String(min % 60).padStart(2, "0")}`;
}

export function isWeekend(day: string): boolean {
  return weekday(day) >= 6;
}

/* ---------- Import z Togglu ---------- */

/** Jednoduchý CSV parser (uvozovky, čárka i středník). */
export function parseCSV(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] ?? "";
  const sep = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) {
      if (c === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === sep) {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim())) rows.push(row);
  return rows;
}

export interface TogglRow {
  description: string;
  project: string;
  client: string;
  tags: string[];
  start: string; // ISO
  end: string; // ISO
}

const H = (s: string) => normalize(s).replace(/[^a-z]/g, "");

/** Řádky z exportu Toggl Track (Reports → Detailed → Export CSV). */
export function parseToggl(text: string): { rows: TogglRow[]; error: string | null } {
  const table = parseCSV(text);
  if (table.length < 2) return { rows: [], error: "Soubor je prázdný." };
  const head = table[0].map(H);
  const col = (...names: string[]) => head.findIndex((h) => names.includes(h));
  const ci = {
    desc: col("description", "popis"),
    project: col("project", "projekt"),
    client: col("client", "klient"),
    tags: col("tags", "stitky"),
    sd: col("startdate", "zacatekdatum"),
    st: col("starttime", "zacatekcas"),
    ed: col("enddate", "konecdatum"),
    et: col("endtime", "koneccas"),
  };
  if (ci.sd < 0 || ci.st < 0 || ci.ed < 0 || ci.et < 0) {
    return { rows: [], error: "Tohle nevypadá jako export z Togglu (chybí sloupce Start date / Start time / End date / End time)." };
  }
  const date = (s: string) => {
    const t = s.trim();
    let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    m = t.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})/);
    if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    return null;
  };
  const time = (s: string) => {
    const m = s.trim().match(/^(\d{1,2}):(\d{2})/);
    return m ? `${m[1].padStart(2, "0")}:${m[2]}` : null;
  };
  const rows: TogglRow[] = [];
  for (const r of table.slice(1)) {
    const sd = date(r[ci.sd] ?? "");
    const st = time(r[ci.st] ?? "");
    const ed = date(r[ci.ed] ?? "");
    const et = time(r[ci.et] ?? "");
    if (!sd || !st || !ed || !et) continue;
    const start = localToISO(sd, st);
    const end = localToISO(ed, et);
    if (end <= start) continue;
    rows.push({
      description: (r[ci.desc] ?? "").trim(),
      project: ci.project >= 0 ? (r[ci.project] ?? "").trim() : "",
      client: ci.client >= 0 ? (r[ci.client] ?? "").trim() : "",
      tags: ci.tags >= 0 ? (r[ci.tags] ?? "").split(",").map((t) => t.trim()).filter(Boolean) : [],
      start,
      end,
    });
  }
  return { rows, error: rows.length ? null : "V souboru nejsou žádné záznamy s časem." };
}

/** „RD Šenov“ → „rd-šenov“ */
export function slugTag(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^\p{L}\p{N}\-/]/gu, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function togglToEntries(rows: TogglRow[], projectTags: Record<string, string>, existing: TimeEntry[]) {
  const seen = new Set(existing.map((e) => `${e.started_at}|${e.ended_at}`));
  const out: { title: string; tags: string[]; task_id: null; started_at: string; ended_at: string }[] = [];
  let skipped = 0;
  for (const r of rows) {
    const key = `${new Date(r.start).toISOString()}|${new Date(r.end).toISOString()}`;
    if (seen.has(key)) {
      skipped++;
      continue;
    }
    seen.add(key);
    const tags = [projectTags[r.project] ?? slugTag(r.project), ...r.tags.map(slugTag)].filter(Boolean);
    out.push({ title: r.description, tags: [...new Set(tags)], task_id: null, started_at: r.start, ended_at: r.end });
  }
  return { entries: out, skipped };
}
