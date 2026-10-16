/*
 * SELF-CONTAINED ON PURPOSE: no imports, so the same file runs in the browser and in
 * the Supabase Edge Function supabase/functions/weather-alerts (a copy lives there as
 * kiln-weather.ts). Change the rules here, then copy this file over and redeploy.
 */

/**
 * Weather for brick-kiln work at Kapasia: an hourly forecast from Open-Meteo and
 * the rules that turn it into signals (red = act now, orange = get ready,
 * yellow = for the day) plus a daily "drying day" rating for green bricks.
 * Thresholds live in KILN_WEATHER_RULES so they are easy to tune.
 */

const LAT = 24.1023;
const LON = 90.5694;

const bn = (x: number | string) => Number(x).toLocaleString("bn-BD");

const WEATHER_TEXT: Record<number, string> = {
  0: "পরিষ্কার আকাশ ☀️", 1: "প্রায় পরিষ্কার আকাশ 🌤️", 2: "আংশিক মেঘলা ⛅", 3: "মেঘাচ্ছন্ন আকাশ ☁️",
  45: "কুয়াশা 🌫️", 48: "ঘন কুয়াশা 🌫️",
  51: "হালকা গুঁড়ি গুঁড়ি বৃষ্টি 🌦️", 53: "গুঁড়ি গুঁড়ি বৃষ্টি 🌦️", 55: "ঘন গুঁড়ি গুঁড়ি বৃষ্টি 🌧️",
  56: "হালকা ঠান্ডা গুঁড়ি বৃষ্টি 🌧️", 57: "ঠান্ডা গুঁড়ি বৃষ্টি 🌧️",
  61: "হালকা বৃষ্টি 🌧️", 63: "মাঝারি বৃষ্টি 🌧️", 65: "ভারী বৃষ্টি 🌧️", 66: "হালকা ঠান্ডা বৃষ্টি 🌧️", 67: "ভারী ঠান্ডা বৃষ্টি 🌧️",
  80: "হালকা ঝরো বৃষ্টি 🌦️", 81: "মাঝারি ঝরো বৃষ্টি 🌧️", 82: "প্রবল ঝরো বৃষ্টি ⛈️",
  95: "বজ্রসহ ঝড়-বৃষ্টি ⛈️", 96: "শিলাসহ বজ্রঝড় ⛈️", 99: "প্রবল শিলাসহ বজ্রঝড় ⛈️",
};
export const kilnWeatherText = (code: number) => WEATHER_TEXT[code] ?? "মিশ্র আবহাওয়া";

/** "YYYY-MM-DDTHH:MM" (already Dhaka time) → "বিকাল ৪:০০" */
export function kilnBnTime(t: string): string {
  const h = Number(t.slice(11, 13)), m = Number(t.slice(14, 16));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return t;
  const label = h >= 4 && h < 6 ? "ভোর" : h >= 6 && h < 12 ? "সকাল" : h >= 12 && h < 15 ? "দুপুর" : h >= 15 && h < 18 ? "বিকাল" : h >= 18 && h < 20 ? "সন্ধ্যা" : "রাত";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${label} ${bn(h12)}:${m < 10 ? "০" : ""}${bn(m)}`;
}

export const KILN_WEATHER_RULES = {
  /** hours ahead to warn of rain: time needed to cover the green bricks in the field */
  coverLeadHours: 2, // covering takes 30-60 min; the forecast is hourly and checked every 30 min
  rainNowProb: 60, // % within the lead time → red
  rainNowMm: 0.5, // mm in an hour within the lead time → red
  rainLaterProb: 40, // % later today or tonight → orange
  rainTomorrowProb: 50, // % tomorrow → orange
  stormHours: 6, // thunderstorm or strong gust look-ahead
  gustKmh: 40, // km/h gust → red
  heatC: 36, // °C max → yellow
  fogVisibilityM: 1000, // m in the early morning → yellow
} as const;

export type HourPoint = {
  time: string; // YYYY-MM-DDTHH:00, Dhaka
  temp: number;
  rainProb: number;
  rainMm: number;
  code: number;
  gust: number;
  humidity: number;
  visibility: number;
  sunSec: number;
};

export type DayPoint = {
  date: string;
  code: number;
  max: number;
  min: number;
  rainProb: number;
  rainMm: number;
  sunHours: number;
  gustMax: number;
  sunrise: string;
  sunset: string;
};

export type KilnForecast = {
  fetchedAt: number;
  current: { temp: number; feels: number; humidity: number; rainMm: number; code: number; gust: number; wind: number };
  hours: HourPoint[];
  days: DayPoint[];
};

export type SignalLevel = "red" | "orange" | "yellow";
export type WeatherSignal = { key: string; level: SignalLevel; title: string; action: string };

export type DryingDay = { label: "ভালো" | "মাঝারি" | "খারাপ"; tone: "good" | "mid" | "bad"; reason: string };

const n = (v: unknown) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

let cache: { at: number; data: KilnForecast } | null = null;

export async function fetchKilnForecast(): Promise<KilnForecast> {
  if (cache && Date.now() - cache.at < 10 * 60_000) return cache.data;
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}` +
    "&current=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,wind_gusts_10m" +
    "&hourly=temperature_2m,precipitation_probability,precipitation,weather_code,wind_gusts_10m,relative_humidity_2m,visibility,sunshine_duration" +
    "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,sunshine_duration,wind_gusts_10m_max,sunrise,sunset" +
    "&timezone=Asia%2FDhaka&forecast_days=4";
  const res = await fetch(url);
  if (!res.ok) {
    if (cache) return cache.data;
    throw new Error("আবহাওয়ার তথ্য আনা যায়নি");
  }
  const d = await res.json();
  const h = d?.hourly ?? {};
  const hours: HourPoint[] = ((h.time ?? []) as string[]).map((t, i) => ({
    time: t,
    temp: n(h.temperature_2m?.[i]),
    rainProb: n(h.precipitation_probability?.[i]),
    rainMm: n(h.precipitation?.[i]),
    code: n(h.weather_code?.[i]),
    gust: n(h.wind_gusts_10m?.[i]),
    humidity: n(h.relative_humidity_2m?.[i]),
    visibility: h.visibility?.[i] == null ? 99999 : n(h.visibility?.[i]),
    sunSec: n(h.sunshine_duration?.[i]),
  }));
  const dl = d?.daily ?? {};
  const days: DayPoint[] = ((dl.time ?? []) as string[]).map((t, i) => ({
    date: t,
    code: n(dl.weather_code?.[i]),
    max: Math.round(n(dl.temperature_2m_max?.[i])),
    min: Math.round(n(dl.temperature_2m_min?.[i])),
    rainProb: n(dl.precipitation_probability_max?.[i]),
    rainMm: n(dl.precipitation_sum?.[i]),
    sunHours: Math.round((n(dl.sunshine_duration?.[i]) / 3600) * 10) / 10,
    gustMax: Math.round(n(dl.wind_gusts_10m_max?.[i])),
    sunrise: String(dl.sunrise?.[i] ?? ""),
    sunset: String(dl.sunset?.[i] ?? ""),
  }));
  const c = d?.current ?? {};
  const data: KilnForecast = {
    fetchedAt: Date.now(),
    current: {
      temp: Math.round(n(c.temperature_2m)),
      feels: Math.round(n(c.apparent_temperature)),
      humidity: Math.round(n(c.relative_humidity_2m)),
      rainMm: n(c.precipitation),
      code: n(c.weather_code),
      gust: Math.round(n(c.wind_gusts_10m)),
      wind: Math.round(n(c.wind_speed_10m)),
    },
    hours,
    days,
  };
  cache = { at: Date.now(), data };
  return data;
}

/** Current Dhaka hour key, e.g. 2026-10-16T20 */
export function dhakaHourKey(d = new Date()) {
  return d.toLocaleString("sv-SE", { timeZone: "Asia/Dhaka" }).slice(0, 13).replace(" ", "T");
}

const isRainCode = (c: number) => (c >= 51 && c <= 67) || (c >= 80 && c <= 82) || c >= 95;
const isStormCode = (c: number) => c >= 95;
const hourOf = (t: string) => Number(t.slice(11, 13));

/** Hours from now (current hour included), up to `count` */
export function upcomingHours(f: KilnForecast, count: number, now = new Date()) {
  const key = dhakaHourKey(now);
  const start = f.hours.findIndex((x) => x.time.slice(0, 13) >= key);
  return start < 0 ? [] : f.hours.slice(start, start + count);
}

const strongest = (list: HourPoint[]) => list.reduce<HourPoint | null>((a, b) => (!a || b.rainProb > a.rainProb ? b : a), null);

/** Turns the forecast into kiln signals, most urgent first */
export function kilnSignals(f: KilnForecast, now = new Date()): WeatherSignal[] {
  const R = KILN_WEATHER_RULES;
  const out: WeatherSignal[] = [];
  const key = dhakaHourKey(now);
  const today = key.slice(0, 10);
  const hourNow = Number(key.slice(11, 13));

  // red: rain now or within the cover lead time
  const lead = upcomingHours(f, R.coverLeadHours + 1, now);
  const rainingNow = f.current.rainMm > 0 || isRainCode(f.current.code);
  const soon = lead.find((x) => x.rainProb >= R.rainNowProb || x.rainMm >= R.rainNowMm);
  if (rainingNow) {
    out.push({ key: "rain-now", level: "red", title: "এখন বৃষ্টি হচ্ছে", action: "কাঁচা ইট এখনই ঢাকুন, লোড বন্ধ রাখুন।" });
  } else if (soon) {
    out.push({
      key: "rain-soon", level: "red",
      title: `${kilnBnTime(soon.time)} নাগাদ বৃষ্টি (${bn(soon.rainProb)}%)`,
      action: "কাঁচা ইট এখনই ঢাকা শুরু করুন, নতুন ইট বিছাবেন না।",
    });
  }

  // red: thunderstorm or strong gusts in the next few hours
  const next = upcomingHours(f, R.stormHours, now);
  const storm = next.find((x) => isStormCode(x.code));
  if (storm) {
    out.push({
      key: "storm", level: "red",
      title: `${kilnBnTime(storm.time)} নাগাদ বজ্রঝড়ের আশঙ্কা`,
      action: "মাঠের কাজ বন্ধ করে শ্রমিকদের নিরাপদ জায়গায় পাঠান। ঢাকনা শক্ত করে বাঁধুন।",
    });
  }
  const gust = next.reduce<HourPoint | null>((a, b) => (!a || b.gust > a.gust ? b : a), null);
  if (gust && gust.gust >= R.gustKmh) {
    out.push({
      key: "gust", level: "red",
      title: `দমকা হাওয়া ঘণ্টায় ${bn(Math.round(gust.gust))} কিমি (${kilnBnTime(gust.time)})`,
      action: "পলিথিন ও ত্রিপল শক্ত করে বাঁধুন, আলগা জিনিস সরান।",
    });
  }

  // orange: later today, tonight, tomorrow
  const restOfDay = f.hours.filter((x) => x.time.slice(0, 13) > key && x.time.slice(0, 10) === today && hourOf(x.time) < 18);
  const laterToday = strongest(restOfDay);
  if (!soon && !rainingNow && laterToday && laterToday.rainProb >= R.rainLaterProb) {
    out.push({
      key: "rain-later", level: "orange",
      title: `আজ ${kilnBnTime(laterToday.time)} নাগাদ বৃষ্টির সম্ভাবনা ${bn(laterToday.rainProb)}%`,
      action: "পলিথিন হাতের কাছে রাখুন, আকাশে চোখ রাখুন।",
    });
  }
  const tomorrow = f.days.find((x) => x.date > today);
  const nightHours = f.hours.filter((x) => {
    const d = x.time.slice(0, 10), hr = hourOf(x.time);
    return (d === today && hr >= Math.max(18, hourNow)) || (tomorrow && d === tomorrow.date && hr < 6);
  });
  const night = strongest(nightHours);
  if (night && night.rainProb >= R.rainLaterProb && !(soon && night.time <= soon.time)) {
    out.push({
      key: "rain-night", level: "orange",
      title: `আজ রাতে বৃষ্টির সম্ভাবনা ${bn(night.rainProb)}% (${kilnBnTime(night.time)} নাগাদ)`,
      action: "সন্ধ্যার আগেই মাঠের সব কাঁচা ইট ঢেকে দিন।",
    });
  }
  if (tomorrow && tomorrow.rainProb >= R.rainTomorrowProb) {
    out.push({
      key: "rain-tomorrow", level: "orange",
      title: `কাল বৃষ্টির সম্ভাবনা ${bn(tomorrow.rainProb)}%`,
      action: "আজ শুকনো ইট বেশি করে ভাটায় ঢোকান, নতুন ইট কম বিছান।",
    });
  }

  // yellow: heat and fog
  const todayDay = f.days.find((x) => x.date === today);
  if (todayDay && todayDay.max >= R.heatC && hourNow < 16) {
    out.push({
      key: "heat", level: "yellow",
      title: `তীব্র গরম, সর্বোচ্চ ${bn(todayDay.max)}° সে.`,
      action: "দুপুর ১২টা থেকে ৩টা ভারী কাজ কমান, শ্রমিকদের পানি ও ছায়ার ব্যবস্থা রাখুন।",
    });
  }
  const fog = f.hours.find((x) => {
    const hr = hourOf(x.time);
    return x.time.slice(0, 13) >= key && hr >= 4 && hr <= 9 &&
      (x.visibility < R.fogVisibilityM || x.code === 45 || x.code === 48);
  });
  if (fog && fog.time.slice(0, 10) <= (tomorrow?.date ?? today)) {
    out.push({
      key: "fog", level: "yellow",
      title: `${fog.time.slice(0, 10) === today ? "আজ" : "কাল"} ভোরে ঘন কুয়াশা`,
      action: "কাজ শুরু একটু দেরিতে, ট্রাক সাবধানে চালাতে বলুন। ইট শুকাতে দেরি হবে।",
    });
  }
  const order: Record<SignalLevel, number> = { red: 0, orange: 1, yellow: 2 };
  return out.sort((a, b) => order[a.level] - order[b.level]);
}

/** How well green bricks dry on a day: sun hours, daytime humidity and rain */
export function dryingDay(f: KilnForecast, date: string): DryingDay | null {
  const day = f.days.find((x) => x.date === date);
  if (!day) return null;
  const daytime = f.hours.filter((x) => x.time.slice(0, 10) === date && hourOf(x.time) >= 7 && hourOf(x.time) <= 17);
  const hum = daytime.length ? daytime.reduce((a, x) => a + x.humidity, 0) / daytime.length : 80;
  const sun = daytime.length ? daytime.reduce((a, x) => a + x.sunSec, 0) / 3600 : day.sunHours;
  if (day.rainMm >= 2 || day.rainProb >= 60) {
    return { label: "খারাপ", tone: "bad", reason: `বৃষ্টির সম্ভাবনা ${bn(day.rainProb)}%` };
  }
  let pts = 0;
  if (sun >= 7) pts += 2; else if (sun >= 4) pts += 1;
  if (hum <= 65) pts += 2; else if (hum <= 80) pts += 1;
  const reason = `রোদ ${bn(Math.round(sun))} ঘণ্টা, আর্দ্রতা ${bn(Math.round(hum))}%`;
  if (pts >= 3) return { label: "ভালো", tone: "good", reason };
  if (pts >= 2) return { label: "মাঝারি", tone: "mid", reason };
  return { label: "খারাপ", tone: "bad", reason };
}

