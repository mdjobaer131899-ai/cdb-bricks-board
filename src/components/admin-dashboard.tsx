import { useEffect, useMemo, useState } from "react";
import {
  FileText,
  Package,
  DollarSign,
  Truck,
  Clock,
  CheckCircle2,
  Users,
  Layers,
} from "lucide-react";
import { StatCard } from "@/components/stat-card";
import { DateRangeFilter, type DateRange } from "@/components/date-range-filter";
import { RecentSalesTable } from "@/components/recent-sales-table";
import { MOCK_SALES, TOTAL_CUSTOMERS, LIFETIME_BRICKS, type SaleEntry } from "@/lib/mock-data";
import { Skeleton } from "@/components/ui/skeleton";

const bn = (n: number) => n.toLocaleString("bn-BD");

function inRange(e: SaleEntry, r: DateRange) {
  const d = new Date(e.date);
  const from = new Date(r.from); from.setHours(0, 0, 0, 0);
  const to = new Date(r.to); to.setHours(23, 59, 59, 999);
  return d >= from && d <= to;
}

export function AdminDashboard() {
  const [range, setRange] = useState<DateRange>({ from: new Date(), to: new Date() });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const t = setTimeout(() => setLoading(false), 600);
    return () => clearTimeout(t);
  }, [range]);

  const filtered = useMemo(() => MOCK_SALES.filter((e) => inRange(e, range)), [range]);
  const stats = useMemo(() => {
    return {
      challans: filtered.length,
      bricks: filtered.reduce((s, e) => s + e.bricks, 0),
      amount: filtered.reduce((s, e) => s + e.amount, 0),
      advance: filtered.filter((e) => e.type === "advance").length,
      pending: filtered.filter((e) => e.status === "pending").length,
      approved: filtered.filter((e) => e.status === "approved").length,
    };
  }, [filtered]);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold tracking-tight md:text-2xl">অ্যাডমিন ড্যাশবোর্ড</h2>
        <p className="text-sm text-muted-foreground">সমস্ত বিক্রয় ও কার্যক্রমের সারসংক্ষেপ</p>
      </div>
      <DateRangeFilter value={range} onChange={setRange} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
        {loading
          ? Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-[110px] rounded-xl" />)
          : (
            <>
              <StatCard label="আজকের মোট চালান" value={bn(stats.challans)} icon={FileText} tone="primary" />
              <StatCard label="ডেলিভার্ড ইট" value={bn(stats.bricks)} icon={Package} tone="info" hint="ইটের সংখ্যা" />
              <StatCard label="মোট বিক্রয় (৳)" value={`৳ ${bn(stats.amount)}`} icon={DollarSign} tone="success" />
              <StatCard label="অগ্রিম ডেলিভারি" value={bn(stats.advance)} icon={Truck} tone="info" />
              <StatCard label="অপেক্ষমাণ অনুমোদন" value={bn(stats.pending)} icon={Clock} tone="warning" badge={stats.pending} />
              <StatCard label="অনুমোদিত বিক্রয়" value={bn(stats.approved)} icon={CheckCircle2} tone="success" />
              <StatCard label="মোট গ্রাহক" value={bn(TOTAL_CUSTOMERS)} icon={Users} tone="primary" hint="সব সময়" />
              <StatCard label="লাইফটাইম ইট" value={bn(LIFETIME_BRICKS)} icon={Layers} tone="destructive" hint="ডেলিভার্ড" />
            </>
          )}
      </div>

      <RecentSalesTable entries={filtered} loading={loading} />
    </div>
  );
}
