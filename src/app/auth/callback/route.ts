import { NextResponse } from "next/server";
import { isAllowedEmail, supabaseServer } from "@/lib/supabase/server";

// Sem se vrací Google přihlášení přes Supabase.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const supabase = await supabaseServer();

  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      if (!isAllowedEmail(data.user?.email)) {
        await supabase.auth.signOut();
        return NextResponse.redirect(new URL("/login?error=email", url.origin));
      }
      return NextResponse.redirect(new URL("/", url.origin));
    }
  }
  return NextResponse.redirect(new URL("/login?error=auth", url.origin));
}
