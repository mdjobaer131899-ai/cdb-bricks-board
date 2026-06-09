import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DollarSign, Truck, Clock, Users, HandCoins, AlertTriangle, Package, CheckCircle2 } from "lucide-react";
import { StatCard } from "@/components/stat-card";
import { DateRangeFilter, type DateRange } from "@/components/date-range-filter";
import { RecentSalesTable } from "@/components/recent-sales-table";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { fetchSales } from "@/lib/sales-queries";
import { bn, isoDate } from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";
import { AiAssistantFab } from "@/components/ai-assistant-fab";
import { QuickActions } from "@/components/quick-actions";
import { StockSummaryCard } from "@/components/stock-summary-card";
import { CashBoxPanel } from "@/components/cash-box-panel";
import { SeasonProgressCard } from "@/components/season-progress-card";
import { BrandLogo } from "@/components/brand-logo";


export function AdminDashboard() {
  const today = useMemo(() => new Date(), []);
  const [range, setRange] = useState<DateRange>({ from: today, to: today });
  const from = isoDate(range.from);
  const to = isoDate(range.to);
  const todayIso = isoDate(today);

  const salesQ = useQuery({
    queryKey: ["sales", "admin", from, to],
    queryFn: () => fetchSales({ from, to }),
  });

  // Today summary stats (kept compact, no chart)
  const todayStatsQ = useQuery({
    queryKey: ["dash", "today", todayIso],
    queryFn: async () => {
      const [salesRes, payRes, colRes] = await Promise.all([
        supabase.from("sales_entries").select("quantity, total_amount, status, vehicle_number").eq("sale_date", todayIso),
        supabase.from("contract_payments").select("amount").eq("payment_date", todayIso),
        supabase.from("collections").select("amount").is("contract_id", null).eq("payment_date", todayIso),
      ]);
      const sales = salesRes.data ?? [];
      const approved = sales.filter((s) => s.status === "approved");
      const vehicles = new Set(approved.map((s) => s.vehicle_number).filter((v): v is string => !!v && v.trim() !== ""));
      const contractPay = (payRes.data ?? []).reduce((a, b) => a + Number(b.amount || 0), 0);
      const cashOnlyPay = (colRes.data ?? []).reduce((a, b) => a + Number(b.amount || 0), 0);
      return {
        challans: sales.length,
        approvedAmount: approved.reduce((a, b) => a + Number(b.total_amount || 0), 0),
        pending: sales.filter((s) => s.status === "pending").length,
        deliveries: vehicles.size,
        collection: contractPay + cashOnlyPay,
      };
    },
  });

  const customersQ = useQuery({
    queryKey: ["customers-count"],
    queryFn: async () => {
      const { count } = await supabase.from("customers").select("id", { count: "exact", head: true });
      return count ?? 0;
    },
  });

  const dueQ = useQuery({
    queryKey: ["dashboard-due"],
    queryFn: async () => {
      const [salesRes, payRes, colRes] = await Promise.all([
        supabase.from("sales_entries").select("total_amount").eq("status", "approved"),
        supabase.from("contract_payments").select("amount"),
        supabase.from("collections").select("amount").is("contract_id", null),
      ]);
      const totalSales = (salesRes.data ?? []).reduce((a, b) => a + Number(b.total_amount || 0), 0);
      const contractPay = (payRes.data ?? []).reduce((a, b) => a + Number(b.amount || 0), 0);
      const cashOnlyPay = (colRes.data ?? []).reduce((a, b) => a + Number(b.amount || 0), 0);
      return { due: Math.max(0, totalSales - (contractPay + cashOnlyPay)) };
    },
  });

  const t = todayStatsQ.data;
  const due = dueQ.data;
  const sales = salesQ.data ?? [];


  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/10 via-background to-warning/10 p-4 shadow-elegant">
        <BrandLogo className="h-14 w-14 shrink-0 drop-shadow-md" />
        <div className="min-w-0 flex-1">
          <h1 className="bg-gradient-to-r from-[#e85d3a] via-[#f7931e] to-[#c2410c] bg-clip-text text-2xl font-extrabold leading-tight tracking-tight text-transparent sm:text-3xl">
            সি ডি বি ব্রিকস
          </h1>
          <p className="text-xs font-medium text-muted-foreground sm:text-sm">কাপাসিয়া, গাজীপুর</p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            আজ {today.toLocaleDateString("bn-BD", { day: "2-digit", month: "long", year: "numeric" })}
          </p>
        </div>
      </div>

      <QuickActions />

      {/* Compact key stats — horizontal cards */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {todayStatsQ.isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[68px] rounded-xl" />)
        ) : (
          <>
            <StatCard label="আজকের বিক্রয়" value={`৳ ${bn(t?.approvedAmount ?? 0)}`} icon={DollarSign} tone="success" />
            <StatCard label="আজকের কালেকশন" value={`৳ ${bn(t?.collection ?? 0)}`} icon={HandCoins} tone="primary" />
            <StatCard label="আজকের ডেলিভারি" value={bn(t?.deliveries ?? 0)} icon={Truck} tone="info" />
            <StatCard label="অপেক্ষমাণ অনুমোদন" value={bn(t?.pending ?? 0)} icon={Clock} tone="warning" badge={t?.pending ?? 0} />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <StatCard label="মোট বকেয়া" value={`৳ ${bn(due?.due ?? 0)}`} icon={AlertTriangle} tone="destructive" />
        <StatCard label="মোট গ্রাহক" value={bn(customersQ.data ?? 0)} icon={Users} tone="primary" />
      </div>


      <StockSummaryCard />

      <SeasonProgressCard />

      {/* Quick income/expense entry */}
      <CashBoxPanel />


      {/* Filtered recent sales */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Package className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">নির্বাচিত পরিসরের বিক্রয়</h2>
            <Badge variant="outline" className="gap-1">
              <CheckCircle2 className="h-3 w-3" />{bn(sales.length)} চালান
            </Badge>
          </div>
          <DateRangeFilter value={range} onChange={setRange} />
        </div>
        <RecentSalesTable entries={sales} loading={salesQ.isLoading} isAdmin />
      </section>

      <AiAssistantFab />
    </div>
  );
}
