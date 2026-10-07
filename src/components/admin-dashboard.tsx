import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Package,
  CheckCircle2,
  MapPin,
  CalendarDays,
  Building2,
  CloudRain,
  Sun,
  Cloud,
  CloudLightning,
  BellRing,
  Droplets,
} from "lucide-react";
import { DateRangeFilter, type DateRange } from "@/components/date-range-filter";
import { RecentSalesTable } from "@/components/recent-sales-table";
import { Badge } from "@/components/ui/badge";
import { fetchSales } from "@/lib/sales-queries";
import { bn, isoDate } from "@/lib/format";
import { AiAssistantFab } from "@/components/ai-assistant-fab";
import { StockSummaryCard } from "@/components/stock-summary-card";
import { DashboardToday } from "@/components/dashboard-today";
import { BrandLogo } from "@/components/brand-logo";
import { CashBalanceChip } from "@/components/cash-balance-chip";
import { toast } from "sonner";

interface WeatherData {
  temp: number;
  rainProb: number;
  weatherCode: number;
  nextRainHour: string | null;
  isRainingNow: boolean;
}

/**
 * কাপাসিয়া, গাজীপুরের (24.1023° N, 90.5694° E) লাইভ আবহাওয়া ও বৃষ্টির পূর্বাভাস
 */
function LiveWeatherWidget() {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [notifEnabled, setNotifEnabled] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setNotifEnabled(Notification.permission === "granted");
    }

    async function loadWeather() {
      try {
        // কাপাসিয়া, গাজীপুরের জিপিএস কোঅর্ডিনেট
        const url =
          "https://api.open-meteo.com/v1/forecast?latitude=24.1023&longitude=90.5694&current=temperature_2m,precipitation,weather_code&hourly=precipitation_probability,precipitation&timezone=Asia%2FDhaka&forecast_days=1";
        const res = await fetch(url);
        const data = await res.json();

        const currentTemp = Math.round(data?.current?.temperature_2m ?? 30);
        const currentCode = data?.current?.weather_code ?? 0;
        const currentPrecip = data?.current?.precipitation ?? 0;

        const nowHour = new Date().getHours();
        const probs: number[] = data?.hourly?.precipitation_probability ?? [];
        const times: string[] = data?.hourly?.time ?? [];

        // পরবর্তী ১২ ঘণ্টার মধ্যে সর্বোচ্চ বৃষ্টির সম্ভাবনা ও সময় বের করা
        let maxProb = probs[nowHour] ?? 0;
        let rainTimeStr: string | null = null;

        for (let i = nowHour; i < Math.min(nowHour + 12, probs.length); i++) {
          if (probs[i] > maxProb) maxProb = probs[i];
          if (!rainTimeStr && probs[i] >= 50) {
            const dt = new Date(times[i]);
            rainTimeStr = dt.toLocaleTimeString("bn-BD", {
              hour: "numeric",
              minute: "2-digit",
            });
          }
        }

        const isRaining = currentPrecip > 0 || currentCode >= 51;

        const wInfo: WeatherData = {
          temp: currentTemp,
          rainProb: maxProb,
          weatherCode: currentCode,
          nextRainHour: rainTimeStr,
          isRainingNow: isRaining,
        };
        setWeather(wInfo);

        // যদি বৃষ্টির সম্ভাবনা ৫০% বা তার বেশি হয়, তবে মোবাইলে সতর্কবার্তা পাঠানো
        const alertKey = `cdb-rain-alert-${new Date().toDateString()}-${nowHour}`;
        if ((isRaining || maxProb >= 50) && !sessionStorage.getItem(alertKey)) {
          sessionStorage.setItem(alertKey, "1");
          const msg = isRaining
            ? `⚠️ কাপাসিয়ায় এখন বৃষ্টি হচ্ছে! কাঁচা ইট দ্রুত পলিথিন দিয়ে ঢেকে দিন।`
            : `🌧️ সতর্কতা: আজ ${rainTimeStr || "শীঘ্রই"} বৃষ্টির সম্ভাবনা ${bn(maxProb)}%! কাঁচা ইট নিরাপদে রাখুন।`;

          toast.warning(msg, { duration: 10000 });

          if ("Notification" in window && Notification.permission === "granted") {
            new Notification("CDB Bricks — বৃষ্টির সতর্কবার্তা 🌧️", {
              body: msg,
              icon: "/cdb-logo.png",
            });
          }
        }
      } catch (e) {
        console.warn("Weather load error:", e);
      }
    }

    loadWeather();
    const timer = setInterval(loadWeather, 15 * 60 * 1000); // প্রতি ১৫ মিনিটে লাইভ আপডেট
    return () => clearInterval(timer);
  }, []);

  const enableNotifications = async () => {
    if (!("Notification" in window)) {
      toast.info("আপনার ব্রাউজারে পপ-আপ অ্যালার্ট চালু আছে!");
      return;
    }
    const perm = await Notification.requestPermission();
    if (perm === "granted") {
      setNotifEnabled(true);
      toast.success("বৃষ্টির লাইভ নোটিফিকেশন চালু হয়েছে!");
      new Notification("CDB Bricks আবহাওয়া সতর্কতা চালু হয়েছে ✅", {
        body: "বৃষ্টির সম্ভাবনা দেখা দিলেই আপনার মোবাইলে অ্যালার্ট চলে আসবে।",
      });
    } else {
      toast.info("অ্যাপের ভেতর অটোমেটিক বৃষ্টির সতর্কবার্তা চালু আছে!");
    }
  };

  if (!weather) {
    return (
      <div className="rounded-xl bg-white/5 border border-white/10 px-2.5 py-1.5 text-[11px] text-slate-300 animate-pulse">
        আবহাওয়া লোড হচ্ছে...
      </div>
    );
  }

  const isDanger = weather.isRainingNow || weather.rainProb >= 50;

  return (
    <button
      type="button"
      onClick={enableNotifications}
      title="বৃষ্টির নোটিফিকেশন চালু করতে ট্যাপ করুন"
      className={`flex flex-col items-end justify-center rounded-xl border px-2.5 py-1.5 text-right transition-all active:scale-95 ${
        isDanger
          ? "bg-rose-950/80 border-rose-500/60 text-rose-100 shadow-md shadow-rose-950/50 animate-pulse"
          : "bg-slate-950/70 border-amber-500/30 text-slate-100 hover:border-amber-400"
      }`}
    >
      {/* তাপমাত্রা ও আইকন */}
      <div className="flex items-center gap-1.5">
        {weather.isRainingNow ? (
          <CloudLightning className="h-4 w-4 text-rose-400 shrink-0" />
        ) : weather.rainProb >= 40 ? (
          <CloudRain className="h-4 w-4 text-sky-400 shrink-0" />
        ) : weather.weatherCode >= 2 ? (
          <Cloud className="h-4 w-4 text-slate-300 shrink-0" />
        ) : (
          <Sun className="h-4 w-4 text-amber-400 shrink-0" />
        )}
        <span className="text-sm font-black tracking-tight text-white">
          {bn(weather.temp)}°C
        </span>
        {!notifEnabled && (
          <BellRing className="h-3 w-3 text-amber-400 ml-0.5" />
        )}
      </div>

      {/* বৃষ্টির সম্ভাবনা */}
      <div className="flex items-center gap-1 text-[10px] font-bold mt-0.5">
        <Droplets className="h-2.5 w-2.5 text-sky-400 shrink-0" />
        <span className={isDanger ? "text-rose-300" : "text-sky-300"}>
          বৃষ্টি: {bn(weather.rainProb)}%
        </span>
      </div>

      {/* কখন বৃষ্টি হতে পারে */}
      <div className="text-[9.5px] font-medium text-amber-200/90 leading-tight mt-0.5">
        {weather.isRainingNow
          ? "⚠️ এখন বৃষ্টি হচ্ছে!"
          : weather.nextRainHour
          ? `🌧️ সম্ভাব্য: ${weather.nextRainHour}`
          : "☀️ ভাটার আবহাওয়া অনুকূল"}
      </div>
    </button>
  );
}

export function AdminDashboard({ navGrid }: { navGrid?: React.ReactNode }) {
  const today = useMemo(() => new Date(), []);
  const [range, setRange] = useState<DateRange>({ from: today, to: today });
  const from = isoDate(range.from);
  const to = isoDate(range.to);

  const salesQ = useQuery({
    queryKey: ["sales", "admin", from, to],
    queryFn: () => fetchSales({ from, to }),
  });

  const sales = salesQ.data ?? [];

  return (
    <div className="space-y-5">
      {/* ইন্ডাস্ট্রিয়াল কমার্শিয়াল এক্সিকিউটিভ ব্যানার */}
      <div className="relative overflow-hidden rounded-2xl border-2 border-slate-800/80 bg-gradient-to-br from-slate-950 via-[#261008] to-slate-950 p-3.5 sm:p-4 text-white shadow-xl">
        <div className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-orange-500/15 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-10 -left-10 h-36 w-36 rounded-full bg-amber-500/10 blur-2xl" />

        <div className="relative space-y-3">
          {/* উপরের সারি: বামে লোগো ও নাম, ডানে লাইভ আবহাওয়া ও বৃষ্টির অ্যালার্ট */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-3 min-w-0">
              <BrandLogo size="lg" className="shrink-0 ring-2 ring-orange-500/50 rounded-xl" />
              <div className="min-w-0">
                <span className="inline-flex items-center gap-1 rounded bg-amber-500/20 border border-amber-400/30 px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wider text-amber-300">
                  <Building2 className="h-2.5 w-2.5" /> Industrial ERP
                </span>
                <h1 className="mt-0.5 whitespace-nowrap bg-gradient-to-r from-white via-amber-200 to-orange-400 bg-clip-text text-xl sm:text-3xl font-black tracking-tight text-transparent">
                  সি ডি বি ব্রিকস
                </h1>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-300">
                  <span className="inline-flex items-center gap-1 font-semibold text-amber-200/90">
                    <MapPin className="h-3 w-3 text-orange-400" /> কাপাসিয়া, গাজীপুর
                  </span>
                  <span className="inline-flex items-center gap-1 text-[10.5px] text-slate-300">
                    <CalendarDays className="h-3 w-3 text-amber-400" />
                    {today.toLocaleDateString("bn-BD", { day: "2-digit", month: "long", year: "numeric" })}
                  </span>
                </div>
              </div>
            </div>

            {/* ডান পাশের উপরের খালি জায়গায় লাইভ আবহাওয়া বক্স */}
            <div className="shrink-0">
              <LiveWeatherWidget />
            </div>
          </div>

          {/* নিচের সারি: পুরো চওড়া হাতে নগদ ব্যালেন্স */}
          <div className="w-full pt-2 border-t border-white/10 flex justify-end [&>*]:w-full [&>*]:justify-between">
            <CashBalanceChip />
          </div>
        </div>
      </div>

      {/* মোবাইল ইন্ডাস্ট্রিয়াল নেভিগেশন গ্রিড */}
      {navGrid}

      {/* আজকের সারসংক্ষেপ */}
      <DashboardToday />

      {/* ইটের স্টক সামারি */}
      <StockSummaryCard />

      {/* নির্বাচিত পরিসরের বিক্রয় তালিকা */}
      <section className="space-y-3 rounded-2xl border-2 border-slate-200 dark:border-slate-800 bg-card p-3.5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2.5">
          <div className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-orange-600 text-white">
              <Package className="h-4 w-4" />
            </span>
            <h2 className="text-sm font-extrabold uppercase tracking-wide text-foreground">
              নির্বাচিত পরিসরের বিক্রয়
            </h2>
            <Badge className="gap-1 bg-emerald-600 text-white hover:bg-emerald-700">
              <CheckCircle2 className="h-3 w-3" />
              {bn(sales.length)} চালান
            </Badge>
          </div>
          <DateRangeFilter value={range} onChange={setRange} />
        </div>
        <RecentSalesTable entries={sales} loading={salesQ.isLoading} isAdmin />
      </section>

      <AiAssistantFab />
    </div>
  );
}