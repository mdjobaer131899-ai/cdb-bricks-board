import { supabase } from "@/integrations/supabase/client";

export const OPENING_NONE = "__no_opening__";

export interface OpeningDue {
  id: string;
  display_name: string | null;
  fiscal_year: number;
  amount: number;
  paid_amount: number;
  remaining_amount: number;
}

/** গত বছরের গ্রাহক ইট-বাকি (অগ্রিম) — যেগুলো এখনো সমন্বয় বাকি আছে */
export async function fetchCustomerOpeningDues(customerId: string): Promise<OpeningDue[]> {
  const { data, error } = await supabase
    .from("opening_balance_summary")
    .select("id, display_name, fiscal_year, amount, paid_amount, remaining_amount")
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
  }));
}
