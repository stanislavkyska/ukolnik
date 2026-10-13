// Odpojení Google Kalendáře. Kalendář „Úkoly“ v Googlu zůstane.

import { NextResponse } from "next/server";
import { requireUser } from "@/lib/calendar-server";
import { getAccount, revoke } from "@/lib/google";
import { supabaseAdmin } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST() {
  const { sb, user, denied } = await requireUser();
  if (denied) return denied;
  const acc = await getAccount(user.id);
  if (acc) {
    await revoke(acc);
    await supabaseAdmin().from("google_accounts").delete().eq("user_id", user.id);
    // vazby na události zrušit, ať se po novém připojení zapíšou znovu
    await sb.from("tasks").update({ gcal_event_id: null, gcal_etag: null, gcal_synced_at: null }).not("gcal_event_id", "is", null);
    await sb.from("tasks").update({ gcal_dirty: true }).eq("done", false);
  }
  return NextResponse.json({ ok: true });
}
