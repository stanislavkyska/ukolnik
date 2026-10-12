// Řazení a seskupení úkolů pro pohledy i pro ranní přehled.

import { addDays, dateLabel } from "./dates.ts";
import type { Task } from "./types.ts";

export function compareTasks(a: Task, b: Task): number {
  // datum → čas (úkoly s časem první) → důležité → nejstarší
  const ad = a.due_date ?? "9999-99-99";
  const bd = b.due_date ?? "9999-99-99";
  if (ad !== bd) return ad < bd ? -1 : 1;
  const at = a.due_time ?? "99";
  const bt = b.due_time ?? "99";
  if (at !== bt) return at < bt ? -1 : 1;
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
  return tasks.filter((t) => !t.done && t.due_date && t.due_date < today).sort(compareTasks);
}

export function dueOn(tasks: Task[], date: string): Task[] {
  return tasks.filter((t) => !t.done && t.due_date === date).sort(compareTasks);
}

/** Pohled „Plán“: po termínu, dalších 14 dní po dnech, později, bez termínu. */
export function planGroups(tasks: Task[], today: string, days = 14): Group[] {
  const open = tasks.filter((t) => !t.done);
  const groups: Group[] = [];
  const od = overdue(open, today);
  if (od.length) groups.push({ key: "overdue", label: "Po termínu", date: null, tasks: od, tone: "overdue" });
  for (let i = 0; i < days; i++) {
    const d = addDays(today, i);
    const list = dueOn(open, d);
    // dnešek a zítřek ukazujeme i prázdné, ať je kam přesouvat
    if (list.length || i < 2) {
      groups.push({ key: d, label: dateLabel(d, today, { long: true }), date: d, tasks: list, tone: i === 0 ? "today" : undefined });
    }
  }
  const limit = addDays(today, days);
  const later = open.filter((t) => t.due_date && t.due_date >= limit).sort(compareTasks);
  if (later.length) groups.push({ key: "later", label: "Později", date: null, tasks: later, tone: "later" });
  const none = open.filter((t) => !t.due_date).sort(compareTasks);
  if (none.length) groups.push({ key: "none", label: "Bez termínu", date: null, tasks: none, tone: "none" });
  return groups;
}

export function doneGroups(tasks: Task[]): Task[] {
  return tasks
    .filter((t) => t.done)
    .sort((a, b) => ((a.done_at ?? "") < (b.done_at ?? "") ? 1 : -1));
}

export function timeLabel(t: string | null): string | null {
  return t ? t.slice(0, 5) : null;
}
