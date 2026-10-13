# Úkolník

Osobní úkolník a plán dne. Rychlé zadání jednou větou, štítky s našeptáváním, přesouvání úkolů, funguje na počítači i v telefonu (připnutý na plochu). Připravený na napojení Google Kalendáře a na agenty (ranní přehled, zadávání přes Clauda).

## Jak se zadává

Napiš úkol jednou větou, aplikace si z ní vytáhne termín, čas a štítky:

| Napíšeš | Vznikne |
|---|---|
| `faktura Novák v pátek #really` | „faktura Novák“, pátek, štítek really |
| `výkresy RD do 15. 10. #kancelář !` | termín 15. 10., důležité |
| `focení Poruba zítra ve 14:30` | zítra 14:30 |
| `objednat dřevo příští týden` | pondělí příštího týdne |
| `STK za měsíc` / `kontrola za 3 dny` | relativně od dneška |

Poznává: dnes, zítra, pozítří, dny v týdnu (i skloňované: do pátku, ve středu), zkratky út/čt/pá/so, příští týden / příští pátek, za N dní/týdnů/měsíců, 15.10., 15. 10. 2027, čas 14:30, 9h, v 9.30. `!` = důležité.

**Štítky:** napiš `#` a začni psát – nabídnou se existující štítky (i bez diakritiky a s překlepem: `#kanc` → kancelář). Šipkami vybereš, Enter/Tab potvrdí. Nový štítek vznikne sám, stačí ho napsat.

**Přesouvání:** klik na úkol otevře úpravu s tlačítky Dnes / Zítra / Příští týden / Bez termínu. V pohledu Plán jde na počítači úkol přetáhnout na jiný den. Úkoly po termínu jdou jedním klikem přesunout na dnes.

Zkratka na počítači: `N` nebo `/` skočí do zadávání.

## Měření času

- **Stopky u úkolu:** tlačítko ▶ vpravo u úkolu spustí stopky s názvem a štítky úkolu. Znovu klik = stop.
- **Stopky na cokoli:** v záložce **Čas** napiš do pole dole, na čem děláš (`elektroinstalace #maringotka`), a dej Spustit.
- Běží vždy jen jedny stopky. Spuštění nových ty předchozí zastaví. Lišta s běžícími stopkami je vidět ve všech záložkách.
- **Přehled:** Dnes / Týden / Měsíc, součty podle štítků. Kliknutím na štítek se vyfiltrují záznamy a CSV export.
- **Podštítky:** `#projekce/rd-senov`, `#projekce/bd-poruba` se sečtou i pod `projekce`. Hodí se na projekty v kanceláři.
- Záznam jde upravit (čas od–do, štítky), smazat, přidat ručně a ▶ u záznamu pokračuje ve stejné činnosti.
- **CSV** se otevře v Excelu (datum, od, do, hodiny s desetinnou čárkou, činnost, štítky).

Štítky jsou společné pro úkoly i čas (a později kalendář) – našeptávač nabízí všechny.

## Spuštění

### 1. Supabase (databáze a přihlášení) – zdarma
1. Založ projekt na [supabase.com](https://supabase.com).
2. SQL Editor → vlož obsah `supabase/schema.sql` → Run. (Při aktualizaci starší instalace stačí `supabase/002_time.sql`.)
3. Authentication → Providers → Google: zapni. Client ID a Secret vytvoříš v [Google Cloud Console](https://console.cloud.google.com/apis/credentials) (OAuth client, typ Web application, redirect URI zkopíruj ze Supabase).
4. Authentication → URL Configuration: Site URL = adresa aplikace (např. `https://ukolnik.vercel.app`), a do Redirect URLs přidej `https://ukolnik.vercel.app/auth/callback` (a `http://localhost:3000/auth/callback` pro vývoj).

### 2. Vercel (hosting) – zdarma
1. Na [vercel.com](https://vercel.com) importuj tenhle repozitář.
2. Do Environment Variables vlož hodnoty podle `.env.example`.
3. Deploy. Po prvním přihlášení najdeš své user id v Supabase (Authentication → Users) a doplníš `OWNER_USER_ID`.

### 3. Telefon
Otevři adresu aplikace v telefonu → Sdílet / menu → **Přidat na plochu**. Otevírá se pak jako samostatná aplikace.

### Lokálně
```bash
npm install
cp .env.example .env.local   # vyplnit
npm run dev
```
Bez vyplněného Supabase běží v **ukázkovém režimu** (bez přihlášení, data jen v prohlížeči) – dobré na vyzkoušení.

## API pro agenty

Hlavička `Authorization: Bearer <AGENT_API_TOKEN>`.

| | |
|---|---|
| `GET /api/agent/brief` | podklad pro ranní přehled: po termínu, dnes, příštích 7 dní + hotový text |
| `GET /api/agent/tasks?view=today\|overdue\|week\|open\|done\|all&tag=really` | výpis úkolů |
| `POST /api/agent/tasks` `{"text": "faktura Novák v pátek #really"}` | nový úkol stejně jako z pole v aplikaci |
| `PATCH /api/agent/tasks/:id` `{"due_date": "2026-10-20"}` | úprava (title, notes, due_date, due_time, tags, important, done) |
| `DELETE /api/agent/tasks/:id` | smazání |
| `GET /api/agent/time?range=today\|week\|month` nebo `?from=…&to=…&tag=projekce` | změřený čas + součty podle štítků |
| `POST /api/agent/time` `{"action":"start","text":"elektro #maringotka"}` / `{"action":"stop"}` | stopky |

## Další kroky
1. ~~Úkolník: zadání, termíny, štítky, přesouvání~~
2. Čtení Google Kalendáře (tvůj + rodinný) – události v pohledech Dnes a Plán
3. Zápis úkolů do kalendáře „Úkoly“ a zpětná synchronizace přesunů
4. Ranní přehled jako naplánovaná úloha (push + e-mail)

## Technika
Next.js 15 (App Router), React 19, Supabase (Postgres + Google přihlášení, řádkové zabezpečení – každý vidí jen své úkoly). Testy parseru a štítků: `npm test`.
