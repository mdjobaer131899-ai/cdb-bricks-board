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
  const [col, exp, sar, wrk, sup, veh] = await Promise.all([
    applyRange(sdb.from("collections").select("amount").is("contract_id", null), "payment_date", filter),
    applyRange(sdb.from("expenses").select("amount"), "expense_date", filter),
    applyRange(sdb.from("sardar_payments").select("amount"), "payment_date", filter),
    applyRange(sdb.from("worker_payments").select("amount"), "payment_date", filter),
    applyRange(sdb.from("supplier_payments").select("amount"), "payment_date", filter),
    applyRange(sdb.from("vehicle_expenses").select("amount"), "expense_date", filter),
  ]);

  for (const r of [col, exp, sar, wrk, sup, veh]) {
    if (r.error) throw r.error;
  }

  const income = sum(col.data as any);
  const breakdown = {
    expenses: sum(exp.data as any),
    sardar: sum(sar.data as any),
    worker: sum(wrk.data as any),
    supplier: sum(sup.data as any),
    vehicle: sum(veh.data as any),
  };
  const expense = Object.values(breakdown).reduce((a, b) => a + b, 0);
  return { income, expense, net: income - expense, breakdown };
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
