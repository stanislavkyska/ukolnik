import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Obnovuje přihlášení a nepřihlášené posílá na /login.
export async function middleware(request: NextRequest) {
  // ukázkový režim bez Supabase – žádné přihlášení
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return NextResponse.next();

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list) => {
          list.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublic = path.startsWith("/login") || path.startsWith("/auth");
  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  // API agentů má vlastní ověření tokenem; statické soubory nepotřebují session
  matcher: ["/((?!api/agent|_next/static|_next/image|icons|manifest.webmanifest|favicon.ico).*)"],
};
