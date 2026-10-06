import { createFileRoute } from "@tanstack/react-router";
import { CashBoxPanel } from "@/components/cash-box-panel";
import { DailyIncomeExpenseFolders } from "@/components/daily-folders";

export const Route = createFileRoute("/_authenticated/cash-book")({
  component: CashBookPage,
});

function CashBookPage() {
  return (
    <div className="space-y-6 pb-20">
      <CashBoxPanel />
      <DailyIncomeExpenseFolders />
    </div>
  );
}