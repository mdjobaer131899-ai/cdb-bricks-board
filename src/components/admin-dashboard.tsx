import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  FileText,
  Package,
  DollarSign,
  Truck,
  Clock,
  CheckCircle2,
  Users,
  Layers,
  Wallet,
  Landmark,
  HandCoins,
  AlertTriangle,
  Factory,
  Boxes,
  UserCheck,
  BookOpenCheck,
  TrendingUp,
  TrendingDown,
  Activity,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { StatCard } from "@/components/stat-card";
import { DateRangeFilter, type DateRange } from "@/components/date-range-filter";
import { RecentSalesTable } from "@/components/recent-sales-table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { fetchSales } from "@/lib/sales-queries";
import { bn, isoDate } from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";
import { AiAssistantFab } from "@/components/ai-assistant-fab";
import { CashBoxPanel } from "@/components/cash-box-panel";

const BN_MONTHS = ["জানু", "ফেব", "মার্চ", "এপ্রিল", "মে", "জুন", "জুলাই", "আগস্ট", "সেপ্ট", "অক্টো", "নভে", "ডিসে"];

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function AdminDashboard() {
  const today = useMemo(() => new Date(), []);
  const [range, setRange] = useState<DateRange>({ from: today, to: today });
  const from = isoDate(range.from);
  const to = isoDate(range.to);
  const todayIso = isoDate(today);

  // First day of 6 months ago
  const sixMonthStart = useMemo(() => {
    const d = new Date(today.getFullYear(), today.getMonth() - 5, 1);
    return isoDate(d);
  }, [today]);
  const monthStartIso = useMemo(
    () => isoDate(new Date(today.getFullYear(), today.getMonth(), 1)),
    [today],
  );

  // === Range-scoped sales (for filter + recent table) ===
  const salesQ = useQuery({
    queryKey: ["sales", "admin", from, to],
    queryFn: () => fetchSales({ from, to }),
  });

  // === Today's metrics ===
  const todayStatsQ = useQuery({
    queryKey: ["dash", "today", todayIso],
    queryFn: async () => {
      const [salesRes, payRes, colRes] = await Promise.all([
        supabase
          .from("sales_entries")
          .select("quantity, total_amount, status, vehicle_number")
          .eq("sale_date", todayIso),
        supabase
          .from("contract_payments")
          .select("amount")
          .eq("payment_date", todayIso),
        supabase
          .from("collections")
          .select("amount")
          .is("contract_id", null)
          .eq("payment_date", todayIso),
      ]);
      const sales = salesRes.data ?? [];
      const approved = sales.filter((s) => s.status === "approved");
      const vehicles = new Set(
        approved.map((s) => s.vehicle_number).filter((v): v is string => !!v && v.trim() !== ""),
      );
      const contractPay = (payRes.data ?? []).reduce((a, b) => a + Number(b.amount || 0), 0);
      const cashOnlyPay = (colRes.data ?? []).reduce((a, b) => a + Number(b.amount || 0), 0);
      return {
        challans: sales.length,
        approvedAmount: approved.reduce((a, b) => a + Number(b.total_amount || 0), 0),
        approvedBricks: approved.reduce((a, b) => a + Number(b.quantity || 0), 0),
        pending: sales.filter((s) => s.status === "pending").length,
        deliveries: vehicles.size,
        collection: contractPay + cashOnlyPay,
      };
    },
  });

  // === Customers / contracts counts ===
  const customersQ = useQuery({
    queryKey: ["customers-count"],
    queryFn: async () => {
      const { count } = await supabase.from("customers").select("id", { count: "exact", head: true });
      return count ?? 0;
    },
  });

  const contractsQ = useQuery({
    queryKey: ["contracts-active"],
    queryFn: async () => {
      const { data } = await supabase
        .from("contracts")
        .select("booked_value, advance_paid, status")
        .eq("status", "active");
      return data ?? [];
    },
  });

  // === Total due (all-time): approved sales amount - all collections ===
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
      const totalCollection = contractPay + cashOnlyPay;
      return { totalSales, totalCollection, due: Math.max(0, totalSales - totalCollection) };
    },
  });

  // === Monthly trend (last 6 months) ===
  const trendQ = useQuery({
    queryKey: ["dashboard-trend", sixMonthStart],
    queryFn: async () => {
      const [salesRes, payRes, colRes] = await Promise.all([
        supabase
          .from("sales_entries")
          .select("sale_date, total_amount, quantity, status")
          .gte("sale_date", sixMonthStart),
        supabase
          .from("contract_payments")
          .select("payment_date, amount")
          .gte("payment_date", sixMonthStart),
        supabase
          .from("collections")
          .select("payment_date, amount")
          .is("contract_id", null)
          .gte("payment_date", sixMonthStart),
      ]);
      return { sales: salesRes.data ?? [], payments: payRes.data ?? [], cashOnly: colRes.data ?? [] };
    },
  });

  // === This month metrics for P&L card ===
  const monthQ = useQuery({
    queryKey: ["dashboard-month", monthStartIso],
    queryFn: async () => {
      const [salesRes, payRes, colRes] = await Promise.all([
        supabase
          .from("sales_entries")
          .select("total_amount, status")
          .gte("sale_date", monthStartIso)
          .eq("status", "approved"),
        supabase
          .from("contract_payments")
          .select("amount")
          .gte("payment_date", monthStartIso),
        supabase
          .from("collections")
          .select("amount")
          .is("contract_id", null)
          .gte("payment_date", monthStartIso),
      ]);
      const sales = (salesRes.data ?? []).reduce((a, b) => a + Number(b.total_amount || 0), 0);
      const collection =
        (payRes.data ?? []).reduce((a, b) => a + Number(b.amount || 0), 0) +
        (colRes.data ?? []).reduce((a, b) => a + Number(b.amount || 0), 0);
      return { sales, collection };
    },
  });

  const monthly = useMemo(() => {
    const buckets = new Map<string, { key: string; label: string; sales: number; collection: number }>();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const k = monthKey(d);
      buckets.set(k, { key: k, label: BN_MONTHS[d.getMonth()], sales: 0, collection: 0 });
    }
    for (const s of trendQ.data?.sales ?? []) {
      if (s.status !== "approved") continue;
      const k = (s.sale_date as string).slice(0, 7);
      const b = buckets.get(k);
      if (b) b.sales += Number(s.total_amount || 0);
    }
    for (const p of trendQ.data?.payments ?? []) {
      const k = (p.payment_date as string).slice(0, 7);
      const b = buckets.get(k);
      if (b) b.collection += Number(p.amount || 0);
    }
    for (const p of trendQ.data?.cashOnly ?? []) {
      const k = (p.payment_date as string).slice(0, 7);
      const b = buckets.get(k);
      if (b) b.collection += Number(p.amount || 0);
    }
    return Array.from(buckets.values());
  }, [trendQ.data, today]);

  const sales = salesQ.data ?? [];
  const loading = salesQ.isLoading;

  const t = todayStatsQ.data;
  const due = dueQ.data;
  const month = monthQ.data;
  const activeContracts = contractsQ.data?.length ?? 0;
  const bookedOutstanding = (contractsQ.data ?? []).reduce(
    (a, b) => a + Math.max(0, Number(b.booked_value || 0) - Number(b.advance_paid || 0)),
    0,
  );

  const profit = (month?.sales ?? 0) - (month?.collection ?? 0); // surrogate metric, label clearly

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-bold tracking-tight md:text-2xl">অ্যাডমিন ড্যাশবোর্ড</h1>
        <p className="text-sm text-muted-foreground">
          আজ {today.toLocaleDateString("bn-BD", { day: "2-digit", month: "long", year: "numeric" })} — পুরো ব্যবসার রিয়েল-টাইম সারসংক্ষেপ
        </p>
      </div>

      {/* === Today's Snapshot === */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">আজকের সারসংক্ষেপ</h2>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {todayStatsQ.isLoading ? (
            Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[140px] rounded-xl" />)
          ) : (
            <>
              <StatCard label="আজকের বিক্রয়" value={`৳ ${bn(t?.approvedAmount ?? 0)}`} icon={DollarSign} tone="success" hint={`${bn(t?.approvedBricks ?? 0)} ইট অনুমোদিত`} />
              <StatCard label="আজকের কালেকশন" value={`৳ ${bn(t?.collection ?? 0)}`} icon={HandCoins} tone="primary" />
              <StatCard label="আজকের ডেলিভারি" value={bn(t?.deliveries ?? 0)} icon={Truck} tone="info" hint={`${bn(t?.challans ?? 0)} টি চালান`} />
              <StatCard label="অপেক্ষমাণ অনুমোদন" value={bn(t?.pending ?? 0)} icon={Clock} tone="warning" badge={t?.pending ?? 0} />
            </>
          )}
        </div>
      </section>

      {/* === Financial Overview === */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Wallet className="h-4 w-4 text-success" />
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">অর্থিক অবস্থা</h2>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {dueQ.isLoading ? (
            Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[140px] rounded-xl" />)
          ) : (
            <>
              <StatCard label="মোট বকেয়া" value={`৳ ${bn(due?.due ?? 0)}`} icon={AlertTriangle} tone="destructive" hint="অনুমোদিত বিক্রয় − কালেকশন" />
              <StatCard label="বুকিং বকেয়া" value={`৳ ${bn(bookedOutstanding)}`} icon={BookOpenCheck} tone="warning" hint="সক্রিয় চুক্তির বকেয়া" />
              <StatCard label="ক্যাশ ব্যালেন্স" value={`৳ ${bn(0)}`} icon={Wallet} tone="success" hint="শীঘ্রই — Accounts মডিউল" />
              <StatCard label="ব্যাংক ব্যালেন্স" value={`৳ ${bn(0)}`} icon={Landmark} tone="info" hint="শীঘ্রই — Accounts মডিউল" />
            </>
          )}
        </div>
      </section>

      {/* === Cash Box (Income / Expense) === */}
      <CashBoxPanel />

      {/* === Operations === */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Factory className="h-4 w-4 text-info" />
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">কার্যক্রম</h2>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          <StatCard label="আজকের উৎপাদন" value={bn(0)} icon={Factory} tone="primary" hint="শীঘ্রই" />
          <StatCard label="উপলব্ধ স্টক" value={bn(0)} icon={Boxes} tone="info" hint="শীঘ্রই" />
          <StatCard label="সক্রিয় গ্রাহক" value={bn(customersQ.data ?? 0)} icon={Users} tone="primary" />
          <StatCard label="সক্রিয় বুকিং" value={bn(activeContracts)} icon={FileText} tone="success" />
          <StatCard label="শ্রমিক হাজিরা" value={bn(0)} icon={UserCheck} tone="warning" hint="শীঘ্রই" />
          <StatCard label="ভ্যাট/অন্যান্য" value={bn(0)} icon={Layers} tone="destructive" hint="শীঘ্রই" />
        </div>
      </section>

      {/* === Charts === */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">মাসিক বিক্রয় গ্রাফ</CardTitle>
                <CardDescription>গত ৬ মাসের অনুমোদিত বিক্রয়</CardDescription>
              </div>
              <Badge variant="secondary" className="gap-1">
                <TrendingUp className="h-3 w-3" />৬ মাস
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-2">
            <div className="h-[240px] w-full">
              {trendQ.isLoading ? (
                <Skeleton className="h-full w-full" />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={monthly} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                    <defs>
                      <linearGradient id="salesG" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--success)" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="var(--success)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => bn(v)} />
                    <Tooltip
                      formatter={(v: number) => [`৳ ${bn(v)}`, "বিক্রয়"]}
                      contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8 }}
                    />
                    <Area type="monotone" dataKey="sales" stroke="var(--success)" strokeWidth={2} fill="url(#salesG)" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">বিক্রয় বনাম কালেকশন</CardTitle>
                <CardDescription>মাসিক তুলনা</CardDescription>
              </div>
              <Badge variant="secondary" className="gap-1">
                <TrendingDown className="h-3 w-3" />বকেয়া বুঝুন
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-2">
            <div className="h-[240px] w-full">
              {trendQ.isLoading ? (
                <Skeleton className="h-full w-full" />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthly} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => bn(v)} />
                    <Tooltip
                      formatter={(v: number, name) => [`৳ ${bn(v)}`, name === "sales" ? "বিক্রয়" : "কালেকশন"]}
                      contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8 }}
                    />
                    <Legend formatter={(v) => (v === "sales" ? "বিক্রয়" : "কালেকশন")} wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="sales" fill="var(--primary)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="collection" fill="var(--info)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>
      </section>

      {/* === P&L Summary === */}
      <section>
        <Card className="overflow-hidden">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">এ মাসের সারসংক্ষেপ</CardTitle>
            <CardDescription>চলতি মাসের বিক্রয়, কালেকশন ও বকেয়া পার্থক্য</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="rounded-lg border bg-success/5 p-4">
                <div className="flex items-center gap-2 text-success">
                  <TrendingUp className="h-4 w-4" />
                  <span className="text-xs font-medium uppercase tracking-wide">এ মাসের বিক্রয়</span>
                </div>
                <p className="mt-2 text-2xl font-bold">৳ {bn(month?.sales ?? 0)}</p>
              </div>
              <div className="rounded-lg border bg-primary/5 p-4">
                <div className="flex items-center gap-2 text-primary">
                  <HandCoins className="h-4 w-4" />
                  <span className="text-xs font-medium uppercase tracking-wide">এ মাসের কালেকশন</span>
                </div>
                <p className="mt-2 text-2xl font-bold">৳ {bn(month?.collection ?? 0)}</p>
              </div>
              <div className={`rounded-lg border p-4 ${profit >= 0 ? "bg-warning/5" : "bg-destructive/5"}`}>
                <div className={`flex items-center gap-2 ${profit >= 0 ? "text-warning" : "text-destructive"}`}>
                  <AlertTriangle className="h-4 w-4" />
                  <span className="text-xs font-medium uppercase tracking-wide">নেট পার্থক্য</span>
                </div>
                <p className="mt-2 text-2xl font-bold">৳ {bn(profit)}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">বিক্রয় − কালেকশন (এ মাসে বৃদ্ধি পাওয়া বকেয়া)</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* === Recent sales with range filter === */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Package className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">নির্বাচিত পরিসরের বিক্রয়</h2>
            <Badge variant="outline" className="gap-1">
              <CheckCircle2 className="h-3 w-3" />
              {bn(sales.length)} টি চালান
            </Badge>
          </div>
          <DateRangeFilter value={range} onChange={setRange} />
        </div>
        <RecentSalesTable entries={sales} loading={loading} isAdmin />
      </section>

      <AiAssistantFab />
    </div>
  );
}
