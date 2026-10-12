// Podklad pro ranní přehled: co je po termínu, co dnes a co čeká v příštích 7 dnech.
//   GET /api/agent/brief
// Události z Google Kalendáře přibydou v dalším kroku (zatím je agent čte přímo z kalendáře).

import { NextResponse } from "next/server";
import { agentDb, checkAgent } from "@/lib/agent";
import { addDays, dateLabel, dayName, todayISO } from "@/lib/dates";
import { compareTasks, overdue, dueOn, timeLabel } from "@/lib/plan";
import { TASK_COLUMNS, type Task } from "@/lib/types";

export const dynamic = "force-dynamic";

function line(t: Task, today: string, withDate = false): string {
  const parts = [t.important ? "❗" : "", timeLabel(t.due_time) ?? "", t.title, t.tags.map((g) => `#${g}`).join(" ")];
  if (withDate && t.due_date) parts.unshift(`[${dateLabel(t.due_date, today)}]`);
  return "- " + parts.filter(Boolean).join(" ");
}

export async function GET(req: Request) {
  const denied = checkAgent(req);
  if (denied) return denied;
  const { db, owner } = agentDb();
  const today = todayISO();
  const until = addDays(today, 7);

  const { data, error } = await db
    .from("tasks")
    .select(TASK_COLUMNS)
    .eq("user_id", owner)
    .eq("done", false)
    .lte("due_date", until);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const tasks = (data as Task[]).sort(compareTasks);
  const late = overdue(tasks, today);
  const now = dueOn(tasks, today);
  const upcoming = tasks.filter((t) => t.due_date! > today);

  const text = [
    `Dnes je ${dayName(today)} ${today}.`,
    late.length ? `\nPo termínu (${late.length}):\n${late.map((t) => line(t, today, true)).join("\n")}` : "",
    now.length ? `\nDnes (${now.length}):\n${now.map((t) => line(t, today)).join("\n")}` : "\nNa dnes žádné úkoly.",
    upcoming.length ? `\nPříštích 7 dní:\n${upcoming.map((t) => line(t, today, true)).join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return NextResponse.json({ today, overdue: late, today_tasks: now, upcoming, text });
}
