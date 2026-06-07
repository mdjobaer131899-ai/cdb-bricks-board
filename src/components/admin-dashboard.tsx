import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileText, Package, DollarSign, Truck, Clock, CheckCircle2, Users, Layers } from "lucide-react";
import { StatCard } from "@/components/stat-card";
import { DateRangeFilter, type DateRange } from "@/components/date-range-filter";
import { RecentSalesTable } from "@/components/recent-sales-table";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchSales } from "@/lib/sales-queries";
import { bn, isoDate } from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";
import { AiAssistantFab } from "@/components/ai-assistant-fab";

export function AdminDashboard() {
  const [range, setRange] = useState<DateRange>({ from: new Date(), to: new Date() });
  const from = isoDate(range.from);
  const to = isoDate(range.to);

  const salesQ = useQuery({
    queryKey: ["sales", "admin", from, to],
    queryFn: () => fetchSales({ from, to }),
  });

  const customersQ = useQuery({
    queryKey: ["customers-count"],
    queryFn: async () => {
      const { count } = await supabase.from("customers").select("id", { count: "exact", head: true });
      return count ?? 0;
    },
  });

  const lifetimeQ = useQuery({
    queryKey: ["lifetime-bricks"],
    queryFn: async () => {
      const { data } = await supabase.from("sales_entries").select("quantity").eq("status", "approved");
      return (data ?? []).reduce((s, r) => s + (r.quantity ?? 0), 0);
    },
  });

  const loading = salesQ.isLoading;
  const sales = salesQ.data ?? [];

  const stats = useMemo(() => ({
    challans: sales.length,
    bricks: sales.reduce((s, e) => s + e.quantity, 0),
    amount: sales.reduce((s, e) => s + Number(e.total_amount), 0),
    advance: sales.filter((e) => e.sale_type === "advance").length,
    pending: sales.filter((e) => e.status === "pending").length,
    approved: sales.filter((e) => e.status === "approved").length,
  }), [sales]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold tracking-tight md:text-2xl">অ্যাডমিন ড্যাশবোর্ড</h1>
        <p className="text-sm text-muted-foreground">সমস্ত বিক্রয় ও কার্যক্রমের সারসংক্ষেপ</p>
      </div>
      <DateRangeFilter value={range} onChange={setRange} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
        {loading
          ? Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-[110px] rounded-xl" />)
          : (
            <>
              <StatCard label="মোট চালান (নির্বাচিত)" value={bn(stats.challans)} icon={FileText} tone="primary" />
              <StatCard label="ডেলিভার্ড ইট" value={bn(stats.bricks)} icon={Package} tone="info" hint="ইটের সংখ্যা" />
              <StatCard label="মোট বিক্রয় (৳)" value={`৳ ${bn(stats.amount)}`} icon={DollarSign} tone="success" />
              <StatCard label="অগ্রিম ডেলিভারি" value={bn(stats.advance)} icon={Truck} tone="info" />
              <StatCard label="অপেক্ষমাণ অনুমোদন" value={bn(stats.pending)} icon={Clock} tone="warning" badge={stats.pending} />
              <StatCard label="অনুমোদিত বিক্রয়" value={bn(stats.approved)} icon={CheckCircle2} tone="success" />
              <StatCard label="মোট গ্রাহক" value={bn(customersQ.data ?? 0)} icon={Users} tone="primary" hint="সব সময়" />
              <StatCard label="লাইফটাইম ইট" value={bn(lifetimeQ.data ?? 0)} icon={Layers} tone="destructive" hint="অনুমোদিত ডেলিভার্ড" />
            </>
          )}
      </div>

      <RecentSalesTable entries={sales} loading={loading} isAdmin />
      <AiAssistantFab />
    </div>
  );
}
