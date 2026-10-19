import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowDownLeft, ArrowUpRight, ChevronRight, FileDown, Loader2, TrendingDown, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { bn, bnDate, todayBD } from "@/lib/format";
import { fetchCashHistory, fetchCashSummary, type CashHistoryRow } from "@/lib/cash-queries";
import { isCost } from "@/lib/money-heads";
import { exportReportPdf } from "@/lib/pdf-export";
import { useSeason } from "@/lib/season-context";
import { useCurrentUser } from "@/lib/use-current-user";
import { getKilnSnapshot, type KilnSnapshot } from "@/services/gemini";

/* =========================================================
   ব্যবসার খাতা — পুরো ব্যবসা একনজরে
   চলতি হিসাব (পাওনা-দেনা, স্টক, হাতে নগদ) আসে একই খাতা থেকে
   (services/gemini.ts → getKilnSnapshot), তাই ড্যাশবোর্ড, AI আর
   এই পাতা সবসময় একই সংখ্যা দেখায়। সময়ভিত্তিক আয়-ব্যয় আসে ক্যাশ বইয়ের
   সূত্র থেকে (lib/cash-queries.ts)।
   ========================================================= */

type Period = "today" | "month" | "season" | "custom";

const PERIODS: { key: Period; label: string }[] = [
  { key: "today", label: "আজ" },
  { key: "month", label: "এই মাস" },
  { key: "season", label: "পুরো মৌসুম" },
  { key: "custom", label: "তারিখ দিন" },
];


const EXPENSE_COLORS = ["#A63A1C", "#D97706", "#0F766E", "#1D4ED8", "#7C3AED", "#78716C"];
const BN_MONTHS_SHORT = ["জানু", "ফেব্রু", "মার্চ", "এপ্রি", "মে", "জুন", "জুলা", "আগ", "সেপ্টে", "অক্টো", "নভে", "ডিসে"];

const tk = (n: number) => `৳${bn(Math.round(n))}`;
const sum = <T,>(rows: T[], pick: (r: T) => number) => rows.reduce((a, r) => a + (Number(pick(r)) || 0), 0);
const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

function addDays(iso: string, n: number) {
  const d = new Date(iso + "T12:00:00+06:00");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/* ---------- ছোট উপকরণ ---------- */

function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2 px-1">
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
      <ChevronRight className="h-4 w-4" aria-hidden="true" />
    </Link>
  );
}

/* ---------- ১. মূল ফলাফল (গাঢ় কার্ড) ---------- */
function ResultHero({
  sales,
  opex,
  collected,
  pendingCount,
  periodLabel,
}: {
  sales: number;
  opex: number;
  collected: number;
  pendingCount: number;
  periodLabel: string;
}) {
  const profit = sales - opex;
  const up = profit >= 0;
  const margin = pct(Math.abs(profit), sales);
  const collectRate = Math.min(100, pct(collected, sales));
  // লাভের হারের বৃত্ত
  const R = 26;
  const C = 2 * Math.PI * R;
  const ring = Math.min(100, margin);

  return (
    <section className="bg-brick-pattern relative overflow-hidden rounded-[22px] bg-ink p-[18px] text-ink-foreground shadow-[0_10px_30px_-12px_rgba(28,25,23,0.55)]">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold tracking-[0.12em] text-stone-300">আনুমানিক লাভ · {periodLabel}</span>
        <span
          className={`flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ${
            up ? "bg-emerald-300/15 text-emerald-200" : "bg-red-300/15 text-red-200"
          }`}
        >
          {up ? <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" /> : <TrendingDown className="h-3.5 w-3.5" aria-hidden="true" />}
          {up ? "লাভে আছে" : "লোকসানে আছে"}
        </span>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <div className={`font-display num text-[40px] font-extrabold leading-[0.95] tracking-tight ${up ? "text-emerald-300" : "text-red-300"}`}>
          {up ? "" : "−"}
          {tk(Math.abs(profit))}
        </div>
        <svg width="68" height="68" viewBox="0 0 68 68" role="img" aria-label={`বিক্রির ${bn(margin)}% ${up ? "লাভ" : "লোকসান"}`} className="shrink-0">
          <circle cx="34" cy="34" r={R} fill="none" stroke="rgba(250,250,249,0.12)" strokeWidth="7" />
          <circle
            cx="34"
            cy="34"
            r={R}
            fill="none"
            stroke={up ? "#6EE7B7" : "#FCA5A5"}
            strokeWidth="7"
            strokeLinecap="round"
            strokeDasharray={`${(ring / 100) * C} ${C}`}
            transform="rotate(-90 34 34)"
          />
          <text x="34" y="38" textAnchor="middle" fontSize="13" fontWeight="700" fill="#FAFAF9">
            {bn(margin)}%
          </text>
        </svg>
      </div>

      <div className="mt-4 divide-y divide-white/10 rounded-2xl border border-white/10 bg-white/[0.06] px-3.5">
        <div className="flex min-h-[42px] items-center justify-between gap-2">
          <span className="text-sm font-semibold text-stone-200">মোট বিক্রি (অনুমোদিত চালান)</span>
          <span className="num text-[17px] font-bold">{tk(sales)}</span>
        </div>
        <div className="flex min-h-[42px] items-center justify-between gap-2">
          <span className="text-sm font-semibold text-stone-200">মোট খরচ</span>
          <span className="num text-[17px] font-bold text-red-300">−{tk(opex)}</span>
        </div>
        <div className="flex min-h-[42px] items-center justify-between gap-2">
          <span className="text-sm font-semibold text-stone-200">গ্রাহক থেকে আদায়</span>
          <span className="num text-[17px] font-bold text-emerald-300">{tk(collected)}</span>
        </div>
      </div>

      {sales > 0 && (
        <div className="mt-3">
          <div className="mb-1 flex justify-between text-xs font-semibold text-stone-300">
            <span>বিক্রির কত টাকা হাতে এসেছে</span>
            <span className="num">{bn(collectRate)}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/10">
            <div className="h-2 rounded-full bg-orange-400" style={{ width: `${collectRate}%` }} />
          </div>
        </div>
      )}

      <p className="mt-3 text-xs leading-relaxed text-stone-400">
        লাভ = বিক্রি − খরচ। মালিকের উত্তোলন, ঋণ ও পূর্বের দেনা পরিশোধ খরচে ধরা হয়নি।
        {pendingCount > 0 && <> অনুমোদন বাকি {bn(pendingCount)}টি চালান বিক্রিতে যোগ হয়নি।</>}
      </p>
    </section>
  );
}

/* ---------- ২. টাকার চলাচল ---------- */
function CashFlow({
  income,
  outgo,
  handCash,
  extras,
}: {
  income: number;
  outgo: number;
  handCash: number;
  extras: { label: string; value: number; dir: "in" | "out" }[];
}) {
  return (
    <Section title="নগদ টাকার চলাচল" action={<MoreLink to="/cash-book">ক্যাশ বই</MoreLink>}>
      <div className="grid grid-cols-3 gap-2">
        <div className="flex flex-col gap-1 rounded-2xl border bg-card p-3">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
            <ArrowDownLeft className="h-[18px] w-[18px]" aria-hidden="true" />
          </span>
          <span className="text-xs font-semibold text-muted-foreground">ঢুকেছে</span>
          <span className="num text-[15px] font-bold text-success">{tk(income)}</span>
        </div>
        <div className="flex flex-col gap-1 rounded-2xl border bg-card p-3">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300">
            <ArrowUpRight className="h-[18px] w-[18px]" aria-hidden="true" />
          </span>
          <span className="text-xs font-semibold text-muted-foreground">বের হয়েছে</span>
          <span className="num text-[15px] font-bold text-destructive">{tk(outgo)}</span>
        </div>
        <Link to="/cash-book" className="flex flex-col gap-1 rounded-2xl border border-transparent bg-ink p-3 text-ink-foreground transition active:scale-[0.98]">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-white/10 text-orange-300">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="2" y="6" width="20" height="12" rx="2" />
              <circle cx="12" cy="12" r="2.5" />
            </svg>
          </span>
          <span className="text-xs font-semibold text-stone-300">হাতে এখন</span>
          <span className={`num text-[15px] font-bold ${handCash < 0 ? "text-red-300" : ""}`}>{tk(handCash)}</span>
        </Link>
      </div>
      {extras.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-0.5">
          {extras.map((x) => (
            <span key={x.label} className="rounded-full border bg-card px-2.5 py-1 text-xs font-semibold text-muted-foreground">
              {x.label}: <span className={`num ${x.dir === "in" ? "text-success" : "text-destructive"}`}>{tk(x.value)}</span>
            </span>
          ))}
        </div>
      )}
    </Section>
  );
}

/* ---------- ৩. পাওনা ও দেনা ---------- */
type MoneyLine = { label: string; value: number; to: string };

function DuesCard({ receive, pay }: { receive: MoneyLine[]; pay: MoneyLine[] }) {
  const rTotal = sum(receive, (x) => x.value);
  const pTotal = sum(pay, (x) => x.value);
  const net = rTotal - pTotal;
  const Col = ({ title, lines, total, tone }: { title: string; lines: MoneyLine[]; total: number; tone: "in" | "out" }) => (
    <div className="flex flex-col gap-1 p-3.5">
      <div className={`mb-1 flex items-center gap-1.5 text-sm font-bold ${tone === "in" ? "text-success" : "text-destructive"}`}>
        {tone === "in" ? <ArrowDownLeft className="h-4 w-4" aria-hidden="true" /> : <ArrowUpRight className="h-4 w-4" aria-hidden="true" />}
        {title}
      </div>
      {lines.map((l) => (
        <Link key={l.label} to={l.to as never} className="-mx-1.5 rounded-lg px-1.5 py-1 transition hover:bg-muted active:bg-muted">
          <div className="text-xs text-muted-foreground">{l.label}</div>
          <div className="num text-[15px] font-bold">{tk(l.value)}</div>
        </Link>
      ))}
      <div className="mt-1 border-t border-dashed pt-2">
        <div className="text-xs font-bold text-muted-foreground">মোট</div>
        <div className={`font-display num text-lg font-extrabold ${tone === "in" ? "text-success" : "text-destructive"}`}>{tk(total)}</div>
      </div>
    </div>
  );

  return (
    <Section title="পাওনা ও দেনা · আজ পর্যন্ত">
      <div className="overflow-hidden rounded-2xl border bg-card">
        <div className="grid grid-cols-2 divide-x">
          <Col title="আমরা পাব" lines={receive} total={rTotal} tone="in" />
          <Col title="আমরা দেব" lines={pay} total={pTotal} tone="out" />
        </div>
        <div
          className={`flex items-center justify-between gap-3 border-t px-4 py-3 ${
            net >= 0 ? "bg-emerald-50 dark:bg-emerald-950/30" : "bg-red-50 dark:bg-red-950/30"
          }`}
        >
          <span className={`text-sm font-bold ${net >= 0 ? "text-emerald-900 dark:text-emerald-200" : "text-red-900 dark:text-red-200"}`}>
            সব মিলিয়ে আমরা {net >= 0 ? "পাব" : "দেব"}
          </span>
          <span className={`font-display num text-[22px] font-extrabold ${net >= 0 ? "text-success" : "text-destructive"}`}>{tk(Math.abs(net))}</span>
        </div>
      </div>
    </Section>
  );
}

/* ---------- ৪. ইটের হিসাব ---------- */
function BrickFlow({
  steps,
  damage,
  inKiln,
  stock,
}: {
  steps: { label: string; value: number; to: string }[];
  damage: number;
  inKiln: number | null;
  stock: number;
}) {
  const max = Math.max(1, ...steps.map((s) => s.value));
  return (
    <Section title="ইটের হিসাব (পিস)" action={<MoreLink to="/production-steps/kacha">উৎপাদন</MoreLink>}>
      <div className="space-y-3 rounded-2xl border bg-card p-4">
        {steps.map((s, i) => (
          <Link key={s.label} to={s.to as never} className="block">
            <div className="mb-1 flex items-center gap-2.5">
              <span
                className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-[13px] font-extrabold ${
                  i < 2 ? "bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-200" : "bg-accent text-accent-foreground"
                }`}
              >
                {bn(i + 1)}
              </span>
              <span className="flex-1 text-[15px] font-semibold">{s.label}</span>
              <span className="num text-[15px] font-bold">{bn(s.value)}</span>
            </div>
            <div className="ml-[38px] h-2 overflow-hidden rounded-full bg-muted">
              <div className={`h-2 rounded-full ${i < 2 ? "bg-amber-500" : "bg-primary"}`} style={{ width: `${(s.value / max) * 100}%` }} />
            </div>
          </Link>
        ))}

        <div className="flex items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-900 dark:bg-emerald-950/30">
          <span className="text-[15px] font-bold text-emerald-900 dark:text-emerald-200">এখন পাকা ইট স্টকে</span>
          <span className="font-display num text-2xl font-extrabold text-success">{bn(stock)}</span>
        </div>
        {(damage > 0 || (inKiln ?? 0) > 0) && (
          <p className="text-xs text-muted-foreground">
            {damage > 0 && <>নষ্ট/ভাঙা: {bn(damage)} পিস</>}
            {damage > 0 && (inKiln ?? 0) > 0 && " · "}
            {(inKiln ?? 0) > 0 && <>ভাটায় পুড়ছে: {bn(inKiln ?? 0)} পিস</>}
          </p>
        )}
      </div>
    </Section>
  );
}

/* ---------- ৫. খরচের খাত ---------- */
function ExpenseSplit({ groups, total }: { groups: { label: string; value: number }[]; total: number }) {
  return (
    <Section title="খরচ কোথায় গেল" action={<MoreLink to="/income-expense">আয়-ব্যয়</MoreLink>}>
      <div className="rounded-2xl border bg-card p-4">
        {groups.length === 0 ? (
          <p className="text-sm text-muted-foreground">এই সময়ে কোনো খরচ নেই।</p>
        ) : (
          <>
            <div className="flex h-3.5 gap-[3px] overflow-hidden rounded-full" aria-hidden="true">
              {groups.map((g, i) => (
                <div key={g.label} style={{ width: `${(g.value / total) * 100}%`, background: EXPENSE_COLORS[i % EXPENSE_COLORS.length] }} />
              ))}
            </div>
            <ul className="mt-3.5 space-y-2.5">
              {groups.map((g, i) => (
                <li key={g.label} className="flex items-center gap-2.5">
                  <span className="h-3 w-3 shrink-0 rounded-[4px]" style={{ background: EXPENSE_COLORS[i % EXPENSE_COLORS.length] }} aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{g.label}</span>
                  <span className="num text-[15px] font-bold">{tk(g.value)}</span>
                  <span className="num w-11 text-right text-xs font-bold text-muted-foreground">{bn(pct(g.value, total))}%</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </Section>
  );
}

/* ---------- ৬. বিক্রি বনাম খরচ (প্রবণতা) ---------- */
function Trend({ buckets, byMonth }: { buckets: { key: string; label: string; sales: number; cost: number }[]; byMonth: boolean }) {
  const max = Math.max(1, ...buckets.map((b) => Math.max(b.sales, b.cost)));
  const every = Math.ceil(buckets.length / 8);
  return (
    <Section title={byMonth ? "মাসভিত্তিক বিক্রি ও খরচ" : "দিনভিত্তিক বিক্রি ও খরচ"}>
      <div className="rounded-2xl border bg-card p-4">
        <div className="mb-3 flex items-center gap-4 text-xs font-semibold text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-[3px] bg-primary" aria-hidden="true" />
            বিক্রি
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-[3px] bg-stone-400 dark:bg-stone-500" aria-hidden="true" />
            খরচ
          </span>
        </div>
        <div className="flex h-36 items-end gap-1" role="img" aria-label="বিক্রি ও খরচের তুলনা">
          {buckets.map((b) => (
            <div key={b.key} className="flex h-full flex-1 items-end justify-center gap-[2px]" title={`${b.label}: বিক্রি ${tk(b.sales)}, খরচ ${tk(b.cost)}`}>
              <div className="w-1/2 max-w-[14px] rounded-t-[3px] bg-primary" style={{ height: `${(b.sales / max) * 100}%`, minHeight: b.sales > 0 ? 2 : 0 }} />
              <div className="w-1/2 max-w-[14px] rounded-t-[3px] bg-stone-400 dark:bg-stone-500" style={{ height: `${(b.cost / max) * 100}%`, minHeight: b.cost > 0 ? 2 : 0 }} />
            </div>
          ))}
        </div>
        <div className="mt-1.5 flex gap-1 border-t pt-1.5">
          {buckets.map((b, i) => (
            <span key={b.key} className="flex-1 text-center text-[10px] font-semibold text-muted-foreground">
              {i % every === 0 ? b.label : ""}
            </span>
          ))}
        </div>
      </div>
    </Section>
  );
}

/* ---------- ৭. যাদের কাছে বেশি পাওনা ---------- */
function TopDebtors({ s }: { s: KilnSnapshot }) {
  const top = s.customers
    .filter((c) => c.balance > 0.5)
    .sort((a, b) => b.balance - a.balance)
    .slice(0, 5);
  const max = top[0]?.balance ?? 1;
  return (
    <Section title="যাদের কাছে বেশি পাওনা" action={<MoreLink to="/collections">সব গ্রাহক</MoreLink>}>
      <div className="overflow-hidden rounded-2xl border bg-card">
        {top.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">কোনো গ্রাহকের কাছে বাকি নেই।</p>
        ) : (
          top.map((c, i) => (
            <Link
              key={c.id}
              to="/customers/$id"
              params={{ id: c.id }}
              className="flex min-h-[58px] items-center gap-3 border-b px-4 py-2 transition last:border-b-0 hover:bg-muted/60 active:bg-muted"
            >
              <span className="font-display grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent text-sm font-bold text-accent-foreground">
                {c.name.trim().charAt(0) || bn(i + 1)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-semibold">{c.name}</span>
                <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-muted">
                  <span className="block h-1.5 rounded-full bg-amber-500" style={{ width: `${(c.balance / max) * 100}%` }} />
                </span>
              </span>
              <span className="num text-[15px] font-bold text-amber-700 dark:text-amber-400">{tk(c.balance)}</span>
            </Link>
          ))
        )}
      </div>
    </Section>
  );
}

/* =========================================================
   মূল অংশ
   ========================================================= */
export function BusinessBook() {
  const today = todayBD();
  const monthStart = today.slice(0, 8) + "01";
  const season = useSeason();
  const { data: me } = useCurrentUser();

  const [period, setPeriod] = useState<Period>("season");
  const [customFrom, setCustomFrom] = useState(monthStart);
  const [customTo, setCustomTo] = useState(today);
  const [exporting, setExporting] = useState(false);

  const range = useMemo(() => {
    if (period === "today") return { from: today, to: today };
    if (period === "month") return { from: monthStart, to: today };
    if (period === "custom") return customFrom <= customTo ? { from: customFrom, to: customTo } : { from: customTo, to: customFrom };
    return null; // পুরো মৌসুম: নির্বাচিত মৌসুমের সীমা আপনাআপনি প্রযোজ্য
  }, [period, today, monthStart, customFrom, customTo]);

  const periodLabel = period === "season" ? (season.season?.name ?? "পুরো মৌসুম") : PERIODS.find((p) => p.key === period)!.label;
  const rangeText = range
    ? range.from === range.to
      ? bnDate(range.from)
      : `${bnDate(range.from)} — ${bnDate(range.to)}`
    : season.season
      ? `${season.season.name} · ${bnDate(season.season.start_date)} থেকে`
      : "সব সময়ের হিসাব";

  const snapQ = useQuery({
    queryKey: ["kiln-snapshot"],
    queryFn: () => getKilnSnapshot(true),
    refetchInterval: 60_000,
  });

  const cashQ = useQuery({
    queryKey: ["business-book-cash", season.key, range?.from ?? "", range?.to ?? ""],
    queryFn: async () => {
      const filter = range ?? {};
      const [summary, history] = await Promise.all([fetchCashSummary(filter), fetchCashHistory(filter)]);
      return { summary, history };
    },
  });

  const s = snapQ.data;
  const cash = cashQ.data;

  const book = useMemo(() => {
    if (!s || !cash) return null;
    const inRange = (d?: string | null) => (!range ? true : !!d && d >= range.from && d <= range.to);

    // বিক্রি
    const periodSales = s.sales.filter((r) => inRange(r.sale_date));
    const approved = periodSales.filter((r) => r.status === "approved");
    const salesTotal = sum(approved, (r) => r.total_amount);
    const soldQty = sum(approved, (r) => r.quantity);
    const pendingCount = periodSales.filter((r) => r.status === "pending").length;

    // খরচ (ব্যবসার খরচ, টাকার চলাচল বাদে)
    const groupMap = new Map<string, number>();
    const opRows: CashHistoryRow[] = [];
    for (const r of cash.history) {
      // only costs; money moves (assets, withdrawals, loans, old dues) are not (money-heads.ts)
      if (r.dir !== "out" || !isCost(r.key)) continue;
      opRows.push(r);
      const head = r.head || "অন্যান্য";
      groupMap.set(head, (groupMap.get(head) ?? 0) + r.amount);
    }
    const vehicle = cash.summary.breakdown.vehicle ?? 0;
    if (vehicle > 0) groupMap.set("গাড়ি খরচ", (groupMap.get("গাড়ি খরচ") ?? 0) + vehicle);
    const sorted = Array.from(groupMap, ([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
    const groups = sorted.length > 6 ? [...sorted.slice(0, 5), { label: "অন্যান্য খাত", value: sum(sorted.slice(5), (g) => g.value) }] : sorted;
    const opex = sum(sorted, (g) => g.value);

    // টাকার চলাচল
    const b = cash.summary.breakdown;
    const ib = cash.summary.incomeBreakdown;
    const extras = [
      { label: "মালিকের বিনিয়োগ", value: ib.ownerInvest ?? 0, dir: "in" as const },
      { label: "ঋণ নেওয়া", value: ib.loanTaken ?? 0, dir: "in" as const },
      { label: "পুরোনো পাওনা আদায়", value: ib.openingCollected ?? 0, dir: "in" as const },
      { label: "মালিকের উত্তোলন", value: b.ownerWithdraw ?? 0, dir: "out" as const },
      { label: "সম্পদ কেনা", value: b.assets ?? 0, dir: "out" as const },
      { label: "পূর্বের দেনা পরিশোধ", value: b.openingPaid ?? 0, dir: "out" as const },
      { label: "ঋণ দেওয়া/শোধ", value: (b.loanGiven ?? 0) + (b.loanRepaid ?? 0), dir: "out" as const },
    ].filter((x) => x.value > 0);

    // পাওনা-দেনা (আজ পর্যন্ত)
    const openRem = (kind: string) => sum(s.opening.filter((o) => o.kind === kind), (o) => Math.max(0, o.remaining));
    const loanNet = (dir: string) =>
      Math.max(0, sum(s.loans.filter((l) => l.direction === dir), (l) => l.amount) - sum(s.loanPaid.filter((l) => l.direction === dir), (l) => l.amount));

    const receive: MoneyLine[] = [
      { label: "গ্রাহকের বাকি", value: sum(s.customers.filter((c) => c.balance > 0.5), (c) => c.balance), to: "/collections" },
      { label: "গত বছরের পাওনা", value: openRem("customer_receivable"), to: "/opening-balances" },
      { label: "দেওয়া ঋণ", value: loanNet("given"), to: "/loans" },
      { label: "সরদারকে দেওয়া অগ্রিম", value: sum(s.sardars.filter((x) => x.due < -0.5), (x) => -x.due), to: "/sardars" },
    ].filter((x) => x.value > 0.5);

    const pay: MoneyLine[] = [
      { label: "সরদার পাবে", value: sum(s.sardars.filter((x) => x.due > 0.5), (x) => x.due), to: "/sardars" },
      { label: "সরবরাহকারী পাবে", value: sum(s.suppliers.filter((x) => x.due > 0.5), (x) => x.due), to: "/purchases" },
      { label: "গ্রাহকের অগ্রিম (ইট দেওয়া বাকি)", value: sum(s.customers.filter((c) => c.balance < -0.5), (c) => -c.balance), to: "/advance-sales" },
      { label: "গত বছরের অগ্রিম (ইট দেওয়া বাকি)", value: openRem("customer_brick_due"), to: "/opening-balances" },
      { label: "পূর্বের দেনা", value: openRem("sardar_payable") + openRem("other_payable"), to: "/opening-balances" },
      { label: "নেওয়া ঋণ", value: loanNet("taken"), to: "/loans" },
    ].filter((x) => x.value > 0.5);

    // ইট
    const kacha = s.kacha.filter((k) => inRange(k.entry_date));
    const kq = (type: string) => sum(kacha.filter((k) => k.entry_type === type), (k) => k.quantity);
    const load = kq("load");
    const unload = kq("unload");
    const steps = [
      { label: "কাঁচা ইট তৈরি", value: kq("production"), to: "/production-steps/kacha" },
      { label: "ভাটায় লোড", value: load, to: "/production-steps/load" },
      { label: "পোড়া ইট আনলোড", value: unload, to: "/production-steps/unload" },
      { label: "বিক্রি (চালান)", value: soldQty, to: "/challans" },
    ];
    const stock = sum(s.stock, (x) => Math.max(0, x.qty));

    // প্রবণতা
    const dayMap = new Map<string, { sales: number; cost: number }>();
    const bump = (d: string, k: "sales" | "cost", v: number) => {
      const cur = dayMap.get(d) ?? { sales: 0, cost: 0 };
      cur[k] += v;
      dayMap.set(d, cur);
    };
    for (const r of approved) if (r.sale_date) bump(String(r.sale_date), "sales", Number(r.total_amount) || 0);
    for (const r of opRows) if (r.date) bump(r.date, "cost", r.amount);
    let buckets: { key: string; label: string; sales: number; cost: number }[] = [];
    let byMonth = false;
    const days = Array.from(dayMap.keys()).filter((d) => d <= today).sort();
    if (days.length > 0 && period !== "today") {
      const first = range ? range.from : days[0];
      const last = range ? (range.to > today ? today : range.to) : today;
      const spanDays = Math.round((new Date(last).getTime() - new Date(first).getTime()) / 86400000);
      byMonth = spanDays > 45;
      if (byMonth) {
        const monthMap = new Map<string, { sales: number; cost: number }>();
        for (const [d, v] of dayMap) {
          const m = d.slice(0, 7);
          const cur = monthMap.get(m) ?? { sales: 0, cost: 0 };
          cur.sales += v.sales;
          cur.cost += v.cost;
          monthMap.set(m, cur);
        }
        let m = first.slice(0, 7);
        const endM = last.slice(0, 7);
        while (m <= endM && buckets.length < 24) {
          const v = monthMap.get(m) ?? { sales: 0, cost: 0 };
          buckets.push({ key: m, label: BN_MONTHS_SHORT[Number(m.slice(5, 7)) - 1], ...v });
          const [y, mo] = m.split("-").map(Number);
          m = mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, "0")}`;
        }
        buckets = buckets.slice(-12);
      } else {
        let d = spanDays > 30 ? addDays(last, -30) : first;
        while (d <= last) {
          const v = dayMap.get(d) ?? { sales: 0, cost: 0 };
          buckets.push({ key: d, label: bn(Number(d.slice(8, 10))), ...v });
          d = addDays(d, 1);
        }
      }
    }

    return {
      salesTotal,
      soldQty,
      pendingCount,
      opex,
      groups,
      collected: ib.sales ?? 0,
      income: cash.summary.income,
      outgo: cash.summary.expense,
      handCash: s.cashSeason?.net ?? 0,
      extras,
      receive,
      pay,
      steps,
      damage: kq("damage"),
      inKiln: period === "season" ? Math.max(0, load - unload) : null,
      stock,
      buckets,
      byMonth,
    };
  }, [s, cash, range, period, today]);

  async function onExportPdf() {
    if (!book) return;
    setExporting(true);
    try {
      const rows: Record<string, string>[] = [];
      const head = (t: string) => rows.push({ item: `■ ${t}`, value: "" });
      const line = (t: string, v: string) => rows.push({ item: t, value: v });

      head("মূল ফলাফল");
      line("মোট বিক্রি (অনুমোদিত চালান)", tk(book.salesTotal));
      line("মোট খরচ", tk(book.opex));
      line(book.salesTotal - book.opex >= 0 ? "আনুমানিক লাভ" : "আনুমানিক লোকসান", tk(Math.abs(book.salesTotal - book.opex)));
      line("গ্রাহক থেকে আদায়", tk(book.collected));

      head("নগদ টাকার চলাচল");
      line("ঢুকেছে", tk(book.income));
      line("বের হয়েছে", tk(book.outgo));
      line("হাতে এখন", tk(book.handCash));
      for (const x of book.extras) line(`  ${x.label}`, tk(x.value));

      head("আমরা পাব (আজ পর্যন্ত)");
      for (const x of book.receive) line(x.label, tk(x.value));
      line("মোট পাব", tk(sum(book.receive, (x) => x.value)));
      head("আমরা দেব (আজ পর্যন্ত)");
      for (const x of book.pay) line(x.label, tk(x.value));
      line("মোট দেব", tk(sum(book.pay, (x) => x.value)));

      head("ইটের হিসাব (পিস)");
      for (const x of book.steps) line(x.label, bn(x.value));
      if (book.damage > 0) line("নষ্ট/ভাঙা", bn(book.damage));
      line("এখন পাকা ইট স্টকে", bn(book.stock));

      head("খরচের খাত");
      for (const g of book.groups) line(g.label, `${tk(g.value)} (${bn(pct(g.value, book.opex))}%)`);

      await exportReportPdf({
        filename: `business-book-${range ? `${range.from}_${range.to}` : "season"}.pdf`,
        reportTitle: "ব্যবসার খাতা — পুরো হিসাব",
        subtitle: rangeText,
        adminName: me?.fullName ?? "Admin",
        columns: [
          { header: "বিষয়", dataKey: "item" },
          { header: "পরিমাণ", dataKey: "value", align: "right" },
        ],
        rows,
      });
      toast.success("PDF তৈরি হয়েছে");
    } catch (e) {
      toast.error("PDF তৈরি ব্যর্থ: " + (e as Error).message);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* শিরোনাম */}
      <div className="flex items-start justify-between gap-3 px-0.5 pt-1">
        <div className="min-w-0">
          <h1 className="font-display text-[26px] font-extrabold leading-tight">ব্যবসার খাতা</h1>
          <p className="text-sm font-semibold text-muted-foreground">পুরো হিসাব একনজরে</p>
        </div>
        <button
          type="button"
          onClick={onExportPdf}
          disabled={!book || exporting}
          className="flex h-11 shrink-0 items-center gap-1.5 rounded-xl bg-primary px-3.5 text-sm font-bold text-primary-foreground shadow-sm transition active:scale-95 disabled:opacity-60"
        >
          {exporting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <FileDown className="h-4 w-4" aria-hidden="true" />}
          পুরো খাতা PDF
        </button>
      </div>

      {/* সময় বাছাই */}
      <div className="space-y-2">
        <div className="grid grid-cols-4 gap-1 rounded-2xl bg-stone-200/70 p-1 dark:bg-stone-800" role="group" aria-label="সময় বাছাই">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              type="button"
              aria-pressed={period === p.key}
              onClick={() => setPeriod(p.key)}
              className={`h-10 rounded-xl text-sm transition ${
                period === p.key ? "bg-card font-bold text-foreground shadow-sm" : "font-semibold text-muted-foreground hover:text-foreground"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        {period === "custom" && (
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-xs font-semibold text-muted-foreground">
              শুরু
              <input type="date" value={customFrom} onChange={(e) => e.target.value && setCustomFrom(e.target.value)} className="h-11 rounded-xl border bg-card px-3 text-[15px] font-semibold text-foreground" />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-muted-foreground">
              শেষ
              <input type="date" value={customTo} onChange={(e) => e.target.value && setCustomTo(e.target.value)} className="h-11 rounded-xl border bg-card px-3 text-[15px] font-semibold text-foreground" />
            </label>
          </div>
        )}
        <p className="px-1 text-[13px] font-semibold text-muted-foreground">{rangeText}</p>
      </div>

      {!book || !s ? (
        snapQ.isError || cashQ.isError ? (
          <div className="rounded-2xl border bg-card p-4 text-sm text-destructive">হিসাব আনা যায়নি। ইন্টারনেট দেখে পাতাটা আবার খুলুন।</div>
        ) : (
          <div className="space-y-4">
            <Skeleton className="h-[300px] rounded-[22px]" />
            <div className="grid grid-cols-3 gap-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-[104px] rounded-2xl" />
              ))}
            </div>
            <Skeleton className="h-64 rounded-2xl" />
          </div>
        )
      ) : (
        <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
          <div className="space-y-4">
            <ResultHero sales={book.salesTotal} opex={book.opex} collected={book.collected} pendingCount={book.pendingCount} periodLabel={periodLabel} />
            <CashFlow income={book.income} outgo={book.outgo} handCash={book.handCash} extras={book.extras} />
            <DuesCard receive={book.receive} pay={book.pay} />
          </div>
          <div className="space-y-4">
            <BrickFlow steps={book.steps} damage={book.damage} inKiln={book.inKiln} stock={book.stock} />
            <ExpenseSplit groups={book.groups} total={book.opex} />
            {book.buckets.length >= 2 && <Trend buckets={book.buckets} byMonth={book.byMonth} />}
            <TopDebtors s={s} />
          </div>
        </div>
      )}
    </div>
  );
}
