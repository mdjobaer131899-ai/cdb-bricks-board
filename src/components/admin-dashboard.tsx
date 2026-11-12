import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  ArrowDownToLine, ArrowUpFromLine, Banknote, CheckCircle2, ChevronDown, ChevronRight, Cloud, CloudLightning, CloudRain,
  FilePlus2, Layers, LayoutGrid, Receipt, Sun, X,
} from "lucide-react";
import { WeatherSignalBanner } from "@/components/weather-signals";
import { BrandLogo } from "@/components/brand-logo";
import { Skeleton } from "@/components/ui/skeleton";
import { PurseTiles, TransferDialog } from "@/components/cash-purses";
import { DayCloseDialog, useDayCloses } from "@/components/day-close";
import { openQuickEntry } from "@/components/quick-entry";
import { supabase } from "@/integrations/supabase/client";
import { bn, bnDate } from "@/lib/format";
import { fetchCashHistory, type CashHistoryRow } from "@/lib/cash-queries";
import { buildDues } from "@/lib/dues";
import { fetchLoansDueSoon, type LoanWithDue } from "@/lib/loan-due";
import { moneyHead } from "@/lib/money-heads";
import { getKilnSnapshot, getKilnWeather, type KilnSnapshot, type WeatherInfo } from "@/services/gemini";

/* =========================================================
   অ্যাডমিনের হোম পাতা
   উপর থেকে: হাতে নগদ (তিন ভাগ, আজকের লেনদেন) → আজকের কাজ →
   টাকা কুলাবে কিনা → পাওনা-দেনার খাতা → এই মাসে খরচ কোথায় →
   উৎপাদন ও বিক্রি (শুরু না হলে এক লাইনে গুটানো)।
   সংখ্যা আসে একই খাতা থেকে (getKilnSnapshot), তাই AI আর এই পাতা মেলে।
   ========================================================= */

const tk = (n: number) => `৳${bn(Math.round(n))}`;
const signedTk = (n: number) => `${n < -0.5 ? "−" : ""}${tk(Math.abs(n))}`;
const sum = <T,>(rows: T[], pick: (r: T) => number) => rows.reduce((a, r) => a + (Number(pick(r)) || 0), 0);
const LOW_STOCK = 10000;
const PIECES_PER_TRUCK = 2000;

function dhakaHour() {
  return Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: "Asia/Dhaka" }).format(new Date()));
}
function prevMonthStart(monthStart: string) {
  const [y, m] = monthStart.split("-").map(Number);
  return m === 1 ? `${y - 1}-12-01` : `${y}-${String(m - 1).padStart(2, "0")}-01`;
}

/** one quiet panel: a plain title, an optional link, the content */
function Panel({ title, action, children, className = "" }: { title: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border bg-card p-4 ${className}`}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-display text-[17px] font-bold leading-tight">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function MoreLink({ to, children, search }: { to: string; children: ReactNode; search?: Record<string, string> }) {
  return (
    <Link to={to as never} search={search as never} className="inline-flex items-center gap-0.5 text-sm font-bold text-primary">
      {children}
      <ChevronRight className="h-4 w-4" aria-hidden="true" />
    </Link>
  );
}

/* ---------- হাতে নগদ: হালকা কার্ড, নিচে তিন জায়গার টাকা আর আজকের লেনদেন ---------- */
function CashHero({ s, weather, todayRows }: { s: KilnSnapshot; weather: WeatherInfo | null; todayRows: CashHistoryRow[] }) {
  const [open, setOpen] = useState(false);
  const net = s.cashSeason?.net ?? 0;
  const todayIn = s.cashToday?.income ?? 0;
  const todayOut = s.cashToday?.expense ?? 0;

  const WeatherIcon = !weather ? Sun
    : weather.precipNow > 0 || weather.code >= 95 ? CloudLightning
    : weather.todayRainProb >= 40 ? CloudRain
    : weather.code >= 2 ? Cloud : Sun;

  return (
    <section className="relative overflow-hidden rounded-2xl border bg-card p-4 shadow-sm">
      {/* a thin brick-red edge marks the one card that holds the money */}
      <span className="absolute inset-y-0 left-0 w-1 bg-primary" aria-hidden="true" />

      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary/10 text-primary">
            <Banknote className="h-4 w-4" aria-hidden="true" />
          </span>
          হাতে নগদ
        </span>
        <Link to={"/weather" as never} className="flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-foreground/80">
          <WeatherIcon className="h-3.5 w-3.5 text-warning" aria-hidden="true" />
          {weather ? `${bn(weather.temp)}°, বৃষ্টি ${bn(weather.todayRainProb)}%` : "আবহাওয়া"}
        </Link>
      </div>

      <Link
        to="/cash-book"
        className={`mt-2 block font-display num text-[38px] font-extrabold leading-none tracking-tight ${net < -0.5 ? "text-destructive" : "text-foreground"}`}
      >
        {signedTk(net)}
      </Link>

      <PurseTiles purses={s.cashSeason?.purses} />

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="mt-1 flex w-full items-center gap-3 border-t pt-3 text-left"
      >
        <span className="flex-1">
          <span className="block text-xs text-muted-foreground">আজ এসেছে</span>
          <span className="num text-[17px] font-bold text-success">+{tk(todayIn)}</span>
        </span>
        <span className="flex-1">
          <span className="block text-xs text-muted-foreground">আজ গেছে</span>
          <span className="num text-[17px] font-bold text-destructive">−{tk(todayOut)}</span>
        </span>
        <span className="flex items-center gap-0.5 text-xs font-semibold text-muted-foreground">
          {open ? "লুকান" : "দেখুন"}
          <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
        </span>
      </button>

      {open && (
        <div className="mt-2 overflow-hidden rounded-xl border">
          {todayRows.length === 0 ? (
            <p className="px-3 py-3 text-sm text-muted-foreground">আজ এখনো কিছু লেখা হয়নি।</p>
          ) : (
            <ul className="divide-y">
              {todayRows.slice(0, 6).map((r) => (
                <li key={r.id}>
                  <Link to={"/cash-book" as never} search={{ row: r.id } as never} className="flex items-center gap-3 px-3 py-2 hover:bg-muted/50">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{r.detail || r.head}</span>
                      <span className="block truncate text-xs text-muted-foreground">{r.head}</span>
                    </span>
                    <span className={`num text-sm font-bold ${r.dir === "in" ? "text-success" : "text-destructive"}`}>
                      {r.dir === "in" ? "+" : "−"}{tk(r.amount)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <Link to="/cash-book" className="flex items-center justify-center gap-1 border-t bg-muted/40 py-2 text-xs font-bold text-primary">
            {todayRows.length > 6 ? `আরও ${bn(todayRows.length - 6)}টি, ক্যাশ বইয়ে দেখুন` : "ক্যাশ বই খুলুন"}
            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </div>
      )}
    </section>
  );
}

/* ---------- আজকের কাজ: অ্যাপ নিজে তালিকা বানায়, একবারে সর্বোচ্চ ৩টা ---------- */
type Task = { id: string; tone: "red" | "amber"; text: string; sub?: string; to?: string; run?: () => void; once?: boolean };

const dismissKey = (t: Task, today: string) => `cdb-dash-dismiss:${t.id}${t.once ? "" : `:${today}`}`;
function isDismissed(key: string) {
  try { return localStorage.getItem(key) === "1"; } catch { return false; }
}

function TasksPanel({ s, rows, loans }: { s: KilnSnapshot; rows: CashHistoryRow[]; loans: LoanWithDue[] }) {
  const closesQ = useDayCloses();
  const transfersQ = useQuery({
    queryKey: ["dash-any-transfer"],
    queryFn: async () => {
      const { count, error } = await supabase.from("cash_transfers").select("id", { count: "exact", head: true });
      if (error) throw error;
      return count ?? 0;
    },
  });
  const [closeDate, setCloseDate] = useState<string | null>(null);
  const [transfer, setTransfer] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [, setTick] = useState(0);

  const hour = dhakaHour();
  const closed = new Set((closesQ.data ?? []).map((c) => c.close_date));
  const hadLines = (d: string) => rows.some((r) => r.date === d);
  const pending = s.sales.filter((r) => r.status === "pending").length;
  const bank = s.cashSeason?.purses?.bank ?? 0;
  const kachaRecent = s.kacha.some((k) => k.entry_type === "production" && String(k.entry_date) >= s.yesterday);
  const kachaToday = s.kacha.some((k) => k.entry_type === "production" && k.entry_date === s.today);

  const tasks: Task[] = [];
  if ((s.cashSeason?.net ?? 0) < -0.5) {
    tasks.push({
      id: "cash-negative", tone: "red", text: "হাতে নগদ ঋণাত্মক দেখাচ্ছে",
      sub: "মালিকের টাকা, ঋণ বা মৌসুম শুরুর ক্যাশ লেখা বাকি কিনা দেখুন", run: () => openQuickEntry("in"),
    });
  }
  if (closesQ.isSuccess && hadLines(s.yesterday) && !closed.has(s.yesterday)) {
    tasks.push({ id: "close-yesterday", tone: "red", text: "গতকালের দিন বন্ধ হয়নি", sub: "ড্রয়ার গুনে হিসাব মিলিয়ে নিন", run: () => setCloseDate(s.yesterday) });
  }
  for (const l of loans) {
    tasks.push({
      id: `loan-${l.id}`,
      tone: l.due.tone === "overdue" ? "red" : "amber",
      text: `${l.party}: ${l.direction === "taken" ? "ঋণ শোধ" : "ঋণ ফেরত পাওয়া"} ${tk(l.remaining)}`,
      sub: l.due.text,
      to: "/loans",
    });
  }
  if (pending > 0) tasks.push({ id: "approvals", tone: "amber", text: `${bn(pending)}টি চালান অনুমোদন বাকি`, sub: "দাম বসিয়ে অনুমোদন দিন", to: "/approvals" });
  if (closesQ.isSuccess && hour >= 17 && hadLines(s.today) && !closed.has(s.today)) {
    tasks.push({ id: "close-today", tone: "amber", text: "আজকের দিন বন্ধ করুন", sub: "সন্ধ্যায় ড্রয়ার গুনে লিখুন", run: () => setCloseDate(s.today) });
  }
  if (kachaRecent && !kachaToday && hour >= 12) {
    tasks.push({ id: "kacha-today", tone: "amber", text: "আজকের কাঁচা ইট লেখা হয়নি", sub: "মিলের হিসাব লিখে রাখুন", to: "/production-steps/kacha" });
  }
  if (transfersQ.data === 0 && bank > 0.5) {
    tasks.push({ id: "bank-hint", tone: "amber", once: true, text: `ব্যাংকে ${tk(bank)} দেখাচ্ছে`, sub: "তুলে খরচ করে থাকলে \"টাকা সরানো\" দিয়ে লিখুন", run: () => setTransfer(true) });
  }

  const visible = tasks.filter((t) => !isDismissed(dismissKey(t, s.today))).sort((a, b) => (a.tone === b.tone ? 0 : a.tone === "red" ? -1 : 1));
  const shown = showAll ? visible : visible.slice(0, 3);
  const dismiss = (t: Task) => {
    try { localStorage.setItem(dismissKey(t, s.today), "1"); } catch { /* storage off: it simply shows again */ }
    setTick((n) => n + 1);
  };

  return (
    <Panel title="আজকের কাজ" action={visible.length > 0 ? <span className="text-xs font-semibold text-muted-foreground">{bn(visible.length)}টি বাকি</span> : undefined}>
      {visible.length === 0 ? (
        <p className="flex items-center gap-2 text-sm font-semibold text-success">
          <CheckCircle2 className="h-5 w-5" aria-hidden="true" /> এখন কোনো কাজ বাকি নেই
        </p>
      ) : (
        <ul className="-mx-1 divide-y">
          {shown.map((t) => {
            const body = (
              <>
                <span className={`mt-1 h-9 w-1 shrink-0 rounded-full ${t.tone === "red" ? "bg-destructive" : "bg-warning"}`} aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold leading-snug">{t.text}</span>
                  {t.sub && <span className="block text-xs text-muted-foreground">{t.sub}</span>}
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              </>
            );
            return (
              <li key={t.id} className="flex items-center gap-1">
                {t.to ? (
                  <Link to={t.to as never} className="flex min-w-0 flex-1 items-start gap-3 px-1 py-2.5">{body}</Link>
                ) : (
                  <button type="button" onClick={t.run} className="flex min-w-0 flex-1 items-start gap-3 px-1 py-2.5 text-left">{body}</button>
                )}
                <button type="button" onClick={() => dismiss(t)} aria-label="পরে দেখব" className="rounded-lg p-2 text-muted-foreground">
                  <X className="h-4 w-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {visible.length > 3 && (
        <button type="button" onClick={() => setShowAll((v) => !v)} className="mt-1 text-xs font-bold text-primary">
          {showAll ? "কম দেখান" : `আরও ${bn(visible.length - 3)}টি`}
        </button>
      )}
      <DayCloseDialog open={closeDate !== null} onOpenChange={(o) => { if (!o) setCloseDate(null); }} date={closeDate ?? undefined} />
      <TransferDialog open={transfer} onOpenChange={setTransfer} />
    </Panel>
  );
}

/* ---------- টাকা কুলাবে? হাতে নগদ বনাম যা দিতে হবে ---------- */
function CashRunway({ s, loans }: { s: KilnSnapshot; loans: LoanWithDue[] }) {
  const hand = s.cashSeason?.net ?? 0;
  const pay = buildDues(s).pay;
  const total = (key: string) => pay.find((l) => l.key === key)?.total ?? 0;
  const labour = total("sardar-due") + total("staff-due");
  const sellers = total("supplier-due") + total("old-payable");
  const loanSoon = sum(loans.filter((l) => l.direction === "taken"), (l) => l.remaining);
  const need = labour + sellers + loanSoon;
  if (need < 0.5) return null;

  const scale = Math.max(hand, need, 1);
  const left = hand - need;
  const verdict = left >= 0
    ? { cls: "text-success", text: `সব বাকি শোধ করেও হাতে থাকবে ${tk(left)}` }
    : hand >= loanSoon
      ? { cls: "text-warning", text: `সব বাকি শোধে ঘাটতি ${tk(-left)}` }
      : { cls: "text-destructive", text: `সামনের ঋণের টাকাও হাতে নেই, ঘাটতি ${tk(-left)}` };

  return (
    <Panel title="টাকা কুলাবে?" action={<MoreLink to="/dues">বিস্তারিত</MoreLink>}>
      <div className="space-y-2.5">
        <div>
          <div className="flex justify-between text-xs font-semibold text-muted-foreground"><span>হাতে আছে</span><span className="num">{signedTk(hand)}</span></div>
          <div className="mt-1 h-2.5 rounded-full bg-muted"><div className="h-2.5 rounded-full bg-ink" style={{ width: `${Math.max(0, (hand / scale) * 100)}%` }} /></div>
        </div>
        <div>
          <div className="flex justify-between text-xs font-semibold text-muted-foreground"><span>দিতে হবে</span><span className="num">{tk(need)}</span></div>
          <div className="mt-1 flex h-2.5 gap-[2px] overflow-hidden rounded-full bg-muted">
            {[[loanSoon, "bg-destructive"], [labour, "bg-primary"], [sellers, "bg-[#d98b5f]"]].map(([v, c]) => (
              (v as number) > 0.5 && <div key={c as string} className={c as string} style={{ width: `${((v as number) / scale) * 100}%` }} />
            ))}
          </div>
        </div>
      </div>
      <p className={`mt-3 text-[15px] font-bold ${verdict.cls}`}>{verdict.text}</p>
      <ul className="mt-2 grid grid-cols-1 gap-1 text-xs text-muted-foreground sm:grid-cols-3">
        {loanSoon > 0.5 && <li className="flex items-center gap-1.5"><span className="h-2 w-3 rounded-[2px] bg-destructive" aria-hidden="true" />৭ দিনের মধ্যে ঋণ <b className="num text-foreground">{tk(loanSoon)}</b></li>}
        {labour > 0.5 && <li className="flex items-center gap-1.5"><span className="h-2 w-3 rounded-[2px] bg-primary" aria-hidden="true" />সরদার ও শ্রমিকের বাকি <b className="num text-foreground">{tk(labour)}</b></li>}
        {sellers > 0.5 && <li className="flex items-center gap-1.5"><span className="h-2 w-3 rounded-[2px] bg-[#d98b5f]" aria-hidden="true" />সাপ্লায়ার ও পুরনো দেনা <b className="num text-foreground">{tk(sellers)}</b></li>}
      </ul>
    </Panel>
  );
}

/* ---------- পাওনা-দেনার খাতা: হালখাতার মতো দুই কলাম ---------- */
const SHORT: Record<string, string> = {
  "customer-due": "গ্রাহকের বাকি",
  "old-receivable": "গত বছরের পাওনা",
  "sardar-advance": "সরদারের দাদন",
  "staff-advance": "স্টাফের অগ্রিম",
  "supplier-advance": "সাপ্লায়ারে আগাম",
  "loan-given": "দেওয়া ঋণ",
  "sardar-due": "সরদার",
  "staff-due": "স্টাফ ও শ্রমিক",
  "supplier-due": "সাপ্লায়ার ও অন্যান্য",
  "old-payable": "পূর্বের দেনা",
  "loan-taken": "নেওয়া ঋণ",
};
const BRICK_KEYS = new Set(["booking-owed", "customer-advance", "old-brick-due"]);

function KhataColumn({ title, lines, tone }: { title: string; lines: Array<{ key: string; total: number }>; tone: string }) {
  const shown = lines.slice(0, 4);
  const rest = sum(lines.slice(4), (l) => l.total);
  const total = sum(lines, (l) => l.total);
  return (
    <div className="min-w-0">
      <div className={`border-b-2 pb-1.5 font-display text-[15px] font-bold ${tone}`}>{title}</div>
      <ul className="text-[13px]">
        {shown.map((l) => (
          <li key={l.key} className="flex items-baseline justify-between gap-2 border-b border-dashed py-1.5">
            <span className="truncate text-muted-foreground">{SHORT[l.key] ?? l.key}</span>
            <span className="num shrink-0 font-semibold">{tk(l.total)}</span>
          </li>
        ))}
        {rest > 0.5 && (
          <li className="flex items-baseline justify-between gap-2 border-b border-dashed py-1.5">
            <span className="text-muted-foreground">অন্যান্য</span>
            <span className="num font-semibold">{tk(rest)}</span>
          </li>
        )}
        {lines.length === 0 && <li className="py-1.5 text-muted-foreground">কিছু নেই</li>}
      </ul>
      {/* the account-book total: a double rule above it */}
      <div className={`mt-1.5 flex items-baseline justify-between border-t-[3px] border-double pt-1 ${tone}`}>
        <span className="text-xs font-semibold">মোট</span>
        <span className="font-display num text-lg font-extrabold">{tk(total)}</span>
      </div>
    </div>
  );
}

function Khata({ s }: { s: KilnSnapshot }) {
  const { receive, pay } = buildDues(s);
  const cashPay = pay.filter((l) => !BRICK_KEYS.has(l.key));
  const advance = pay.find((l) => l.key === "customer-advance")?.total ?? 0;
  const bookingTrucks = sum(s.bookings ?? [], (b) => b.trucksLeft);
  const oldTrucks = sum(s.opening.filter((o) => o.kind === "customer_brick_due" && (o.remainingQty ?? 0) > 0), (o) => (o.remainingQty ?? 0) / PIECES_PER_TRUCK);
  const brickParts = [
    advance > 0.5 && `অগ্রিম ${tk(advance)}`,
    bookingTrucks > 0 && `বুকিং ${bn(bookingTrucks)} গাড়ি`,
    oldTrucks > 0.01 && `গত বছরের ${bn(Math.round(oldTrucks * 10) / 10)} গাড়ি`,
  ].filter(Boolean) as string[];

  return (
    <Panel title="পাওনা-দেনা" action={<MoreLink to="/dues">সব হিসাব</MoreLink>}>
      <Link to={"/dues" as never} className="grid grid-cols-2 gap-4">
        <KhataColumn title="আমরা পাবো" lines={receive} tone="text-success border-success/60" />
        <KhataColumn title="আমরা দেব" lines={cashPay} tone="text-destructive border-destructive/60" />
      </Link>
      {brickParts.length > 0 && (
        <p className="mt-3 rounded-xl bg-accent px-3 py-2 text-[13px] text-accent-foreground">
          <b>ইট দেওয়া বাকি:</b> {brickParts.join(", ")}
        </p>
      )}
    </Panel>
  );
}

/* ---------- এই মাসে খরচ কোথায় (ক্যাশ বইয়ের হিসাব) ---------- */
function MonthSpend({ s, rows }: { s: KilnSnapshot; rows: CashHistoryRow[] }) {
  const day = Number(s.today.slice(8, 10));
  const isCost = (r: CashHistoryRow) => r.dir === "out" && moneyHead(r.key)?.group !== "move";
  const thisMonth = rows.filter((r) => isCost(r) && r.date >= s.monthStart);
  // last month up to the same day, so a half month is not compared with a full one
  const lastSame = rows.filter((r) => isCost(r) && r.date < s.monthStart && Number(r.date.slice(8, 10)) <= day);
  const by = new Map<string, number>();
  for (const r of thisMonth) by.set(r.head, (by.get(r.head) ?? 0) + r.amount);
  const heads = [...by].sort((a, b) => b[1] - a[1]);
  const top = heads.slice(0, 4);
  const restTotal = sum(heads.slice(4), (h) => h[1]);
  const total = sum(thisMonth, (r) => r.amount);
  const before = sum(lastSame, (r) => r.amount);
  const max = Math.max(1, ...top.map((h) => h[1]), restTotal);
  const change = total - before;

  return (
    <Panel title="এই মাসে খরচ কোথায়" action={<MoreLink to="/ledger">খরচের খাতা</MoreLink>}>
      {total < 0.5 ? (
        <p className="text-sm text-muted-foreground">এই মাসে এখনো কোনো খরচ লেখা হয়নি।</p>
      ) : (
        <>
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-display num text-2xl font-extrabold">{tk(total)}</span>
            {before > 0.5 && (
              <span className={`text-xs font-semibold ${change > 0 ? "text-destructive" : "text-success"}`}>
                গত মাসের এই সময়ের চেয়ে {tk(Math.abs(change))} {change > 0 ? "বেশি" : "কম"}
              </span>
            )}
          </div>
          <ul className="mt-3 space-y-2.5">
            {[...top, ...(restTotal > 0.5 ? [["বাকি খাত", restTotal] as [string, number]] : [])].map(([name, v], i) => (
              <li key={name}>
                <div className="flex items-baseline justify-between gap-2 text-[13px]">
                  <span className="truncate font-semibold">{name}</span>
                  <span className="num shrink-0 text-muted-foreground">{tk(v)} <span className="text-xs">({bn(Math.round((v / total) * 100))}%)</span></span>
                </div>
                <div className="mt-1 h-2 rounded-[3px] bg-muted">
                  <div className={`h-2 rounded-[3px] ${i === 0 ? "bg-primary" : "bg-primary/45"}`} style={{ width: `${(v / max) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </Panel>
  );
}

/* ---------- উৎপাদন ও বিক্রি: শুরু না হলে এক লাইনে ---------- */
function useSeasonTarget() {
  return useQuery({
    queryKey: ["dash-season-target"],
    queryFn: async () => {
      const { data, error } = await supabase.from("seasons").select("id, name, target_production").eq("is_active", true).order("start_date", { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

function ProductionAndSales({ s }: { s: KilnSnapshot }) {
  const targetQ = useSeasonTarget();
  const target = Number(targetQ.data?.target_production || 0);
  const made = sum(s.kacha.filter((k) => k.entry_type === "production"), (k) => k.quantity);
  const started = s.kacha.length > 0 || s.sales.length > 0;

  if (!started) {
    return (
      <section className="flex items-center gap-3 rounded-2xl border border-dashed bg-card/60 p-4">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground"><Layers className="h-5 w-5" aria-hidden="true" /></span>
        <span className="min-w-0 flex-1">
          <span className="block font-display text-[15px] font-bold">উৎপাদন ও বিক্রি এখনো শুরু হয়নি</span>
          <span className="block text-xs text-muted-foreground">প্রথম কাঁচা ইট বা চালান লিখলে এখানে উৎপাদন, স্টক আর চালান দেখাবে।</span>
        </span>
        {target <= 0 && <MoreLink to="/seasons">লক্ষ্য বসান</MoreLink>}
      </section>
    );
  }

  const today = s.kacha.filter((r) => r.entry_date === s.today);
  const q = (type: string) => sum(today.filter((r) => r.entry_type === type), (r) => r.quantity);
  const steps = [
    { label: "কাঁচা ইট", value: q("production"), to: "/production-steps/kacha", icon: Layers },
    { label: "ভাটায় ঢোকানো", value: q("load"), to: "/production-steps/load", icon: ArrowDownToLine },
    { label: "পাকা বের", value: q("unload"), to: "/production-steps/unload", icon: ArrowUpFromLine },
  ];
  const stock = s.stock.filter((x) => x.qty > 0).sort((a, b) => b.qty - a.qty);
  const stockTotal = sum(stock, (x) => x.qty);
  const pct = target > 0 ? Math.min(100, (made / target) * 100) : 0;

  return (
    <Panel title="উৎপাদন ও বিক্রি" action={<MoreLink to="/challans">চালান</MoreLink>}>
      {target > 0 ? (
        <div className="mb-4">
          <div className="flex items-baseline justify-between text-[13px]">
            <span className="font-semibold">মৌসুমের লক্ষ্য {bn(target)} ইট</span>
            <span className="num text-muted-foreground">{bn(Math.round(pct))}%</span>
          </div>
          <div className="mt-1 h-2.5 rounded-full bg-muted"><div className="h-2.5 rounded-full bg-primary" style={{ width: `${pct}%` }} /></div>
          <p className="mt-1 text-xs text-muted-foreground">এ পর্যন্ত কাঁচা ইট {bn(made)}</p>
        </div>
      ) : (
        <p className="mb-3 text-xs text-muted-foreground">মৌসুমের লক্ষ্য বসানো নেই। <Link to={"/seasons" as never} className="font-bold text-primary">মৌসুম পাতায় বসান</Link></p>
      )}

      <div className="grid grid-cols-3 gap-2">
        {steps.map((st) => (
          <Link key={st.label} to={st.to as never} className="rounded-xl bg-muted/60 px-2 py-2.5 text-center">
            <st.icon className="mx-auto h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <span className="mt-1 block font-display num text-lg font-bold leading-none">{bn(st.value)}</span>
            <span className="text-[11px] font-semibold text-muted-foreground">আজ {st.label}</span>
          </Link>
        ))}
      </div>

      <div className="mt-4 flex items-baseline justify-between">
        <span className="text-[13px] font-semibold">পাকা ইটের স্টক</span>
        <span className="font-display num text-lg font-bold">{bn(stockTotal)}</span>
      </div>
      {stock.length > 0 && (
        <ul className="mt-1 grid grid-cols-2 gap-x-4 text-[13px]">
          {stock.slice(0, 6).map((x) => (
            <li key={x.name} className="flex justify-between border-b border-dashed py-1">
              <span className="truncate text-muted-foreground">{x.name}</span>
              <span className={`num font-semibold ${x.qty < LOW_STOCK ? "text-destructive" : ""}`}>{bn(x.qty)}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/* ---------- কম্পিউটারে দ্রুত কাজের বোতাম (ফোনে + বোতাম এই কাজ করে) ---------- */
function QuickActions() {
  const items: Array<{ key: string; to?: string; step?: "in" | "out"; label: string; icon: typeof FilePlus2; primary?: boolean }> = [
    { key: "challan", to: "/entries/new", label: "নতুন চালান", icon: FilePlus2, primary: true },
    { key: "in", step: "in", label: "টাকা পেলাম", icon: Banknote },
    { key: "out", step: "out", label: "টাকা দিলাম", icon: Receipt },
    { key: "kacha", to: "/production-steps/kacha", label: "কাঁচা ইট", icon: Layers },
  ];
  const cls = (primary?: boolean) =>
    `flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold transition active:scale-95 ${primary ? "bg-primary text-primary-foreground" : "border bg-card"}`;
  return (
    <section className="hidden grid-cols-4 gap-2 md:grid">
      {items.map((it) => {
        const body = <><it.icon className="h-4 w-4" aria-hidden="true" />{it.label}</>;
        return it.to ? (
          <Link key={it.key} to={it.to as never} className={cls(it.primary)}>{body}</Link>
        ) : (
          <button key={it.key} type="button" onClick={() => openQuickEntry(it.step)} className={cls(it.primary)}>{body}</button>
        );
      })}
    </section>
  );
}

/* ---------- মূল পাতা ---------- */
export function AdminDashboard({ navGrid }: { navGrid?: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const snapQ = useQuery({
    queryKey: ["kiln-snapshot"],
    queryFn: () => getKilnSnapshot(true),
    // the whole ledger is read for this page: every 5 minutes is enough, and on return to the app
    refetchInterval: 5 * 60_000,
  });
  const weatherQ = useQuery({ queryKey: ["kiln-weather"], queryFn: () => getKilnWeather(), refetchInterval: 15 * 60_000 });
  const loansQ = useQuery({ queryKey: ["loans", "due-soon"], queryFn: fetchLoansDueSoon, refetchInterval: 15 * 60_000 });

  const s = snapQ.data;
  const from = s ? prevMonthStart(s.monthStart) : null;
  const histQ = useQuery({
    queryKey: ["dash-history", from, s?.today],
    enabled: !!s,
    queryFn: () => fetchCashHistory({ from: from!, to: s!.today }),
  });
  const rows = histQ.data ?? [];
  const todayRows = useMemo(() => (s ? rows.filter((r) => r.date === s.today).reverse() : []), [rows, s]);
  const loans = loansQ.data ?? [];
  const weather = weatherQ.data ?? null;
  const dateLabel = s ? bnDate(s.today) : "";
  const weekday = new Date().toLocaleDateString("bn-BD", { weekday: "long", timeZone: "Asia/Dhaka" });

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4">
      <header className="flex items-center gap-3 px-0.5 pt-1">
        <BrandLogo size="sm" className="shrink-0" />
        <div className="min-w-0">
          <h1 className="font-display text-xl font-extrabold leading-tight">সি ডি বি ব্রিকস</h1>
          <p className="truncate text-xs font-semibold text-muted-foreground">{weekday}, {dateLabel}</p>
        </div>
      </header>

      {!s ? (
        <div className="space-y-4">
          <Skeleton className="h-[230px] rounded-[22px]" />
          <Skeleton className="h-32 rounded-2xl" />
          <Skeleton className="h-40 rounded-2xl" />
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
          <div className="space-y-4">
            <CashHero s={s} weather={weather} todayRows={todayRows} />
            <WeatherSignalBanner />
            <QuickActions />
            <TasksPanel s={s} rows={rows} loans={loans} />
            <CashRunway s={s} loans={loans} />
          </div>
          <div className="space-y-4">
            <Khata s={s} />
            <MonthSpend s={s} rows={rows} />
            <ProductionAndSales s={s} />
          </div>
        </div>
      )}

      {navGrid && (
        <div className="lg:hidden">
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-expanded={menuOpen}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border bg-card py-3 text-sm font-bold"
          >
            <LayoutGrid className="h-4 w-4" aria-hidden="true" /> {menuOpen ? "সব পাতা লুকান" : "সব পাতা দেখুন"}
          </button>
          {menuOpen && <div className="pt-4">{navGrid}</div>}
        </div>
      )}
    </div>
  );
}
