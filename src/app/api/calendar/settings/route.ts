// Nastavení kalendáře: které kalendáře zobrazovat a zda zapisovat úkoly.

import { NextResponse } from "next/server";
import { requireUser } from "@/lib/calendar-server";
import { getAccount, updateAccount } from "@/lib/google";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { user, denied } = await requireUser();
  if (denied) return denied;
  const acc = await getAccount(user.id);
  if (!acc) return NextResponse.json({ error: "Kalendář není připojený." }, { status: 404 });
  const body = (await req.json().catch(() => null)) as { show_calendars?: unknown; write_tasks?: unknown } | null;
  const patch: { show_calendars?: string[]; write_tasks?: boolean } = {};
  if (body && Array.isArray(body.show_calendars) && body.show_calendars.every((x) => typeof x === "string")) {
    patch.show_calendars = body.show_calendars as string[];
  }
  if (body && typeof body.write_tasks === "boolean") patch.write_tasks = body.write_tasks;
  if (!Object.keys(patch).length) return NextResponse.json({ error: "Nic ke změně." }, { status: 400 });
  await updateAccount(user.id, patch);
  return NextResponse.json({ ok: true });
}
