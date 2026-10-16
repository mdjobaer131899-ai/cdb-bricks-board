import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarRange, ChevronRight, Printer, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { fetchCashSummary } from "@/lib/cash-queries";
import { fetchProfitLoss, fetchSupplierDues } from "@/lib/pl-queries";
import { bn, bnDate, todayBD } from "@/lib/format";
import { printTable } from "@/lib/print-table";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/income-expense")({
  head: () => ({
    meta: [
      { title: "লাভ-ক্ষতি ও দেনা-পাওনা — CDB Bricks" },
      { name: "description", content: "আসল লাভ-ক্ষতি (বাকিতে কেনা মালসহ), সাপ্লায়ারের দেনা আর নগদ আয়-ব্যয়ের হিসাব।" },
      { property: "og:title", content: "লাভ-ক্ষতি ও দেনা-পাওনা — CDB Bricks" },
      { property: "og:description", content: "লাভ-ক্ষতি, দেনা-পাওনা ও নগদ হিসাব।" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: IncomeExpensePage,
});

const tk = (n: number) => `৳${bn(Math.round(n))}`;

type Range = { from: string; to: string };
type Preset = "season" | "month" | "last" | "custom";

function monthRangeBD(offset: number): Range {
  const [y, m] = todayBD().split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1 + offset, 1));
  const last = new Date(Date.UTC(y, m + offset, 0));
  return { from: first.toISOString().slice(0, 10), to: last.toISOString().slice(0, 10) };
}

const PRESETS: Array<[Preset, string]> = [
  ["season", "পুরো সিজন"],
  ["month", "এই মাস"],
  ["last", "গত মাস"],
];

const COST_LABELS: Record<string, string> = {
  purchases: "মালামাল ও কাঁচামাল (বাকিসহ)",
  expenses: "দৈনিক খরচ ও বিল",
  sardar: "সরদার পেমেন্ট",
  worker: "শ্রমিক ও বেতন",
  vehicle: "গাড়ি খরচ",
};

const IN_LABELS: Record<string, string> = {
  sales: "ইট বিক্রয় / কালেকশন",
  ownerInvest: "মালিকের বিনিয়োগ",
  loanTaken: "ঋণ নেওয়া",
  loanReturned: "দেওয়া ঋণ ফেরত",
  openingCollected: "গত বছরের পাওনা আদায়",
};
const OUT_LABELS: Record<string, string> = {
  expenses: "দৈনিক খরচ ও বিল",
  sardar: "সরদার পেমেন্ট",
  worker: "শ্রমিক ও বেতন",
  supplier: "সাপ্লায়ারকে পরিশোধ",
  vehicle: "গাড়ি খরচ",
  ownerWithdraw: "মালিকের উত্তোলন",
  loanGiven: "ঋণ দেওয়া",
  loanRepaid: "নেওয়া ঋণ পরিশোধ",
  openingPaid: "পূর্বের দায় পরিশোধ",
};

function IncomeExpensePage() {
  const [preset, setPreset] = useState<Preset>("season");
  const [range, setRange] = useState<Range>({ from: "", to: "" });
  const [dateSheet, setDateSheet] = useState(false);

  const choose = (p: Preset) => {
    setPreset(p);
    setRange(p === "month" ? monthRangeBD(0) : p === "last" ? monthRangeBD(-1) : { from: "", to: "" });
  };
  const filter = { from: range.from || undefined, to: range.to || undefined };
  const rangeText = range.from || range.to ? `${bnDate(range.from)} – ${bnDate(range.to)}` : "পুরো সিজন";

  const pl = useQuery({ queryKey: ["profit-loss", "accrual", range.from, range.to], queryFn: () => fetchProfitLoss(filter) });
  const dues = useQuery({ queryKey: ["profit-loss", "supplier-dues"], queryFn: fetchSupplierDues });
  const cash = useQuery({ queryKey: ["cash", "summary-all", range.from, range.to], queryFn: () => fetchCashSummary(filter) });

  const costRows = useMemo(
    () => Object.entries(pl.data?.costs ?? {}).filter(([, v]) => v).sort((a, b) => b[1] - a[1]),
    [pl.data],
  );
  const inRows = useMemo(() => Object.entries(cash.data?.incomeBreakdown ?? {}).filter(([, v]) => v), [cash.data]);
  const outRows = useMemo(() => Object.entries(cash.data?.breakdown ?? {}).filter(([, v]) => v), [cash.data]);

  const profit = pl.data?.profit ?? 0;

  const print = () => {
    const d = pl.data;
    printTable({
      title: "লাভ-ক্ষতি ও দেনা-পাওনা",
      subtitle: rangeText,
      headers: ["অংশ", "খাত", "টাকা"],
      rightCols: [2],
      rows: [
        ["লাভ-ক্ষতি", "ইট বিক্রি (অনুমোদিত চালান)", tk(d?.sales ?? 0)],
        ...costRows.map(([k, v]) => ["লাভ-ক্ষতি", COST_LABELS[k] ?? k, tk(v)]),
        ["দেনা", "সাপ্লায়ারের মোট দেনা (সব সময়)", tk(dues.data?.total ?? 0)],
        ...inRows.map(([k, v]) => ["নগদ আয়", IN_LABELS[k] ?? k, tk(v)]),
        ...outRows.map(([k, v]) => ["নগদ ব্যয়", OUT_LABELS[k] ?? k, tk(v)]),
      ],
      totals: [
        ["মোট খরচ", tk(d?.totalCost ?? 0)],
        ["হাতে নগদ (আয় − ব্যয়)", tk(cash.data?.net ?? 0)],
        [profit >= 0 ? "লাভ" : "ক্ষতি", tk(Math.abs(profit))],
      ],
    });
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4 pb-28 md:pb-6">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[26px] font-extrabold leading-tight">লাভ-ক্ষতি ও দেনা-পাওনা</h1>
          <p className="text-sm text-muted-foreground">আসল খরচ, কার কাছে কত বাকি, আর নগদ হিসাব</p>
        </div>
        <Button variant="outline" size="icon" className="h-10 w-10 shrink-0 rounded-xl" onClick={print} aria-label="প্রিন্ট">
          <Printer className="h-5 w-5" />
        </Button>
      </div>

      <div className="overflow-x-auto [scrollbar-width:none]">
        <div className="flex w-max gap-2">
          {PRESETS.map(([p, label]) => (
            <button
              key={p}
              type="button"
              onClick={() => choose(p)}
              className={`h-10 rounded-full px-4 text-sm font-bold transition active:scale-95 ${
                preset === p ? "bg-ink text-ink-foreground" : "border bg-card text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setDateSheet(true)}
            className={`flex h-10 items-center gap-1.5 rounded-full px-4 text-sm font-bold transition active:scale-95 ${
              preset === "custom" ? "bg-ink text-ink-foreground" : "border bg-card text-foreground"
            }`}
          >
            <CalendarRange className="h-4 w-4" />
            {preset === "custom" ? rangeText : "তারিখ বাছুন"}
          </button>
        </div>
      </div>

      <Tabs defaultValue="pl">
        <TabsList className="grid h-11 w-full grid-cols-2 rounded-xl">
          <TabsTrigger value="pl" className="rounded-lg font-bold">লাভ-ক্ষতি</TabsTrigger>
          <TabsTrigger value="cash" className="rounded-lg font-bold">নগদ হিসাব</TabsTrigger>
        </TabsList>

        <TabsContent value="pl" className="mt-4 space-y-4">
          {/* Profit hero */}
          <section className="bg-brick-pattern relative overflow-hidden rounded-[20px] bg-ink p-[18px] text-ink-foreground">
            <div className="text-xs font-bold tracking-[0.12em] text-stone-300">{rangeText} · {profit >= 0 ? "লাভ" : "ক্ষতি"}</div>
            {pl.isLoading ? (
              <Skeleton className="mt-3 h-10 w-48 bg-white/10" />
            ) : (
              <div className={`mt-2 font-display num text-[40px] font-extrabold leading-[0.95] tracking-tight ${profit >= 0 ? "text-emerald-300" : "text-red-300"}`}>
                {profit >= 0 ? "" : "−"}{tk(Math.abs(profit))}
              </div>
            )}
            <div className="mt-3.5 grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-white/10 bg-white/[0.07] px-3 py-2">
                <div className="flex items-center gap-1 text-xs font-semibold text-emerald-200"><TrendingUp className="h-3.5 w-3.5" />ইট বিক্রি</div>
                <div className="num text-lg font-bold text-emerald-300">{tk(pl.data?.sales ?? 0)}</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.07] px-3 py-2">
                <div className="flex items-center gap-1 text-xs font-semibold text-red-200"><TrendingDown className="h-3.5 w-3.5" />মোট খরচ</div>
                <div className="num text-lg font-bold text-red-300">{tk(pl.data?.totalCost ?? 0)}</div>
              </div>
            </div>
          </section>

          {/* Cost breakdown */}
          <section className="rounded-[20px] border bg-card p-4">
            <h2 className="text-base font-bold">খরচ কোথায় গেল</h2>
            <p className="text-xs text-muted-foreground">বাকিতে কেনা মালও কেনার দিনেই খরচ ধরা হয়েছে</p>
            {pl.isLoading ? (
              <div className="mt-3 space-y-2"><Skeleton className="h-10" /><Skeleton className="h-10" /></div>
            ) : costRows.length === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">এই সময়ে কোনো খরচ নেই</p>
            ) : (
              <div className="mt-3 space-y-3">
                {costRows.map(([k, v]) => {
                  const pct = pl.data?.totalCost ? (v / pl.data.totalCost) * 100 : 0;
                  return (
                    <div key={k}>
                      <div className="flex items-baseline justify-between gap-2 text-sm">
                        <span className="font-semibold">{COST_LABELS[k] ?? k}</span>
                        <b className="num">{tk(v)}</b>
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(pct, 2)}%` }} />
                        </div>
                        <span className="num w-10 text-right text-xs text-muted-foreground">{bn(Math.round(pct))}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {(pl.data?.salesFromOldAdvance ?? 0) > 0 && (
              <p className="mt-3 rounded-xl bg-amber-50 p-2.5 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                বিক্রির মধ্যে {tk(pl.data!.salesFromOldAdvance)} গত বছরের অগ্রিমের বদলে দেওয়া ইট। এর টাকা আগের মৌসুমে এসেছিল।
              </p>
            )}
            <p className="mt-3 text-xs text-muted-foreground">
              সরদার ও শ্রমিকের খরচ এখন যত টাকা দেওয়া হয়েছে তা ধরে হিসাব হচ্ছে, পাওনা ধরে নয়।
            </p>
          </section>

          {/* Supplier dues */}
          <section className="rounded-[20px] border bg-card p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="text-base font-bold">সাপ্লায়ারের কাছে দেনা</h2>
                <p className="text-xs text-muted-foreground">কেনা মালের বিল − দেওয়া টাকা (সব মৌসুম মিলিয়ে)</p>
              </div>
              {dues.isLoading ? <Skeleton className="h-7 w-24" /> : (
                <b className={`num font-display text-xl ${(dues.data?.total ?? 0) > 0 ? "text-warning" : "text-success"}`}>{tk(dues.data?.total ?? 0)}</b>
              )}
            </div>
            {!dues.isLoading && (dues.data?.suppliers.length ?? 0) === 0 && (
              <p className="mt-3 text-sm text-muted-foreground">কোনো সাপ্লায়ারের বাকি নেই</p>
            )}
            <div className="mt-3 divide-y">
              {(dues.data?.suppliers ?? []).slice(0, 5).map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-2 py-2.5 text-sm">
                  <div className="min-w-0">
                    <div className="break-words font-semibold">{s.name}</div>
                    <div className="num text-xs text-muted-foreground">বিল {tk(s.bill)} · দেওয়া {tk(s.paid)}</div>
                  </div>
                  <b className={`num shrink-0 ${s.due > 0 ? "text-warning" : "text-info"}`}>
                    {s.due < 0 ? "অগ্রিম " : ""}{tk(Math.abs(s.due))}
                  </b>
                </div>
              ))}
            </div>
            <Link to="/purchases" className="mt-2 flex h-11 items-center justify-center gap-1 rounded-xl bg-muted text-sm font-bold">
              সব সাপ্লায়ার দেখুন <ChevronRight className="h-4 w-4" />
            </Link>
          </section>
        </TabsContent>

        <TabsContent value="cash" className="mt-4 space-y-4">
          <section className="bg-brick-pattern relative overflow-hidden rounded-[20px] bg-ink p-[18px] text-ink-foreground">
            <div className="flex items-center gap-1.5 text-xs font-bold tracking-[0.12em] text-stone-300"><Wallet className="h-3.5 w-3.5" />হাতে নগদ · {rangeText}</div>
            {cash.isLoading ? <Skeleton className="mt-3 h-10 w-48 bg-white/10" /> : (
              <div className="mt-2 font-display num text-[40px] font-extrabold leading-[0.95] tracking-tight">
                {(cash.data?.net ?? 0) < 0 ? "−" : ""}{tk(Math.abs(cash.data?.net ?? 0))}
              </div>
            )}
            <div className="mt-3.5 grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-white/10 bg-white/[0.07] px-3 py-2">
                <div className="text-xs font-semibold text-emerald-200">মোট এসেছে</div>
                <div className="num text-lg font-bold text-emerald-300">+{tk(cash.data?.income ?? 0)}</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.07] px-3 py-2">
                <div className="text-xs font-semibold text-red-200">মোট গেছে</div>
                <div className="num text-lg font-bold text-red-300">−{tk(cash.data?.expense ?? 0)}</div>
              </div>
            </div>
          </section>

          <BreakdownCard title="টাকা এসেছে" tone="in" rows={inRows} labels={IN_LABELS} loading={cash.isLoading} />
          <BreakdownCard title="টাকা গেছে" tone="out" rows={outRows} labels={OUT_LABELS} loading={cash.isLoading} />
          <p className="px-1 text-xs text-muted-foreground">
            পূর্বের দায় পরিশোধ, গত বছরের পাওনা আদায়, মালিক ও ঋণের টাকা নগদে আসে-যায়, কিন্তু লাভ-ক্ষতিতে ধরা হয় না।
          </p>
        </TabsContent>
      </Tabs>

      <Sheet open={dateSheet} onOpenChange={setDateSheet}>
        <SheetContent side="bottom" className="rounded-t-3xl pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
          <DateRangeForm
            initial={range}
            onApply={(r) => { setRange(r); setPreset("custom"); setDateSheet(false); }}
          />
        </SheetContent>
      </Sheet>
    </div>
  );
}

function BreakdownCard({ title, tone, rows, labels, loading }: {
  title: string;
  tone: "in" | "out";
  rows: Array<[string, number]>;
  labels: Record<string, string>;
  loading: boolean;
}) {
  const color = tone === "in" ? "text-emerald-700 dark:text-emerald-300" : "text-red-700 dark:text-red-300";
  return (
    <section className="rounded-[20px] border bg-card p-4">
      <h2 className={`text-base font-bold ${color}`}>{title}</h2>
      {loading ? (
        <div className="mt-3 space-y-2"><Skeleton className="h-8" /><Skeleton className="h-8" /></div>
      ) : rows.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">কিছু নেই</p>
      ) : (
        <div className="mt-2 divide-y">
          {rows.map(([k, v]) => (
            <div key={k} className="flex items-center justify-between gap-2 py-2.5 text-sm">
              <span>{labels[k] ?? k}</span>
              <b className={`num ${color}`}>{tk(v)}</b>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function DateRangeForm({ initial, onApply }: { initial: Range; onApply: (r: Range) => void }) {
  const [from, setFrom] = useState(initial.from || todayBD());
  const [to, setTo] = useState(initial.to || todayBD());
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!from || !to) return toast.error("দুটি তারিখই দিন");
        if (to < from) return toast.error("শেষ তারিখ শুরুর আগে হতে পারে না");
        onApply({ from, to });
      }}
    >
      <SheetHeader className="text-left">
        <SheetTitle>তারিখ বাছুন</SheetTitle>
        <SheetDescription>যে সময়ের হিসাব দেখতে চান</SheetDescription>
      </SheetHeader>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1"><Label>শুরু</Label><Input type="date" className="h-12" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div className="space-y-1"><Label>শেষ</Label><Input type="date" className="h-12" value={to} onChange={(e) => setTo(e.target.value)} /></div>
      </div>
      <Button type="submit" className="h-12 w-full rounded-xl text-base font-bold">দেখাও</Button>
    </form>
  );
}
