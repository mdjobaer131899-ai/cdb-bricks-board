import { supabase } from "@/integrations/supabase/client";
import { bn } from "@/lib/format";
import {
  HOUR, VEKU_DIESEL_CREDIT, VEKU_DIESEL_OLD, VEKU_ITEM, VEKU_KHORAKI, VEKU_SEP, makeVekuNote,
} from "@/components/contract-config";

/**
 * Writes one day of a veku (one line of the paper দৈনিক খাতা). The day dialog
 * (components/veku-day.tsx) and the AI assistant both save through this, so a day looks
 * the same wherever it was written:
 *  - hours → purchases (item ভেকু, unit ঘণ্টা): what the kiln owes the veku; diesel taken on
 *    credit that day (a price but nothing paid) is noted on this row
 *  - diesel paid, driver's pay, the diesel auto fare → supplier_payments to the veku, in one insert
 *  - khoraki → expenses (VEKU_KHORAKI): the kiln's own cost, not the veku's
 */
export type VekuDayInput = {
  vekuId: string;
  vekuName: string;
  date: string;
  driver: string;
  /** hours worked (decimal) and rate per hour */
  hours: number;
  rate: number;
  litres: number;
  /** diesel price (bill at the pump) and what was paid to the pump now */
  price: number;
  paid: number;
  driverPay: number;
  auto: number;
  khoraki: number;
  method: string;
  note: string;
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const tk = (n: number) => `৳${bn(Math.round(n))}`;

export function checkVekuDay(d: VekuDayInput): string | null {
  if (!d.vekuId) return "কোন ভেকু, বেছে নিন";
  if (!d.date) return "তারিখ দিন";
  if (d.hours > 0 && !(d.rate > 0)) return "ঘণ্টায় কত টাকা, লিখুন";
  if (d.litres > 0 && !(d.price > 0)) return "ডিজেলের দাম লিখুন";
  if (d.price > 0 && !(d.paid > 0) && !(d.hours > 0)) return "ডিজেল বাকিতে নিলে সেদিনের ঘণ্টাও লিখুন। পাম্পে টাকা দিলে তখন \"পাম্পে দিলেন\" লিখবেন।";
  if (!(d.hours > 0) && !(d.paid > 0) && !(d.driverPay > 0) && !(d.auto > 0) && !(d.khoraki > 0)) return "ঘণ্টা বা কোনো টাকা লিখুন";
  return null;
}

/** saves the day; returns the rows written (table and id) for an undo */
export async function saveVekuDay(d: VekuDayInput, uid: string): Promise<Array<{ table: string; id: string }>> {
  const bad = checkVekuDay(d);
  if (bad) throw new Error(bad);
  const refs: Array<{ table: string; id: string }> = [];
  const note = d.note.trim();
  let noteUsed = false;
  const takeNote = () => { if (noteUsed || !note) return ""; noteUsed = true; return note; };
  const dieselText = [d.litres > 0 ? `${bn(d.litres)} লিটার` : "", d.price > 0 ? `দাম ${tk(d.price)}` : ""].filter(Boolean).join(VEKU_SEP);
  const rent = round2(d.hours * d.rate);

  // 1. hours (and diesel taken on credit that day)
  if (d.hours > 0) {
    const credit = d.price > 0 && !(d.paid > 0) ? `${VEKU_DIESEL_CREDIT}: ${dieselText}` : "";
    const { data, error } = await supabase.from("purchases").insert({
      supplier_id: d.vekuId, purchase_date: d.date, item_name: VEKU_ITEM, material_id: null,
      quantity: round2(d.hours), unit: HOUR, unit_price: d.rate, total_amount: rent,
      note: makeVekuNote("", d.driver, [takeNote(), credit].filter(Boolean).join(VEKU_SEP)), created_by: uid,
    } as never).select("id").single();
    if (error) throw error;
    if (data) refs.push({ table: "purchases", id: (data as { id: string }).id });
  }

  // 2. money off the veku account, in one insert
  const pays: Array<Record<string, unknown>> = [];
  const pay = (kind: string, amount: number, rest: string) => pays.push({
    supplier_id: d.vekuId, amount: round2(amount), payment_date: d.date, method: d.method, created_by: uid,
    note: makeVekuNote(kind, d.driver, [rest, takeNote()].filter(Boolean).join(VEKU_SEP)),
  });
  if (d.paid > 0) pay("ডিজেল", d.paid, d.price > 0 ? dieselText : VEKU_DIESEL_OLD);
  if (d.driverPay > 0) pay("চালকের বেতন", d.driverPay, "");
  if (d.auto > 0) pay("অটো ভাড়া", d.auto, "ডিজেল আনা");
  if (pays.length) {
    const { data, error } = await supabase.from("supplier_payments").insert(pays as never).select("id");
    if (error) throw new Error(refs.length ? `ঘণ্টা সেভ হয়েছে, কিন্তু টাকাগুলো হয়নি। শুধু টাকাগুলো আবার লিখুন। (${error.message})` : error.message);
    for (const r of (data ?? []) as Array<{ id: string }>) refs.push({ table: "supplier_payments", id: r.id });
  }

  // 3. khoraki: the kiln's own cost
  if (d.khoraki > 0) {
    const { data, error } = await supabase.from("expenses").insert({
      category: VEKU_KHORAKI, amount: d.khoraki, expense_date: d.date, method: d.method,
      note: [d.vekuName, d.driver.trim() ? `চালক: ${d.driver.trim()}` : "", takeNote()].filter(Boolean).join(VEKU_SEP),
      created_by: uid,
    } as never).select("id").single();
    if (error) throw new Error(refs.length ? `বাকিগুলো সেভ হয়েছে, কিন্তু খোরাকি হয়নি। শুধু খোরাকি আবার লিখুন। (${error.message})` : error.message);
    if (data) refs.push({ table: "expenses", id: (data as { id: string }).id });
  }
  return refs;
}
