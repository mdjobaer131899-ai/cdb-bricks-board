import { supabase } from "@/integrations/supabase/client";
import { sdb } from "@/lib/season-db";
import { fetchAllRows } from "@/lib/fetch-all";
import { ASSET_PREFIX, expenseHead, moneyHead, supplierHead, type MoneyKey } from "@/lib/money-heads";

/**
 * মূল ক্যাশের একটিই হিসাব।
 *
 * নগদ আসে: সব কালেকশন (চুক্তির অগ্রিমও, কারণ টাকাটা হাতে আসে)।
 * নগদ যায়: সাধারণ ব্যয় + সরদার পেমেন্ট + শ্রমিক পেমেন্ট + সরবরাহকারী পেমেন্ট
 *          + গাড়ি খরচ।
 *
 * সব জায়গায় (ড্যাশবোর্ড চিপ, আজকের আয়-ব্যয় বক্স) এই একই হিসাব ব্যবহার হয়,
 * তাই যেকোনো এন্ট্রি সাথে সাথে মূল ক্যাশে প্রভাব ফেলে।
 */

/**
 * expenses.category prefix for fixed assets (the kiln's share of an excavator, a power line,
 * a transformer): cash goes out, but it is not this season's cost in the P&L.
 */
export { ASSET_PREFIX };
export const isAssetCategory = (c: string | null | undefined) => (c ?? "").normalize("NFC").startsWith(ASSET_PREFIX.normalize("NFC"));

/** collections.method used when bricks are given against a supplier due (see settle_supplier_with_bricks) */
export const BRICK_SETTLE_COLLECTION = "ইট দিয়ে সমন্বয়";

function sum(rows: Array<{ amount: number | string | null }> | null) {
  return (rows ?? []).reduce((a, b) => a + Number(b.amount || 0), 0);
}

type DateFilter = { from?: string; to?: string };

function applyRange<T>(q: T, column: string, f: DateFilter): T {
  let out: any = q;
  if (f.from) out = out.gte(column, f.from);
  if (f.to) out = out.lte(column, f.to);
  return out as T;
}

/**
 * Every row of a season-scoped table in the range, page by page, so a total is never cut
 * at the 1000-row API limit. Returns { data, error } like a single query did.
 */
async function rowsOf(table: string, select: string, column: string, f: DateFilter, extra?: (q: any) => any) {
  try {
    const data = await fetchAllRows<any>(() => {
      let q: any = applyRange((sdb as any).from(table).select(select.includes("id") ? select : `id, ${select}`), column, f);
      if (extra) q = extra(q);
      return q.order("id");
    });
    return { data, error: null as any };
  } catch (error) {
    return { data: [] as any[], error };
  }
}

/** নির্দিষ্ট পরিসরের (বা সব সময়ের) মোট নগদ আয়, ব্যয় ও নিট ব্যালেন্স */
export async function fetchCashSummary(filter: DateFilter = {}) {
  // every collection is cash that came in, a contract's advance too
  const [col, exp, sar, wrk, sup, veh, own, loans, lpay, opay] = await Promise.all([
    rowsOf("collections", "id, amount", "payment_date", filter),
    rowsOf("expenses", "id, amount, category", "expense_date", filter),
    rowsOf("sardar_payments", "id, amount", "payment_date", filter),
    rowsOf("worker_payments", "id, amount", "payment_date", filter),
    rowsOf("supplier_payments", "id, amount", "payment_date", filter),
    rowsOf("vehicle_expenses", "id, amount", "expense_date", filter),
    rowsOf("owner_transactions", "id, amount, txn_type", "txn_date", filter),
    rowsOf("loans", "id, amount, direction", "loan_date", filter),
    rowsOf("loan_payments", "id, amount, loan:loans(direction)", "payment_date", filter),
    rowsOf("opening_payments", "id, amount, ob:opening_balances(kind)", "payment_date", filter),
  ]);

  for (const r of [col, exp, sar, wrk, sup, veh, own, loans, lpay, opay]) {
    if (r.error) throw r.error;
  }

  const ownRows = (own.data ?? []) as any[];
  const loanRows = (loans.data ?? []) as any[];
  const lpayRows = (lpay.data ?? []) as any[];
  // পূর্বের জের: দায় পরিশোধ = ক্যাশ আউট, গ্রাহকের পুরোনো পাওনা আদায় = ক্যাশ ইন।
  // কোনোটাই চলতি সিজনের লাভ-ক্ষতিতে যায় না (breakdown-এ আলাদা কী দিয়ে রাখা)।
  const opAll = (opay.data ?? []) as any[];
  const opayRows = opAll.filter((p) => p.ob?.kind === "sardar_payable" || p.ob?.kind === "other_payable");
  const opayIn = opAll.filter((p) => p.ob?.kind === "customer_receivable");
  const s = (rows: any[]) => rows.reduce((a, b) => a + Number(b.amount || 0), 0);

  const incomeBreakdown = {
    sales: sum(col.data as any),
    ownerInvest: s(ownRows.filter((r) => r.txn_type === "invest")),
    loanTaken: s(loanRows.filter((r) => r.direction === "taken")),
    loanReturned: s(lpayRows.filter((r) => r.loan?.direction === "given")),
    openingCollected: s(opayIn),
  };
  const income = Object.values(incomeBreakdown).reduce((a, b) => a + b, 0);
  const expRows = (exp.data ?? []) as any[];
  const breakdown = {
    expenses: s(expRows.filter((r) => !isAssetCategory(r.category))),
    // fixed assets: cash out, but not a running cost
    assets: s(expRows.filter((r) => isAssetCategory(r.category))),
    sardar: sum(sar.data as any),
    worker: sum(wrk.data as any),
    supplier: sum(sup.data as any),
    vehicle: sum(veh.data as any),
    // owner salary is a business cost; a withdrawal comes out of the owner's investment
    ownerSalary: s(ownRows.filter((r) => r.txn_type === "salary")),
    ownerWithdraw: s(ownRows.filter((r) => r.txn_type === "withdraw")),
    loanGiven: s(loanRows.filter((r) => r.direction === "given")),
    loanRepaid: s(lpayRows.filter((r) => r.loan?.direction === "taken")),
    openingPaid: s(opayRows),
  };
  const expense = Object.values(breakdown).reduce((a, b) => a + b, 0);
  return { income, expense, net: income - expense, breakdown, incomeBreakdown };
}

/**
 * One cash book line. `key` is the head from money-heads.ts and `head` its label, so every
 * page shows the same name; `detail` is who or what (a person, a supplier, "চা"), `note`
 * the typed note. `locked` rows belong to a brick settlement or a cash challan and are changed
 * from the challan.
 */
export type CashHistoryRow = {
  id: string; date: string; dir: "in" | "out"; key: MoneyKey; head: string; detail: string; note: string; amount: number; locked?: boolean;
};

/** মূল ক্যাশের সব আয়-ব্যয়ের হিস্টোরি — fetchCashSummary-র সব খাত থেকে */
export async function fetchCashHistory(filter: DateFilter = {}): Promise<CashHistoryRow[]> {
  const [col, exp, sar, wrk, sup, own, loans, lpay, opay] = await Promise.all([
    rowsOf("collections", "id, amount, payment_date, note, method, cash_sale, customer:customers(name), contract:contracts(contract_no)", "payment_date", filter),
    rowsOf("expenses", "id, amount, expense_date, category, note", "expense_date", filter),
    rowsOf("sardar_payments", "id, amount, payment_date, note, sardar:sardars(name)", "payment_date", filter),
    rowsOf("worker_payments", "id, amount, payment_date, note, worker:workers(name, role)", "payment_date", filter),
    rowsOf("supplier_payments", "id, amount, payment_date, note, method, supplier:suppliers(name, material_type)", "payment_date", filter),
    rowsOf("owner_transactions", "id, amount, txn_date, txn_type, note, owner:owners(name)", "txn_date", filter),
    rowsOf("loans", "id, amount, loan_date, direction, party_name, note", "loan_date", filter),
    rowsOf("loan_payments", "id, amount, payment_date, note, loan:loans(direction, party_name)", "payment_date", filter),
    rowsOf("opening_payments", "id, amount, payment_date, note, ob:opening_balances(kind, party_name, sardar:sardars(name), worker:workers(name), customer:customers(name))", "payment_date", filter),
  ]);
  for (const r of [col, exp, sar, wrk, sup, own, loans, lpay, opay]) if (r.error) throw r.error;
  const A = (x: any) => (x.data ?? []) as any[];
  const row = (id: string, date: string, dir: "in" | "out", key: MoneyKey, detail: string, note: string | null, amount: number, locked = false): CashHistoryRow =>
    ({ id, date, dir, key, head: moneyHead(key).label, detail: detail || "—", note: note ?? "", amount: Number(amount), locked });
  const out: CashHistoryRow[] = [
    // Bricks given against a supplier due: a brick sale (in) and the due paid (out) of the same amount, so hand cash is unchanged
    // Money taken with a cash challan: written by the challan (trigger), changed only from it
    ...A(col).map((r) => r.method === BRICK_SETTLE_COLLECTION
      ? row(`c${r.id}`, r.payment_date, "in", "sale", `${r.customer?.name ?? "—"} (বাকির বদলে ইট)`, r.note, r.amount, true)
      : r.cash_sale
      ? row(`c${r.id}`, r.payment_date, "in", "sale", `${r.customer?.name ?? "—"} (নগদ চালান)`, r.note, r.amount, true)
      : row(`c${r.id}`, r.payment_date, "in", "sale", `${r.customer?.name ?? "—"}${r.contract?.contract_no ? ` (চুক্তি ${r.contract.contract_no})` : ""}`, r.note, r.amount)),
    ...A(exp).map((r) => {
      const h = expenseHead(r.category);
      return row(`e${r.id}`, r.expense_date, "out", h.key, h.item || r.note || moneyHead(h.key).label, h.item ? r.note : null, r.amount);
    }),
    ...A(sar).map((r) => row(`s${r.id}`, r.payment_date, "out", "sardar", r.sardar?.name ?? "—", r.note, r.amount)),
    ...A(wrk).map((r) => row(`w${r.id}`, r.payment_date, "out", r.worker?.role === "daily" ? "daily" : "staff", r.worker?.name ?? "—", r.note, r.amount)),
    ...A(sup).map((r) => r.method === "bricks"
      ? row(`p${r.id}`, r.payment_date, "out", supplierHead(r.supplier?.material_type), `${r.supplier?.name ?? "—"} (ইট দিয়ে শোধ)`, r.note, r.amount, true)
      : row(`p${r.id}`, r.payment_date, "out", supplierHead(r.supplier?.material_type), r.supplier?.name ?? "—", r.note, r.amount)),
    ...A(own).map((r) => row(`o${r.id}`, r.txn_date, r.txn_type === "invest" ? "in" : "out", r.txn_type === "invest" ? "ownerInvest" : r.txn_type === "salary" ? "ownerSalary" : "ownerWithdraw", r.owner?.name ?? "—", r.note, r.amount)),
    ...A(loans).map((r) => row(`l${r.id}`, r.loan_date, r.direction === "taken" ? "in" : "out", r.direction === "taken" ? "loanIn" : "loanGive", r.party_name, r.note, r.amount)),
    ...A(lpay).map((r) => row(`lp${r.id}`, r.payment_date, r.loan?.direction === "given" ? "in" : "out", r.loan?.direction === "given" ? "loanBack" : "loanRepay", r.loan?.party_name ?? "—", r.note, r.amount)),
    ...A(opay).filter((r) => r.ob?.kind !== "customer_brick_due").map((r) => {
      const isIn = r.ob?.kind === "customer_receivable";
      const who = (r.ob as any)?.sardar?.name ?? (r.ob as any)?.worker?.name ?? (r.ob as any)?.customer?.name ?? r.ob?.party_name ?? "—";
      return row(`op${r.id}`, r.payment_date, isIn ? "in" : "out", isIn ? "openingIn" : "openingOut", who, r.note, r.amount);
    }),
  ];
  return out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}
