// Návrat ze souhlasu Googlu: uloží přístup a založí kalendář „Úkoly“.

import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/calendar-server";
import { ensureTasksCalendar, exchangeCode, getAccount, type GoogleAccount } from "@/lib/google";
import { supabaseAdmin } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const origin = url.origin;
  const back = (status: string) => {
    const res = NextResponse.redirect(new URL(`/?calendar=${status}`, origin));
    res.cookies.delete("gcal_state");
    return res;
  };

  const { user } = await requireUser();
  if (!user) return NextResponse.redirect(new URL("/login", origin));
  if (url.searchParams.get("error")) return back("denied");

  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  if (!state || !code || state !== req.cookies.get("gcal_state")?.value) return back("error");

  try {
    const tokens = await exchangeCode(code, origin);
    const existing = await getAccount(user.id);
    const refresh = tokens.refresh_token ?? existing?.refresh_token;
    if (!refresh) return back("no-refresh");

    const row = {
      user_id: user.id,
      email: tokens.email ?? existing?.email ?? null,
      refresh_token: refresh,
      access_token: tokens.access_token,
      access_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabaseAdmin().from("google_accounts").upsert(row, { onConflict: "user_id" });
    if (error) throw error;

    const acc = (await getAccount(user.id)) as GoogleAccount;
    await ensureTasksCalendar(acc);
    return back("connected");
  } catch (e) {
    console.error("Google callback:", e);
    return back("error");
  }
}
