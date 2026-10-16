"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { dateLabel, weekday } from "@/lib/dates";
import {
  DEFAULT_PLACE,
  describe,
  fetchForecast,
  loadPlace,
  loadRecent,
  savePlace,
  searchPlaces,
  type DayForecast,
  type Forecast,
  type Place,
} from "@/lib/weather";

const REFRESH_MS = 30 * 60 * 1000;

/** Stav předpovědi pro celou aplikaci (karta v hlavičce + dny v Plánu). */
export function useWeather() {
  const [place, setPlace] = useState<Place | null>(null);
  const [recent, setRecent] = useState<Place[]>([]);
  const [forecast, setForecast] = useState<Forecast | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    setPlace(loadPlace());
    setRecent(loadRecent());
  }, []);

  const refresh = useCallback(async (p: Place) => {
    try {
      setForecast(await fetchForecast(p));
      setError(false);
    } catch (e) {
      console.error(e);
      setError(true);
    }
  }, []);

  useEffect(() => {
    if (!place) return;
    setForecast(null);
    refresh(place);
    const t = setInterval(() => refresh(place), REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh(place);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [place, refresh]);

  const choose = (p: Place) => {
    setRecent(savePlace(p));
    setPlace(p);
  };

  const dayFor = (date: string): DayForecast | undefined => forecast?.days.find((d) => d.date === date);

  return { place, recent, forecast, error, choose, dayFor };
}

export type WeatherState = ReturnType<typeof useWeather>;

/** Malý údaj o počasí k hlavičce dne v Plánu */
export function DayWeather({ day }: { day: DayForecast | undefined }) {
  if (!day) return null;
  const d = describe(day.code);
  return (
    <span className="dayw" title={`${d.label}${day.rainChance ? `, srážky ${day.rainChance} %` : ""}`}>
      <span aria-hidden>{d.icon}</span>
      <span>
        {day.max}° <span className="dayw-min">{day.min}°</span>
      </span>
      <span className="sr-only">{d.label}</span>
    </span>
  );
}

function PlacePicker({ w, onDone }: { w: WeatherState; onDone: () => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Place[]>([]);
  const [busy, setBusy] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => input.current?.focus(), []);

  useEffect(() => {
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    let live = true;
    // pomalejší psaní = méně dotazů (OpenStreetMap povoluje 1 dotaz za sekundu)
    const t = setTimeout(async () => {
      setBusy(true);
      try {
        const list = await searchPlaces(q.trim());
        if (live) {
          setResults(list);
          setSearchError(null);
        }
      } catch (e) {
        if (live) {
          setResults([]);
          setSearchError(e instanceof Error ? e.message : "Vyhledávání selhalo.");
        }
      } finally {
        if (live) setBusy(false);
      }
    }, 600);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [q]);

  const pick = (p: Place) => {
    w.choose(p);
    onDone();
  };

  const here = () => {
    setGeoError(null);
    if (!navigator.geolocation) return setGeoError("Prohlížeč polohu nepodporuje.");
    navigator.geolocation.getCurrentPosition(
      (pos) => pick({ name: "Moje poloha", region: "", lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => setGeoError("Polohu se nepodařilo zjistit. Povol ji prohlížeči, nebo místo vyhledej."),
      { timeout: 10000, maximumAge: 600000 },
    );
  };

  const quick = [DEFAULT_PLACE, ...w.recent].filter(
    (p, i, all) => all.findIndex((x) => Math.abs(x.lat - p.lat) < 0.01 && Math.abs(x.lon - p.lon) < 0.01) === i,
  );

  return (
    <div className="picker">
      <input
        ref={input}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && results[0]) {
            e.preventDefault();
            pick(results[0]);
          }
          if (e.key === "Escape") onDone();
        }}
        placeholder="Hledat obec nebo město"
        aria-label="Hledat místo"
      />
      <ul className="picker-list">
        {q.trim().length >= 2 ? (
          results.length ? (
            results.map((p) => (
              <li key={`${p.lat},${p.lon}`}>
                <button type="button" onClick={() => pick(p)}>
                  <b>{p.name}</b> <span>{p.region}</span>
                </button>
              </li>
            ))
          ) : (
            <li className="picker-empty">
              {busy ? "Hledám…" : searchError ? `${searchError} Zkus to za chvíli, nebo použij Moje poloha.` : "Nic nenalezeno. Zkus jiný tvar názvu nebo bližší větší obec."}
            </li>
          )
        ) : (
          <>
            {quick.map((p) => (
              <li key={`${p.lat},${p.lon}`}>
                <button type="button" onClick={() => pick(p)} aria-current={w.place?.lat === p.lat && w.place?.lon === p.lon}>
                  <b>{p.name}</b> <span>{p.region}</span>
                </button>
              </li>
            ))}
            <li>
              <button type="button" onClick={here}>
                <b>📍 Moje poloha</b>
              </button>
            </li>
          </>
        )}
      </ul>
      {geoError && <p className="picker-error">{geoError}</p>}
    </div>
  );
}

/** Karta počasí v hlavičce: teď + po kliknutí hodiny a dny, výběr místa. */
export function WeatherCard({ w, today }: { w: WeatherState; today: string }) {
  const [open, setOpen] = useState(false);
  const [picking, setPicking] = useState(false);
  const f = w.forecast;
  const now = f ? describe(f.now.code, f.now.isDay) : null;
  const todayF = f?.days.find((d) => d.date === today);

  // příštích 12 hodin od teď
  const hourNow = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Prague", hour: "2-digit", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit" })
    .format(new Date())
    .replace(" ", "T");
  const hours = f ? f.hours.filter((h) => h.time.slice(0, 13) >= hourNow.slice(0, 13)).slice(0, 12) : [];

  return (
    <>
    <div className="wx">
      <button type="button" className="wx-now" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls="wx-detail">
        {f && now ? (
          <>
            <span className="wx-icon" aria-hidden>
              {now.icon}
            </span>
            <span className="wx-temp">{f.now.temp}°</span>
            <span className="wx-sub">
              {now.label}
              {todayF && (
                <>
                  <br />
                  {todayF.max}° / {todayF.min}°{todayF.rainChance ? ` · 💧${todayF.rainChance} %` : ""}
                </>
              )}
            </span>
          </>
        ) : (
          <span className="wx-sub">{w.error ? "Počasí nedostupné" : "Načítám počasí…"}</span>
        )}
      </button>
      <button
        type="button"
        className="wx-place"
        onClick={() => {
          setOpen(true);
          setPicking((p) => !p);
        }}
        aria-expanded={picking}
      >
        {w.place?.name ?? "…"} ▾
      </button>
    </div>

      {open && (
        <div className="wx-detail" id="wx-detail">
          {picking && <PlacePicker w={w} onDone={() => setPicking(false)} />}
          {f && (
            <>
              <ol className="wx-hours" aria-label="Příštích 12 hodin">
                {hours.map((h) => {
                  const d = describe(h.code);
                  return (
                    <li key={h.time}>
                      <span className="wx-h">{h.time.slice(11, 13)}</span>
                      <span aria-hidden>{d.icon}</span>
                      <span className="wx-ht">{h.temp}°</span>
                      <span className="wx-hr">{h.rainChance ? `${h.rainChance} %` : ""}</span>
                    </li>
                  );
                })}
              </ol>
              <ol className="wx-days" aria-label="Předpověď na 7 dní">
                {f.days.slice(0, 7).map((d) => {
                  const x = describe(d.code);
                  const weekend = weekday(d.date) >= 6;
                  return (
                    <li key={d.date} className={weekend ? "is-weekend" : undefined}>
                      <span className="wx-dn">{dateLabel(d.date, today)}</span>
                      <span className="wx-di" title={x.label} aria-hidden>
                        {x.icon}
                      </span>
                      <span className="wx-dl">{x.label}</span>
                      <span className="wx-dr">{d.rainChance ? `💧 ${d.rainChance} %` : ""}</span>
                      <span className="wx-dt">
                        <b>{d.max}°</b> {d.min}°
                      </span>
                    </li>
                  );
                })}
              </ol>
              {todayF && (
                <p className="wx-foot">
                  Východ {todayF.sunrise} · západ {todayF.sunset} · vítr {f.now.wind} km/h · Open-Meteo
                </p>
              )}
            </>
          )}
        </div>
      )}
    </>
  );
}
