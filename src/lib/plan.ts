// Řazení a seskupení úkolů pro pohledy i pro ranní přehled.

import { addDays, dateLabel, daysBetween } from "./dates.ts";
import type { Task } from "./types.ts";

/** Den, pod kterým se úkol zobrazuje: kdy na tom dělat, jinak deadline. */
export function when(t: Task): string | null {
  return t.due_date ?? t.deadline;
}

export function compareTasks(a: Task, b: Task): number {
  // datum → čas (úkoly s časem první) → bližší deadline → důležité → nejstarší
  const ad = when(a) ?? "9999-99-99";
  const bd = when(b) ?? "9999-99-99";
  if (ad !== bd) return ad < bd ? -1 : 1;
  const at = a.due_time ?? "99";
  const bt = b.due_time ?? "99";
  if (at !== bt) return at < bt ? -1 : 1;
  const adl = a.deadline ?? "9999-99-99";
  const bdl = b.deadline ?? "9999-99-99";
  if (adl !== bdl) return adl < bdl ? -1 : 1;
  if (a.important !== b.important) return a.important ? -1 : 1;
  return a.created_at < b.created_at ? -1 : 1;
}

export interface Group {
  key: string;
  label: string;
  date: string | null;
  tasks: Task[];
  tone?: "overdue" | "today" | "later" | "none";
}

export function overdue(tasks: Task[], today: string): Task[] {
  return tasks.filter((t) => !t.done && when(t) && when(t)! < today).sort(compareTasks);
}

export function dueOn(tasks: Task[], date: string): Task[] {
  return tasks.filter((t) => !t.done && when(t) === date).sort(compareTasks);
}

/** Pohled „Plán“: po termínu, dalších 14 dní po dnech, později, bez termínu.
 *  busyDates = dny s událostmi v kalendáři (zobrazí se, i když nemají úkoly). */
export function planGroups(tasks: Task[], today: string, days = 14, busyDates?: Set<string>): Group[] {
  const open = tasks.filter((t) => !t.done);
  const groups: Group[] = [];
  const od = overdue(open, today);
  if (od.length) groups.push({ key: "overdue", label: "Po termínu", date: null, tasks: od, tone: "overdue" });
  for (let i = 0; i < days; i++) {
    const d = addDays(today, i);
    const list = dueOn(open, d);
    // dnešek a zítřek ukazujeme i prázdné, ať je kam přesouvat
    if (list.length || i < 2 || busyDates?.has(d)) {
      groups.push({ key: d, label: dateLabel(d, today, { long: true }), date: d, tasks: list, tone: i === 0 ? "today" : undefined });
    }
  }
  const limit = addDays(today, days);
  const later = open.filter((t) => when(t) && when(t)! >= limit).sort(compareTasks);
  if (later.length) groups.push({ key: "later", label: "Později", date: null, tasks: later, tone: "later" });
  const none = open.filter((t) => !when(t)).sort(compareTasks);
  if (none.length) groups.push({ key: "none", label: "Bez termínu", date: null, tasks: none, tone: "none" });
  return groups;
}

export function doneGroups(tasks: Task[]): Task[] {
  return tasks
    .filter((t) => t.done)
    .sort((a, b) => ((a.done_at ?? "") < (b.done_at ?? "") ? 1 : -1));
}

/** Úkoly s deadlinem v příštích `days` dnech, které nejsou naplánované na dnešek ani po termínu. */
export function deadlinesSoon(tasks: Task[], today: string, days = 3): Task[] {
  const limit = addDays(today, days);
  return tasks
    .filter((t) => !t.done && t.deadline && t.deadline >= today && t.deadline <= limit)
    .filter((t) => when(t)! > today)
    .sort((a, b) => (a.deadline! < b.deadline! ? -1 : 1));
}

export type DeadlineTone = "late" | "soon" | "ok";

/** Popisek deadlinu: „deadline dnes“, „deadline za 3 dny“, „deadline prošel včera“ */
export function deadlineInfo(deadline: string, today: string): { label: string; tone: DeadlineTone } {
  const diff = daysBetween(today, deadline);
  if (diff < 0) {
    const n = -diff;
    return { label: n === 1 ? "deadline včera" : `deadline před ${n} dny`, tone: "late" };
  }
  if (diff === 0) return { label: "deadline dnes", tone: "late" };
  if (diff === 1) return { label: "deadline zítra", tone: "soon" };
  if (diff <= 3) return { label: `deadline za ${diff} dny`, tone: "soon" };
  return { label: `deadline ${dateLabel(deadline, today)}`, tone: "ok" };
}

export function timeLabel(t: string | null): string | null {
  return t ? t.slice(0, 5) : null;
}
