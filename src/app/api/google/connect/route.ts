// Začátek připojení Google Kalendáře – přesměruje na souhlas Googlu.

import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/calendar-server";
import { authUrl, googleConfigured } from "@/lib/google";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { user } = await requireUser();
  const origin = new URL(req.url).origin;
  if (!user) return NextResponse.redirect(new URL("/login", origin));
  if (!googleConfigured()) return NextResponse.redirect(new URL("/?calendar=not-configured", origin));

  const state = randomBytes(24).toString("hex");
  const res = NextResponse.redirect(authUrl(origin, state, user.email ?? undefined));
  res.cookies.set("gcal_state", state, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 600, path: "/" });
  return res;
}
