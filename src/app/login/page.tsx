"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";

function Login() {
  const error = useSearchParams().get("error");

  const signIn = async () => {
    await supabaseBrowser().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  };

  return (
    <main className="login">
      <h1>Úkolník</h1>
      <p>Úkoly a plán dne na jednom místě.</p>
      {error === "email" && <p className="error">Tento Google účet nemá přístup. Přihlas se účtem, který je povolený v nastavení.</p>}
      {error === "auth" && <p className="error">Přihlášení se nepovedlo. Zkus to znovu.</p>}
      <button type="button" className="btn" onClick={signIn}>
        Přihlásit přes Google
      </button>
      <p className="login-foot">
        <a href="/soukromi">Ochrana soukromí</a>
      </p>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <Login />
    </Suspense>
  );
}
