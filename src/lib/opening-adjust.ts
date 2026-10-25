import { supabase } from "@/integrations/supabase/client";
import { bn } from "@/lib/format";

export const OPENING_NONE = "__no_opening__";

/** a truck (গাড়ি) of bricks, the unit last season's advance was sold in */
export const PIECES_PER_TRUCK = 2000;

export interface OpeningDue {
  id: string;
  display_name: string | null;
  fiscal_year: number;
  amount: number;
  paid_amount: number;
  remaining_amount: number;
  /** price per piece agreed last season (৳16,000 a truck = ৳8); null when not set */
  unit_rate: number | null;
  /** bricks still to give at that price; null when unit_rate is not set */
  remaining_qty: number | null;
}

/** "৩,৮৮,০০০ ইট (১৯৪ গাড়ি)" */
export function piecesLabel(qty: number): string {
  const trucks = Math.round((qty / PIECES_PER_TRUCK) * 100) / 100;
  return `${bn(Math.round(qty))} ইট (${bn(trucks)} গাড়ি)`;
}

/** গত বছরের গ্রাহক ইট-বাকি (অগ্রিম) — যেগুলো এখনো সমন্বয় বাকি আছে */
export async function fetchCustomerOpeningDues(customerId: string): Promise<OpeningDue[]> {
  const { data, error } = await supabase
    .from("opening_balance_summary")
    .select("id, display_name, fiscal_year, amount, paid_amount, remaining_amount, unit_rate, remaining_qty")
    .eq("kind", "customer_brick_due")
    .eq("customer_id", customerId)
    .order("fiscal_year", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    id: r.id as string,
    display_name: r.display_name ?? null,
    fiscal_year: Number(r.fiscal_year || 0),
    amount: Number(r.amount || 0),
    paid_amount: Number(r.paid_amount || 0),
    remaining_amount: Number(r.remaining_amount || 0),
    unit_rate: r.unit_rate == null ? null : Number(r.unit_rate),
    remaining_qty: r.remaining_qty == null ? null : Number(r.remaining_qty),
  }));
}

/** the option text for an old advance in the challan forms */
export function openingDueLabel(d: OpeningDue): string {
  const left = d.remaining_qty != null ? `বাকি ${piecesLabel(d.remaining_qty)}` : `বাকি ৳${bn(d.remaining_amount)}`;
  return `${bn(d.fiscal_year)} সালের অগ্রিম • ${left}`;
}
