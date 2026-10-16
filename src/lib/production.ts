import { supabase } from "@/integrations/supabase/client";

/**
 * Production ledger helpers: mills, per-thousand rates by step and brick grades.
 * Rates live in production_rates with an effective date, so a new rate only
 * pre-fills entries from that date on; every entry still stores its own rate.
 */

export type RateKind = "production" | "load" | "unload";
export type ProductionRate = { id: string; kind: RateKind; rate: number; effective_from: string; note: string | null };
export type Mill = { id: string; name: string; sort_order: number; sardar_id: string | null; is_active: boolean };

export const RATE_LABEL: Record<RateKind, string> = {
  production: "কাঁচা ইট তৈরি",
  load: "ভাটায় ঢোকানো",
  unload: "বের করা",
};

/** Grades counted when bricks come out of the kiln, in display order */
export const UNLOAD_GRADES = ["১ নং ইট", "২ নং ইট", "পিকেট", "১ নং আদলা", "২ নং আদলা", "মিক্সার আদলা"];

export const DAMAGE_REASONS = ["বৃষ্টি", "শুকানোর সময় ভাঙা", "বহনে ভাঙা", "অন্যান্য"];

export async function fetchProductionRates(): Promise<ProductionRate[]> {
  const { data, error } = await (supabase as any)
    .from("production_rates")
    .select("id, kind, rate, effective_from, note")
    .order("effective_from", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as any[]).map((r) => ({ ...r, rate: Number(r.rate) }));
}

/** The rate in force on a date (YYYY-MM-DD), or null when none was set yet */
export function rateOn(rates: ProductionRate[] | undefined, kind: RateKind, date: string): number | null {
  const r = (rates ?? [])
    .filter((x) => x.kind === kind && x.effective_from <= date)
    .sort((a, b) => (a.effective_from < b.effective_from ? 1 : -1))[0];
  return r ? r.rate : null;
}

export async function fetchMills(): Promise<Mill[]> {
  const { data, error } = await (supabase as any)
    .from("mills")
    .select("id, name, sort_order, sardar_id, is_active")
    .order("sort_order");
  if (error) throw error;
  return (data ?? []) as Mill[];
}
