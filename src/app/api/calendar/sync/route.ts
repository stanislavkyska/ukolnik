// Obousměrná synchronizace úkolů s kalendářem „Úkoly“.
//   POST /api/calendar/sync  → { pushed, pulled, removed, more, changed }

import { NextResponse } from "next/server";
import { googleError, googlePort, requireUser } from "@/lib/calendar-server";
import { syncTasks, TASK_SYNC_COLUMNS, type SyncTask } from "@/lib/gcal";
import { ensureTasksCalendar, getAccount, updateAccount } from "@/lib/google";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST() {
  const { sb, user, denied } = await requireUser();
  if (denied) return denied;
  const acc = await getAccount(user.id);
  if (!acc) return NextResponse.json({ connected: false });

  try {
    const calId = await ensureTasksCalendar(acc);
    const { data, error } = await sb.from("tasks").select(TASK_SYNC_COLUMNS).limit(5000);
    if (error) throw error;

    const r = await syncTasks(data as SyncTask[], googlePort(acc, calId), { write: acc.write_tasks });

    for (const u of r.updates) {
      const { error: e } = await sb.from("tasks").update(u.patch).eq("id", u.id);
      if (e) console.error("sync update", u.id, e);
    }
    if (r.creates.length) {
      const { error: e } = await sb.from("tasks").insert(r.creates.map((c) => ({ ...c, gcal_dirty: false })));
      if (e) console.error("sync insert", e);
    }
    await updateAccount(user.id, { last_sync_at: new Date().toISOString() });

    // úkoly změněné z kalendáře → aplikace si je má načíst znovu
    const changed = r.pulled > 0;
    return NextResponse.json({ connected: true, pushed: r.pushed, pulled: r.pulled, removed: r.removed, more: r.more, changed });
  } catch (e) {
    return googleError(e);
  }
}
