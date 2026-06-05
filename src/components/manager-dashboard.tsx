import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileText, Clock, CheckCircle2, Package } from "lucide-react";
import { StatCard } from "@/components/stat-card";
import { DateRangeFilter, type DateRange } from "@/components/date-range-filter";
import { RecentSalesTable } from "@/components/recent-sales-table";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchSales } from "@/lib/sales-queries";
import { bn, isoDate } from "@/lib/format";
import { useCurrentUser } from "@/lib/use-current-user";

export function ManagerDashboard() {
  const { data: me } = useCurrentUser();
  const [range, setRange] = useState<DateRange>({ from: new Date(), to: new Date() });
  const from = isoDate(range.from);
  const to = isoDate(range.to);

  const q = useQuery({
    queryKey: ["sales", "mine", me?.user.id, from, to],
    enabled: !!me?.user.id,
    queryFn: () => fetchSales({ from, to, createdBy: me!.user.id }),
  });

  const sales = q.data ?? [];
  const loading = q.isLoading;

  const stats = useMemo(() => ({
    total: sales.length,
    pending: sales.filter((e) => e.status === "pending").length,
    approved: sales.filter((e) => e.status === "approved").length,
    bricks: sales.reduce((s, e) => s + e.quantity, 0),
  }), [sales]);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold tracking-tight md:text-2xl">ম্যানেজার ড্যাশবোর্ড</h2>
        <p className="text-sm text-muted-foreground">{me?.fullName} — আপনার নিজস্ব এন্ট্রি ও পারফরম্যান্স</p>
      </div>
      <DateRangeFilter value={range} onChange={setRange} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[110px] rounded-xl" />)
          : (
            <>
              <StatCard label="আমার এন্ট্রি (নির্বাচিত)" value={bn(stats.total)} icon={FileText} tone="primary" />
              <StatCard label="অপেক্ষমাণ এন্ট্রি" value={bn(stats.pending)} icon={Clock} tone="warning" badge={stats.pending} />
              <StatCard label="অনুমোদিত এন্ট্রি" value={bn(stats.approved)} icon={CheckCircle2} tone="success" />
              <StatCard label="মোট ইট এন্টার্ড" value={bn(stats.bricks)} icon={Package} tone="info" />
            </>
          )}
      </div>

      <RecentSalesTable entries={sales} loading={loading} title="আমার সাম্প্রতিক এন্ট্রি" subtitle="শেষ ১০টি চালান" />
    </div>
  );
}
