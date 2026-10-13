// Stav připojení kalendáře a seznam kalendářů.

import { NextResponse } from "next/server";
import { googleError, requireUser, shownCalendars } from "@/lib/calendar-server";
import { getAccount, googleConfigured } from "@/lib/google";

export const dynamic = "force-dynamic";

export async function GET() {
  const { user, denied } = await requireUser();
  if (denied) return denied;
  if (!googleConfigured()) return NextResponse.json({ configured: false, connected: false });
  const acc = await getAccount(user.id);
  if (!acc) return NextResponse.json({ configured: true, connected: false });
  try {
    return NextResponse.json({
      configured: true,
      connected: true,
      email: acc.email,
      writeTasks: acc.write_tasks,
      lastSync: acc.last_sync_at,
      calendars: await shownCalendars(acc),
    });
  } catch (e) {
    return googleError(e);
  }
}
