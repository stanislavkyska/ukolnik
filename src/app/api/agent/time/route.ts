// API pro agenty: měření času.
//   GET  /api/agent/time?from=2026-10-01&to=2026-10-31&tag=projekce   → záznamy + součty podle štítků
//   GET  /api/agent/time?range=today|week|month
//   POST /api/agent/time  { "action": "start", "text": "elektro #maringotka" }  → spustí stopky
//   POST /api/agent/time  { "action": "stop" }                                 → zastaví běžící

import { NextResponse } from "next/server";
import { agentDb, checkAgent } from "@/lib/agent";
import { addDays, todayISO } from "@/lib/dates";
import { normalize } from "@/lib/text";
import { durationMs, fmtDuration, inRange, localToISO, rangeDates, TIME_COLUMNS, totalsByTag, type RangeKey, type TimeEntry } from "@/lib/time";

export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: Request) {
  const denied = checkAgent(req);
  if (denied) return denied;
  const { db, owner } = agentDb();
  const url = new URL(req.url);
  const today = todayISO();

  let from = url.searchParams.get("from");
  let to = url.searchParams.get("to");
  const range = url.searchParams.get("range") as RangeKey | null;
  if (range) {
    if (!["today", "week", "month"].includes(range)) return NextResponse.json({ error: "range musí být today|week|month" }, { status: 400 });
    ({ from, to } = rangeDates(range, today));
  }
  from ??= rangeDates("week", today).from;
  to ??= today;
  if (!DATE_RE.test(from) || !DATE_RE.test(to)) return NextResponse.json({ error: "from/to musí být YYYY-MM-DD" }, { status: 400 });

  const { data, error } = await db
    .from("time_entries")
    .select(TIME_COLUMNS)
    .eq("user_id", owner)
    .gte("started_at", localToISO(addDays(from, -1), "00:00"))
    .lt("started_at", localToISO(addDays(to, 2), "00:00"))
    .order("started_at", { ascending: true })
    .limit(5000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let entries = (data as TimeEntry[]).filter((e) => inRange(e, from!, to!));
  const tag = url.searchParams.get("tag");
  if (tag) {
    const t = normalize(tag);
    entries = entries.filter((e) => e.tags.some((g) => normalize(g) === t || normalize(g).startsWith(t + "/")));
  }

  const { total, tags } = totalsByTag(entries);
  const human = (ms: number) => ({ minutes: Math.round(ms / 60000), text: fmtDuration(ms) });
  return NextResponse.json({
    from,
    to,
    total: human(total),
    by_tag: tags.map((t) => ({
      tag: t.tag || null,
      ...human(t.ms),
      children: t.children.map((c) => ({ tag: c.tag, ...human(c.ms) })),
    })),
    entries: entries.map((e) => ({ ...e, minutes: Math.round(durationMs(e) / 60000) })),
  });
}

export async function POST(req: Request) {
  const denied = checkAgent(req);
  if (denied) return denied;
  const { db, owner } = agentDb();
  const body = (await req.json().catch(() => null)) as { action?: string; text?: string } | null;
  const now = new Date().toISOString();

  const { data: stopped, error: e1 } = await db
    .from("time_entries")
    .update({ ended_at: now })
    .eq("user_id", owner)
    .is("ended_at", null)
    .select(TIME_COLUMNS);
  if (e1) return NextResponse.json({ error: e1.message }, { status: 500 });

  if (body?.action === "stop") return NextResponse.json({ stopped: stopped?.[0] ?? null });
  if (body?.action !== "start") return NextResponse.json({ error: 'action musí být "start" nebo "stop"' }, { status: 400 });

  const words = (body.text ?? "").trim().split(/\s+/).filter(Boolean);
  const tags = [...new Set(words.filter((w) => w.startsWith("#")).map((w) => w.slice(1).toLowerCase()).filter(Boolean))];
  const title = words.filter((w) => !w.startsWith("#")).join(" ");
  const { data, error } = await db
    .from("time_entries")
    .insert({ user_id: owner, title, tags, started_at: now })
    .select(TIME_COLUMNS)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ started: data, stopped: stopped?.[0] ?? null }, { status: 201 });
}
