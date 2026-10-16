import { useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ChevronRight, CloudLightning, CloudRain, Sun } from "lucide-react";
import { toast } from "sonner";
import { fetchKilnForecast, kilnSignals, type SignalLevel, type WeatherSignal } from "@/lib/kiln-weather";

export function useKilnForecast() {
  return useQuery({
    queryKey: ["kiln-forecast"],
    queryFn: fetchKilnForecast,
    refetchInterval: 15 * 60_000,
    staleTime: 5 * 60_000,
  });
}

export const SIGNAL_STYLE: Record<SignalLevel, { box: string; chip: string; text: string; label: string }> = {
  red: {
    box: "border-red-300 bg-red-50 dark:border-red-800/70 dark:bg-red-950/50",
    chip: "bg-red-600 text-white",
    text: "text-red-900 dark:text-red-100",
    label: "জরুরি",
  },
  orange: {
    box: "border-amber-300 bg-amber-50 dark:border-amber-700/60 dark:bg-amber-950/40",
    chip: "bg-amber-500 text-white",
    text: "text-amber-950 dark:text-amber-100",
    label: "সতর্কতা",
  },
  yellow: {
    box: "border-yellow-200 bg-yellow-50 dark:border-yellow-800/50 dark:bg-yellow-950/30",
    chip: "bg-yellow-400 text-yellow-950",
    text: "text-yellow-950 dark:text-yellow-100",
    label: "আজকের খবর",
  },
};

export function signalIcon(s: WeatherSignal) {
  if (s.key === "storm" || s.key === "gust") return CloudLightning;
  if (s.key.startsWith("rain")) return CloudRain;
  if (s.key === "heat") return Sun;
  return AlertTriangle;
}

export function SignalCard({ s }: { s: WeatherSignal }) {
  const st = SIGNAL_STYLE[s.level];
  const Icon = signalIcon(s);
  return (
    <div className={`flex gap-3 rounded-2xl border p-3 ${st.box}`}>
      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${st.chip}`}>
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <div className={`min-w-0 ${st.text}`}>
        <div className="text-[11px] font-bold tracking-wide opacity-80">{st.label}</div>
        <div className="font-bold leading-snug">{s.title}</div>
        <div className="mt-0.5 text-sm leading-snug">{s.action}</div>
      </div>
    </div>
  );
}

/**
 * Dashboard strip: red and orange kiln signals with what to do. A red signal also
 * pops a toast and vibrates the phone once per hour while the app is open.
 */
export function WeatherSignalBanner() {
  const q = useKilnForecast();
  const signals = q.data ? kilnSignals(q.data) : [];
  const urgent = signals.filter((s) => s.level !== "yellow");
  const red = signals.filter((s) => s.level === "red");

  useEffect(() => {
    if (red.length === 0) return;
    const hourKey = new Date().toISOString().slice(0, 13);
    for (const s of red) {
      const key = `cdb-weather-${s.key}-${hourKey}`;
      try {
        if (sessionStorage.getItem(key)) continue;
        sessionStorage.setItem(key, "1");
      } catch { /* storage unavailable */ }
      toast.error(`${s.title} — ${s.action}`, { duration: 12000 });
      try { navigator.vibrate?.([300, 150, 300]); } catch { /* not supported */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [red.map((s) => s.key + s.title).join("|")]);

  if (!q.data || urgent.length === 0) return null;
  return (
    <section className="space-y-2">
      {urgent.slice(0, 2).map((s) => <SignalCard key={s.key} s={s} />)}
      <Link to={"/weather" as never} className="flex items-center justify-end gap-1 px-1 text-sm font-semibold text-primary">
        {urgent.length > 2 ? `আরো ${urgent.length - 2}টি সতর্কতা ও ` : ""}আবহাওয়ার বিস্তারিত <ChevronRight className="h-4 w-4" />
      </Link>
    </section>
  );
}
