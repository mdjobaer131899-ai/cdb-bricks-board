import { supabase } from "@/integrations/supabase/client";
import { sdb } from "@/lib/season-db";
import { fetchAllRows } from "@/lib/fetch-all";

export { fetchAllRows };

/**
 * Profit/loss on an accrual basis, and what the kiln owes suppliers.
 *
 * Unlike fetchCashSummary (cash basis, used for hand cash everywhere), material is
 * counted at its bill value on the purchase date, whether paid or not. Supplier
 * payments are cash movements only and are NOT counted again as cost here.
 *
 * Labour (sardar / worker / salary) is still counted by payments made, because
 * the earned-wage figures are not yet season-correct (OVERVIEW 8.1 items 4 and 5).
 */

type DateFilter = { from?: string; to?: string };

function ranged(q: any, column: string, f: DateFilter) {
  let out = q;
  if (f.from) out = out.gte(column, f.from);
  if (f.to) out = out.lte(column, f.to);
  return out;
}

const total = (rows: Array<{ amount?: number | string | null; total_amount?: number | string | null }>, key: "amount" | "total_amount" = "amount") =>
  rows.reduce((a, r) => a + Number((r as any)[key] || 0), 0);

export type ProfitLoss = {
  sales: number;
  /** Part of sales delivered against last year's advance (opening customer_brick_due) */
  salesFromOldAdvance: number;
  costs: { expenses: number; purchases: number; sardar: number; worker: number; vehicle: number };
  totalCost: number;
  profit: number;
};

export async function fetchProfitLoss(filter: DateFilter = {}): Promise<ProfitLoss> {
  const [sales, exp, pur, sar, wrk, veh] = await Promise.all([
    fetchAllRows<{ total_amount: number; opening_balance_id: string | null }>(() =>
      ranged(sdb.from("sales_entries").select("id, total_amount, opening_balance_id").eq("status", "approved").order("id"), "sale_date", filter)),
    fetchAllRows<{ amount: number }>(() => ranged(sdb.from("expenses").select("id, amount").order("id"), "expense_date", filter)),
    fetchAllRows<{ total_amount: number }>(() => ranged(sdb.from("purchases").select("id, total_amount").order("id"), "purchase_date", filter)),
    fetchAllRows<{ amount: number }>(() => ranged(sdb.from("sardar_payments").select("id, amount").order("id"), "payment_date", filter)),
    fetchAllRows<{ amount: number }>(() => ranged(sdb.from("worker_payments").select("id, amount").order("id"), "payment_date", filter)),
    fetchAllRows<{ amount: number }>(() => ranged(sdb.from("vehicle_expenses").select("id, amount").order("id"), "expense_date", filter)),
  ]);

  const salesTotal = total(sales, "total_amount");
  const salesFromOldAdvance = total(sales.filter((s) => !!s.opening_balance_id), "total_amount");
  const costs = {
    expenses: total(exp),
    purchases: total(pur, "total_amount"),
    sardar: total(sar),
    worker: total(wrk),
    vehicle: total(veh),
  };
  const totalCost = Object.values(costs).reduce((a, b) => a + b, 0);
  return { sales: salesTotal, salesFromOldAdvance, costs, totalCost, profit: salesTotal - totalCost };
}

export type SupplierDue = { id: string; name: string; bill: number; paid: number; due: number };

/**
 * What each supplier is still owed: all purchases − all supplier payments, over all time
 * (a due does not reset with the season, so this reads supabase, not sdb).
 * The purchases page shows the same figure for the selected season only.
 */
export async function fetchSupplierDues(): Promise<{ total: number; suppliers: SupplierDue[] }> {
  const [sup, pur, pay] = await Promise.all([
    fetchAllRows<{ id: string; name: string }>(() => supabase.from("suppliers").select("id, name").order("id")),
    fetchAllRows<{ supplier_id: string | null; total_amount: number }>(() => supabase.from("purchases").select("id, supplier_id, total_amount").order("id")),
    fetchAllRows<{ supplier_id: string | null; amount: number }>(() => supabase.from("supplier_payments").select("id, supplier_id, amount").order("id")),
  ]);

  const map = new Map<string, SupplierDue>();
  const get = (id: string) => {
    let s = map.get(id);
    if (!s) {
      s = { id, name: sup.find((x) => x.id === id)?.name ?? "নাম ছাড়া", bill: 0, paid: 0, due: 0 };
      map.set(id, s);
    }
    return s;
  };
  for (const p of pur) get(p.supplier_id ?? "__none__").bill += Number(p.total_amount || 0);
  for (const p of pay) get(p.supplier_id ?? "__none__").paid += Number(p.amount || 0);

  const suppliers = [...map.values()]
    .map((s) => ({ ...s, due: s.bill - s.paid }))
    .filter((s) => Math.abs(s.due) >= 1)
    .sort((a, b) => b.due - a.due);
  const totalDue = suppliers.reduce((a, s) => a + s.due, 0);
  return { total: totalDue, suppliers };
}
