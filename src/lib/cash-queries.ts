import { supabase } from "@/integrations/supabase/client";
import { sdb } from "@/lib/season-db";

/**
 * মূল ক্যাশের একটিই হিসাব।
 *
 * নগদ আসে: চুক্তি বহির্ভূত কালেকশন (নগদ আয়)।
 * নগদ যায়: সাধারণ ব্যয় + সরদার পেমেন্ট + শ্রমিক পেমেন্ট + সরবরাহকারী পেমেন্ট
 *          + গাড়ি খরচ।
 *
 * সব জায়গায় (ড্যাশবোর্ড চিপ, আজকের আয়-ব্যয় বক্স) এই একই হিসাব ব্যবহার হয়,
 * তাই যেকোনো এন্ট্রি সাথে সাথে মূল ক্যাশে প্রভাব ফেলে।
 */

export type CashOutRow = {
  id: string;
  kind: "expense" | "sardar" | "worker" | "supplier" | "vehicle";
  category: string;
  amount: number;
  note: string | null;
  date: string;
  /** শুধু kind === "expense" হলে ড্যাশবোর্ড থেকে মুছে ফেলা যায় */
  deletable: boolean;
};

export type CashInRow = {
  id: string;
  label: string;
  amount: number;
  method: string | null;
  date: string;
};

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

/** নির্দিষ্ট পরিসরের (বা সব সময়ের) মোট নগদ আয়, ব্যয় ও নিট ব্যালেন্স */
export async function fetchCashSummary(filter: DateFilter = {}) {
  const [col, exp, sar, wrk, sup, veh, own, loans, lpay, opay] = await Promise.all([
    applyRange(sdb.from("collections").select("amount").is("contract_id", null), "payment_date", filter),
    applyRange(sdb.from("expenses").select("amount"), "expense_date", filter),
    applyRange(sdb.from("sardar_payments").select("amount"), "payment_date", filter),
    applyRange(sdb.from("worker_payments").select("amount"), "payment_date", filter),
    applyRange(sdb.from("supplier_payments").select("amount"), "payment_date", filter),
    applyRange(sdb.from("vehicle_expenses").select("amount"), "expense_date", filter),
    applyRange(sdb.from("owner_transactions").select("amount, txn_type"), "txn_date", filter),
    applyRange(sdb.from("loans").select("amount, direction"), "loan_date", filter),
    applyRange(sdb.from("loan_payments").select("amount, loan:loans(direction)"), "payment_date", filter),
    applyRange(sdb.from("opening_payments").select("amount, ob:opening_balances(kind)"), "payment_date", filter),
  ]);

  for (const r of [col, exp, sar, wrk, sup, veh, own, loans, lpay, opay]) {
    if (r.error) throw r.error;
  }

  const ownRows = (own.data ?? []) as any[];
  const loanRows = (loans.data ?? []) as any[];
  const lpayRows = (lpay.data ?? []) as any[];
  const opayRows = ((opay.data ?? []) as any[]).filter((p) => p.ob?.kind !== "customer_brick_due");
  const s = (rows: any[]) => rows.reduce((a, b) => a + Number(b.amount || 0), 0);

  const incomeBreakdown = {
    sales: sum(col.data as any),
    ownerInvest: s(ownRows.filter((r) => r.txn_type === "invest")),
    loanTaken: s(loanRows.filter((r) => r.direction === "taken")),
    loanReturned: s(lpayRows.filter((r) => r.loan?.direction === "given")),
  };
  const income = Object.values(incomeBreakdown).reduce((a, b) => a + b, 0);
  const breakdown = {
    expenses: sum(exp.data as any),
    sardar: sum(sar.data as any),
    worker: sum(wrk.data as any),
    supplier: sum(sup.data as any),
    vehicle: sum(veh.data as any),
    ownerWithdraw: s(ownRows.filter((r) => r.txn_type === "withdraw")),
    loanGiven: s(loanRows.filter((r) => r.direction === "given")),
    loanRepaid: s(lpayRows.filter((r) => r.loan?.direction === "taken")),
    openingPaid: s(opayRows),
  };
  const expense = Object.values(breakdown).reduce((a, b) => a + b, 0);
  return { income, expense, net: income - expense, breakdown, incomeBreakdown };
}

/** নির্দিষ্ট এক দিনের সব নগদ আয় ও নগদ ব্যয়ের বিস্তারিত তালিকা */
export async function fetchCashDay(dayIso: string) {
  const [col, exp, sar, wrk, sup, veh] = await Promise.all([
    sdb
      .from("collections")
      .select("id, amount, method, payment_date, customer:customers(name)")
      .is("contract_id", null)
      .eq("payment_date", dayIso)
      .order("created_at", { ascending: false }),
    sdb.from("expenses").select("id, category, amount, note, expense_date").eq("expense_date", dayIso).order("created_at", { ascending: false }),
    sdb
      .from("sardar_payments")
      .select("id, amount, note, payment_date, payment_type, sardar:sardars(name)")
      .eq("payment_date", dayIso)
      .order("created_at", { ascending: false }),
    sdb
      .from("worker_payments")
      .select("id, amount, note, payment_date, payment_type, worker:workers(name)")
      .eq("payment_date", dayIso)
      .order("created_at", { ascending: false }),
    sdb
      .from("supplier_payments")
      .select("id, amount, note, payment_date, supplier:suppliers(name)")
      .eq("payment_date", dayIso)
      .order("created_at", { ascending: false }),
    sdb
      .from("vehicle_expenses")
      .select("id, amount, note, category, expense_date, vehicle:vehicles(vehicle_no)")
      .eq("expense_date", dayIso)
      .order("created_at", { ascending: false }),
  ]);

  for (const r of [col, exp, sar, wrk, sup, veh]) {
    if (r.error) throw r.error;
  }

  const incomes: CashInRow[] = ((col.data ?? []) as any[]).map((c) => ({
    id: `col-${c.id}`,
    label: c.customer?.name ?? "—",
    amount: Number(c.amount),
    method: c.method,
    date: c.payment_date,
  }));

  const outs: CashOutRow[] = [
    ...((exp.data ?? []) as any[]).map((e) => ({
      id: e.id,
      kind: "expense" as const,
      category: e.category,
      amount: Number(e.amount),
      note: e.note,
      date: e.expense_date,
      deletable: true,
    })),
    ...((sar.data ?? []) as any[]).map((p) => ({
      id: p.id,
      kind: "sardar" as const,
      category: `সরদার পেমেন্ট — ${p.sardar?.name ?? "—"}${p.payment_type === "advance" ? " (অগ্রিম)" : ""}`,
      amount: Number(p.amount),
      note: p.note,
      date: p.payment_date,
      deletable: false,
    })),
    ...((wrk.data ?? []) as any[]).map((p) => ({
      id: p.id,
      kind: "worker" as const,
      category: `শ্রমিক পেমেন্ট — ${p.worker?.name ?? "—"}`,
      amount: Number(p.amount),
      note: p.note,
      date: p.payment_date,
      deletable: false,
    })),
    ...((sup.data ?? []) as any[]).map((p) => ({
      id: p.id,
      kind: "supplier" as const,
      category: `সরবরাহকারী পেমেন্ট — ${p.supplier?.name ?? "—"}`,
      amount: Number(p.amount),
      note: p.note,
      date: p.payment_date,
      deletable: false,
    })),
    ...((veh.data ?? []) as any[]).map((e) => ({
      id: e.id,
      kind: "vehicle" as const,
      category: `গাড়ি খরচ — ${e.vehicle?.vehicle_no ?? "—"} (${e.category})`,
      amount: Number(e.amount),
      note: e.note,
      date: e.expense_date,
      deletable: false,
    })),
  ];

  return { incomes, outs };
}

export type CashHistoryRow = { id: string; date: string; dir: "in" | "out"; head: string; detail: string; amount: number };

/** মূল ক্যাশের সব আয়-ব্যয়ের হিস্টোরি — fetchCashSummary-র সব খাত থেকে */
export async function fetchCashHistory(filter: DateFilter = {}): Promise<CashHistoryRow[]> {
  const [col, exp, sar, wrk, sup, own, loans, lpay, opay] = await Promise.all([
    applyRange(sdb.from("collections").select("id, amount, payment_date, note, customer:customers(name)").is("contract_id", null), "payment_date", filter),
    applyRange(sdb.from("expenses").select("id, amount, expense_date, category, note"), "expense_date", filter),
    applyRange(sdb.from("sardar_payments").select("id, amount, payment_date, note, sardar:sardars(name)"), "payment_date", filter),
    applyRange(sdb.from("worker_payments").select("id, amount, payment_date, note, worker:workers(name, role)"), "payment_date", filter),
    applyRange(sdb.from("supplier_payments").select("id, amount, payment_date, note, supplier:suppliers(name)"), "payment_date", filter),
    applyRange(sdb.from("owner_transactions").select("id, amount, txn_date, txn_type, note, owner:owners(name)"), "txn_date", filter),
    applyRange(sdb.from("loans").select("id, amount, loan_date, direction, party_name"), "loan_date", filter),
    applyRange(sdb.from("loan_payments").select("id, amount, payment_date, loan:loans(direction, party_name)"), "payment_date", filter),
    applyRange(sdb.from("opening_payments").select("id, amount, payment_date, ob:opening_balances(kind, party_name)"), "payment_date", filter),
  ]);
  for (const r of [col, exp, sar, wrk, sup, own, loans, lpay, opay]) if (r.error) throw r.error;
  const A = (x: any) => (x.data ?? []) as any[];
  const out: CashHistoryRow[] = [
    ...A(col).map((r) => ({ id: `c${r.id}`, date: r.payment_date, dir: "in" as const, head: "ইট বিক্রয় / কালেকশন", detail: r.customer?.name ?? "—", amount: Number(r.amount) })),
    ...A(exp).map((r) => ({ id: `e${r.id}`, date: r.expense_date, dir: "out" as const, head: r.category, detail: r.note ?? "", amount: Number(r.amount) })),
    ...A(sar).map((r) => ({ id: `s${r.id}`, date: r.payment_date, dir: "out" as const, head: "সরদার পেমেন্ট", detail: r.sardar?.name ?? "—", amount: Number(r.amount) })),
    ...A(wrk).map((r) => ({ id: `w${r.id}`, date: r.payment_date, dir: "out" as const, head: r.worker?.role === "daily" ? "ডেলি শ্রমিক" : "বেতন (মেস্তুরি/ম্যানেজার)", detail: r.worker?.name ?? "—", amount: Number(r.amount) })),
    ...A(sup).map((r) => ({ id: `p${r.id}`, date: r.payment_date, dir: "out" as const, head: "মালামাল ক্রয় পরিশোধ", detail: r.supplier?.name ?? "—", amount: Number(r.amount) })),
    ...A(own).map((r) => ({ id: `o${r.id}`, date: r.txn_date, dir: r.txn_type === "invest" ? ("in" as const) : ("out" as const), head: r.txn_type === "invest" ? "মালিকের বিনিয়োগ" : "মালিকের উত্তোলন", detail: r.owner?.name ?? "—", amount: Number(r.amount) })),
    ...A(loans).map((r) => ({ id: `l${r.id}`, date: r.loan_date, dir: r.direction === "taken" ? ("in" as const) : ("out" as const), head: r.direction === "taken" ? "ঋণ নেওয়া" : "ঋণ দেওয়া", detail: r.party_name, amount: Number(r.amount) })),
    ...A(lpay).map((r) => ({ id: `lp${r.id}`, date: r.payment_date, dir: r.loan?.direction === "given" ? ("in" as const) : ("out" as const), head: r.loan?.direction === "given" ? "দেওয়া ঋণ ফেরত" : "নেওয়া ঋণ পরিশোধ", detail: r.loan?.party_name ?? "—", amount: Number(r.amount) })),
    ...A(opay).filter((r) => r.ob?.kind !== "customer_brick_due").map((r) => ({ id: `op${r.id}`, date: r.payment_date, dir: "out" as const, head: "পূর্বের বকেয়া পরিশোধ", detail: r.ob?.party_name ?? "—", amount: Number(r.amount) })),
  ];
  return out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}
