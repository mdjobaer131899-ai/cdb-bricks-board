import { supabase } from "@/integrations/supabase/client";
import { getSeasonRange, sdb } from "@/lib/season-db";
import { fetchAllRows } from "@/lib/fetch-all";
import { RAW_TYPES, expenseHead, moneyHead, type MoneyGroup, type MoneyKey } from "@/lib/money-heads";
import { SARDAR_EARNING_TYPES, dailyDays, salaryDays, type AccrualRange, type PayRate } from "@/lib/salary-accrual";
import { bn } from "@/lib/format";

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
 * Labour is counted by work done, not by money handed over (salary-accrual.ts, the
 * same rules as the sardar, staff and owner pages): a sardar's kacha / load / unload
 * entries on their dates (burn sardars by monthly salary), daily workers for every
 * day present, staff and owner salary day by day. Payments to them (and dadan) are
 * cash only; what is still owed or paid ahead shows on /dues.
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
  const [sales, exp, pur, kacha, work, veh, items, sardars, workers, att, rates, owners] = await Promise.all([
    fetchAllRows<{ total_amount: number; sale_date: string; opening_balance_id: string | null }>(() =>
      ranged(db.from("sales_entries").select("id, total_amount, sale_date, opening_balance_id").eq("status", "approved").order("id"), "sale_date", filter)),
    fetchAllRows<{ amount: number; category: string; expense_date: string; note: string | null }>(() =>
      ranged(db.from("expenses").select("id, amount, category, expense_date, note").order("id"), "expense_date", filter)),
    fetchAllRows<{ total_amount: number; item_name: string; purchase_date: string; material_id: string | null; quantity: number; unit: string | null; supplier: { name: string } | null }>(() =>
      ranged(db.from("purchases").select("id, total_amount, item_name, purchase_date, material_id, quantity, unit, supplier:suppliers(name)").order("id"), "purchase_date", filter)),
    // sardar work: kacha / load / unload wage lines and old per-category work entries
    fetchAllRows<{ entry_date: string; entry_type: string; sardar_id: string | null; quantity: number; amount: number }>(() =>
      ranged(db.from("kacha_brick_entries").select("id, entry_date, entry_type, sardar_id, quantity, amount").order("id"), "entry_date", filter)),
    fetchAllRows<{ entry_date: string; sardar_id: string | null; quantity: number; amount: number }>(() =>
      ranged(db.from("sardar_work_entries").select("id, entry_date, sardar_id, quantity, amount").order("id"), "entry_date", filter)),
    fetchAllRows<{ amount: number; expense_date: string; category: string | null }>(() =>
      ranged(db.from("vehicle_expenses").select("id, amount, expense_date, category").order("id"), "expense_date", filter)),
    supabase.from("raw_materials").select("id, name, item_group"),
    fetchAllRows<any>(() => supabase.from("sardars").select("id, name, kind, monthly_salary, join_date, leave_date").order("id")),
    fetchAllRows<any>(() => supabase.from("workers").select("id, name, role, daily_wage, monthly_salary, join_date, leave_date").order("id")),
    fetchAllRows<{ worker_id: string; date: string; present: boolean; is_half_day: boolean }>(() =>
      ranged(db.from("worker_attendance").select("id, worker_id, date, present, is_half_day").order("id"), "date", filter)),
    fetchAllRows<PayRate & { owner_id?: string | null }>(() => (supabase as any).from("pay_rates").select("id, worker_id, sardar_id, owner_id, amount, effective_from").order("id")),
    fetchAllRows<{ id: string; name: string }>(() => supabase.from("owners").select("id, name").order("id")),
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
  lines.push(...labourLines({ filter, allSeasons: !!opts.allSeasons, kacha, work, sardars, workers, att, rates, owners }));
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

const BN_MONTH = ["জানুয়ারি", "ফেব্রুয়ারি", "মার্চ", "এপ্রিল", "মে", "জুন", "জুলাই", "আগস্ট", "সেপ্টেম্বর", "অক্টোবর", "নভেম্বর", "ডিসেম্বর"];
const monthName = (d: string) => BN_MONTH[Number(d.slice(5, 7)) - 1] ?? d.slice(0, 7);
const KACHA_LABEL: Record<string, string> = { production: "কাঁচা ইট", load: "লোড", unload: "আনলোড" };

/** one line per person per calendar month, dated on the last day counted that month */
function byMonth(key: MoneyKey, name: string, days: Array<{ date: string; amount: number; value?: number }>, detail: (m: { days: number; count: number }) => string): PLLine[] {
  const m = new Map<string, { date: string; amount: number; days: number; count: number }>();
  for (const d of days) {
    const k = d.date.slice(0, 7);
    const cur = m.get(k) ?? { date: d.date, amount: 0, days: 0, count: 0 };
    cur.amount += d.amount;
    cur.days += d.value ?? 1;
    cur.count += 1;
    if (d.date > cur.date) cur.date = d.date;
    m.set(k, cur);
  }
  return [...m.values()]
    .filter((x) => Math.abs(x.amount) >= 0.5)
    .map((x) => ({ key, date: x.date, name, detail: `${monthName(x.date)} · ${detail(x)}`, amount: Math.round(x.amount) }));
}

/** labour cost by work done in the range (see fetchProfitLoss) */
function labourLines(p: {
  filter: DateFilter; allSeasons: boolean;
  kacha: Array<{ entry_date: string; entry_type: string; sardar_id: string | null; quantity: number; amount: number }>;
  work: Array<{ entry_date: string; sardar_id: string | null; quantity: number; amount: number }>;
  sardars: any[]; workers: any[];
  att: Array<{ worker_id: string; date: string; present: boolean; is_half_day: boolean }>;
  rates: Array<PayRate & { owner_id?: string | null }>;
  owners: Array<{ id: string; name: string }>;
}): PLLine[] {
  const out: PLLine[] = [];
  const { filter } = p;
  const inFilter = (d: string) => (!filter.from || d >= filter.from) && (!filter.to || d <= filter.to);
  // salaries accrue inside the selected season (as on the staff pages); another range
  // (season and yearly reports) is read as given
  const range: AccrualRange = p.allSeasons ? { from: filter.from ?? null, to: filter.to ?? null } : getSeasonRange();
  const sardarName = new Map(p.sardars.map((s) => [s.id as string, String(s.name ?? "—")]));
  const burn = new Set(p.sardars.filter((s) => s.kind === "burn").map((s) => s.id as string));

  // sardars: their kacha / load / unload wage lines and work entries, by month
  const sm = new Map<string, Array<{ date: string; amount: number; what: string; qty: number }>>();
  const push = (id: string | null, x: { date: string; amount: number; what: string; qty: number }) => {
    const k = id ?? "";
    if (!sm.has(k)) sm.set(k, []);
    sm.get(k)!.push(x);
  };
  for (const k of p.kacha) {
    if (!SARDAR_EARNING_TYPES.has(k.entry_type) || (k.sardar_id && burn.has(k.sardar_id))) continue;
    push(k.sardar_id, { date: k.entry_date, amount: Number(k.amount || 0), what: KACHA_LABEL[k.entry_type] ?? k.entry_type, qty: Number(k.quantity || 0) });
  }
  for (const w of p.work) {
    if (w.sardar_id && burn.has(w.sardar_id)) continue;
    push(w.sardar_id, { date: w.entry_date, amount: Number(w.amount || 0), what: "কাজ", qty: Number(w.quantity || 0) });
  }
  for (const [id, rows] of sm) {
    const months = new Map<string, typeof rows>();
    for (const r of rows) {
      const k = r.date.slice(0, 7);
      if (!months.has(k)) months.set(k, []);
      months.get(k)!.push(r);
    }
    for (const list of months.values()) {
      const amount = list.reduce((a, r) => a + r.amount, 0);
      if (Math.abs(amount) < 0.5) continue;
      const qty = new Map<string, number>();
      for (const r of list) qty.set(r.what, (qty.get(r.what) ?? 0) + r.qty);
      const date = list.reduce((a, r) => (r.date > a ? r.date : a), list[0].date);
      out.push({
        key: "sardar", date, name: id ? sardarName.get(id) ?? "—" : "সরদার দেওয়া নেই",
        detail: `${monthName(date)} · ${[...qty].map(([w, q]) => `${w} ${bn(q)}`).join(" · ")}`, amount: Math.round(amount),
      });
    }
  }
  // burn sardars (পুড়াই মেস্তুরি): monthly salary
  for (const s of p.sardars.filter((x) => burn.has(x.id))) {
    const days = salaryDays({ monthly: s.monthly_salary, join: s.join_date, leave: s.leave_date, rates: p.rates.filter((r) => r.sardar_id === s.id), range }).filter((d) => inFilter(d.date));
    out.push(...byMonth("sardar", String(s.name ?? "—"), days, (m) => `বেতন ${bn(m.count)} দিন`));
  }

  // daily workers: every day present unless marked; staff: salary day by day less absences
  for (const w of p.workers) {
    const mine = p.att.filter((a) => a.worker_id === w.id);
    const rates = p.rates.filter((r) => r.worker_id === w.id);
    if (w.role === "daily") {
      const days = dailyDays({
        wage: w.daily_wage, join: w.join_date, leave: w.leave_date, rates, range,
        marks: mine.map((a) => ({ date: a.date, present: a.present !== false, half: !!a.is_half_day })),
      }).filter((d) => inFilter(d.date));
      out.push(...byMonth("daily", String(w.name ?? "—"), days, (m) => `${bn(m.days)} দিন হাজিরা`));
    } else {
      const days = salaryDays({
        monthly: w.monthly_salary, join: w.join_date, leave: w.leave_date, rates, range,
        absences: mine.filter((a) => a.present === false || a.is_half_day).map((a) => ({ date: a.date, half: a.is_half_day })),
      }).filter((d) => inFilter(d.date));
      out.push(...byMonth("staff", String(w.name ?? "—"), days, (m) => `বেতন ${bn(m.count)} দিন`));
    }
  }

  // owners' salary: from their first salary rate, like the owners page
  for (const o of p.owners) {
    const rates = p.rates.filter((r) => r.owner_id === o.id).sort((a, b) => (a.effective_from < b.effective_from ? -1 : 1));
    if (!rates.length) continue;
    const days = salaryDays({ monthly: 0, join: rates[0].effective_from, rates, range }).filter((d) => inFilter(d.date));
    out.push(...byMonth("ownerSalary", o.name, days, (m) => `বেতন ${bn(m.count)} দিন`));
  }
  return out;
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
