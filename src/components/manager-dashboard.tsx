import { useEffect, useMemo, useState } from "react";
import { FileText, Clock, CheckCircle2, Package } from "lucide-react";
import { StatCard } from "@/components/stat-card";
import { DateRangeFilter, type DateRange } from "@/components/date-range-filter";
import { RecentSalesTable } from "@/components/recent-sales-table";
import { MOCK_SALES, type SaleEntry } from "@/lib/mock-data";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth-store";

const bn = (n: number) => n.toLocaleString("bn-BD");

function inRange(e: SaleEntry, r: DateRange) {
  const d = new Date(e.date);
  const from = new Date(r.from); from.setHours(0, 0, 0, 0);
  const to = new Date(r.to); to.setHours(23, 59, 59, 999);
  return d >= from && d <= to;
}

export function ManagerDashboard() {
  const { user } = useAuth();
  const [range, setRange] = useState<DateRange>({ from: new Date(), to: new Date() });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const t = setTimeout(() => setLoading(false), 500);
    return () => clearTimeout(t);
  }, [range]);

  // Treat first manager in mock as "me" — keeps demo realistic
  const myName = "আব্দুল হাসান";
  const myEntries = useMemo(
    () => MOCK_SALES.filter((e) => e.managerName === myName && inRange(e, range)),
    [range],
  );

  const stats = useMemo(
    () => ({
      total: myEntries.length,
      pending: myEntries.filter((e) => e.status === "pending").length,
      approved: myEntries.filter((e) => e.status === "approved").length,
      bricks: myEntries.reduce((s, e) => s + e.bricks, 0),
    }),
    [myEntries],
  );

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold tracking-tight md:text-2xl">ম্যানেজার ড্যাশবোর্ড</h2>
        <p className="text-sm text-muted-foreground">{user.name} — আপনার নিজস্ব এন্ট্রি ও পারফরম্যান্স</p>
      </div>
      <DateRangeFilter value={range} onChange={setRange} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[110px] rounded-xl" />)
          : (
            <>
              <StatCard label="আমার আজকের এন্ট্রি" value={bn(stats.total)} icon={FileText} tone="primary" />
              <StatCard label="অপেক্ষমাণ এন্ট্রি" value={bn(stats.pending)} icon={Clock} tone="warning" badge={stats.pending} />
              <StatCard label="অনুমোদিত এন্ট্রি" value={bn(stats.approved)} icon={CheckCircle2} tone="success" />
              <StatCard label="মোট ইট এন্টার্ড" value={bn(stats.bricks)} icon={Package} tone="info" />
            </>
          )}
      </div>

      <RecentSalesTable entries={myEntries} loading={loading} />
    </div>
  );
}
