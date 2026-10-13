// Události ze zobrazených kalendářů pro pohledy Dnes a Plán.
//   GET /api/calendar/events?from=2026-10-13&to=2026-10-27

import { NextResponse } from "next/server";
import { eventsInRange, googleError, requireUser } from "@/lib/calendar-server";
import { addDays, daysBetween, todayISO } from "@/lib/dates";
import { getAccount } from "@/lib/google";

export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: Request) {
  const { user, denied } = await requireUser();
  if (denied) return denied;
  const acc = await getAccount(user.id);
  if (!acc) return NextResponse.json({ connected: false, events: [] });

  const url = new URL(req.url);
  const today = todayISO();
  const from = url.searchParams.get("from") ?? today;
  const to = url.searchParams.get("to") ?? addDays(today, 14);
  if (!DATE_RE.test(from) || !DATE_RE.test(to) || daysBetween(from, to) < 0 || daysBetween(from, to) > 62) {
    return NextResponse.json({ error: "Neplatný rozsah (max. 62 dní)." }, { status: 400 });
  }
  try {
    return NextResponse.json({ connected: true, events: await eventsInRange(acc, from, to) });
  } catch (e) {
    return googleError(e);
  }
}
