// Rychlé zadání: z věty typu „faktura Novák v pátek 14:00 #really !“
// vytáhne termín, čas, štítky a důležitost. Zbytek je název úkolu.

import { addDays, addMonths, isValidDate, makeISO, startOfWeek, todayISO, weekday } from "./dates.ts";
import { normalize } from "./text.ts";

export interface ParsedTask {
  title: string;
  dueDate: string | null;
  dueTime: string | null;
  tags: string[];
  important: boolean;
}

// Tvary dnů (bez diakritiky, včetně skloňování) → 1 = pondělí … 7 = neděle
const WEEKDAYS: Record<string, number> = {
  pondeli: 1,
  utery: 2, ut: 2,
  streda: 3, stredu: 3, stredy: 3,
  ctvrtek: 4, ctvrtka: 4, ct: 4,
  patek: 5, patku: 5, pa: 5,
  sobota: 6, sobotu: 6, soboty: 6, so: 6,
  nedele: 7, nedeli: 7,
};
// Zkratky, které jsou zároveň běžná slova – berou se jen s předložkou („v po“, „do ne“)
const WEEKDAYS_WITH_PREFIX_ONLY: Record<string, number> = { po: 1, st: 3, ne: 7 };

const DATE_PREFIXES = new Set(["v", "ve", "do", "na", "nejpozdeji", "od"]);
const TIME_PREFIXES = new Set(["v", "ve", "od", "kolem", "na"]);

const TAG_RE = /^#([\p{L}\p{N}_\-/]+)$/u;

interface Match {
  start: number; // index prvního spotřebovaného tokenu
  end: number; // index za posledním
  date?: string;
  time?: string;
}

export function parseQuickAdd(
  input: string,
  opts: { now?: Date; knownTags?: string[] } = {},
): ParsedTask {
  const today = todayISO(opts.now);
  const raw = input.trim().split(/\s+/).filter(Boolean);
  const norm = raw.map((t) => normalize(t).replace(/[,;]$/, ""));
  const used = new Array(raw.length).fill(false);

  let dueDate: string | null = null;
  let dueTime: string | null = null;
  const tags: string[] = [];
  let important = false;

  const known = new Map((opts.knownTags ?? []).map((t) => [normalize(t), t]));

  const consume = (m: Match) => {
    let start = m.start;
    // předložka před datem/časem („v pátek“, „do 15. 10.“, „ve 14:00“)
    const prefixes = m.time && !m.date ? TIME_PREFIXES : DATE_PREFIXES;
    if (start > 0 && !used[start - 1] && prefixes.has(norm[start - 1])) start--;
    for (let k = start; k < m.end; k++) used[k] = true;
  };

  for (let i = 0; i < raw.length; i++) {
    if (used[i]) continue;
    const t = norm[i];

    // štítky
    const tag = raw[i].match(TAG_RE);
    if (tag) {
      const name = tag[1].toLowerCase();
      const resolved = known.get(normalize(name)) ?? name;
      if (!tags.includes(resolved)) tags.push(resolved);
      used[i] = true;
      continue;
    }

    // důležité
    if (/^!{1,3}$/.test(t)) {
      important = true;
      used[i] = true;
      continue;
    }

    // čas
    if (!dueTime) {
      const tm = matchTime(norm, i);
      if (tm) {
        dueTime = tm.time!;
        consume(tm);
        i = tm.end - 1;
        continue;
      }
    }

    // datum
    if (!dueDate) {
      const dm = matchDate(norm, i, today);
      if (dm) {
        dueDate = dm.date!;
        consume(dm);
        i = dm.end - 1;
        continue;
      }
    }
  }

  let title = raw.filter((_, k) => !used[k]).join(" ").trim();
  title = title.replace(/[\s,;:-]+$/, "").trim();
  if (!title) title = input.trim();

  return { title, dueDate, dueTime, tags, important };
}

function matchTime(norm: string[], i: number): Match | null {
  const t = norm[i];
  let m = t.match(/^(\d{1,2})[:.](\d{2})(h)?$/);
  // „14.30“ by mohlo být i datum – jako čas bereme jen s „h“ nebo s předložkou v/ve
  if (m && t.includes(".") && !m[3] && !(i > 0 && (norm[i - 1] === "v" || norm[i - 1] === "ve"))) m = null;
  if (m) {
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (h < 24 && min < 60) return { start: i, end: i + 1, time: hhmm(h, min) };
  }
  const h = t.match(/^(\d{1,2})h$/);
  if (h && Number(h[1]) < 24) return { start: i, end: i + 1, time: hhmm(Number(h[1]), 0) };
  return null;
}

function hhmm(h: number, m: number): string {
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function nextWeekday(today: string, wd: number): string {
  // nejbližší takový den v budoucnu; když je dnes ten den, tak za týden
  let diff = wd - weekday(today);
  if (diff <= 0) diff += 7;
  return addDays(today, diff);
}

function matchDate(norm: string[], i: number, today: string): Match | null {
  const t = norm[i];
  const next = norm[i + 1];
  const prev = i > 0 ? norm[i - 1] : "";

  if (t === "dnes" || t === "dneska") return { start: i, end: i + 1, date: today };
  if (t === "zitra") return { start: i, end: i + 1, date: addDays(today, 1) };
  if (t === "pozitri") return { start: i, end: i + 1, date: addDays(today, 2) };

  // příští týden / příští pátek / tento pátek
  if (t === "pristi" || t === "tento" || t === "tuto" || t === "tenhle") {
    if (next === "tyden") {
      return { start: i, end: i + 2, date: addDays(startOfWeek(today), 7) };
    }
    if (next === "mesic") {
      const d = addMonths(today, 1);
      return { start: i, end: i + 2, date: d.slice(0, 8) + "01" };
    }
    const wd = next ? WEEKDAYS[next] ?? WEEKDAYS_WITH_PREFIX_ONLY[next] : undefined;
    if (wd) {
      const date =
        t === "pristi" ? addDays(startOfWeek(today), 7 + wd - 1) : nextWeekday(today, wd);
      return { start: i, end: i + 2, date };
    }
  }

  // za 3 dny / za týden / za 2 týdny / za měsíc
  if (t === "za") {
    const n = next && /^\d+$/.test(next) ? Number(next) : null;
    const unit = n !== null ? norm[i + 2] : next;
    const count = n ?? 1;
    const len = n !== null ? 3 : 2;
    if (unit && /^(den|dny|dni|dnu)$/.test(unit)) return { start: i, end: i + len, date: addDays(today, count) };
    if (unit && /^(tyden|tydny|tydnu)$/.test(unit)) return { start: i, end: i + len, date: addDays(today, 7 * count) };
    if (unit && /^(mesic|mesice|mesicu)$/.test(unit)) return { start: i, end: i + len, date: addMonths(today, count) };
  }

  // dny v týdnu
  const wd = WEEKDAYS[t] ?? (DATE_PREFIXES.has(prev) ? WEEKDAYS_WITH_PREFIX_ONLY[t] : undefined);
  if (wd) return { start: i, end: i + 1, date: nextWeekday(today, wd) };

  // 15.10. / 15.10.2026 / 15.10
  let m = t.match(/^(\d{1,2})\.(\d{1,2})\.?(\d{2,4})?$/);
  if (m) {
    const date = absolute(Number(m[1]), Number(m[2]), m[3], today);
    if (date) return { start: i, end: i + 1, date };
  }
  // „15. 10.“ / „15. 10. 2026“ jako dvě nebo tři slova
  m = t.match(/^(\d{1,2})\.$/);
  if (m && next) {
    const m2 = next.match(/^(\d{1,2})\.(\d{2,4})?$/);
    if (m2) {
      let year = m2[2];
      let end = i + 2;
      const third = norm[i + 2];
      if (!year && third && /^\d{4}$/.test(third)) {
        year = third;
        end = i + 3;
      }
      const date = absolute(Number(m[1]), Number(m2[1]), year, today);
      if (date) return { start: i, end, date };
    }
  }
  return null;
}

function absolute(d: number, mo: number, yearStr: string | undefined, today: string): string | null {
  const ty = Number(today.slice(0, 4));
  let y = yearStr ? Number(yearStr) : ty;
  if (yearStr && yearStr.length === 2) y = 2000 + y;
  if (!isValidDate(y, mo, d)) return null;
  let iso = makeISO(y, mo, d);
  // bez roku a už to bylo → příští rok
  if (!yearStr && iso < today) {
    if (!isValidDate(y + 1, mo, d)) return null;
    iso = makeISO(y + 1, mo, d);
  }
  return iso;
}
