import type { Metadata } from "next";

export const metadata: Metadata = { title: "Ochrana soukromí – Úkolník" };

export default function Privacy() {
  return (
    <main className="legal">
      <h1>Ochrana soukromí</h1>
      <p>Úkolník je osobní aplikace na úkoly, měření času a plán dne. Používá ji jen její vlastník.</p>

      <h2>Jaká data aplikace zpracovává</h2>
      <ul>
        <li>Úkoly, záznamy času a štítky, které do aplikace zapíšeš. Ukládají se do databáze Supabase.</li>
        <li>E-mail Google účtu, kterým se přihlašuješ.</li>
        <li>
          Po připojení Google Kalendáře: události z kalendářů, které si vybereš (jen pro zobrazení v aplikaci, neukládají se), a kalendář „Úkoly“,
          do kterého aplikace zapisuje úkoly s datem a ze kterého čte jejich změny.
        </li>
        <li>Přístupový klíč ke Google Kalendáři, uložený na serveru a nepřístupný z prohlížeče.</li>
      </ul>

      <h2>Komu se data předávají</h2>
      <p>
        Nikomu. Data se nesdílí, neprodávají ani nepoužívají k reklamě. Technicky je zpracovávají jen služby, na kterých aplikace běží: Supabase
        (databáze), Vercel (hosting) a Google (přihlášení a kalendář). Předpověď počasí se načítá z Open-Meteo a OpenStreetMap jen podle zvoleného
        místa.
      </p>

      <h2>Smazání a odpojení</h2>
      <p>
        Kalendář lze kdykoli odpojit v aplikaci (tlačítko Kalendář) nebo v nastavení účtu Google v části Zabezpečení → Aplikace třetích stran. Po
        odpojení se přístupový klíč smaže.
      </p>

      <p>
        <a href="/">Zpět do aplikace</a>
      </p>
    </main>
  );
}
