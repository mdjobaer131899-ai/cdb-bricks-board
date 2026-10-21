import { supabase } from "@/integrations/supabase/client";
import { getSeasonRange, sdb } from "@/lib/season-db";
import { fetchAllRows } from "@/lib/fetch-all";
import { bn } from "@/lib/format";
import { MONEY_HEADS, RAW_TYPES, expenseHead, moneyHead, supplierHead, type MoneyGroup, type MoneyKey } from "@/lib/money-heads";
import { SARDAR_EARNING_TYPES, dailyDays, salaryDays, type PayRate } from "@/lib/salary-accrual";

/**
 * খরচের খাতা (read only): one folder per money-out head, the people or items inside,
 * and each one's dated lines with a running balance. Nothing is written here; a line
 * links to the page where it is changed (the cash book for money and bills, the
 * production or attendance page for work).
 *
 * The numbers follow the same rules as the rest of the app:
 *  - labour (sardar, daily, staff, owner salary): work done in the selected season
 *    (salary-accrual.ts) against money given in the season, plus last season's unpaid
 *    wage (opening balances) and what was paid on it;
 *  - sellers, veku, vehicle, land, sweeper: all bills and payments ever (a due does not
 *    reset), the part before the season start shown as one "আগের জের" line;
 *  - cash-only heads (electricity, misc, assets, owner withdrawal): what was spent;
 *  - loans and old dues: all time.
 */

export type LedgerLink = { to: string; search?: Record<string, string> };

export type LedgerLine = {
  id: string;
  date: string;
  /** what happened ("কাঁচা ইট ১০,০০০ পিস", "টাকা দিলাম") */
  text: string;
  sub?: string;
  /** raises what we owe (a bill, work done, a loan given out) */
  bill: number;
  /** lowers it (money handed over, a loan paid back to us) */
  paid: number;
  /** where this line is changed or deleted */
  link?: LedgerLink;
  linkLabel?: string;
};

export type LedgerPerson = {
  id: string;
  name: string;
  sub?: string;
  lines: LedgerLine[];
  bill: number;
  paid: number;
  due: number;
  /** this season only (no carried-over lines) */
  seasonBill: number;
  seasonPaid: number;
};

export type LedgerFolder = {
  key: MoneyKey;
  label: string;
  group: MoneyGroup;
  /** column words: e.g. "কাজ হয়েছে" / "দিলাম" / "বাকি" */
  words: { bill: string; paid: string; due: string; ahead: string };
  /** cash-only head: bill and paid are the same money, there is no due */
  cashOnly: boolean;
  note: string;
  people: LedgerPerson[];
  bill: number;
  paid: number;
  due: number;
  seasonBill: number;
  seasonPaid: number;
};

const BN_MONTH = ["জানুয়ারি", "ফেব্রুয়ারি", "মার্চ", "এপ্রিল", "মে", "জুন", "জুলাই", "আগস্ট", "সেপ্টেম্বর", "অক্টোবর", "নভেম্বর", "ডিসেম্বর"];
const monthName = (d: string) => BN_MONTH[Number(d.slice(5, 7)) - 1] ?? d.slice(0, 7);
const dayNo = (d: string) => bn(Number(d.slice(8, 10)));
const tk = (n: number) => `৳${bn(Math.round(n))}`;
const nfc = (s: string | null | undefined) => (s ?? "").normalize("NFC").trim();
const dayBefore = (d: string) => new Date(new Date(`${d}T00:00:00Z`).getTime() - 86400000).toISOString().slice(0, 10);

const KACHA_LABEL: Record<string, string> = { production: "কাঁচা ইট", load: "ভাটায় লোড", unload: "আনলোড (বের করা)" };
const KACHA_PAGE: Record<string, string> = { production: "/production-steps/kacha", load: "/production-steps/load", unload: "/production-steps/unload" };
const CONTRACT_ITEM_HEAD: Record<string, MoneyKey> = { "জমি ভাড়া": "land", "পরিচ্ছন্ন কর্মী": "clean", "গাড়ি ভাড়া": "vehicle", "ভেকু": "veku" };

const LABOUR_WORDS = { bill: "কাজ / পাওনা", paid: "দিলাম", due: "বাকি", ahead: "অগ্রিম" };
const SELLER_WORDS = { bill: "বিল", paid: "দিলাম", due: "বাকি", ahead: "আগাম দেওয়া" };
const CASH_WORDS = { bill: "খরচ", paid: "দিলাম", due: "বাকি", ahead: "আগাম" };

/** money row in the cash book (edit / delete happen there) */
const cashLink = (key: string): LedgerLink => ({ to: "/cash-book", search: { row: key } });
const billLink = (id: string): LedgerLink => ({ to: "/cash-book", search: { bill: id } });

/** a line of this season (not last season's due, not the carried-over balance) */
const isSeasonLine = (l: LedgerLine) => {
  const s = getSeasonRange();
  return !l.id.startsWith("pre-") && !l.id.startsWith("ob-") && (!s || (l.date >= s.from && l.date <= s.to));
};

function person(id: string, name: string, lines: LedgerLine[], sub?: string): LedgerPerson {
  // by date; on the same day a bill comes before the money given for it
  const sorted = [...lines].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (b.bill > 0 ? 1 : 0) - (a.bill > 0 ? 1 : 0)));
  const bill = sorted.reduce((a, l) => a + l.bill, 0);
  const paid = sorted.reduce((a, l) => a + l.paid, 0);
  const sl = sorted.filter(isSeasonLine);
  return {
    id, name, sub, lines: sorted, bill, paid, due: bill - paid,
    seasonBill: sl.reduce((a, l) => a + l.bill, 0), seasonPaid: sl.reduce((a, l) => a + l.paid, 0),
  };
}

/** groups day amounts into one line per calendar month */
function monthLines(idPrefix: string, days: Array<{ date: string; amount: number; value?: number }>, text: (m: { first: string; last: string; days: number; absent: number; half: number }) => string, link: LedgerLink, linkLabel: string): LedgerLine[] {
  const m = new Map<string, { first: string; last: string; amount: number; days: number; absent: number; half: number }>();
  for (const d of days) {
    const k = d.date.slice(0, 7);
    const cur = m.get(k) ?? { first: d.date, last: d.date, amount: 0, days: 0, absent: 0, half: 0 };
    cur.amount += d.amount;
    cur.days += d.value ?? 1;
    if (d.value === 0) cur.absent++;
    if (d.value === 0.5) cur.half++;
    if (d.date < cur.first) cur.first = d.date;
    if (d.date > cur.last) cur.last = d.date;
    m.set(k, cur);
  }
  return [...m.entries()].filter(([, x]) => Math.abs(x.amount) >= 0.5).map(([k, x]) => ({
    id: `${idPrefix}-${k}`, date: x.last, text: text(x), sub: `${monthName(x.first)} ${dayNo(x.first)}–${dayNo(x.last)} তারিখ`,
    bill: Math.round(x.amount), paid: 0, link, linkLabel,
  }));
}

export async function fetchLedger(): Promise<LedgerFolder[]> {
  const season = getSeasonRange();
  const inSeason = (d: string) => !season || (d >= season.from && d <= season.to);
  const db: any = sdb;
  const all: any = supabase;

  const [
    sardars, workers, owners, rates, items, suppliers,
    kacha, work, sarPay, att, wrkPay, ownTx,
    purchases, supPay, expenses, loans, loanPay, openings, openPay,
  ] = await Promise.all([
    fetchAllRows<any>(() => all.from("sardars").select("id, name, kind, monthly_salary, join_date, leave_date").order("id")),
    fetchAllRows<any>(() => all.from("workers").select("id, name, role, daily_wage, monthly_salary, join_date, leave_date").order("id")),
    fetchAllRows<any>(() => all.from("owners").select("id, name").order("id")),
    fetchAllRows<PayRate & { owner_id?: string | null }>(() => all.from("pay_rates").select("id, worker_id, sardar_id, owner_id, amount, effective_from").order("id")),
    fetchAllRows<any>(() => all.from("raw_materials").select("id, name, item_group").order("id")),
    fetchAllRows<any>(() => all.from("suppliers").select("id, name, material_type, phone").order("id")),
    fetchAllRows<any>(() => db.from("kacha_brick_entries").select("id, entry_date, entry_type, sardar_id, quantity, rate, amount").order("id")),
    fetchAllRows<any>(() => db.from("sardar_work_entries").select("id, entry_date, sardar_id, quantity, rate, amount, note").order("id")),
    fetchAllRows<any>(() => db.from("sardar_payments").select("id, sardar_id, payment_date, amount, payment_type, note").order("id")),
    fetchAllRows<any>(() => db.from("worker_attendance").select("id, worker_id, date, present, is_half_day").order("id")),
    fetchAllRows<any>(() => db.from("worker_payments").select("id, worker_id, payment_date, amount, note").order("id")),
    fetchAllRows<any>(() => all.from("owner_transactions").select("id, owner_id, txn_type, amount, txn_date, note").order("id")),
    fetchAllRows<any>(() => all.from("purchases").select("id, supplier_id, purchase_date, item_name, material_id, quantity, unit, unit_price, total_amount, note").order("id")),
    fetchAllRows<any>(() => all.from("supplier_payments").select("id, supplier_id, payment_date, amount, method, note").order("id")),
    fetchAllRows<any>(() => db.from("expenses").select("id, expense_date, category, amount, note").order("id")),
    fetchAllRows<any>(() => all.from("loans").select("id, party_name, direction, amount, loan_date, note").order("id")),
    fetchAllRows<any>(() => all.from("loan_payments").select("id, loan_id, amount, payment_date, note").order("id")),
    fetchAllRows<any>(() => all.from("opening_balance_summary").select("id, kind, party_name, display_name, sardar_id, worker_id, amount, as_of_date, note, remaining_amount").in("kind", ["sardar_payable", "other_payable"]).order("id")),
    fetchAllRows<any>(() => all.from("opening_payments").select("id, opening_balance_id, payment_date, amount, note").order("id")),
  ]);

  const folders = new Map<MoneyKey, LedgerPerson[]>();
  const add = (k: MoneyKey, p: LedgerPerson) => {
    if (!p.lines.length) return;
    if (!folders.has(k)) folders.set(k, []);
    folders.get(k)!.push(p);
  };

  /* ---------- last season's unpaid wage, shown inside the person's own ledger ---------- */
  const openLine = (ob: any): LedgerLine[] => {
    const date = ob.as_of_date ?? (season ? dayBefore(season.from) : "2000-01-01");
    const out: LedgerLine[] = [{
      id: `ob-${ob.id}`, date, text: "গত বছরের বকেয়া", sub: ob.note ?? undefined, bill: Number(ob.amount || 0), paid: 0,
      link: { to: "/opening-balances" }, linkLabel: "পূর্বের বকেয়া পাতা",
    }];
    for (const p of openPay.filter((x) => x.opening_balance_id === ob.id)) {
      out.push({
        id: `op-${p.id}`, date: p.payment_date, text: "গত বছরের বকেয়া থেকে দিলাম", sub: p.note ?? undefined, bill: 0, paid: Number(p.amount || 0),
        ...(inSeason(p.payment_date) ? { link: cashLink(`op${p.id}`), linkLabel: "ক্যাশ বই" } : { sub: `${p.note ? `${p.note} · ` : ""}আগের মৌসুমে` }),
      });
    }
    return out;
  };
  const openingsOf = (field: "sardar_id" | "worker_id", id: string) => openings.filter((o) => o[field] === id).flatMap(openLine);

  /* ---------- sardars ---------- */
  for (const s of sardars) {
    const lines: LedgerLine[] = [];
    if (s.kind === "burn") {
      const days = salaryDays({ monthly: s.monthly_salary, join: s.join_date, leave: s.leave_date, rates: rates.filter((r) => r.sardar_id === s.id) });
      lines.push(...monthLines(`sal-${s.id}`, days, () => "মাসিক বেতন", { to: "/sardars" }, "সরদার খাতা"));
    } else {
      for (const k of kacha.filter((x) => x.sardar_id === s.id && SARDAR_EARNING_TYPES.has(x.entry_type))) {
        lines.push({
          id: `k-${k.id}`, date: k.entry_date, text: `${KACHA_LABEL[k.entry_type] ?? k.entry_type} ${bn(Number(k.quantity || 0))} পিস`,
          sub: Number(k.rate) ? `প্রতি হাজার ${tk(Number(k.rate))}` : undefined, bill: Number(k.amount || 0), paid: 0,
          link: { to: KACHA_PAGE[k.entry_type] ?? "/production-steps/kacha" }, linkLabel: "উৎপাদনের পাতা",
        });
      }
      for (const w of work.filter((x) => x.sardar_id === s.id)) {
        lines.push({ id: `sw-${w.id}`, date: w.entry_date, text: `কাজ ${bn(Number(w.quantity || 0))}`, sub: w.note ?? undefined, bill: Number(w.amount || 0), paid: 0, link: { to: "/sardars" }, linkLabel: "সরদার খাতা" });
      }
    }
    for (const p of sarPay.filter((x) => x.sardar_id === s.id)) {
      lines.push({ id: `s-${p.id}`, date: p.payment_date, text: p.payment_type === "advance" ? "দাদন দিলাম" : "টাকা দিলাম", sub: p.note ?? undefined, bill: 0, paid: Number(p.amount || 0), link: cashLink(`s${p.id}`), linkLabel: "ক্যাশ বই" });
    }
    lines.push(...openingsOf("sardar_id", s.id));
    add("sardar", person(s.id, s.name, lines, s.kind === "burn" ? "পুড়াই মেস্তুরি" : s.kind === "load" ? "লোড সরদার" : s.kind === "unload" ? "আনলোড সরদার" : "মিল সরদার"));
  }

  /* ---------- daily workers and staff ---------- */
  for (const w of workers) {
    const isDaily = w.role === "daily";
    const wr = rates.filter((r) => r.worker_id === w.id);
    const mine = att.filter((a) => a.worker_id === w.id);
    const lines: LedgerLine[] = isDaily
      ? monthLines(`d-${w.id}`, dailyDays({ wage: w.daily_wage, join: w.join_date, leave: w.leave_date, rates: wr, marks: mine.map((a) => ({ date: a.date, present: a.present !== false, half: !!a.is_half_day })) }),
        (m) => `${bn(m.days)} দিন হাজিরা${m.absent ? ` · অনুপস্থিত ${bn(m.absent)}` : ""}${m.half ? ` · হাফ ${bn(m.half)}` : ""}`, { to: "/daily-workers" }, "ডেলি শ্রমিক পাতা")
      : monthLines(`m-${w.id}`, salaryDays({ monthly: w.monthly_salary, join: w.join_date, leave: w.leave_date, rates: wr, absences: mine.filter((a) => a.present === false || a.is_half_day).map((a) => ({ date: a.date, half: a.is_half_day })) }),
        () => "মাসিক বেতন", { to: "/salaries" }, "বেতন পাতা");
    for (const p of wrkPay.filter((x) => x.worker_id === w.id)) {
      lines.push({ id: `w-${p.id}`, date: p.payment_date, text: "টাকা দিলাম", sub: p.note ?? undefined, bill: 0, paid: Number(p.amount || 0), link: cashLink(`w${p.id}`), linkLabel: "ক্যাশ বই" });
    }
    lines.push(...openingsOf("worker_id", w.id));
    add(isDaily ? "daily" : "staff", person(w.id, w.name, lines, isDaily ? `দৈনিক ${tk(Number(w.daily_wage || 0))}` : String(w.role ?? "")));
  }

  /* ---------- owners: salary earned and taken; withdrawals ---------- */
  for (const o of owners) {
    const or = rates.filter((r) => r.owner_id === o.id).sort((a, b) => (a.effective_from < b.effective_from ? -1 : 1));
    const sal: LedgerLine[] = or.length
      ? monthLines(`os-${o.id}`, salaryDays({ monthly: 0, join: or[0].effective_from, rates: or }), () => "মাসিক বেতন", { to: "/owners" }, "মালিক পাতা")
      : [];
    for (const t of ownTx.filter((x) => x.owner_id === o.id && x.txn_type === "salary" && inSeason(x.txn_date))) {
      sal.push({ id: `o-${t.id}`, date: t.txn_date, text: "বেতন নিলেন", sub: t.note ?? undefined, bill: 0, paid: Number(t.amount || 0), link: cashLink(`o${t.id}`), linkLabel: "ক্যাশ বই" });
    }
    add("ownerSalary", person(o.id, o.name, sal));
    const wd: LedgerLine[] = ownTx.filter((x) => x.owner_id === o.id && x.txn_type === "withdraw").map((t) => ({
      id: `o-${t.id}`, date: t.txn_date, text: "উত্তোলন", sub: t.note ?? undefined, bill: Number(t.amount || 0), paid: Number(t.amount || 0),
      ...(inSeason(t.txn_date) ? { link: cashLink(`o${t.id}`), linkLabel: "ক্যাশ বই" } : {}),
    }));
    add("ownerWithdraw", person(o.id, o.name, wd));
  }

  /* ---------- sellers and contract people (all time) ---------- */
  const rawIds = new Set(items.filter((i) => i.item_group === "raw").map((i) => i.id as string));
  const rawNames = new Set([...RAW_TYPES, ...items.filter((i) => i.item_group === "raw").map((i) => nfc(i.name))]);
  const supHead = (s: any): MoneyKey => {
    const h = supplierHead(s.material_type);
    if (h !== "parts" && h !== "raw") return h;
    // a seller's folder: what they mostly sold (catalog group), else the seller's type
    const bills = purchases.filter((p) => p.supplier_id === s.id);
    if (!bills.length) return h;
    const raw = bills.filter((p) => (p.material_id && rawIds.has(p.material_id)) || rawNames.has(nfc(p.item_name))).reduce((a, p) => a + Number(p.total_amount || 0), 0);
    const total = bills.reduce((a, p) => a + Number(p.total_amount || 0), 0);
    return raw * 2 >= total ? "raw" : "parts";
  };
  const supplierIds = new Set(suppliers.map((s) => s.id));
  for (const s of [...suppliers, { id: "__none__", name: "নাম ছাড়া", material_type: null }]) {
    const bills = purchases.filter((p) => (p.supplier_id ?? "__none__") === s.id || (s.id === "__none__" && p.supplier_id && !supplierIds.has(p.supplier_id)));
    const pays = supPay.filter((p) => (p.supplier_id ?? "__none__") === s.id || (s.id === "__none__" && p.supplier_id && !supplierIds.has(p.supplier_id)));
    if (!bills.length && !pays.length) continue;
    const lines: LedgerLine[] = [];
    let preBill = 0, prePaid = 0;
    for (const b of bills) {
      if (season && b.purchase_date < season.from) { preBill += Number(b.total_amount || 0); continue; }
      const qty = Number(b.quantity) > 0 && b.unit ? `${bn(Number(b.quantity))} ${b.unit}` : "";
      const rate = Number(b.unit_price) > 0 && qty ? ` × ${tk(Number(b.unit_price))}` : "";
      lines.push({ id: `b-${b.id}`, date: b.purchase_date, text: `${b.item_name}${qty ? ` · ${qty}${rate}` : ""}`, sub: b.note ?? undefined, bill: Number(b.total_amount || 0), paid: 0, link: billLink(b.id), linkLabel: "আয়-ব্যয় (ক্যাশ বই)" });
    }
    for (const p of pays) {
      if (season && p.payment_date < season.from) { prePaid += Number(p.amount || 0); continue; }
      lines.push({
        id: `p-${p.id}`, date: p.payment_date, text: p.method === "bricks" ? "ইট দিয়ে শোধ" : "টাকা দিলাম", sub: p.note ?? undefined, bill: 0, paid: Number(p.amount || 0),
        link: cashLink(`p${p.id}`), linkLabel: p.method === "bricks" ? "ক্যাশ বই (চালান থেকে বদলায়)" : "ক্যাশ বই",
      });
    }
    if (preBill || prePaid) {
      lines.push({ id: `pre-${s.id}`, date: season ? dayBefore(season.from) : "2000-01-01", text: "আগের জের (এই মৌসুম শুরুর আগে)", sub: `বিল ${tk(preBill)} · দিলাম ${tk(prePaid)}`, bill: preBill, paid: prePaid });
    }
    // a bill's own head decides contract folders (land, veku …); sellers go by what they sold
    const head = s.id === "__none__" ? "parts" : supHead(s);
    add(head, person(s.id, s.name, lines, s.material_type ?? undefined));
  }

  /* ---------- cash expenses (expenses table) ---------- */
  const byItem = new Map<string, { key: MoneyKey; name: string; lines: LedgerLine[] }>();
  for (const e of expenses) {
    const h = expenseHead(e.category);
    const name = h.key === "power" ? "বিদ্যুৎ বিল" : h.key === "parts" ? "দোকানের নাম ছাড়া কেনা" : h.item || e.note || moneyHead(h.key).label;
    const k = `${h.key}|${nfc(name)}`;
    if (!byItem.has(k)) byItem.set(k, { key: h.key, name, lines: [] });
    const amt = Number(e.amount || 0);
    byItem.get(k)!.lines.push({
      id: `e-${e.id}`, date: e.expense_date, text: h.key === "parts" ? h.item || "যন্ত্রাংশ" : h.key === "misc" || h.key === "asset" ? (e.note || h.item || "খরচ") : "নগদে দিলাম",
      sub: h.key === "parts" ? e.note ?? undefined : undefined, bill: amt, paid: amt, link: cashLink(`e${e.id}`), linkLabel: "ক্যাশ বই",
    });
  }
  // parts bought without a shop name sit with the parts sellers as one more name
  for (const x of byItem.values()) add(x.key, person(`x-${x.key}-${x.name}`, x.name, x.lines));

  /* ---------- loans ---------- */
  for (const l of loans) {
    const given = l.direction === "given";
    const lines: LedgerLine[] = [{
      id: `l-${l.id}`, date: l.loan_date, text: given ? "ঋণ দিলাম" : "ঋণ নিলাম", sub: l.note ?? undefined, bill: Number(l.amount || 0), paid: 0,
      ...(inSeason(l.loan_date) ? { link: cashLink(`l${l.id}`), linkLabel: "ক্যাশ বই" } : {}),
    }];
    for (const p of loanPay.filter((x) => x.loan_id === l.id)) {
      lines.push({
        id: `lp-${p.id}`, date: p.payment_date, text: given ? "ফেরত পেলাম" : "শোধ দিলাম", sub: p.note ?? undefined, bill: 0, paid: Number(p.amount || 0),
        ...(inSeason(p.payment_date) ? { link: cashLink(`lp${p.id}`), linkLabel: "ক্যাশ বই" } : {}),
      });
    }
    add(given ? "loanGive" : "loanRepay", person(l.id, l.party_name ?? "—", lines));
  }

  /* ---------- old dues (every one, also those shown inside a person's ledger above) ---------- */
  for (const ob of openings) {
    add("openingOut", person(ob.id, ob.display_name || ob.party_name || "—", openLine(ob), ob.kind === "sardar_payable" ? "সরদার / শ্রমিক" : "অন্যান্য"));
  }

  /* ---------- folders in the one head order ---------- */
  const out: LedgerFolder[] = [];
  for (const h of MONEY_HEADS) {
    if (h.group === "in") continue;
    const people = (folders.get(h.key) ?? []).sort((a, b) => Math.abs(b.due) - Math.abs(a.due) || b.bill - a.bill);
    const cashOnly = ["power", "misc", "asset", "ownerWithdraw"].includes(h.key);
    const words = h.key === "loanGive" ? { bill: "ঋণ দিলাম", paid: "ফেরত পেলাম", due: "পাব", ahead: "বেশি পেয়েছি" }
      : h.key === "loanRepay" ? { bill: "ঋণ নিলাম", paid: "শোধ দিলাম", due: "দেব", ahead: "বেশি দিয়েছি" }
      : h.key === "openingOut" ? { bill: "গত বছরের দেনা", paid: "দিলাম", due: "বাকি", ahead: "বেশি দেওয়া" }
      : cashOnly ? CASH_WORDS
      : h.group === "labour" ? LABOUR_WORDS
      : SELLER_WORDS;
    const note = h.group === "labour"
      ? "এই মৌসুমের কাজ আর দেওয়া টাকা, সাথে গত বছরের বকেয়া ও তার শোধ। দাদন বা অগ্রিম বেশি দিলে বাকি ঋণাত্মক (অগ্রিম) দেখায়।"
      : cashOnly ? "নগদে খরচ, বাকি থাকে না। এই মৌসুমের হিসাব" + (h.key === "ownerWithdraw" ? " (উত্তোলন শুরু থেকে)।" : "।")
      : h.key === "loanGive" || h.key === "loanRepay" || h.key === "openingOut" ? "শুরু থেকে এখন পর্যন্ত।"
      : "বাকি শুরু থেকে এখন পর্যন্ত; এই মৌসুমের আগের সব একটি \"আগের জের\" লাইনে।";
    out.push({
      key: h.key, label: h.label, group: h.group, words, cashOnly, note, people,
      bill: people.reduce((a, p) => a + p.bill, 0),
      paid: people.reduce((a, p) => a + p.paid, 0),
      due: people.reduce((a, p) => a + p.due, 0),
      seasonBill: people.reduce((a, p) => a + p.seasonBill, 0),
      seasonPaid: people.reduce((a, p) => a + p.seasonPaid, 0),
    });
  }
  return out;
}

/** a purchases row's head (raw / parts / a contract folder), as the profit page does */
export function billHead(p: { item_name: string; material_id: string | null }, rawIds: Set<string>, rawNames: Set<string>): MoneyKey {
  return CONTRACT_ITEM_HEAD[p.item_name] ?? (p.material_id && rawIds.has(p.material_id) ? "raw" : rawNames.has(nfc(p.item_name)) ? "raw" : "parts");
}
