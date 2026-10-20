import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarRange, ChevronRight, Printer, TrendingDown, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { fetchProfitLoss, type PLLine } from "@/lib/pl-queries";
import { COST_GROUPS, GROUP_LABEL, MONEY_HEADS, TONE_CLASS, headLink, moneyHead, type MoneyKey } from "@/lib/money-heads";
import { bn, bnDate, todayBD } from "@/lib/format";
import { printTable } from "@/lib/print-table";
import { toast } from "sonner";

/**
 * লাভ-ক্ষতি: the one profit figure (fetchProfitLoss). Costs are shown in the four groups
 * of money-heads.ts; a head opens its own lines, and from there its ledger page.
 * Hand cash lives in the cash book; who owes what lives on /dues.
 */
export const Route = createFileRoute("/_authenticated/income-expense")({
  head: () => ({
    meta: [
      { title: "লাভ-ক্ষতি — CDB Bricks" },
      { name: "description", content: "ইট বিক্রি থেকে সব খরচ বাদে আসল লাভ বা ক্ষতি, খাত অনুযায়ী।" },
      { property: "og:title", content: "লাভ-ক্ষতি — CDB Bricks" },
      { property: "og:description", content: "খাত অনুযায়ী লাভ-ক্ষতি।" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProfitPage,
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

function ProfitPage() {
  const [preset, setPreset] = useState<Preset>("season");
  const [range, setRange] = useState<Range>({ from: "", to: "" });
  const [dateSheet, setDateSheet] = useState(false);
  const [openHead, setOpenHead] = useState<MoneyKey | "assets" | null>(null);

  const choose = (p: Preset) => {
    setPreset(p);
    setRange(p === "month" ? monthRangeBD(0) : p === "last" ? monthRangeBD(-1) : { from: "", to: "" });
  };
  const filter = { from: range.from || undefined, to: range.to || undefined };
  const rangeText = range.from || range.to ? `${bnDate(range.from)} – ${bnDate(range.to)}` : "পুরো সিজন";

  const pl = useQuery({ queryKey: ["profit-loss", "accrual", range.from, range.to], queryFn: () => fetchProfitLoss(filter) });
  const d = pl.data;
  const profit = d?.profit ?? 0;

  // groups in a fixed order; heads inside by size
  const groups = useMemo(() => COST_GROUPS.map((g) => ({
    g,
    total: d?.byGroup[g] ?? 0,
    heads: MONEY_HEADS.filter((h) => h.group === g && (d?.byHead[h.key] ?? 0) > 0)
      .map((h) => ({ h, v: d!.byHead[h.key]! }))
      .sort((a, b) => b.v - a.v),
  })).filter((x) => x.total > 0), [d]);

  const sheetLines: PLLine[] = openHead === "assets" ? d?.assetLines ?? [] : openHead ? (d?.lines ?? []).filter((l) => l.key === openHead) : [];
  const sheetHead = openHead && openHead !== "assets" ? moneyHead(openHead) : null;
  const sheetLink = openHead && openHead !== "assets" ? headLink(openHead) : null;

  const print = () => printTable({
    title: "লাভ-ক্ষতি",
    subtitle: rangeText,
    headers: ["ঘর", "খাত", "টাকা"],
    rightCols: [2],
    rows: [
      ["আয়", "ইট বিক্রি (অনুমোদিত চালান)", tk(d?.sales ?? 0)],
      ...groups.flatMap((x) => x.heads.map(({ h, v }) => [GROUP_LABEL[x.g], h.label, tk(v)])),
    ],
    totals: [
      ["মোট খরচ", tk(d?.totalCost ?? 0)],
      [profit >= 0 ? "লাভ" : "ক্ষতি", tk(Math.abs(profit))],
      ...((d?.assets ?? 0) > 0 ? [["সম্পদ কেনা (খরচে ধরা হয়নি)", tk(d!.assets)] as [string, string]] : []),
    ],
  });

  return (
    <div className="mx-auto max-w-3xl space-y-4 pb-28 md:pb-6">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[26px] font-extrabold leading-tight">লাভ-ক্ষতি</h1>
          <p className="text-sm text-muted-foreground">ইট বিক্রি থেকে সব খরচ বাদে কত থাকল</p>
        </div>
        <Button variant="outline" size="icon" className="h-10 w-10 shrink-0 rounded-xl" onClick={print} aria-label="প্রিন্ট">
          <Printer className="h-5 w-5" />
        </Button>
      </div>

      <div className="overflow-x-auto [scrollbar-width:none]">
        <div className="flex w-max gap-2">
          {PRESETS.map(([p, label]) => (
            <button key={p} type="button" onClick={() => choose(p)}
              className={`h-10 rounded-full px-4 text-sm font-bold transition active:scale-95 ${preset === p ? "bg-ink text-ink-foreground" : "border bg-card text-foreground"}`}>
              {label}
            </button>
          ))}
          <button type="button" onClick={() => setDateSheet(true)}
            className={`flex h-10 items-center gap-1.5 rounded-full px-4 text-sm font-bold transition active:scale-95 ${preset === "custom" ? "bg-ink text-ink-foreground" : "border bg-card text-foreground"}`}>
            <CalendarRange className="h-4 w-4" />
            {preset === "custom" ? rangeText : "তারিখ বাছুন"}
          </button>
        </div>
      </div>

      {/* the one profit figure */}
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
          <Link to="/challans" className="rounded-xl border border-white/10 bg-white/[0.07] px-3 py-2">
            <div className="flex items-center gap-1 text-xs font-semibold text-emerald-200"><TrendingUp className="h-3.5 w-3.5" />ইট বিক্রি</div>
            <div className="num text-lg font-bold text-emerald-300">{tk(d?.sales ?? 0)}</div>
          </Link>
          <div className="rounded-xl border border-white/10 bg-white/[0.07] px-3 py-2">
            <div className="flex items-center gap-1 text-xs font-semibold text-red-200"><TrendingDown className="h-3.5 w-3.5" />মোট খরচ</div>
            <div className="num text-lg font-bold text-red-300">{tk(d?.totalCost ?? 0)}</div>
          </div>
        </div>
      </section>

      {/* costs by group and head */}
      {pl.isLoading ? (
        <div className="space-y-2"><Skeleton className="h-28 rounded-[20px]" /><Skeleton className="h-28 rounded-[20px]" /></div>
      ) : groups.length === 0 ? (
        <p className="rounded-[20px] border bg-card p-4 text-sm text-muted-foreground">এই সময়ে কোনো খরচ নেই</p>
      ) : (
        groups.map(({ g, total, heads }) => (
          <section key={g} className="overflow-hidden rounded-[20px] border bg-card">
            <div className="flex items-baseline justify-between gap-2 px-4 pt-3.5">
              <h2 className="text-base font-bold">{GROUP_LABEL[g]}</h2>
              <span className="flex items-baseline gap-2">
                <span className="num text-xs text-muted-foreground">{bn(Math.round(d!.totalCost ? (total / d!.totalCost) * 100 : 0))}%</span>
                <b className="num font-display text-lg">{tk(total)}</b>
              </span>
            </div>
            <div className="mt-2 divide-y">
              {heads.map(({ h, v }) => (
                <button key={h.key} type="button" onClick={() => setOpenHead(h.key)}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition active:bg-muted/60">
                  <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${TONE_CLASS[h.tone]}`}><h.icon className="h-4 w-4" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">{h.label}</span>
                    <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-muted">
                      <span className="block h-1.5 rounded-full bg-primary" style={{ width: `${Math.max(2, (v / total) * 100)}%` }} />
                    </span>
                  </span>
                  <b className="num shrink-0 text-sm">{tk(v)}</b>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </button>
              ))}
            </div>
          </section>
        ))
      )}

      {(d?.assets ?? 0) > 0 && (
        <button type="button" onClick={() => setOpenHead("assets")}
          className="flex w-full items-center justify-between gap-2 rounded-[20px] bg-sky-50 p-3.5 text-left text-sm text-sky-900 dark:bg-sky-950/40 dark:text-sky-200">
          <span>সম্পদ কেনা হয়েছে <b className="num">{tk(d!.assets)}</b>। হাতে নগদ থেকে কমেছে, কিন্তু অনেক বছর কাজে লাগবে বলে এই মৌসুমের খরচে ধরা হয়নি।</span>
          <ChevronRight className="h-4 w-4 shrink-0" />
        </button>
      )}
      {(d?.salesFromOldAdvance ?? 0) > 0 && (
        <p className="rounded-[20px] bg-amber-50 p-3.5 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          বিক্রির মধ্যে {tk(d!.salesFromOldAdvance)} গত বছরের অগ্রিমের বদলে দেওয়া ইট। এর টাকা আগের মৌসুমে এসেছিল।
        </p>
      )}
      <div className="space-y-1 px-1 text-xs text-muted-foreground">
        <p>বাকিতে কেনা মাল কেনার দিনেই খরচ ধরা হয়। সরদার ও শ্রমিকের খরচ এখনো যত টাকা দেওয়া হয়েছে তা ধরে।</p>
        <p>মালিকের উত্তোলন, ঋণ আর পূর্বের দেনা খরচ নয়, তাই এখানে নেই। হাতে নগদ দেখুন <Link to="/cash-book" className="font-bold text-primary">ক্যাশ বই</Link>-তে, কে কত পাবে দেখুন <Link to="/dues" className="font-bold text-primary">পাওনা-দেনা</Link>-য়।</p>
      </div>

      {/* one head's lines */}
      <Sheet open={!!openHead} onOpenChange={(o) => { if (!o) setOpenHead(null); }}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-3xl pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
          <SheetHeader className="text-left">
            <SheetTitle>{sheetHead?.label ?? "সম্পদ কেনা"}</SheetTitle>
            <SheetDescription>{rangeText} · {bn(sheetLines.length)}টি · মোট {tk(sheetLines.reduce((a, l) => a + l.amount, 0))}</SheetDescription>
          </SheetHeader>
          <div className="mt-3 divide-y rounded-2xl border">
            {sheetLines.map((l, i) => (
              <div key={i} className="flex items-center gap-2 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="break-words text-sm font-semibold">{l.name}</div>
                  <div className="break-words text-xs text-muted-foreground">{[bnDate(l.date), l.detail].filter(Boolean).join(" · ")}</div>
                </div>
                <b className="num shrink-0 text-sm">{tk(l.amount)}</b>
              </div>
            ))}
          </div>
          {sheetLink && (
            <Link to={sheetLink.to as never} search={sheetLink.search as never}
              className="mt-3 flex h-11 items-center justify-center gap-1 rounded-xl bg-muted text-sm font-bold">
              {sheetLink.label} খুলুন <ChevronRight className="h-4 w-4" />
            </Link>
          )}
        </SheetContent>
      </Sheet>

      <Sheet open={dateSheet} onOpenChange={setDateSheet}>
        <SheetContent side="bottom" className="rounded-t-3xl pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
          <DateRangeForm initial={range} onApply={(r) => { setRange(r); setPreset("custom"); setDateSheet(false); }} />
        </SheetContent>
      </Sheet>
    </div>
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
