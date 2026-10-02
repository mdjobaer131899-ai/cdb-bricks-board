import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Printer, Scale, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/stat-card";
import { fetchCashSummary } from "@/lib/cash-queries";
import { bn } from "@/lib/format";
import { printTable } from "@/lib/print-table";

export const Route = createFileRoute("/_authenticated/income-expense")({
  head: () => ({
    meta: [
      { title: "মোট আয়-ব্যয় — CDB Bricks" },
      { name: "description", content: "বিক্রয়, বিনিয়োগ, ঋণ, মজুরি, বেতন, ক্রয় ও খরচ — সব আয় ও ব্যয় এক জায়গায়।" },
      { property: "og:title", content: "মোট আয়-ব্যয় — CDB Bricks" },
      { property: "og:description", content: "সব আয় ও ব্যয়ের সারসংক্ষেপ।" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: IncomeExpensePage,
});

const IN_LABELS: Record<string, string> = { sales: "ইট বিক্রয় / কালেকশন", ownerInvest: "মালিকের বিনিয়োগ", loanTaken: "ঋণ নেওয়া", loanReturned: "দেওয়া ঋণ ফেরত", openingCollected: "গত বছরের পাওনা আদায় (লাভ-ক্ষতির বাইরে)" };
const OUT_LABELS: Record<string, string> = {
  expenses: "দৈনিক খরচ (ইঞ্জিন, বিল ইত্যাদি)", sardar: "সরদার পেমেন্ট", worker: "ডেলি শ্রমিক, মেস্তুরি ও ম্যানেজার",
  supplier: "মালামাল ক্রয় পরিশোধ", vehicle: "অন্যান্য", ownerWithdraw: "মালিকের উত্তোলন", loanGiven: "ঋণ দেওয়া",
  loanRepaid: "নেওয়া ঋণ পরিশোধ", openingPaid: "পূর্বের দায় পরিশোধ (লাভ-ক্ষতির বাইরে)",
};

function IncomeExpensePage() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const q = useQuery({ queryKey: ["cash", "summary-all", from, to], queryFn: () => fetchCashSummary({ from: from || undefined, to: to || undefined }) });
  const d = q.data;
  const inRows = useMemo(() => Object.entries(d?.incomeBreakdown ?? {}).filter(([, v]) => v), [d]);
  const outRows = useMemo(() => Object.entries(d?.breakdown ?? {}).filter(([, v]) => v), [d]);

  const print = () => printTable({
    title: "মোট আয়-ব্যয় বিবরণী",
    subtitle: from || to ? `${from || "শুরু"} থেকে ${to || "আজ"}` : "চলতি মৌসুম",
    headers: ["খাত", "ধরন", "টাকা"], rightCols: [2],
    rows: [...inRows.map(([k, v]) => [IN_LABELS[k] ?? k, "আয়", `৳ ${bn(v)}`]), ...outRows.map(([k, v]) => [OUT_LABELS[k] ?? k, "ব্যয়", `৳ ${bn(v)}`])],
    totals: [["মোট আয়", `৳ ${bn(d?.income ?? 0)}`], ["মোট ব্যয়", `৳ ${bn(d?.expense ?? 0)}`], ["হাতে নগদ (আয় − ব্যয়)", `৳ ${bn(d?.net ?? 0)}`]],
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold md:text-2xl"><Scale className="h-6 w-6 text-primary" /> মোট আয়-ব্যয়</h1>
          <p className="text-sm text-muted-foreground">সব পাতার টাকা লেনদেন এক হিসাবে</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div><Label className="text-xs">থেকে</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div><Label className="text-xs">পর্যন্ত</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
          <Button variant="outline" onClick={print}><Printer className="mr-1 h-4 w-4" /> প্রিন্ট</Button>
        </div>
      </div>
      {q.isLoading ? <Skeleton className="h-24" /> : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <StatCard label="মোট আয়" value={`৳ ${bn(d?.income ?? 0)}`} icon={TrendingUp} tone="success" />
          <StatCard label="মোট ব্যয়" value={`৳ ${bn(d?.expense ?? 0)}`} icon={TrendingDown} tone="destructive" />
          <StatCard label="হাতে নগদ" value={`৳ ${bn(d?.net ?? 0)}`} icon={Wallet} tone="primary" />
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base text-success">আয়</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {inRows.length === 0 && <p className="text-muted-foreground">কোনো আয় নেই</p>}
            {inRows.map(([k, v]) => <div key={k} className="flex justify-between border-b pb-1"><span>{IN_LABELS[k] ?? k}</span><b>৳ {bn(v)}</b></div>)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base text-destructive">ব্যয়</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {outRows.length === 0 && <p className="text-muted-foreground">কোনো ব্যয় নেই</p>}
            {outRows.map(([k, v]) => <div key={k} className="flex justify-between border-b pb-1"><span>{OUT_LABELS[k] ?? k}</span><b>৳ {bn(v)}</b></div>)}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
