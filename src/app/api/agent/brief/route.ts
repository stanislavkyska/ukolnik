// Podklad pro ranní přehled: co je po termínu, co dnes a co čeká v příštích 7 dnech.
//   GET /api/agent/brief
// Obsahuje i dnešní události z připojeného Google Kalendáře.

import { NextResponse } from "next/server";
import { agentDb, checkAgent } from "@/lib/agent";
import { addDays, dateLabel, dayName, todayISO } from "@/lib/dates";
import { compareTasks, deadlineInfo, overdue, dueOn, timeLabel, when } from "@/lib/plan";
import { TASK_COLUMNS, type Task } from "@/lib/types";
import { eventsInRange } from "@/lib/calendar-server";
import { eventTimeLabel, type CalEvent } from "@/lib/gcal";
import { getAccount } from "@/lib/google";

export const dynamic = "force-dynamic";

function line(t: Task, today: string, withDate = false): string {
  const parts = [
    t.important ? "❗" : "",
    timeLabel(t.due_time) ?? "",
    t.title,
    t.deadline ? `(${deadlineInfo(t.deadline, today).label})` : "",
    t.tags.map((g) => `#${g}`).join(" "),
  ];
  if (withDate && when(t)) parts.unshift(`[${dateLabel(when(t)!, today)}]`);
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
    .or(`due_date.lte.${until},deadline.lte.${until}`);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const tasks = (data as Task[]).sort(compareTasks);
  const late = overdue(tasks, today);
  const now = dueOn(tasks, today);
  const upcoming = tasks.filter((t) => when(t)! > today);

  let events: CalEvent[] = [];
  let calendarError: string | null = null;
  try {
    const acc = await getAccount(owner);
    if (acc) events = await eventsInRange(acc, today, today);
  } catch (e) {
    calendarError = e instanceof Error ? e.message : "Kalendář nedostupný";
  }

  const text = [
    `Dnes je ${dayName(today)} ${today}.`,
    events.length
      ? `\nKalendář dnes:\n${events.map((e) => `- ${eventTimeLabel(e, today)} ${e.title} (${e.calendar})`).join("\n")}`
      : calendarError
        ? `\nKalendář: ${calendarError}`
        : "",
    late.length ? `\nPo termínu (${late.length}):\n${late.map((t) => line(t, today, true)).join("\n")}` : "",
    now.length ? `\nDnes (${now.length}):\n${now.map((t) => line(t, today)).join("\n")}` : "\nNa dnes žádné úkoly.",
    upcoming.length ? `\nPříštích 7 dní:\n${upcoming.map((t) => line(t, today, true)).join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return NextResponse.json({ today, events, overdue: late, today_tasks: now, upcoming, text });
}
