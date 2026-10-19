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
| `faktura Dvořák do pátku` | **deadline** pátek (bez naplánovaného dne) |
| `řezy RD ve středu do 20. 10. #projekce/rd-senov` | dělat ve středu, deadline 20. 10. |
| `STK za měsíc` / `kontrola za 3 dny` | relativně od dneška |

**Kdy vs. deadline:** datum s předložkou `do`, `nejpozději` nebo `deadline` je deadline (do kdy musí být hotovo). Ostatní datum je den, kdy na tom chceš dělat. Úkol bez naplánovaného dne se zobrazuje v den deadlinu. Deadliny v příštích 3 dnech hlídá sekce **Blíží se deadline** v pohledu Dnes.

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

### Cíle hodin
- **Čas → Nastavit cíl hodin:** např. `projekce` 8 h denně (po–pá) a 40 h týdně. Prázdný štítek = všechen čas. Štítek `projekce` počítá i `projekce/rd-senov` atd.
- V pohledu **Dnes** i v záložce **Čas** je průběh: kolik je odpracováno, kolik zbývá, se spuštěnými stopkami odhad, kdy bude hotovo. U týdne/měsíce tempo na zbývající pracovní dny a skluz/náskok proti plánu (čárka v pruhu).
- **Dopsání času:** v poli stopek napiš délku – `kontrola výkresů 1h30 #projekce/rd-senov`, `porada 45min`, `statika 2,5h včera` – a tlačítko se změní na **Zapsat** (záznam končí teď, u „včera“ včera v 17:00).
- **Od kdy / od–do:** `výkresy od 8:00 #projekce` spustí stopky běžící od 8:00 (funguje i `od 8,00`, `od 8`). `porada 8:00-9:30` nebo `porada od 8 do 9:30` zapíše hotový záznam, stejně tak `statika od 13:00 2h` nebo `výkaz 1h do 12:00`. S „včera“ platí pro včerejšek.
- Stopky běžící přes 10 h upozorní, že je asi zapomenuté zastavit.

Štítky jsou společné pro úkoly, čas i kalendář – našeptávač nabízí všechny.

## Počasí

V hlavičce vpravo je aktuální počasí. Kliknutím rozbalíš předpověď na 12 hodin a 7 dní, kliknutím na název místa ho změníš (vyhledání obce, poslední místa, „Moje poloha“). Výchozí místo je Šenov u Ostravy, vybrané místo si pamatuje každé zařízení zvlášť. V pohledu Plán je u každého dne ikona počasí a teploty. Data: Open-Meteo (zdarma, bez klíče).

## Google Kalendář

- V pohledech **Dnes** a **Plán** jsou události ze zvolených kalendářů (tvůj, rodinný…). Klik otevře událost v Google Kalendáři.
- Úkoly s datem se zapisují do kalendáře **Úkoly** (založí se sám): bez času jako celodenní, s časem jako 30 min, úkol jen s deadlinem jako `⚑ název`.
- **Obousměrně:** přesuneš událost v kalendáři → přesune se úkol. Smažeš ji → úkol přijde o datum. Přidáš událost přímo do kalendáře Úkoly → vznikne úkol. Hotový úkol z kalendáře zmizí. Při změně na obou stranách vyhrává novější.
- **Štítky v kalendáři:** napiš `#štítek` do názvu nebo popisu události (i v rodinném kalendáři) – zobrazí se u události a filtr podle štítku ji ukáže.
- Nastavení (které kalendáře zobrazovat, zápis úkolů, odpojení) je pod tlačítkem **Kalendář** dole na stránce.

### Nastavení napojení (jednou)
1. [Google Cloud Console](https://console.cloud.google.com) → projekt `ukolnik` → **APIs & Services → Library** → vyhledej **Google Calendar API** → **Enable**.
2. **Google Auth Platform → Clients** → tvůj klient → **Authorized redirect URIs** → přidej `https://ADRESA-APLIKACE/api/google/callback` → Save.
3. **Google Auth Platform → Audience** → **Publish app** (v testovacím režimu Google přístup ke kalendáři po 7 dnech zruší). Při připojení pak Google ukáže varování „aplikace není ověřená“ → *Advanced* → *Go to Úkolník*. Je to tvoje vlastní aplikace, ověření není potřeba.
4. Ve Vercelu doplň `GOOGLE_CLIENT_ID` a `GOOGLE_CLIENT_SECRET` (stejné hodnoty jako v Supabase u přihlášení Google) a nasaď znovu.
5. V Supabase spusť `supabase/004_calendar.sql`.
6. V aplikaci dole **Připojit kalendář**.

## Spuštění

### 1. Supabase (databáze a přihlášení) – zdarma
1. Založ projekt na [supabase.com](https://supabase.com).
2. SQL Editor → vlož obsah `supabase/schema.sql` → Run. (Při aktualizaci starší instalace stačí spustit nové soubory `supabase/00X_*.sql`, naposledy `005_goals.sql`.)
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
| `GET /api/agent/brief` | podklad pro ranní přehled: dnešní události z kalendáře, po termínu, dnes, příštích 7 dní + hotový text |
| `GET /api/agent/tasks?view=today\|overdue\|week\|open\|done\|all&tag=really` | výpis úkolů |
| `POST /api/agent/tasks` `{"text": "faktura Novák v pátek #really"}` | nový úkol stejně jako z pole v aplikaci |
| `PATCH /api/agent/tasks/:id` `{"due_date": "2026-10-20"}` | úprava (title, notes, due_date, due_time, tags, important, done) |
| `DELETE /api/agent/tasks/:id` | smazání |
| `GET /api/agent/time?range=today\|week\|month` nebo `?from=…&to=…&tag=projekce` | změřený čas + součty podle štítků |
| `POST /api/agent/time` `{"action":"start","text":"elektro #maringotka"}` / `{"action":"stop"}` | stopky |

## Další kroky
1. ~~Úkolník: zadání, termíny, štítky, přesouvání~~
2. ~~Čtení Google Kalendáře (tvůj + rodinný) – události v pohledech Dnes a Plán~~
3. ~~Zápis úkolů do kalendáře „Úkoly“ a zpětná synchronizace přesunů~~
4. Ranní přehled jako naplánovaná úloha (push + e-mail)

## Technika
Next.js 15 (App Router), React 19, Supabase (Postgres + Google přihlášení, řádkové zabezpečení – každý vidí jen své úkoly). Testy parseru a štítků: `npm test`.
