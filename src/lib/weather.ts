// Předpověď počasí z Open-Meteo (zdarma, bez klíče, volá se přímo z prohlížeče).

export interface Place {
  name: string;
  region: string; // okres / kraj pro odlišení stejných názvů
  lat: number;
  lon: number;
}

// Šenov u Ostravy
export const DEFAULT_PLACE: Place = { name: "Šenov", region: "Ostrava-město", lat: 49.7932, lon: 18.3761 };

export interface DayForecast {
  date: string; // YYYY-MM-DD
  code: number;
  max: number;
  min: number;
  rainChance: number | null; // %
  rainSum: number; // mm
  sunrise: string; // HH:MM
  sunset: string;
}

export interface HourForecast {
  time: string; // YYYY-MM-DDTHH:MM (pražský čas)
  temp: number;
  code: number;
  rainChance: number | null;
}

export interface Forecast {
  now: { temp: number; code: number; wind: number; isDay: boolean };
  days: DayForecast[];
  hours: HourForecast[];
  fetchedAt: number;
}

/** WMO kód počasí → popis a ikona */
export function describe(code: number, isDay = true): { label: string; icon: string } {
  if (code === 0) return { label: "Jasno", icon: isDay ? "☀️" : "🌙" };
  if (code === 1) return { label: "Skoro jasno", icon: isDay ? "🌤️" : "🌙" };
  if (code === 2) return { label: "Polojasno", icon: "⛅" };
  if (code === 3) return { label: "Zataženo", icon: "☁️" };
  if (code === 45 || code === 48) return { label: "Mlha", icon: "🌫️" };
  if (code >= 51 && code <= 57) return { label: "Mrholení", icon: "🌦️" };
  if (code === 61 || code === 80) return { label: "Slabý déšť", icon: "🌦️" };
  if (code === 63 || code === 81) return { label: "Déšť", icon: "🌧️" };
  if (code === 65 || code === 82) return { label: "Silný déšť", icon: "🌧️" };
  if (code === 66 || code === 67) return { label: "Mrznoucí déšť", icon: "🌧️" };
  if (code === 71 || code === 85) return { label: "Slabé sněžení", icon: "🌨️" };
  if (code === 73 || code === 75 || code === 86) return { label: "Sněžení", icon: "❄️" };
  if (code === 77) return { label: "Sněhová zrna", icon: "🌨️" };
  if (code === 95) return { label: "Bouřka", icon: "⛈️" };
  if (code === 96 || code === 99) return { label: "Bouřka s kroupami", icon: "⛈️" };
  return { label: "—", icon: "·" };
}

const r = Math.round;

export async function fetchForecast(p: Place): Promise<Forecast> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${p.lat}&longitude=${p.lon}` +
    `&current=temperature_2m,weather_code,wind_speed_10m,is_day` +
    `&hourly=temperature_2m,weather_code,precipitation_probability` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,sunrise,sunset` +
    `&timezone=Europe%2FPrague&forecast_days=14&wind_speed_unit=kmh`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Počasí: ${res.status}`);
  const j = await res.json();
  const d = j.daily;
  const h = j.hourly;
  return {
    now: { temp: r(j.current.temperature_2m), code: j.current.weather_code, wind: r(j.current.wind_speed_10m), isDay: j.current.is_day === 1 },
    days: d.time.map((date: string, i: number) => ({
      date,
      code: d.weather_code[i],
      max: r(d.temperature_2m_max[i]),
      min: r(d.temperature_2m_min[i]),
      rainChance: d.precipitation_probability_max?.[i] ?? null,
      rainSum: Math.round((d.precipitation_sum?.[i] ?? 0) * 10) / 10,
      sunrise: String(d.sunrise[i]).slice(11, 16),
      sunset: String(d.sunset[i]).slice(11, 16),
    })),
    hours: h.time.map((time: string, i: number) => ({
      time,
      temp: r(h.temperature_2m[i]),
      code: h.weather_code[i],
      rainChance: h.precipitation_probability?.[i] ?? null,
    })),
    fetchedAt: Date.now(),
  };
}

export async function searchPlaces(q: string): Promise<Place[]> {
  const res = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=8&language=cs&format=json`,
  );
  if (!res.ok) return [];
  const j = await res.json();
  const list: Place[] = (j.results ?? []).map(
    (x: { name: string; admin1?: string; admin2?: string; country_code?: string; country?: string; latitude: number; longitude: number }) => ({
      name: x.name,
      region: [x.admin2 ?? x.admin1, x.country_code !== "CZ" ? x.country : null].filter(Boolean).join(", "),
      lat: x.latitude,
      lon: x.longitude,
    }),
  );
  // česká místa první
  return list.sort((a, b) => Number(/,/.test(a.region)) - Number(/,/.test(b.region)));
}

// Zapamatování místa v tomto zařízení
const PLACE_KEY = "ukolnik-weather-place";
const RECENT_KEY = "ukolnik-weather-recent";

export function loadPlace(): Place {
  try {
    const p = JSON.parse(localStorage.getItem(PLACE_KEY) ?? "null");
    if (p && typeof p.lat === "number") return p;
  } catch {
    /* výchozí místo */
  }
  return DEFAULT_PLACE;
}

export function loadRecent(): Place[] {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    if (Array.isArray(list)) return list;
  } catch {
    /* nic */
  }
  return [];
}

export function savePlace(p: Place): Place[] {
  const same = (a: Place) => Math.abs(a.lat - p.lat) < 0.01 && Math.abs(a.lon - p.lon) < 0.01;
  const recent = [p, ...loadRecent().filter((x) => !same(x))].slice(0, 5);
  try {
    localStorage.setItem(PLACE_KEY, JSON.stringify(p));
    localStorage.setItem(RECENT_KEY, JSON.stringify(recent));
  } catch {
    /* jen do zavření stránky */
  }
  return recent;
}
