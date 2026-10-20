import { supabase } from "@/integrations/supabase/client";
import { sdb } from "@/lib/season-db";
import { fetchAllRows } from "@/lib/fetch-all";
import { RAW_TYPES, expenseHead, moneyHead, type MoneyGroup, type MoneyKey } from "@/lib/money-heads";

export { fetchAllRows };

/**
 * Profit/loss on an accrual basis — the one profit figure of the app. The profit page,
 * the season and annual reports all read this; nothing else computes a profit.
 *
 * Unlike fetchCashSummary (cash basis, used for hand cash everywhere), material is
 * counted at its bill value on the purchase date, whether paid or not. Supplier
 * payments are cash movements only and are NOT counted again as cost here.
 *
 * Every cost is a line tagged with its head from money-heads.ts, so the page groups
 * them the same way as the cash book and the forms, and a head opens its own lines.
 * Labour (sardar / worker / salary) is still counted by payments made.
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

/** one cost behind the profit figure */
export type PLLine = { key: MoneyKey; date: string; name: string; detail: string; amount: number };

export type ProfitLoss = {
  sales: number;
  /** approved challans by date, for month-by-month views */
  saleLines: Array<{ date: string; amount: number }>;
  /** Part of sales delivered against last year's advance (opening customer_brick_due) */
  salesFromOldAdvance: number;
  /** cost per head and per group (money-heads.ts) */
  byHead: Partial<Record<MoneyKey, number>>;
  byGroup: Partial<Record<MoneyGroup, number>>;
  lines: PLLine[];
  totalCost: number;
  profit: number;
  /** fixed assets bought (expenses with the "সম্পদ — " category): cash out, not counted as cost */
  assets: number;
  assetLines: PLLine[];
};

const CONTRACT_ITEM_HEAD: Record<string, MoneyKey> = { "জমি ভাড়া": "land", "পরিচ্ছন্ন কর্মী": "clean", "গাড়ি ভাড়া": "vehicle", "ভেকু": "veku" };

/**
 * `allSeasons`: read the date range as given, not inside the selected season
 * (the season comparison and the yearly report look at other seasons).
 */
export async function fetchProfitLoss(filter: DateFilter = {}, opts: { allSeasons?: boolean } = {}): Promise<ProfitLoss> {
  const db: any = opts.allSeasons ? supabase : sdb;
  const [sales, exp, pur, sar, wrk, veh, own, items] = await Promise.all([
    fetchAllRows<{ total_amount: number; sale_date: string; opening_balance_id: string | null }>(() =>
      ranged(db.from("sales_entries").select("id, total_amount, sale_date, opening_balance_id").eq("status", "approved").order("id"), "sale_date", filter)),
    fetchAllRows<{ amount: number; category: string; expense_date: string; note: string | null }>(() =>
      ranged(db.from("expenses").select("id, amount, category, expense_date, note").order("id"), "expense_date", filter)),
    fetchAllRows<{ total_amount: number; item_name: string; purchase_date: string; material_id: string | null; quantity: number; unit: string | null; supplier: { name: string } | null }>(() =>
      ranged(db.from("purchases").select("id, total_amount, item_name, purchase_date, material_id, quantity, unit, supplier:suppliers(name)").order("id"), "purchase_date", filter)),
    fetchAllRows<{ amount: number; payment_date: string; sardar: { name: string } | null }>(() =>
      ranged(db.from("sardar_payments").select("id, amount, payment_date, sardar:sardars(name)").order("id"), "payment_date", filter)),
    fetchAllRows<{ amount: number; payment_date: string; worker: { name: string; role: string } | null }>(() =>
      ranged(db.from("worker_payments").select("id, amount, payment_date, worker:workers(name, role)").order("id"), "payment_date", filter)),
    fetchAllRows<{ amount: number; expense_date: string; category: string | null }>(() =>
      ranged(db.from("vehicle_expenses").select("id, amount, expense_date, category").order("id"), "expense_date", filter)),
    // owner salary taken (counted when paid, like staff salaries)
    fetchAllRows<{ amount: number; txn_date: string; owner: { name: string } | null }>(() =>
      ranged(db.from("owner_transactions").select("id, amount, txn_date, owner:owners(name)").eq("txn_type", "salary").order("id"), "txn_date", filter)),
    supabase.from("raw_materials").select("id, name, item_group"),
  ]);

  // which purchases are raw material: catalog group, else the known raw names
  const rawIds = new Set(((items as any).data ?? []).filter((i: any) => i.item_group === "raw").map((i: any) => i.id as string));
  const rawNames = new Set([...RAW_TYPES, ...((items as any).data ?? []).filter((i: any) => i.item_group === "raw").map((i: any) => String(i.name).normalize("NFC"))]);
  const purchaseHead = (p: { item_name: string; material_id: string | null }): MoneyKey =>
    CONTRACT_ITEM_HEAD[p.item_name] ?? (p.material_id && rawIds.has(p.material_id) ? "raw" : rawNames.has((p.item_name ?? "").normalize("NFC")) ? "raw" : "parts");

  const lines: PLLine[] = [];
  const assetLines: PLLine[] = [];
  for (const p of pur) {
    const qty = Number(p.quantity) > 0 && p.unit ? ` · ${Number(p.quantity)} ${p.unit}` : "";
    lines.push({ key: purchaseHead(p), date: p.purchase_date, name: p.supplier?.name ?? "—", detail: `${p.item_name}${qty}`, amount: Number(p.total_amount || 0) });
  }
  for (const e of exp) {
    const h = expenseHead(e.category);
    const line = { key: h.key, date: e.expense_date, name: h.item || e.note || moneyHead(h.key).label, detail: h.item ? e.note ?? "" : "", amount: Number(e.amount || 0) };
    (h.key === "asset" ? assetLines : lines).push(line);
  }
  for (const r of sar) lines.push({ key: "sardar", date: r.payment_date, name: r.sardar?.name ?? "—", detail: "দেওয়া টাকা", amount: Number(r.amount || 0) });
  for (const r of wrk) lines.push({ key: r.worker?.role === "daily" ? "daily" : "staff", date: r.payment_date, name: r.worker?.name ?? "—", detail: "দেওয়া টাকা", amount: Number(r.amount || 0) });
  for (const r of own) lines.push({ key: "ownerSalary", date: r.txn_date, name: r.owner?.name ?? "—", detail: "বেতন", amount: Number(r.amount || 0) });
  for (const r of veh) lines.push({ key: "misc", date: r.expense_date, name: "গাড়ি খরচ", detail: r.category ?? "", amount: Number(r.amount || 0) });

  const byHead: Partial<Record<MoneyKey, number>> = {};
  const byGroup: Partial<Record<MoneyGroup, number>> = {};
  for (const l of lines) {
    byHead[l.key] = (byHead[l.key] ?? 0) + l.amount;
    const g = moneyHead(l.key).group;
    byGroup[g] = (byGroup[g] ?? 0) + l.amount;
  }
  lines.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  const salesTotal = total(sales, "total_amount");
  const salesFromOldAdvance = total(sales.filter((s) => !!s.opening_balance_id), "total_amount");
  const totalCost = lines.reduce((a, l) => a + l.amount, 0);
  return {
    sales: salesTotal,
    saleLines: sales.map((s) => ({ date: s.sale_date, amount: Number(s.total_amount || 0) })),
    salesFromOldAdvance,
    byHead,
    byGroup,
    lines,
    totalCost,
    profit: salesTotal - totalCost,
    assets: assetLines.reduce((a, l) => a + l.amount, 0),
    assetLines,
  };
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
