import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileText, DollarSign, Truck, Clock, Users, Wallet, HandCoins, AlertTriangle, Package, CheckCircle2, TrendingUp, Users2 } from "lucide-react";
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
import { DailyIncomeExpenseFolders } from "@/components/daily-folders";
import { CashBoxPanel } from "@/components/cash-box-panel";

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

  // New: month-to-date raw material + labor + net profit
  const monthIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`;
  const monthLast = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()).padStart(2, "0")}`;

  const newStatsQ = useQuery({
    queryKey: ["dash-new-cards", todayIso, monthIso],
    queryFn: async () => {
      const [rmTodayRes, wpTodayRes, monthSalesRes, monthExpRes, monthRmRes, monthWpRes, materialsRes, rmAllRes] = await Promise.all([
        supabase.from("raw_material_purchases").select("total_amount").eq("purchase_date", todayIso),
        supabase.from("worker_payments").select("amount").eq("payment_date", todayIso),
        supabase.from("sales_entries").select("total_amount").eq("status", "approved").gte("sale_date", monthIso).lte("sale_date", monthLast),
        supabase.from("expenses").select("amount").gte("expense_date", monthIso).lte("expense_date", monthLast),
        supabase.from("raw_material_purchases").select("total_amount").gte("purchase_date", monthIso).lte("purchase_date", monthLast),
        supabase.from("worker_payments").select("amount").gte("payment_date", monthIso).lte("payment_date", monthLast),
        supabase.from("raw_materials").select("id, name, unit, low_stock_threshold"),
        supabase.from("raw_material_purchases").select("material_id, quantity"),
      ]);
      const sum = (rows: any[] | null, k: string) => (rows ?? []).reduce((s, r) => s + Number(r[k] || 0), 0);
      const rmToday = sum(rmTodayRes.data, "total_amount");
      const wpToday = sum(wpTodayRes.data, "amount");
      const mSales = sum(monthSalesRes.data, "total_amount");
      const mExp = sum(monthExpRes.data, "amount");
      const mRm = sum(monthRmRes.data, "total_amount");
      const mWp = sum(monthWpRes.data, "amount");
      const stockMap = new Map<string, number>();
      (rmAllRes.data ?? []).forEach((p: any) => stockMap.set(p.material_id, (stockMap.get(p.material_id) ?? 0) + Number(p.quantity || 0)));
      const lowStock = (materialsRes.data ?? []).filter((m: any) => Number(m.low_stock_threshold || 0) > 0 && (stockMap.get(m.id) ?? 0) < Number(m.low_stock_threshold));
      return { rmToday, wpToday, netProfit: mSales - mExp - mRm - mWp, lowStock };
    },
  });

  const t = todayStatsQ.data;
  const due = dueQ.data;
  const sales = salesQ.data ?? [];
  const n = newStatsQ.data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight md:text-2xl">অ্যাডমিন ড্যাশবোর্ড</h1>
        <p className="text-sm text-muted-foreground">
          আজ {today.toLocaleDateString("bn-BD", { day: "2-digit", month: "long", year: "numeric" })}
        </p>
      </div>

      <QuickActions />

      {/* Compact key stats only — no charts */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {todayStatsQ.isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[110px] rounded-xl" />)
        ) : (
          <>
            <StatCard label="আজকের বিক্রয়" value={`৳ ${bn(t?.approvedAmount ?? 0)}`} icon={DollarSign} tone="success" />
            <StatCard label="আজকের কালেকশন" value={`৳ ${bn(t?.collection ?? 0)}`} icon={HandCoins} tone="primary" />
            <StatCard label="আজকের ডেলিভারি" value={bn(t?.deliveries ?? 0)} icon={Truck} tone="info" hint={`${bn(t?.challans ?? 0)} চালান`} />
            <StatCard label="অপেক্ষমাণ অনুমোদন" value={bn(t?.pending ?? 0)} icon={Clock} tone="warning" badge={t?.pending ?? 0} />
          </>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="মোট বকেয়া" value={`৳ ${bn(due?.due ?? 0)}`} icon={AlertTriangle} tone="destructive" />
        <StatCard label="মোট গ্রাহক" value={bn(customersQ.data ?? 0)} icon={Users} tone="primary" />
        <StatCard label="মাসিক লেনদেন" value={bn(sales.length)} icon={FileText} tone="info" />
        <StatCard label="হাতে নগদ" value={`৳ ${bn(0)}`} icon={Wallet} tone="success" hint="শীঘ্রই" />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="আজকের কাঁচামাল খরচ" value={`৳ ${bn(n?.rmToday ?? 0)}`} icon={Package} tone="warning" />
        <StatCard label="আজকের শ্রমিক খরচ" value={`৳ ${bn(n?.wpToday ?? 0)}`} icon={Users2} tone="warning" />
        <StatCard label="চলতি মাসের নিট লাভ" value={`৳ ${bn(n?.netProfit ?? 0)}`} icon={TrendingUp} tone={(n?.netProfit ?? 0) >= 0 ? "success" : "destructive"} />
        <StatCard label="কম স্টক সতর্কতা" value={bn(n?.lowStock?.length ?? 0)} icon={AlertTriangle} tone={(n?.lowStock?.length ?? 0) > 0 ? "destructive" : "info"} hint={(n?.lowStock ?? []).map((m: any) => m.name).join(", ") || "—"} />
      </div>

      <StockSummaryCard />

      {/* New: daily folders */}
      <DailyIncomeExpenseFolders />

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
