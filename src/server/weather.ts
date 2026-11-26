// Real weather + local time per space, from Open-Meteo (free, no API key).
// Falls back to a deterministic simulation when the network is unavailable.
export type WeatherKind = "clear" | "cloudy" | "fog" | "rain" | "storm" | "snow";
export interface WeatherInfo {
  kind: WeatherKind;
  code: number;
  temp: number;
  humidity: number;
  wind: number;
  isDay: boolean;
  sunrise: string;   // "HH:MM" local
  sunset: string;    // "HH:MM" local
  timezone: string;  // IANA
  utcOffsetSeconds: number;
  city: string;
  country: string;
  lat: number;
  lon: number;
  fetchedAt: number;
  source: "open-meteo" | "simulado" | "manual";
}

const TTL = 10 * 60 * 1000;
const cache = new Map<string, { at: number; info: WeatherInfo }>();
const geoCache = new Map<string, { lat: number; lon: number; timezone: string; name: string; country: string }>();

export function kindFromCode(code: number): WeatherKind {
  if (code <= 1) return "clear";
  if (code <= 3) return "cloudy";
  if (code === 45 || code === 48) return "fog";
  if (code >= 71 && code <= 77) return "snow";
  if (code === 85 || code === 86) return "snow";
  if (code >= 95) return "storm";
  if (code >= 51) return "rain";
  return "cloudy";
}

async function fetchJson(url: string, ms = 6000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { "user-agent": "gather-lite/1.0" } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally { clearTimeout(t); }
}

export async function geocode(city: string) {
  const key = city.trim().toLowerCase();
  if (geoCache.has(key)) return geoCache.get(key)!;
  const data = await fetchJson(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=pt&format=json`);
  const hit = data?.results?.[0];
  if (!hit) throw new Error("cidade não encontrada");
  const out = { lat: hit.latitude, lon: hit.longitude, timezone: hit.timezone ?? "UTC", name: hit.name, country: hit.country ?? "" };
  geoCache.set(key, out);
  return out;
}

function hhmm(iso: string) { const m = /T(\d{2}:\d{2})/.exec(iso ?? ""); return m ? m[1] : "06:00"; }

export function simulated(city: string, timezone = "America/Sao_Paulo"): WeatherInfo {
  // Deterministic by day+city so everyone in the space sees the same thing.
  const day = Math.floor(Date.now() / 86400000);
  let h = 0; for (const ch of city + day) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const kinds: WeatherKind[] = ["clear", "clear", "cloudy", "cloudy", "rain", "clear", "fog", "storm"];
  const kind = kinds[h % kinds.length];
  const now = new Date();
  const local = new Date(now.toLocaleString("en-US", { timeZone: timezone }));
  const hour = local.getHours();
  const offset = Math.round((local.getTime() - new Date(now.toLocaleString("en-US", { timeZone: "UTC" })).getTime()) / 1000);
  return { kind, code: kind === "rain" ? 61 : kind === "storm" ? 95 : kind === "fog" ? 45 : kind === "cloudy" ? 3 : 0, temp: 18 + (h % 12), humidity: 50 + (h % 40), wind: h % 20, isDay: hour >= 6 && hour < 18, sunrise: "06:00", sunset: "18:00", timezone, utcOffsetSeconds: offset, city, country: "", lat: 0, lon: 0, fetchedAt: Date.now(), source: "simulado" };
}

export async function getWeather(spaceId: string, city: string, lat?: number | null, lon?: number | null): Promise<WeatherInfo> {
  const cached = cache.get(spaceId);
  if (cached && Date.now() - cached.at < TTL && cached.info.city === city) return cached.info;
  try {
    let geo = lat != null && lon != null ? { lat, lon, timezone: "auto", name: city, country: "" } : await geocode(city);
    const d = await fetchJson(`https://api.open-meteo.com/v1/forecast?latitude=${geo.lat}&longitude=${geo.lon}&current=temperature_2m,relative_humidity_2m,is_day,weather_code,wind_speed_10m&daily=sunrise,sunset&timezone=auto&forecast_days=1`);
    const info: WeatherInfo = {
      kind: kindFromCode(d.current.weather_code), code: d.current.weather_code, temp: Math.round(d.current.temperature_2m), humidity: d.current.relative_humidity_2m, wind: Math.round(d.current.wind_speed_10m),
      isDay: d.current.is_day === 1, sunrise: hhmm(d.daily.sunrise[0]), sunset: hhmm(d.daily.sunset[0]), timezone: d.timezone, utcOffsetSeconds: d.utc_offset_seconds,
      city: geo.name || city, country: geo.country, lat: geo.lat, lon: geo.lon, fetchedAt: Date.now(), source: "open-meteo",
    };
    cache.set(spaceId, { at: Date.now(), info });
    return info;
  } catch (e) {
    const info = simulated(city, cached?.info.timezone);
    cache.set(spaceId, { at: Date.now() - TTL + 60_000, info }); // retry in a minute
    return info;
  }
}

export function invalidate(spaceId: string) { cache.delete(spaceId); }
