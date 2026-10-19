import { supabase } from "@/integrations/supabase/client";
import { sdb } from "@/lib/season-db";
import { fetchAllRows } from "@/lib/fetch-all";
import { isAssetCategory } from "@/lib/cash-queries";

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
  costs: { expenses: number; purchases: number; landRent: number; cleaning: number; vehicleRent: number; sardar: number; worker: number; ownerSalary: number; vehicle: number };
  totalCost: number;
  profit: number;
  /** fixed assets bought (expenses with the "সম্পদ — " category): cash out, not counted as cost */
  assets: number;
};

export async function fetchProfitLoss(filter: DateFilter = {}): Promise<ProfitLoss> {
  const [sales, exp, pur, sar, wrk, veh, own] = await Promise.all([
    fetchAllRows<{ total_amount: number; opening_balance_id: string | null }>(() =>
      ranged(sdb.from("sales_entries").select("id, total_amount, opening_balance_id").eq("status", "approved").order("id"), "sale_date", filter)),
    fetchAllRows<{ amount: number; category: string }>(() => ranged(sdb.from("expenses").select("id, amount, category").order("id"), "expense_date", filter)),
    fetchAllRows<{ total_amount: number; item_name: string }>(() => ranged(sdb.from("purchases").select("id, total_amount, item_name").order("id"), "purchase_date", filter)),
    fetchAllRows<{ amount: number }>(() => ranged(sdb.from("sardar_payments").select("id, amount").order("id"), "payment_date", filter)),
    fetchAllRows<{ amount: number }>(() => ranged(sdb.from("worker_payments").select("id, amount").order("id"), "payment_date", filter)),
    fetchAllRows<{ amount: number }>(() => ranged(sdb.from("vehicle_expenses").select("id, amount").order("id"), "expense_date", filter)),
    // owner salary taken (counted when paid, like staff salaries)
    fetchAllRows<{ amount: number }>(() => ranged(sdb.from("owner_transactions").select("id, amount").eq("txn_type", "salary").order("id"), "txn_date", filter)),
  ]);

  const salesTotal = total(sales, "total_amount");
  const salesFromOldAdvance = total(sales.filter((s) => !!s.opening_balance_id), "total_amount");
  const costs = {
    expenses: total(exp.filter((e) => !isAssetCategory(e.category))),
    // land rent (জমি ভাড়া) is its own line; previous-season dues are dated before the season so not counted
    purchases: total(pur.filter((p) => p.item_name !== "জমি ভাড়া" && p.item_name !== "পরিচ্ছন্ন কর্মী" && p.item_name !== "গাড়ি ভাড়া"), "total_amount"),
    landRent: total(pur.filter((p) => p.item_name === "জমি ভাড়া"), "total_amount"),
    cleaning: total(pur.filter((p) => p.item_name === "পরিচ্ছন্ন কর্মী"), "total_amount"),
    // hired vehicles, per trip (গাড়ি ভাড়া folder); "vehicle" below is the old vehicle_expenses table
    vehicleRent: total(pur.filter((p) => p.item_name === "গাড়ি ভাড়া"), "total_amount"),
    sardar: total(sar),
    worker: total(wrk),
    ownerSalary: total(own),
    vehicle: total(veh),
  };
  const totalCost = Object.values(costs).reduce((a, b) => a + b, 0);
  const assets = total(exp.filter((e) => isAssetCategory(e.category)));
  return { sales: salesTotal, salesFromOldAdvance, costs, totalCost, profit: salesTotal - totalCost, assets };
}

/** type: suppliers.material_type, e.g. "গাড়ি ভাড়া" for a vehicle owner */
export type SupplierDue = { id: string; name: string; type: string | null; bill: number; paid: number; due: number };

/**
 * What each supplier is still owed: all purchases − all supplier payments, over all time
 * (a due does not reset with the season, so this reads supabase, not sdb).
 * The purchases page shows the same figure for the selected season only.
 */
export async function fetchSupplierDues(): Promise<{ total: number; suppliers: SupplierDue[] }> {
  const [sup, pur, pay] = await Promise.all([
    fetchAllRows<{ id: string; name: string; material_type: string | null }>(() => supabase.from("suppliers").select("id, name, material_type").order("id")),
    fetchAllRows<{ supplier_id: string | null; total_amount: number }>(() => supabase.from("purchases").select("id, supplier_id, total_amount").order("id")),
    fetchAllRows<{ supplier_id: string | null; amount: number }>(() => supabase.from("supplier_payments").select("id, supplier_id, amount").order("id")),
  ]);

  const map = new Map<string, SupplierDue>();
  const get = (id: string) => {
    let s = map.get(id);
    if (!s) {
      const row = sup.find((x) => x.id === id);
      s = { id, name: row?.name ?? "নাম ছাড়া", type: row?.material_type ?? null, bill: 0, paid: 0, due: 0 };
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
