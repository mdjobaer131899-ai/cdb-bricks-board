import { useEffect, useMemo } from "react";
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { WeatherSignalBanner } from "@/components/weather-signals";
import { Banknote, ChevronRight, Cloud, CloudLightning, CloudRain, FilePlus2, Layers, Receipt, Sun } from "lucide-react";
import { toast } from "sonner";
import { BrandLogo } from "@/components/brand-logo";
import { Skeleton } from "@/components/ui/skeleton";
import { bn, isoDate } from "@/lib/format";
import { fetchCashHistory } from "@/lib/cash-queries";
import {
  getKilnSnapshot,
  getKilnWeather,
  kilnBnTime,
  type KilnSnapshot,
  type WeatherInfo,
} from "@/services/gemini";

/* =========================================================
   অ্যাডমিন ড্যাশবোর্ড
   সব সংখ্যা আসে একই খাতা থেকে (services/gemini.ts → getKilnSnapshot),
   তাই AI সহকারী আর এই পাতা সবসময় একই হিসাব দেখায়।
   ========================================================= */

const tk = (n: number) => `৳${bn(Math.round(n))}`;
const sum = <T,>(rows: T[], pick: (r: T) => number) => rows.reduce((a, r) => a + (Number(pick(r)) || 0), 0);
const LOW_STOCK = 10000;

function SectionCard({ title, action, children, className = "" }: { title: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border bg-card p-4 ${className}`}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="section-label">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function MoreLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to as never} className="inline-flex items-center gap-0.5 text-sm font-bold text-primary hover:underline">
      {children}
      <ChevronRight className="h-4 w-4" />
    </Link>
  );
}

/* ---------- হাতে নগদ (গাঢ় কার্ড) ---------- */
function CashHero({ s, weather }: { s: KilnSnapshot; weather: WeatherInfo | null }) {
  const today = s.today;
  const weekAgo = isoDate(new Date(Date.now() - 6 * 86400000));
  const histQ = useQuery({
    queryKey: ["dash-cash-history", weekAgo, today],
    queryFn: () => fetchCashHistory({ from: weekAgo, to: today }),
  });

  const net = s.cashSeason?.net ?? 0;
  const todayIn = s.cashToday?.income ?? 0;
  const todayOut = s.cashToday?.expense ?? 0;

  // গত ৭ দিনের দিনশেষের ক্যাশ: আজকের ক্যাশ থেকে পেছনে হিসাব
  const points = useMemo(() => {
    const rows = histQ.data ?? [];
    const days: string[] = [];
    for (let i = 6; i >= 0; i--) days.push(isoDate(new Date(Date.now() - i * 86400000)));
    const dayNet = new Map<string, number>();
    for (const r of rows) dayNet.set(r.date, (dayNet.get(r.date) ?? 0) + (r.dir === "in" ? r.amount : -r.amount));
    const closing: number[] = new Array(7).fill(0);
    let running = net;
    for (let i = 6; i >= 0; i--) {
      closing[i] = running;
      running -= dayNet.get(days[i]) ?? 0;
    }
    return closing;
  }, [histQ.data, net]);

  const spark = useMemo(() => {
    const min = Math.min(...points);
    const max = Math.max(...points);
    const span = max - min || 1;
    return points.map((v, i) => `${2 + i * 15.3},${36 - ((v - min) / span) * 30}`).join(" ");
  }, [points]);
  const last = spark.split(" ").pop()?.split(",") ?? ["94", "6"];
  const rising = points[6] >= points[0];

  const WeatherIcon = !weather
    ? Sun
    : weather.precipNow > 0 || weather.code >= 95
      ? CloudLightning
      : weather.todayRainProb >= 40
        ? CloudRain
        : weather.code >= 2
          ? Cloud
          : Sun;

  return (
    <section className="bg-brick-pattern relative overflow-hidden rounded-[20px] bg-ink p-[18px] text-ink-foreground">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold tracking-[0.12em] text-stone-300">হাতে নগদ · মূল ক্যাশ</span>
        <Link to={"/weather" as never} className="flex items-center gap-1.5 rounded-full bg-amber-200/10 px-2.5 py-0.5 text-xs font-semibold text-amber-200">
          <WeatherIcon className="h-3.5 w-3.5" aria-hidden="true" />
          {weather ? `${bn(weather.temp)}° · বৃষ্টি ${bn(weather.todayRainProb)}%` : "আবহাওয়া…"}
        </Link>
      </div>

      <div className="mt-3 flex items-end justify-between gap-3">
        <Link to="/cash-book" className="font-display num text-[42px] font-extrabold leading-[0.95] tracking-tight text-ink-foreground">
          {tk(net)}
        </Link>
        <svg width="96" height="40" viewBox="0 0 96 40" role="img" aria-label={rising ? "গত ৭ দিনে ক্যাশ বেড়েছে" : "গত ৭ দিনে ক্যাশ কমেছে"} className="shrink-0">
          <polyline points={spark} fill="none" stroke={rising ? "#FB923C" : "#FCA5A5"} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx={last[0]} cy={last[1]} r="3.5" fill={rising ? "#FB923C" : "#FCA5A5"} />
        </svg>
      </div>

      <div className="mt-3.5 grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-white/10 bg-white/[0.07] px-3 py-2">
          <div className="text-xs font-semibold text-emerald-200">আজ এসেছে</div>
          <div className="num text-lg font-bold text-emerald-300">+{tk(todayIn)}</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.07] px-3 py-2">
          <div className="text-xs font-semibold text-red-200">আজ গেছে</div>
          <div className="num text-lg font-bold text-red-300">−{tk(todayOut)}</div>
        </div>
      </div>
      {net < 0 && (
        <p className="mt-2 text-xs font-semibold text-red-200">ক্যাশ ঋণাত্মক দেখাচ্ছে, ক্যাশ বইয়ের এন্ট্রি একবার মিলিয়ে নিন।</p>
      )}
    </section>
  );
}

/* ---------- দ্রুত কাজের বাটন ---------- */
function QuickActions() {
  const items = [
    { to: "/entries/new", label: "নতুন চালান", icon: FilePlus2, primary: true, chip: "bg-white/15", color: "text-white" },
    { to: "/collections", label: "জমা নিন", icon: Banknote, chip: "bg-emerald-50 dark:bg-emerald-950/50", color: "text-emerald-700 dark:text-emerald-300" },
    { to: "/cash-book", label: "ক্যাশ বই", icon: Receipt, chip: "bg-red-50 dark:bg-red-950/50", color: "text-red-700 dark:text-red-300" },
    { to: "/production-steps/kacha", label: "কাঁচা ইট", icon: Layers, chip: "bg-stone-100 dark:bg-stone-800", color: "text-stone-700 dark:text-stone-200" },
  ];
  return (
    <section className="grid grid-cols-4 gap-2">
      {items.map((it) => (
        <Link
          key={it.to}
          to={it.to as never}
          className={`flex min-h-[84px] flex-col items-center justify-center gap-1.5 rounded-2xl px-1 py-2.5 text-center transition active:scale-95 ${
            it.primary ? "bg-primary text-primary-foreground" : "border bg-card text-foreground"
          }`}
        >
          <span className={`grid h-9 w-9 place-items-center rounded-[11px] ${it.chip}`}>
            <it.icon className={`h-5 w-5 ${it.color}`} aria-hidden="true" />
          </span>
          <span className="text-[13px] font-bold leading-tight">{it.label}</span>
        </Link>
      ))}
    </section>
  );
}

/* ---------- আজকের হিসাব ---------- */
function TodayStrip({ s }: { s: KilnSnapshot }) {
  const t = s.today;
  const sales = s.sales.filter((r) => r.sale_date === t && r.status !== "rejected");
  const pendingAll = s.sales.filter((r) => r.status === "pending").length;
  const exp = s.expenses.filter((r) => r.expense_date === t);
  const customers = new Set(sales.map((r) => r.customer_id)).size;
  const cats = new Set(exp.map((r) => r.category || "অন্যান্য")).size;

  return (
    <SectionCard
      title="আজকের হিসাব"
      action={
        pendingAll > 0 ? (
          <Link to="/approvals" className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-800 dark:bg-amber-900/50 dark:text-amber-200">
            {bn(pendingAll)}টি অনুমোদন বাকি
          </Link>
        ) : undefined
      }
    >
      <div className="grid grid-cols-3">
        <div className="flex flex-col gap-0.5 border-r pr-2.5">
          <span className="text-[13px] text-muted-foreground">বিক্রি</span>
          <span className="font-display num text-[22px] font-bold leading-tight">{tk(sum(sales, (r) => r.total_amount))}</span>
          <span className="text-xs text-muted-foreground">{bn(sum(sales, (r) => r.quantity))} পিস</span>
        </div>
        <div className="flex flex-col gap-0.5 border-r px-2.5">
          <span className="text-[13px] text-muted-foreground">চালান</span>
          <span className="font-display num text-[22px] font-bold leading-tight">{bn(sales.length)}টি</span>
          <span className="text-xs text-muted-foreground">{bn(customers)} জন গ্রাহক</span>
        </div>
        <div className="flex flex-col gap-0.5 pl-2.5">
          <span className="text-[13px] text-muted-foreground">খরচ</span>
          <span className="font-display num text-[22px] font-bold leading-tight text-destructive">{tk(sum(exp, (r) => r.amount))}</span>
          <span className="text-xs text-muted-foreground">{bn(cats)}টি খাতে</span>
        </div>
      </div>
    </SectionCard>
  );
}

/* ---------- উৎপাদন লাইন ---------- */
function ProductionLine({ s }: { s: KilnSnapshot }) {
  const rows = s.kacha.filter((r) => r.entry_date === s.today);
  const q = (type: string) => sum(rows.filter((r) => r.entry_type === type), (r) => r.quantity);
  const steps = [
    { n: "১", label: "কাঁচা ইট", value: q("production"), ring: "border-stone-400 bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-200", to: "/production-steps/kacha" },
    { n: "২", label: "ভাটায় ঢোকানো", value: q("load"), ring: "border-orange-600 bg-orange-50 text-orange-800 dark:bg-orange-950/50 dark:text-orange-300", to: "/production-steps/load" },
    { n: "৩", label: "পাকা বের", value: q("unload"), ring: "border-primary bg-primary text-primary-foreground", to: "/production-steps/unload" },
  ];
  return (
    <SectionCard title="উৎপাদন লাইন · আজ" action={<MoreLink to="/production-steps/kacha">বিস্তারিত</MoreLink>}>
      <div className="flex items-start">
        {steps.map((st, i) => (
          <div key={st.n} className="contents">
            {i > 0 && <div className="mt-5 h-0.5 w-5 shrink-0 bg-border" aria-hidden="true" />}
            <Link to={st.to as never} className="flex flex-1 flex-col items-center gap-1.5 text-center">
              <span className={`grid h-10 w-10 place-items-center rounded-full border-2 text-[13px] font-bold ${st.ring}`}>{st.n}</span>
              <span className="font-display num text-lg font-bold leading-none">{bn(st.value)}</span>
              <span className="text-xs font-semibold text-muted-foreground">{st.label}</span>
            </Link>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

/* ---------- পাওনা-দেনা ---------- */
function MoneyTiles({ s }: { s: KilnSnapshot }) {
  const dues = s.customers.filter((c) => c.balance > 0.5);
  const adv = s.customers.filter((c) => c.balance < -0.5);
  const sardarOwed = s.sardars.filter((x) => x.due > 0.5);
  const supplierOwed = s.suppliers.filter((x) => x.due > 0.5);
  const tiles = [
    { label: "গ্রাহকের বাকি", dot: "bg-amber-600", color: "text-amber-700 dark:text-amber-400", value: sum(dues, (c) => c.balance), sub: `${bn(dues.length)} জন · আমরা পাবো`, to: "/collections" },
    { label: "গ্রাহকের অগ্রিম", dot: "bg-blue-600", color: "text-blue-700 dark:text-blue-300", value: sum(adv, (c) => -c.balance), sub: `${bn(adv.length)} জন · ইট দেওয়া বাকি`, to: "/advance-sales" },
    { label: "সর্দার পাবে", dot: "bg-red-600", color: "text-destructive", value: sum(sardarOwed, (x) => x.due), sub: `${bn(sardarOwed.length)} জন সর্দার`, to: "/sardars" },
    { label: "সাপ্লায়ার পাবে", dot: "bg-red-600", color: "text-destructive", value: sum(supplierOwed, (x) => x.due), sub: `${bn(supplierOwed.length)} জন সাপ্লায়ার`, to: "/purchases" },
  ];
  return (
    <section className="grid grid-cols-2 gap-2.5">
      {tiles.map((t) => (
        <Link key={t.label} to={t.to as never} className="flex flex-col gap-1 rounded-2xl border bg-card p-3.5 transition active:scale-[0.98]">
          <span className="flex items-center gap-1.5 text-[13px] font-semibold text-muted-foreground">
            <span className={`h-2 w-2 rounded-full ${t.dot}`} aria-hidden="true" />
            {t.label}
          </span>
          <span className={`font-display num text-2xl font-extrabold leading-tight ${t.color}`}>{tk(t.value)}</span>
          <span className="text-xs text-muted-foreground">{t.sub}</span>
        </Link>
      ))}
    </section>
  );
}

/* ---------- পাকা ইটের স্টক ---------- */
const STOCK_COLORS = ["bg-primary", "bg-amber-500", "bg-stone-400", "bg-teal-600", "bg-sky-600", "bg-rose-400"];

function StockCard({ s }: { s: KilnSnapshot }) {
  const items = s.stock.filter((x) => x.qty > 0).sort((a, b) => b.qty - a.qty);
  const total = sum(items, (x) => x.qty);
  return (
    <SectionCard title="পাকা ইটের স্টক" action={<span className="font-display num text-lg font-bold">{bn(total)} পিস</span>}>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">স্টকে এখন কোনো পাকা ইট নেই।</p>
      ) : (
        <>
          <div className="flex h-3.5 gap-[3px] overflow-hidden rounded-full" aria-hidden="true">
            {items.map((x, i) => (
              <div key={x.name} className={STOCK_COLORS[i % STOCK_COLORS.length]} style={{ width: `${(x.qty / total) * 100}%` }} />
            ))}
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {items.map((x, i) => (
              <div key={x.name} className="flex flex-col">
                <span className="flex items-center gap-1.5 text-[13px] font-semibold">
                  <span className={`h-2.5 w-2.5 rounded-[3px] ${STOCK_COLORS[i % STOCK_COLORS.length]}`} aria-hidden="true" />
                  {x.name}
                </span>
                <span className={`num text-[15px] font-bold ${x.qty < LOW_STOCK ? "text-destructive" : ""}`}>
                  {bn(x.qty)}
                  {x.qty < LOW_STOCK ? " · কম" : ""}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </SectionCard>
  );
}

/* ---------- সাম্প্রতিক চালান ---------- */
const STATUS: Record<string, { label: string; cls: string }> = {
  approved: { label: "অনুমোদিত", cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200" },
  pending: { label: "অপেক্ষায়", cls: "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200" },
  rejected: { label: "বাতিল", cls: "bg-stone-200 text-stone-700 dark:bg-stone-800 dark:text-stone-300" },
};

function RecentChallans({ s }: { s: KilnSnapshot }) {
  const nameOf = (id: string) => s.customers.find((c) => c.id === id)?.name ?? "অজানা গ্রাহক";
  const brickOf = (id: string) => s.brickTypes.find((b) => b.id === id)?.name ?? "ইট";
  const rows = [...s.sales]
    .sort((a, b) => String(b.sale_date).localeCompare(String(a.sale_date)) || String(b.challan_no).localeCompare(String(a.challan_no)))
    .slice(0, 5);
  return (
    <SectionCard title="সাম্প্রতিক চালান" action={<MoreLink to="/challans">সব দেখুন</MoreLink>} className="pb-1">
      {rows.length === 0 ? (
        <p className="pb-3 text-sm text-muted-foreground">এখনো কোনো চালান নেই।</p>
      ) : (
        <ul className="divide-y">
          {rows.map((r) => {
            const name = nameOf(r.customer_id);
            const st = STATUS[r.status] ?? STATUS.pending;
            return (
              <li key={r.id ?? r.challan_no}>
                <Link to="/challans/$id" params={{ id: String(r.id) }} className="flex items-center gap-3 py-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-muted text-[15px] font-bold text-muted-foreground">
                    {name.trim().charAt(0).toUpperCase()}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[15px] font-bold">{name}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {brickOf(r.brick_type_id)} · {bn(r.quantity)} পিস{r.challan_no ? ` · ${r.challan_no}` : ""}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <span className="num text-[15px] font-bold">{Number(r.total_amount) > 0 ? tk(Number(r.total_amount)) : "—"}</span>
                    <span className={`rounded-full px-2 text-[11px] font-bold ${st.cls}`}>{st.label}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}

/* ---------- মূল পাতা ---------- */
export function AdminDashboard({ navGrid }: { navGrid?: ReactNode }) {
  const snapQ = useQuery({
    queryKey: ["kiln-snapshot"],
    queryFn: () => getKilnSnapshot(true),
    refetchInterval: 60_000,
  });
  const weatherQ = useQuery({
    queryKey: ["kiln-weather"],
    queryFn: () => getKilnWeather(),
    refetchInterval: 15 * 60_000,
  });

  const s = snapQ.data;
  const weather = weatherQ.data ?? null;
  const dateLabel = new Date().toLocaleDateString("bn-BD", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Dhaka" });

  return (
    <div className="mx-auto w-full max-w-5xl space-y-3.5">
      <div className="flex items-center gap-3 px-0.5 pt-1">
        <BrandLogo size="sm" className="shrink-0" />
        <div className="min-w-0">
          <h1 className="font-display text-xl font-extrabold leading-tight">সি ডি বি ব্রিকস</h1>
          <p className="truncate text-xs font-semibold text-muted-foreground">কাপাসিয়া, গাজীপুর · {dateLabel}</p>
        </div>
      </div>

      {!s ? (
        <div className="space-y-3.5">
          <Skeleton className="h-[188px] rounded-[20px]" />
          <div className="grid grid-cols-4 gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-[84px] rounded-2xl" />
            ))}
          </div>
          <Skeleton className="h-28 rounded-2xl" />
          <Skeleton className="h-36 rounded-2xl" />
        </div>
      ) : (
        <div className="grid gap-3.5 lg:grid-cols-2 lg:items-start">
          <div className="space-y-3.5">
            <CashHero s={s} weather={weather} />
            <WeatherSignalBanner />
            <QuickActions />
            <TodayStrip s={s} />
            <ProductionLine s={s} />
          </div>
          <div className="space-y-3.5">
            <MoneyTiles s={s} />
            <StockCard s={s} />
            <RecentChallans s={s} />
          </div>
        </div>
      )}

      {navGrid && (
        <div className="pt-2">
          <h2 className="section-label mb-3 px-1 lg:hidden">সব মেনু</h2>
          {navGrid}
        </div>
      )}

    </div>
  );
}
