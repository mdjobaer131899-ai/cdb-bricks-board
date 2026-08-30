import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { FileText, Clock, CheckCircle2, Package, Plus, Zap } from "lucide-react";
import { StatCard } from "@/components/stat-card";
import { DateRangeFilter, type DateRange } from "@/components/date-range-filter";
import { RecentSalesTable } from "@/components/recent-sales-table";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchSales } from "@/lib/sales-queries";
import { bn, isoDate } from "@/lib/format";
import { useCurrentUser } from "@/lib/use-current-user";
import { BrandLogo } from "@/components/brand-logo";
import { DashboardMenuBar } from "@/components/dashboard-menu-bar";

const actions = [
  { to: "/entries/new" as const, label: "নতুন এন্ট্রি", icon: Plus, tone: "from-primary/15 to-primary/5 text-primary" },
  { to: "/challans" as const, label: "চালান তালিকা", icon: FileText, tone: "from-info/15 to-info/5 text-info" },
];

export function ManagerDashboard() {
  const { data: me } = useCurrentUser();
  const today = useMemo(() => new Date(), []);
  const [range, setRange] = useState<DateRange>({ from: today, to: today });
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
    <div className="space-y-6">
      <div className="space-y-2 rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/10 via-background to-warning/10 p-4 shadow-elegant">
        <div className="flex items-center gap-3">
          <BrandLogo className="h-14 w-14 shrink-0 drop-shadow-md" />
          <div className="min-w-0 flex-1">
            <h1 className="bg-gradient-to-r from-[#e85d3a] via-[#f7931e] to-[#c2410c] bg-clip-text text-2xl font-extrabold leading-tight tracking-tight text-transparent sm:text-3xl">
              সি ডি বি ব্রিকস
            </h1>
            <p className="text-xs font-medium text-muted-foreground sm:text-sm">কাপাসিয়া, গাজীপুর</p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {me?.fullName} — আজ {today.toLocaleDateString("bn-BD", { day: "2-digit", month: "long", year: "numeric" })}
            </p>
          </div>
        </div>
        <DashboardMenuBar />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Zap className="h-4 w-4 text-warning" /> দ্রুত অ্যাকশন
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="-mx-2 flex gap-4 overflow-x-auto px-2 pb-2 [scrollbar-width:thin]">
            {actions.map((a) => (
              <Link
                key={a.label}
                to={a.to}
                className="group flex shrink-0 flex-col items-center gap-2 transition-all hover:-translate-y-0.5"
              >
                <div className={`flex h-16 w-16 items-center justify-center rounded-full border bg-gradient-to-br ${a.tone} shadow-sm ring-1 ring-border/40 group-hover:shadow-md`}>
                  <a.icon className="h-6 w-6" />
                </div>
                <span className="w-20 truncate text-center text-[11px] font-semibold text-foreground">{a.label}</span>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[68px] rounded-xl" />)
        ) : (
          <>
            <StatCard label="আমার এন্ট্রি" value={bn(stats.total)} icon={FileText} tone="primary" />
            <StatCard label="অপেক্ষমাণ" value={bn(stats.pending)} icon={Clock} tone="warning" badge={stats.pending} />
            <StatCard label="অনুমোদিত" value={bn(stats.approved)} icon={CheckCircle2} tone="success" />
            <StatCard label="মোট ইট" value={bn(stats.bricks)} icon={Package} tone="info" />
          </>
        )}
      </div>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">আমার সাম্প্রতিক এন্ট্রি</h2>
          <DateRangeFilter value={range} onChange={setRange} />
        </div>
        <RecentSalesTable entries={sales} loading={loading} title="আমার সাম্প্রতিক এন্ট্রি" subtitle="নির্বাচিত পরিসর" />
      </section>
    </div>
  );
}
