// API pro agenty: výpis a zakládání úkolů.
//   GET  /api/agent/tasks?view=today|overdue|week|open|done|all&tag=really
//   POST /api/agent/tasks  { "text": "faktura Novák v pátek #really" }
//                     nebo { "title": "...", "due_date": "2026-10-16", "tags": ["really"] }

import { NextResponse } from "next/server";
import { agentDb, checkAgent, cleanPatch } from "@/lib/agent";
import { addDays, todayISO } from "@/lib/dates";
import { parseQuickAdd } from "@/lib/parse";
import { compareTasks } from "@/lib/plan";
import { TASK_COLUMNS, type Task } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = checkAgent(req);
  if (denied) return denied;
  const { db, owner } = agentDb();
  const url = new URL(req.url);
  const view = url.searchParams.get("view") ?? "open";
  const tag = url.searchParams.get("tag");
  const today = todayISO();

  let q = db.from("tasks").select(TASK_COLUMNS).eq("user_id", owner);
  switch (view) {
    case "today":
      q = q.eq("done", false).lte("due_date", today);
      break;
    case "overdue":
      q = q.eq("done", false).lt("due_date", today);
      break;
    case "week":
      q = q.eq("done", false).lte("due_date", addDays(today, 7));
      break;
    case "open":
      q = q.eq("done", false);
      break;
    case "done":
      q = q.eq("done", true).gte("done_at", new Date(Date.now() - 14 * 86400000).toISOString());
      break;
    case "all":
      break;
    default:
      return NextResponse.json({ error: "view musí být today|overdue|week|open|done|all" }, { status: 400 });
  }
  if (tag) q = q.contains("tags", [tag.toLowerCase()]);

  const { data, error } = await q.limit(500);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ today, tasks: (data as Task[]).sort(compareTasks) });
}

export async function POST(req: Request) {
  const denied = checkAgent(req);
  if (denied) return denied;
  const { db, owner } = agentDb();
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Tělo musí být JSON." }, { status: 400 });

  let row: Record<string, unknown>;
  if (typeof body.text === "string" && body.text.trim()) {
    // stejné rychlé zadání jako v aplikaci, včetně sloučení s existujícími štítky
    const { data: tags } = await db.from("tag_usage").select("name").eq("user_id", owner);
    const p = parseQuickAdd(body.text, { knownTags: (tags ?? []).map((t: { name: string }) => t.name) });
    row = { title: p.title, due_date: p.dueDate, due_time: p.dueTime, tags: p.tags, important: p.important };
  } else {
    const r = cleanPatch(body);
    if ("error" in r) return NextResponse.json({ error: r.error }, { status: 400 });
    if (!r.patch.title) return NextResponse.json({ error: "Chybí text nebo title." }, { status: 400 });
    row = { ...r.patch };
  }

  const { data, error } = await db
    .from("tasks")
    .insert({ ...row, user_id: owner })
    .select(TASK_COLUMNS)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ task: data }, { status: 201 });
}
