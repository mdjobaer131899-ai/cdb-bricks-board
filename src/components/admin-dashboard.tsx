import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Package, CheckCircle2 } from "lucide-react";
import { DateRangeFilter, type DateRange } from "@/components/date-range-filter";
import { RecentSalesTable } from "@/components/recent-sales-table";
import { Badge } from "@/components/ui/badge";
import { fetchSales } from "@/lib/sales-queries";
import { bn, isoDate } from "@/lib/format";
import { AiAssistantFab } from "@/components/ai-assistant-fab";
import { StockSummaryCard } from "@/components/stock-summary-card";
import { DashboardToday } from "@/components/dashboard-today";
import { BrandLogo } from "@/components/brand-logo";
import { CashBalanceChip } from "@/components/cash-balance-chip";

export function AdminDashboard({ navGrid }: { navGrid?: React.ReactNode }) {
  const today = useMemo(() => new Date(), []);
  const [range, setRange] = useState<DateRange>({ from: today, to: today });
  const from = isoDate(range.from);
  const to = isoDate(range.to);

  const salesQ = useQuery({
    queryKey: ["sales", "admin", from, to],
    queryFn: () => fetchSales({ from, to }),
  });

  const sales = salesQ.data ?? [];


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
              আজ {today.toLocaleDateString("bn-BD", { day: "2-digit", month: "long", year: "numeric" })}
            </p>
          </div>
          <CashBalanceChip />
        </div>
      </div>

      {navGrid}

      <DashboardToday />

      <StockSummaryCard />

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
