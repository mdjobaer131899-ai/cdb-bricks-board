import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, CloudSun, Droplets, RefreshCw, Sunrise, Sunset, Wind } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SignalCard, useKilnForecast } from "@/components/weather-signals";
import { KILN_WEATHER_RULES, dryingDay, kilnBnTime, kilnSignals, kilnWeatherText, upcomingHours } from "@/lib/kiln-weather";
import { bn, bnDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/weather")({
  head: () => ({
    meta: [
      { title: "আবহাওয়া ও সতর্কতা — CDB Bricks" },
      { name: "description", content: "কাপাসিয়ার আবহাওয়া: বৃষ্টি, ঝড়, কুয়াশা আর গরমের সতর্কতা, কাঁচা ইট শুকানোর দিন আর ৩ দিনের পূর্বাভাস।" },
    ],
  }),
  component: WeatherPage,
});

const DRY_TONE = {
  good: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200",
  mid: "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-200",
  bad: "bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-200",
};

/** Rain chance to bar colour */
const rainTone = (p: number) =>
  p >= KILN_WEATHER_RULES.rainNowProb ? "bg-red-500" : p >= KILN_WEATHER_RULES.rainLaterProb ? "bg-amber-500" : p >= 20 ? "bg-sky-400" : "bg-sky-200 dark:bg-sky-900";

const dayName = (date: string, i: number) =>
  i === 0 ? "আজ" : i === 1 ? "আগামীকাল" : new Date(`${date}T00:00:00+06:00`).toLocaleDateString("bn-BD", { weekday: "long", timeZone: "Asia/Dhaka" });

function WeatherPage() {
  const q = useKilnForecast();
  const f = q.data;
  const signals = f ? kilnSignals(f) : [];
  const next24 = f ? upcomingHours(f, 24) : [];
  const today = f?.days[0];

  return (
    <div className="mx-auto max-w-3xl space-y-4 pb-28 md:pb-6">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-display text-[26px] font-extrabold leading-tight">
            <CloudSun className="h-6 w-6 text-primary" /> আবহাওয়া ও সতর্কতা
          </h1>
          <p className="text-sm text-muted-foreground">কাপাসিয়া, গাজীপুর · ভাটার কাজের হিসাবে</p>
        </div>
        <Button variant="outline" size="icon" className="h-10 w-10 shrink-0 rounded-xl" aria-label="আবার আনুন" onClick={() => q.refetch()} disabled={q.isFetching}>
          <RefreshCw className={`h-5 w-5 ${q.isFetching ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {q.isLoading ? (
        <div className="space-y-3"><Skeleton className="h-36 rounded-[20px]" /><Skeleton className="h-24 rounded-2xl" /></div>
      ) : q.isError || !f ? (
        <div className="rounded-2xl border p-6 text-center text-sm text-muted-foreground">আবহাওয়ার তথ্য আনা যায়নি। ইন্টারনেট দেখে আবার চেষ্টা করুন।</div>
      ) : (
        <>
          {/* Now */}
          <section className="bg-brick-pattern relative overflow-hidden rounded-[20px] bg-ink p-[18px] text-ink-foreground">
            <div className="text-xs font-bold tracking-[0.12em] text-stone-300">এখন</div>
            <div className="mt-1 flex items-end justify-between gap-3">
              <div>
                <div className="font-display num text-[44px] font-extrabold leading-none">{bn(f.current.temp)}°</div>
                <div className="mt-1 text-sm text-stone-300">অনুভূত {bn(f.current.feels)}° · {kilnWeatherText(f.current.code)}</div>
              </div>
              {today && (
                <div className="text-right text-xs text-stone-300">
                  <div>সর্বোচ্চ {bn(today.max)}° / সর্বনিম্ন {bn(today.min)}°</div>
                  <div className="mt-1 flex items-center justify-end gap-1"><Sunrise className="h-3.5 w-3.5" />{kilnBnTime(today.sunrise)}</div>
                  <div className="flex items-center justify-end gap-1"><Sunset className="h-3.5 w-3.5" />{kilnBnTime(today.sunset)}</div>
                </div>
              )}
            </div>
            <div className="mt-3.5 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl border border-white/10 bg-white/[0.07] px-2 py-2">
                <div className="flex items-center justify-center gap-1 text-[11px] font-semibold text-stone-300"><Droplets className="h-3.5 w-3.5" />আর্দ্রতা</div>
                <div className="num text-base font-bold">{bn(f.current.humidity)}%</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.07] px-2 py-2">
                <div className="flex items-center justify-center gap-1 text-[11px] font-semibold text-stone-300"><Wind className="h-3.5 w-3.5" />দমকা হাওয়া</div>
                <div className="num text-base font-bold">{bn(f.current.gust)} কিমি</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.07] px-2 py-2">
                <div className="text-[11px] font-semibold text-stone-300">আজ বৃষ্টি</div>
                <div className="num text-base font-bold">{bn(today?.rainProb ?? 0)}%</div>
              </div>
            </div>
          </section>

          {/* Signals */}
          <section className="space-y-2">
            <h2 className="px-1 text-base font-bold">সংকেত</h2>
            {signals.length === 0 ? (
              <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-emerald-900 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-100">
                <CheckCircle2 className="h-6 w-6 shrink-0" />
                <div><div className="font-bold">এখন কোনো সতর্কতা নেই</div><div className="text-sm">মাঠের কাজ স্বাভাবিকভাবে চলতে পারে।</div></div>
              </div>
            ) : signals.map((s) => <SignalCard key={s.key} s={s} />)}
          </section>

          {/* Next 24 hours */}
          <section className="rounded-[20px] border bg-card p-4">
            <h2 className="text-base font-bold">আগামী ২৪ ঘণ্টা — বৃষ্টির সম্ভাবনা</h2>
            <div className="mt-3 overflow-x-auto [scrollbar-width:none]">
              <div className="flex w-max items-end gap-1.5">
                {next24.map((h) => (
                  <div key={h.time} className="flex w-11 flex-col items-center gap-1">
                    <span className="num text-[11px] font-bold">{bn(h.rainProb)}%</span>
                    <div className="flex h-20 w-6 items-end overflow-hidden rounded-md bg-muted">
                      <div className={`w-full rounded-md ${rainTone(h.rainProb)}`} style={{ height: `${Math.max(h.rainProb, 4)}%` }} />
                    </div>
                    <span className="whitespace-pre-line text-center text-[10px] leading-tight text-muted-foreground">{kilnBnTime(h.time).replace(" ", "\n")}</span>
                  </div>
                ))}
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              লাল = {bn(KILN_WEATHER_RULES.rainNowProb)}% বা বেশি, কমলা = {bn(KILN_WEATHER_RULES.rainLaterProb)}% বা বেশি
            </p>
          </section>

          {/* 3 days with drying rating */}
          <section className="rounded-[20px] border bg-card p-4">
            <h2 className="text-base font-bold">৩ দিনের পূর্বাভাস ও শুকানোর দিন</h2>
            <div className="mt-3 divide-y">
              {f.days.slice(0, 3).map((d, i) => {
                const dry = dryingDay(f, d.date);
                return (
                  <div key={d.date} className="flex items-center gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="font-bold">{dayName(d.date, i)} <span className="text-xs font-normal text-muted-foreground">{bnDate(d.date)}</span></div>
                      <div className="text-sm text-muted-foreground">{kilnWeatherText(d.code)}</div>
                      <div className="num text-xs text-muted-foreground">{bn(d.min)}°–{bn(d.max)}° · বৃষ্টি {bn(d.rainProb)}% · রোদ {bn(Math.round(d.sunHours))} ঘণ্টা</div>
                    </div>
                    {dry && (
                      <div className="shrink-0 text-right">
                        <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-bold ${DRY_TONE[dry.tone]}`}>শুকানো: {dry.label}</span>
                        <div className="mt-1 max-w-[9rem] text-[11px] leading-tight text-muted-foreground">{dry.reason}</div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          <p className="px-1 text-xs leading-relaxed text-muted-foreground">
            পূর্বাভাস Open-Meteo থেকে, প্রতি ১৫ মিনিটে নতুন হয়। কালবৈশাখীর মতো হঠাৎ ঝড় অনেক সময় আগে ধরা পড়ে না, তাই আকাশ দেখে সিদ্ধান্ত নেওয়াও জরুরি।
            শেষ হালনাগাদ: {new Date(f.fetchedAt).toLocaleTimeString("bn-BD", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Dhaka" })}
          </p>
        </>
      )}
    </div>
  );
}
