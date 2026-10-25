import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/fetch-all";
import { PIECES_PER_TRUCK } from "@/lib/opening-adjust";

/**
 * How a challan sold at the day's price is paid (sales_entries.pay_mode). Bookings
 * (contract_id) and last season's advance (opening_balance_id) have their own accounts and
 * no pay_mode. 'cash': the money taken (cash_received) becomes a collection linked to the
 * challan by the trigger sync_cash_sale_collection; 'advance': taken from this season's
 * advance money at the day's price less the customer's discount; 'credit': the customer owes.
 */
export type PayMode = "cash" | "advance" | "credit";

export const PAY_MODES: { value: PayMode; label: string; hint: string }[] = [
  { value: "cash", label: "নগদ", hint: "টাকা ইটের সাথেই নিলাম — ক্যাশে নিজে থেকে যোগ হবে" },
  { value: "advance", label: "অগ্রিম টাকা থেকে", hint: "এ বছরের অগ্রিম জমা থেকে কাটবে, ছাড়সহ" },
  { value: "credit", label: "বাকিতে", hint: "গ্রাহক পরে দেবে" },
];

export const PAY_MODE_LABEL: Record<PayMode, string> = { cash: "নগদ", advance: "অগ্রিম টাকা থেকে", credit: "বাকিতে" };

/** the label of how one challan is paid, for lists and the invoice */
export function challanPayLabel(r: { contract_id?: string | null; opening_balance_id?: string | null; pay_mode?: string | null }): string {
  if (r.contract_id) return "বুকিং থেকে";
  if (r.opening_balance_id) return "গত বছরের অগ্রিম থেকে";
  if (r.pay_mode && r.pay_mode in PAY_MODE_LABEL) return PAY_MODE_LABEL[r.pay_mode as PayMode];
  return "";
}

/**
 * The customer's current account, the same rule as the collections page, dashboard and AI:
 * approved challans that are not from a booking or last season's advance − collections that
 * are not for a booking. > 0 the customer owes; < 0 advance money left.
 */
export async function fetchCustomerBalance(customerId: string): Promise<number> {
  const [sales, cols] = await Promise.all([
    fetchAllRows<{ total_amount: number }>(() => supabase.from("sales_entries").select("id, total_amount")
      .eq("customer_id", customerId).eq("status", "approved").is("contract_id", null).is("opening_balance_id", null).order("id")),
    fetchAllRows<{ amount: number }>(() => supabase.from("collections").select("id, amount")
      .eq("customer_id", customerId).is("contract_id", null).order("id")),
  ]);
  return sales.reduce((a, r) => a + Number(r.total_amount || 0), 0) - cols.reduce((a, r) => a + Number(r.amount || 0), 0);
}

/** less per piece on bricks taken from this season's advance (customer_price_terms), 0 if none */
export async function fetchCustomerDiscount(customerId: string): Promise<number> {
  const { data, error } = await supabase
    .from("customer_price_terms")
    .select("discount_per_piece")
    .eq("customer_id", customerId)
    .maybeSingle();
  if (error) throw error;
  return Number(data?.discount_per_piece || 0);
}

/** "গাড়িতে ৳১,০০০ (প্রতি পিস ৳০.৫)" */
export function discountLabel(perPiece: number): string {
  const perTruck = Math.round(perPiece * PIECES_PER_TRUCK * 100) / 100;
  return `গাড়িতে ৳${perTruck.toLocaleString("bn-BD")} (প্রতি পিস ৳${perPiece.toLocaleString("bn-BD")})`;
}
