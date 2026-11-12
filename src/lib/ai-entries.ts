import { supabase } from "@/integrations/supabase/client";
import { fetchCashSummary, PAY_METHOD_BN } from "@/lib/cash-queries";
import { payWorker } from "@/lib/worker-pay";
import { saveVekuDay, type VekuDayInput } from "@/lib/veku-save";
import { ASSET_PREFIX, MISC_PREFIX, PARTS_PREFIX, POWER_BILL, moneyHead, type MoneyKey } from "@/lib/money-heads";
import { HOUR, TRIP, VEKU_ITEM, contractByKey, makeVekuNote } from "@/components/contract-config";
import { bn, bnDate } from "@/lib/format";

/**
 * What the AI assistant writes after "খাতায় সেভ". Every head is written to the same tables,
 * with the same notes and the same checks, as the money forms (components/expense-entry.tsx
 * and income-entry.tsx), the production pages, the transfer dialog and the day close, so an
 * entry made by voice shows up everywhere exactly like one typed in a form. When a form's
 * save changes, change the matching branch here too.
 *
 * Each save returns the rows it wrote (table, id) so the chat can undo its own entry
 * (admin, with the password).
 */

export type PayMethod = "cash" | "bkash" | "nagad" | "bank";
export const PAY_METHOD_LIST: PayMethod[] = ["cash", "bkash", "nagad", "bank"];
export const METHOD_LABEL: Record<PayMethod, string> = { cash: "ক্যাশ (ড্রয়ার)", bkash: "বিকাশ", nagad: "নগদ (মোবাইল)", bank: "ব্যাংক" };
export const asMethod = (m: unknown): PayMethod => (PAY_METHOD_LIST.includes(String(m) as PayMethod) ? (String(m) as PayMethod) : "cash");

export type SavedRef = { table: string; id: string };
export type SaveOutcome = { success: boolean; message: string; refs: SavedRef[]; challanNo?: string };

/** heads whose person is a seller or contract person (purchases bill + supplier_payments) */
export const SELLER_HEADS = new Set<MoneyKey>(["raw", "parts", "veku", "vehicle", "land", "clean"]);
/** heads that are a plain cash expense with no person */
export const CASH_HEADS = new Set<MoneyKey>(["power", "misc", "asset"]);

export type MoneyEntry = {
  head: MoneyKey;
  /** sardar / worker / owner / veku / customer / supplier / opening balance / loan id */
  personId?: string | null;
  /** the name shown (or a new seller / loan party) */
  person?: string;
  /** a seller or loan party not in the book yet: the save adds the name */
  newPerson?: boolean;
  /** money handed over or received now */
  amount: number;
  /** a bill (what they are owed for goods or work), seller heads only */
  bill?: number;
  qty?: number;
  rate?: number;
  unit?: string | null;
  /** raw catalog item, parts list, misc or asset text */
  item?: string;
  itemId?: string | null;
  /** a new seller's material_type */
  sellerType?: string;
  method: PayMethod;
  date: string;
  note?: string;
  vekuKind?: string;
  driver?: string;
  dueDate?: string | null;
  paymentType?: "payment" | "advance";
  /** what is owed before this entry (shown on the card), and which way it runs */
  prevDue?: number | null;
  dueSide?: "pay" | "receive" | null;
};

export type TransferEntry = { from: PayMethod; to: PayMethod; amount: number; date: string; note?: string };
export type DayCloseEntry = { date: string; counted: number; expected?: number | null; note?: string };
export type KachaEntry = {
  step: "production" | "load" | "unload" | "damage";
  sardarId?: string | null;
  sardar?: string;
  millId?: string | null;
  mill?: string;
  quantity: number;
  rate?: number;
  grades?: Array<{ brickTypeId: string; name: string; quantity: number }>;
  reason?: string;
  date: string;
  note?: string;
};
export type BookEntry = { page: number; keys: string[]; total: number; upTo: string };
export type ReminderEntry = { text: string; at: string };

const round2 = (n: number) => Math.round(n * 100) / 100;
const tk = (n: number) => `৳${bn(Math.round(n * 100) / 100)}`;

function friendly(e: unknown): Error {
  const err = e as { message?: string; code?: string };
  const msg = String(err?.message ?? e);
  if (err?.code === "42501" || /row-level security|permission denied/i.test(msg)) {
    return new Error("এই এন্ট্রি দেওয়ার অনুমতি আপনার নেই। অ্যাডমিনকে বলুন বা সংশ্লিষ্ট পাতা থেকে দিন।");
  }
  return new Error(msg);
}

async function insertOne(table: string, row: Record<string, unknown>): Promise<SavedRef> {
  const { data, error } = await (supabase as any).from(table).insert(row).select("id").single();
  if (error) throw friendly(error);
  return { table, id: (data as { id: string }).id };
}

/* ---------------------------------------------------------------- money by head */

export async function saveMoneyEntry(e: MoneyEntry, uid: string): Promise<SaveOutcome> {
  const head = e.head;
  const def = moneyHead(head);
  if (!def) throw new Error("কোন খাতে, বোঝা যায়নি");
  const amount = round2(Number(e.amount) || 0);
  const bill = round2(Number(e.bill) || 0);
  const method = asMethod(e.method);
  const note = (e.note ?? "").trim();
  const date = e.date;
  if (!date) throw new Error("তারিখ দিন");
  const refs: SavedRef[] = [];
  const need = (ok: unknown, msg: string) => { if (!ok) throw new Error(msg); };
  const by = { created_by: uid };

  switch (head) {
    /* ----- money in (IncomeEntryDialog) ----- */
    case "sale":
      need(e.personId, "কোন গ্রাহক, বোঝা যায়নি");
      need(amount > 0, "কত টাকা পেলেন, বলুন");
      refs.push(await insertOne("collections", { customer_id: e.personId, contract_id: null, amount, payment_date: date, method, note: note || null, ...by }));
      break;
    case "openingIn": {
      need(e.personId, "কার কাছ থেকে গত বছরের পাওনা, বোঝা যায়নি");
      need(amount > 0, "কত টাকা পেলেন, বলুন");
      const left = await openingLeft(e.personId!);
      if (amount > left + 0.001) throw new Error(`গত বছরের বাকি আছে মাত্র ${tk(left)}`);
      refs.push(await insertOne("opening_payments", { opening_balance_id: e.personId, amount, payment_date: date, method: PAY_METHOD_BN[method] ?? "নগদ", note: note || null, ...by }));
      break;
    }
    case "ownerInvest":
      need(e.personId, "কোন মালিক, বোঝা যায়নি");
      need(amount > 0, "কত টাকা দিলেন, বলুন");
      refs.push(await insertOne("owner_transactions", { owner_id: e.personId, txn_type: "invest", amount, txn_date: date, method, note: note || null, ...by }));
      break;
    case "loanIn":
      need((e.person ?? "").trim(), "কার কাছ থেকে ঋণ, নাম বলুন");
      need(amount > 0, "কত টাকা ঋণ, বলুন");
      refs.push(await insertOne("loans", { party_name: e.person!.trim(), direction: "taken", amount, loan_date: date, due_date: e.dueDate || null, method, note: note || null, ...by }));
      break;
    case "loanBack": {
      need(e.personId, "কে ঋণ ফেরত দিল, বোঝা যায়নি");
      need(amount > 0, "কত টাকা ফেরত পেলেন, বলুন");
      const left = await loanLeft(e.personId!);
      if (amount > left + 0.5) throw new Error(`এই ঋণের বাকি আছে মাত্র ${tk(left)}`);
      refs.push(await insertOne("loan_payments", { loan_id: e.personId, amount, payment_date: date, method, note: note || null, ...by }));
      break;
    }

    /* ----- money out (ExpenseEntryDialog) ----- */
    case "sardar":
      need(e.personId, "কোন সরদার, বোঝা যায়নি");
      need(amount > 0, "কত টাকা দিলেন, বলুন");
      refs.push(await insertOne("sardar_payments", {
        sardar_id: e.personId, amount, payment_date: date, payment_type: e.paymentType === "advance" ? "advance" : "payment", method, note: note || null, ...by,
      }));
      break;
    case "daily":
    case "staff": {
      need(e.personId, "কাকে দিলেন, বোঝা যায়নি");
      need(amount > 0, "কত টাকা দিলেন, বলুন");
      // last season's unpaid wage first, the rest this season's (lib/worker-pay.ts)
      const split = await payWorker({ workerId: e.personId!, amount, date, note: note || "AI সহকারী থেকে", createdBy: uid, method });
      refs.push(...split.refs);
      const how = split.toOldTotal > 0.5 ? ` (গত বছরের বকেয়ায় ${tk(split.toOldTotal)}${split.toNow > 0.5 ? `, এই মৌসুমে ${tk(split.toNow)}` : ""})` : "";
      return { success: true, refs, message: `${e.person ?? ""}-কে ${tk(amount)} দেওয়া খাতায় উঠেছে${how}।` };
    }
    case "ownerSalary":
    case "ownerWithdraw":
      need(e.personId, "কোন মালিক, বোঝা যায়নি");
      need(amount > 0, "কত টাকা নিলেন, বলুন");
      refs.push(await insertOne("owner_transactions", {
        owner_id: e.personId, txn_type: head === "ownerSalary" ? "salary" : "withdraw", amount, txn_date: date, method, note: note || null, ...by,
      }));
      break;
    case "openingOut": {
      need(e.personId, "কার পূর্বের দেনা, বোঝা যায়নি");
      need(amount > 0, "কত টাকা দিলেন, বলুন");
      const left = await openingLeft(e.personId!);
      if (amount > left + 0.001) throw new Error(`পূর্বের বাকি আছে মাত্র ${tk(left)}`);
      refs.push(await insertOne("opening_payments", { opening_balance_id: e.personId, amount, payment_date: date, method: PAY_METHOD_BN[method] ?? "নগদ", note: note || null, ...by }));
      break;
    }
    case "loanRepay": {
      need(e.personId, "কার ঋণ শোধ, বোঝা যায়নি");
      need(amount > 0, "কত টাকা দিলেন, বলুন");
      const left = await loanLeft(e.personId!);
      if (amount > left + 0.5) throw new Error(`এই ঋণের বাকি আছে মাত্র ${tk(left)}`);
      refs.push(await insertOne("loan_payments", { loan_id: e.personId, amount, payment_date: date, method, note: note || null, ...by }));
      break;
    }
    case "loanGive":
      need((e.person ?? "").trim(), "কাকে ঋণ দিলেন, নাম বলুন");
      need(amount > 0, "কত টাকা দিলেন, বলুন");
      refs.push(await insertOne("loans", { party_name: e.person!.trim(), direction: "given", amount, loan_date: date, due_date: e.dueDate || null, method, note: note || null, ...by }));
      break;
    case "power":
    case "misc":
    case "asset": {
      need(amount > 0, "কত টাকা, বলুন");
      const what = (e.item ?? "").trim();
      if (head !== "power" && !what) throw new Error(head === "asset" ? "কী কেনা হলো, বলুন" : "খরচটা কিসের, বলুন");
      const category = (head === "power" ? POWER_BILL : head === "asset" ? `${ASSET_PREFIX}${what}` : `${MISC_PREFIX}${what}`).slice(0, 80);
      refs.push(await insertOne("expenses", { category, amount, expense_date: date, note: note || null, method, ...by }));
      break;
    }
    case "raw":
    case "parts":
    case "veku":
    case "vehicle":
    case "land":
    case "clean": {
      need(bill > 0 || amount > 0, "বিল বা দেওয়া টাকা বলুন");
      const cfg = contractByKey(head);
      // parts bought without a shop name: a plain cash expense, nothing may stay due
      if (head === "parts" && !e.personId && !(e.person ?? "").trim()) {
        // said as a price ("বিয়ারিং ১২০০ টাকায় কিনলাম"): paid in full
        const total = bill > 0 ? bill : amount;
        if (bill > 0 && amount > 0 && amount < bill - 0.001) throw new Error("বাকি থাকলে দোকানের নাম বলুন");
        if (bill > 0 && amount > bill + 0.001) throw new Error("দেওয়া টাকা দামের চেয়ে বেশি। আগের বাকি দিলে দোকানের নাম বলুন।");
        need((e.item ?? "").trim(), "কী কী কিনলেন, বলুন");
        refs.push(await insertOne("expenses", { category: `${PARTS_PREFIX}${(e.item ?? "").trim()}`.slice(0, 80), amount: total, expense_date: date, note: note || null, method, ...by }));
        break;
      }
      if (head === "veku" && !e.personId) throw new Error("কোন ভেকু, বোঝা যায়নি");
      if (head === "veku" && amount > 0 && !e.vekuKind) throw new Error("ভেকুর টাকা কিসের (ডিজেল, মেরামত, চালকের বেতন …), বলুন");
      if (head === "raw" && bill > 0 && !e.item) throw new Error("কোন কাঁচামাল, বলুন");
      if (head === "parts" && bill > 0 && !(e.item ?? "").trim()) throw new Error("কী কী কিনলেন, বলুন");
      let sid = e.personId ?? null;
      if (!sid) {
        const name = (e.person ?? "").trim();
        need(name, "কার কাছ থেকে, নাম বলুন");
        const type = head === "raw" ? e.sellerType || e.item || "কাঁচামাল" : head === "parts" ? e.sellerType || "ইঞ্জিন মালামাল" : cfg!.type;
        // the same name may have been added a moment ago (a batch with two lines for one seller)
        const { data: same } = await supabase.from("suppliers").select("id").eq("name", name).eq("material_type", type).limit(1);
        if (same?.length) sid = (same[0] as { id: string }).id;
        else {
          const { data, error } = await supabase.from("suppliers").insert({ name, material_type: type }).select("id").single();
          if (error) throw friendly(error);
          sid = (data as { id: string }).id;
        }
      }
      if (bill > 0) {
        const qty = Number(e.qty) || 0;
        const rate = Number(e.rate) || 0;
        let row: Record<string, unknown>;
        if (head === "raw") {
          const unitPriced = qty > 0 && rate > 0 && Math.abs(qty * rate - bill) < 0.5;
          row = {
            item_name: e.item, material_id: e.itemId ?? null, quantity: qty > 0 ? qty : 1, unit: e.unit ?? null,
            unit_price: unitPriced ? rate : round2(bill / (qty > 0 ? qty : 1)), total_amount: bill, note: note || null,
          };
        } else if (head === "parts") {
          row = { item_name: (e.item ?? "").trim(), material_id: e.itemId ?? null, quantity: 1, unit: null, unit_price: bill, total_amount: bill, note: note || null };
        } else if (head === "veku") {
          need(qty > 0 && rate > 0, "ভেকু কত ঘণ্টা আর ঘণ্টায় কত, বলুন");
          row = { item_name: VEKU_ITEM, material_id: null, quantity: qty, unit: HOUR, unit_price: rate, total_amount: round2(qty * rate), note: makeVekuNote("", e.driver ?? "", note) };
        } else {
          const c = cfg!;
          const trips = !!c.trips && qty > 0 && rate > 0;
          row = {
            item_name: c.item, material_id: null, quantity: trips ? qty : 1, unit: trips ? TRIP : null,
            unit_price: trips ? rate : bill, total_amount: trips ? round2(qty * rate) : bill, note: note || null,
          };
        }
        refs.push(await insertOne("purchases", { ...row, supplier_id: sid, purchase_date: date, ...by }));
      }
      if (amount > 0) {
        const what = head === "raw" ? e.item || e.sellerType || "কাঁচামাল" : head === "parts" ? (e.item ?? "").trim() || "মালামাল" : "";
        const payNote = head === "veku" ? makeVekuNote(e.vekuKind ?? "অন্যান্য", e.driver ?? "", note)
          : cfg ? (note ? `${cfg.item} পরিশোধ — ${note}` : `${cfg.item} পরিশোধ`)
          : `${what} — ${bill > 0 ? "পরিশোধ" : "অগ্রিম/বকেয়া পরিশোধ"}${note ? ` (${note})` : ""}`;
        try {
          refs.push(await insertOne("supplier_payments", { supplier_id: sid, amount, payment_date: date, method, note: payNote, ...by }));
        } catch (err) {
          throw new Error(bill > 0 ? `বিল লেখা হয়েছে, কিন্তু দেওয়া টাকা সেভ হয়নি। শুধু টাকাটা আবার দিন। (${(err as Error).message})` : (err as Error).message);
        }
      }
      break;
    }
    default:
      throw new Error("এই খাতের এন্ট্রি এখান থেকে দেওয়া যায় না");
  }

  const who = e.person ? `${e.person} · ` : "";
  const parts = [bill > 0 ? `বিল ${tk(bill)}` : "", amount > 0 ? `${def.group === "in" ? "পেলাম" : "দিলাম"} ${tk(amount)}` : ""].filter(Boolean).join(", ");
  return { success: true, refs, message: `${def.label}: ${who}${parts} খাতায় উঠেছে${method !== "cash" ? ` (${METHOD_LABEL[method]})` : ""}।` };
}

async function openingLeft(id: string): Promise<number> {
  const { data, error } = await supabase.from("opening_balance_summary").select("remaining_amount").eq("id", id).maybeSingle();
  if (error) throw friendly(error);
  return Number((data as { remaining_amount?: number } | null)?.remaining_amount ?? 0);
}

async function loanLeft(id: string): Promise<number> {
  const [l, p] = await Promise.all([
    supabase.from("loans").select("amount").eq("id", id).maybeSingle(),
    supabase.from("loan_payments").select("amount").eq("loan_id", id),
  ]);
  if (l.error) throw friendly(l.error);
  const paid = ((p.data ?? []) as Array<{ amount: number }>).reduce((a, x) => a + Number(x.amount || 0), 0);
  return Number((l.data as { amount?: number } | null)?.amount ?? 0) - paid;
}

/* ---------------------------------------------------------------- other entries */

export async function saveTransfer(t: TransferEntry, uid: string): Promise<SaveOutcome> {
  const amount = round2(Number(t.amount) || 0);
  if (!(amount > 0)) throw new Error("কত টাকা সরালেন, বলুন");
  const from = asMethod(t.from);
  const to = asMethod(t.to);
  if (from === to) throw new Error("কোথা থেকে আর কোথায়, দুটো আলাদা হতে হবে");
  const ref = await insertOne("cash_transfers", { transfer_date: t.date, from_method: from, to_method: to, amount, note: (t.note ?? "").trim() || null, created_by: uid });
  return { success: true, refs: [ref], message: `${METHOD_LABEL[from]} থেকে ${METHOD_LABEL[to]}-এ ${tk(amount)} সরানো লেখা হয়েছে। মোট হাতে নগদ একই থাকল।` };
}

/** drawer money the app expects at the end of a day (the same figure as the day close card) */
export async function expectedDrawer(date: string): Promise<number> {
  const s = await fetchCashSummary({ to: date });
  return Math.round(((s as any).purses?.cash ?? s.net) * 100) / 100;
}

export async function saveDayClose(d: DayCloseEntry, uid: string): Promise<SaveOutcome> {
  const counted = round2(Number(d.counted));
  if (!Number.isFinite(counted) || counted < 0) throw new Error("ড্রয়ারে গুনে কত পেলেন, বলুন");
  const expected = await expectedDrawer(d.date);
  const diff = round2(counted - expected);
  if (Math.abs(diff) >= 1 && !(d.note ?? "").trim()) {
    throw new Error(`হিসাবে ড্রয়ারে থাকার কথা ${tk(expected)}, গুনেছেন ${tk(counted)}। গরমিল ${tk(Math.abs(diff))}-এর কারণ লিখুন।`);
  }
  const { data, error } = await supabase.from("cash_day_closes").insert({
    close_date: d.date, expected, counted, note: (d.note ?? "").trim() || null, closed_by: uid,
  } as never).select("id").single();
  if (error) throw (error as { code?: string }).code === "23505" ? new Error("এই দিন আগেই বন্ধ করা হয়েছে। আবার খুলতে ক্যাশ বইয়ে অ্যাডমিন খুলবেন।") : friendly(error);
  return {
    success: true,
    refs: [{ table: "cash_day_closes", id: (data as { id: string }).id }],
    message: Math.abs(diff) < 1 ? `দিন বন্ধ হয়েছে। ড্রয়ার মিলে গেছে: ${tk(counted)}।` : `দিন বন্ধ হয়েছে। গরমিল ${diff > 0 ? "বেশি" : "কম"} ${tk(Math.abs(diff))}, কারণসহ লেখা থাকল।`,
  };
}

async function rateFor(kind: "production" | "load" | "unload", date: string): Promise<number> {
  const { data } = await (supabase as any).from("production_rates").select("rate, effective_from")
    .eq("kind", kind).lte("effective_from", date).order("effective_from", { ascending: false }).limit(1);
  return Number(data?.[0]?.rate ?? 0);
}

/** kacha bricks: made at a mill, loaded into the kiln, taken out (by grade) or damaged */
export async function saveKacha(k: KachaEntry, uid: string): Promise<SaveOutcome> {
  const qty = Math.round(Number(k.quantity) || 0);
  const date = k.date;
  const note = (k.note ?? "").trim() || "AI সহকারী থেকে";
  if (k.step === "unload") {
    const grades = (k.grades ?? []).filter((g) => g.brickTypeId && Number(g.quantity) > 0);
    if (!grades.length) throw new Error("কোন গ্রেডের কত ইট বের হলো, বলুন (যেমন: ১ নং ৮০০০, ২ নং ১৫০০)");
    let rate = Number(k.rate) || 0;
    if (rate > 0 && rate < 20) rate = round2(rate * 1000);
    if (!rate) rate = await rateFor("unload", date);
    const { data, error } = await (supabase as any).rpc("save_unload", {
      p_id: null, p_date: date, p_sardar_id: k.sardarId ?? null, p_rate: rate, p_note: note,
      p_grades: grades.map((g) => ({ brick_type_id: g.brickTypeId, quantity: Math.round(Number(g.quantity)) })),
    });
    if (error) throw friendly(error);
    const total = grades.reduce((a, g) => a + Math.round(Number(g.quantity)), 0);
    return {
      success: true,
      refs: data ? [{ table: "kacha_brick_entries", id: String(data) }] : [],
      message: `পাকা ইট বের: ${bn(total)} পিস স্টকে উঠেছে${rate ? ` (মজুরি ${tk(Math.round((total / 1000) * rate))})` : ""}।`,
    };
  }
  if (!(qty > 0)) throw new Error("কত ইট, বলুন");
  if (k.step === "damage") {
    const ref = await insertOne("kacha_brick_entries", {
      entry_date: date, entry_type: "damage", mill_id: k.millId ?? null, sardar_id: null, quantity: qty, rate: 0, amount: 0,
      damage_reason: k.reason || "অন্যান্য", note, created_by: uid,
    });
    return { success: true, refs: [ref], message: `নষ্ট কাঁচা ইট ${bn(qty)} পিস লেখা হয়েছে (${k.reason || "অন্যান্য"})।` };
  }
  // production or load: the rate is per thousand bricks
  let rate = Number(k.rate) || 0;
  if (rate > 0 && rate < 20) rate = round2(rate * 1000);
  if (!rate) rate = await rateFor(k.step, date);
  if (!rate && k.sardarId) {
    const { data: last } = await (supabase as any).from("kacha_brick_entries").select("rate")
      .eq("sardar_id", k.sardarId).eq("entry_type", k.step).gt("rate", 0).order("entry_date", { ascending: false }).limit(1).maybeSingle();
    rate = Number(last?.rate ?? 0);
  }
  if (!rate) throw new Error(`রেট (প্রতি হাজার) জানা নেই। রেটসহ বলুন, যেমন: "১০০০০ ইট, রেট ৯০০"।`);
  if (k.step === "production" && !k.sardarId) throw new Error("কোন মিল বা কোন সরদারের ইট, বলুন");
  const amount = Math.round((qty / 1000) * rate);
  const ref = await insertOne("kacha_brick_entries", {
    entry_date: date, entry_type: k.step, mill_id: k.step === "production" ? k.millId ?? null : null,
    sardar_id: k.sardarId ?? null, quantity: qty, rate, amount, damage_reason: null, note, created_by: uid,
  });
  const what = k.step === "production" ? "কাঁচা ইট তৈরি" : "ভাটায় ঢোকানো (লোড)";
  return { success: true, refs: [ref], message: `${what}: ${[k.mill, k.sardar].filter(Boolean).join(" · ")} ${bn(qty)} পিস × ${tk(rate)} প্রতি হাজার = ${tk(amount)}।` };
}

export async function saveVeku(d: VekuDayInput, uid: string): Promise<SaveOutcome> {
  const refs = await saveVekuDay(d, uid);
  return { success: true, refs, message: `${d.vekuName}: ${bnDate(d.date)}-এর দিনের হিসাব উঠেছে।` };
}

/** ticks the paper-book lines with the page they were copied to */
export async function saveBookMarks(b: BookEntry): Promise<SaveOutcome> {
  if (!(b.page > 0)) throw new Error("খাতার কোন পাতায় তুললেন, বলুন");
  if (!b.keys.length) return { success: true, refs: [], message: "খাতায় তোলার মতো কোনো লাইন বাকি নেই।" };
  const rows = b.keys.map((k) => ({ entry_key: k, page: b.page, checked: true }));
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await (supabase as any).from("book_marks").upsert(rows.slice(i, i + 500));
    if (error) throw friendly(error);
  }
  return { success: true, refs: [], message: `${bn(b.keys.length)}টা লাইন (${tk(b.total)}) খাতার ${bn(b.page)} নম্বর পাতায় তোলা হিসেবে টিক পড়েছে।` };
}

/** "কাল সকাল ১০টা", "১৫ নভে, বিকেল ৪:৩০" — a reminder time as people say it (Dhaka) */
export function whenText(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const local = d.toLocaleString("sv-SE", { timeZone: "Asia/Dhaka" }); // "2026-11-13 10:00:00"
  const day = local.slice(0, 10);
  const h = Number(local.slice(11, 13));
  const m = Number(local.slice(14, 16));
  const now = new Date().toLocaleString("sv-SE", { timeZone: "Asia/Dhaka" }).slice(0, 10);
  const next = new Date(new Date(`${now}T12:00:00+06:00`).getTime() + 86400000).toLocaleString("sv-SE", { timeZone: "Asia/Dhaka" }).slice(0, 10);
  const dayText = day === now ? "আজ" : day === next ? "কাল" : bnDate(day);
  const part = h < 4 ? "রাত" : h < 12 ? "সকাল" : h < 15 ? "দুপুর" : h < 18 ? "বিকেল" : h < 20 ? "সন্ধ্যা" : "রাত";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${dayText} ${part} ${bn(h12)}${m ? `:${String(m).padStart(2, "0").replace(/\d/g, (x) => "০১২৩৪৫৬৭৮৯"[Number(x)])}` : "টা"}`;
}

export async function saveReminder(r: ReminderEntry, uid: string): Promise<SaveOutcome> {
  const text = r.text.trim();
  if (!text) throw new Error("কী মনে করাতে হবে, বলুন");
  const at = new Date(r.at);
  if (Number.isNaN(at.getTime())) throw new Error("কখন মনে করাতে হবে, বলুন");
  const ref = await insertOne("agent_reminders", { body: text.slice(0, 300), remind_at: at.toISOString(), created_by: uid });
  return { success: true, refs: [ref], message: `ঠিক আছে, ${whenText(at.toISOString())}-এ ফোনে মনে করিয়ে দেব: ${text}` };
}

/* ---------------------------------------------------------------- undo */

const UNDO_TABLES = new Set([
  "collections", "opening_payments", "owner_transactions", "loans", "loan_payments", "sardar_payments", "worker_payments",
  "expenses", "purchases", "supplier_payments", "cash_transfers", "cash_day_closes", "kacha_brick_entries", "sales_entries",
  "agent_reminders",
]);

/** the admin's password, checked by signing in again (the same check as the cash book's delete) */
async function checkAdminPassword(password: string): Promise<void> {
  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes?.user;
  if (!user?.email) throw new Error("আবার লগইন করুন");
  const { data: role } = await (supabase as any).from("user_roles").select("role").eq("user_id", user.id).maybeSingle();
  if (role?.role !== "admin") throw new Error("শুধু অ্যাডমিন এন্ট্রি মুছতে পারেন");
  const { error } = await supabase.auth.signInWithPassword({ email: user.email, password });
  if (error) throw new Error("পাসওয়ার্ড ঠিক হয়নি");
}

/** deletes the rows one chat entry wrote, newest first (the audit trigger keeps a copy) */
export async function undoSaved(refs: SavedRef[], password: string): Promise<string> {
  if (!refs.length) throw new Error("এই এন্ট্রির কোনো সারি পাওয়া যায়নি");
  await checkAdminPassword(password);
  let n = 0;
  for (const r of [...refs].reverse()) {
    if (!UNDO_TABLES.has(r.table)) continue;
    const { error } = await (supabase as any).from(r.table).delete().eq("id", r.id);
    if (error) throw friendly(error);
    n++;
  }
  return n ? "এন্ট্রিটা মুছে ফেলা হয়েছে। হাতে নগদ আর সব হিসাব আগের মতো হয়ে গেছে।" : "মোছার মতো কিছু পাওয়া যায়নি।";
}
