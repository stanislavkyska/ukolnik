// Práce s datem v časové zóně Europe/Prague.
// Data úkolů jsou uložená jako 'YYYY-MM-DD' (bez časové zóny), čas jako 'HH:MM'.

export const TZ = "Europe/Prague";

export function todayISO(now: Date = new Date()): string {
  // en-CA formátuje jako YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function toUTC(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fromUTC(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  const d = toUTC(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return fromUTC(d);
}

export function addMonths(iso: string, months: number): string {
  const d = toUTC(iso);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return fromUTC(d);
}

/** Den v týdnu: 1 = pondělí … 7 = neděle */
export function weekday(iso: string): number {
  const w = toUTC(iso).getUTCDay();
  return w === 0 ? 7 : w;
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((toUTC(toIso).getTime() - toUTC(fromIso).getTime()) / 86400000);
}

/** Pondělí týdne, ve kterém leží datum */
export function startOfWeek(iso: string): string {
  return addDays(iso, 1 - weekday(iso));
}

export function isValidDate(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1) return false;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return d <= last;
}

export function makeISO(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

const DAY_NAMES = ["pondělí", "úterý", "středa", "čtvrtek", "pátek", "sobota", "neděle"];
const DAY_SHORT = ["po", "út", "st", "čt", "pá", "so", "ne"];

export function dayName(iso: string): string {
  return DAY_NAMES[weekday(iso) - 1];
}

/** Lidský popisek data vůči dnešku: Dnes, Zítra, Čtvrtek, Po 19. 10., 3. 1. 2027 */
export function dateLabel(iso: string, today: string, opts: { long?: boolean } = {}): string {
  const diff = daysBetween(today, iso);
  if (diff === 0) return "Dnes";
  if (diff === 1) return "Zítra";
  if (diff === -1) return "Včera";
  const [y, m, d] = iso.split("-").map(Number);
  const ty = Number(today.slice(0, 4));
  const dm = `${d}. ${m}.`;
  if (diff > 1 && diff < 7) {
    const name = DAY_NAMES[weekday(iso) - 1];
    return opts.long ? `${cap(name)} ${dm}` : cap(name);
  }
  const short = cap(DAY_SHORT[weekday(iso) - 1]);
  return y === ty ? `${short} ${dm}` : `${dm} ${y}`;
}

export function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
