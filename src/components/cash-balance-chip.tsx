import { useQuery } from "@tanstack/react-query";
import { Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { sdb } from "@/lib/season-db";
import { bn } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";

async function fetchCashBalance() {
  const [colRes, expRes] = await Promise.all([
    sdb.from("collections").select("amount").is("contract_id", null),
    sdb.from("expenses").select("amount"),
  ]);
  if (colRes.error) throw colRes.error;
  if (expRes.error) throw expRes.error;
  const income = (colRes.data ?? []).reduce((a, b) => a + Number(b.amount || 0), 0);
  const expense = (expRes.data ?? []).reduce((a, b) => a + Number(b.amount || 0), 0);
  return income - expense;
}

export function CashBalanceChip() {
  const q = useQuery({ queryKey: ["cash-balance-total"], queryFn: fetchCashBalance });
  const net = q.data ?? 0;
  const positive = net >= 0;
  return (
    <div
      className={`flex min-w-[150px] items-center gap-2 rounded-xl border px-3 py-2 shadow-sm ${
        positive
          ? "border-success/40 bg-gradient-to-br from-success/15 to-success/5 text-success"
          : "border-destructive/40 bg-gradient-to-br from-destructive/15 to-destructive/5 text-destructive"
      }`}
    >
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-background/70 ring-1 ring-current/20">
        <Wallet className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-medium uppercase tracking-wide opacity-80">হাতে নগদ</p>
        {q.isLoading ? (
          <Skeleton className="mt-1 h-5 w-20" />
        ) : (
          <p className="text-base font-extrabold leading-tight">৳ {bn(Math.abs(net))}</p>
        )}
      </div>
    </div>
  );
}
