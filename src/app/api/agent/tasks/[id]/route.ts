// API pro agenty: úprava a smazání úkolu.
//   PATCH  /api/agent/tasks/:id  { "due_date": "2026-10-20" } / { "done": true } / …
//   DELETE /api/agent/tasks/:id

import { NextResponse } from "next/server";
import { agentDb, checkAgent, cleanPatch } from "@/lib/agent";
import { TASK_COLUMNS } from "@/lib/types";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f-]{36}$/i;

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = checkAgent(req);
  if (denied) return denied;
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Neplatné id." }, { status: 400 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Tělo musí být JSON." }, { status: 400 });
  const r = cleanPatch(body);
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: 400 });
  if (!Object.keys(r.patch).length) return NextResponse.json({ error: "Nic ke změně." }, { status: 400 });

  const { db, owner } = agentDb();
  const { data, error } = await db.from("tasks").update(r.patch).eq("id", id).eq("user_id", owner).select(TASK_COLUMNS).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Úkol nenalezen." }, { status: 404 });
  return NextResponse.json({ task: data });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = checkAgent(req);
  if (denied) return denied;
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Neplatné id." }, { status: 400 });
  const { db, owner } = agentDb();
  const { data, error } = await db.from("tasks").delete().eq("id", id).eq("user_id", owner).select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data?.length) return NextResponse.json({ error: "Úkol nenalezen." }, { status: 404 });
  return NextResponse.json({ deleted: id });
}
