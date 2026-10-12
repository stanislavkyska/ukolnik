import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "./supabase/server";
import type { TaskPatch } from "./types";

/** Ověří Bearer token agenta. Vrací chybovou odpověď, nebo null když je vše v pořádku. */
export function checkAgent(req: Request): NextResponse | null {
  const expected = process.env.AGENT_API_TOKEN ?? "";
  const owner = process.env.OWNER_USER_ID ?? "";
  if (!expected || !owner) {
    return NextResponse.json({ error: "API pro agenty není nastavené (AGENT_API_TOKEN, OWNER_USER_ID)." }, { status: 503 });
  }
  const got = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: "Neplatný token." }, { status: 401 });
  }
  return null;
}

export function agentDb() {
  return { db: supabaseAdmin(), owner: process.env.OWNER_USER_ID! };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}(:\d{2})?$/;

/** Převezme jen známá pole a zkontroluje formáty. */
export function cleanPatch(body: Record<string, unknown>): { patch: TaskPatch } | { error: string } {
  const patch: TaskPatch = {};
  if ("title" in body) {
    if (typeof body.title !== "string" || !body.title.trim()) return { error: "title musí být neprázdný text" };
    patch.title = body.title.trim().slice(0, 500);
  }
  if ("notes" in body) {
    if (typeof body.notes !== "string") return { error: "notes musí být text" };
    patch.notes = body.notes;
  }
  if ("due_date" in body) {
    if (body.due_date !== null && !(typeof body.due_date === "string" && DATE_RE.test(body.due_date)))
      return { error: "due_date musí být YYYY-MM-DD nebo null" };
    patch.due_date = body.due_date as string | null;
    if (body.due_date === null) patch.due_time = null;
  }
  if ("due_time" in body) {
    if (body.due_time !== null && !(typeof body.due_time === "string" && TIME_RE.test(body.due_time)))
      return { error: "due_time musí být HH:MM nebo null" };
    patch.due_time = body.due_time as string | null;
  }
  if ("tags" in body) {
    if (!Array.isArray(body.tags) || !body.tags.every((t) => typeof t === "string")) return { error: "tags musí být pole textů" };
    patch.tags = [...new Set((body.tags as string[]).map((t) => t.replace(/^#/, "").trim().toLowerCase()).filter(Boolean))];
  }
  if ("important" in body) {
    if (typeof body.important !== "boolean") return { error: "important musí být true/false" };
    patch.important = body.important;
  }
  if ("done" in body) {
    if (typeof body.done !== "boolean") return { error: "done musí být true/false" };
    patch.done = body.done;
  }
  return { patch };
}
