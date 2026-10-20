import { supabase } from "@/integrations/supabase/client";

/**
 * Paying a daily worker or staff member: last season's unpaid wage (opening_balances
 * linked by worker_id, kind sardar_payable / other_payable) is settled first, and only
 * the rest counts against this season's pay. The expense form and the AI both pay
 * through payWorker, so the split is the same wherever the money is written.
 */

export type WorkerOldDue = { id: string; remaining: number; asOf: string | null };

/** last season's unpaid wage of one worker, oldest first */
export async function fetchWorkerOldDues(workerId: string): Promise<WorkerOldDue[]> {
  const { data, error } = await supabase.from("opening_balance_summary")
    .select("id, remaining_amount, as_of_date")
    .eq("worker_id", workerId)
    .in("kind", ["sardar_payable", "other_payable"]);
  if (error) throw error;
  return ((data ?? []) as any[])
    .map((r) => ({ id: r.id as string, remaining: Number(r.remaining_amount || 0), asOf: (r.as_of_date as string | null) ?? null }))
    .filter((r) => r.remaining > 0.5)
    .sort((a, b) => String(a.asOf ?? "").localeCompare(String(b.asOf ?? "")));
}

/** how a payment splits: old due first, the rest to this season */
export function splitWorkerPay(amount: number, old: WorkerOldDue[]) {
  const parts: Array<{ id: string; amount: number }> = [];
  let left = amount;
  for (const o of old) {
    if (left <= 0.001) break;
    const take = Math.min(left, o.remaining);
    parts.push({ id: o.id, amount: take });
    left -= take;
  }
  return { toOld: parts, toOldTotal: amount - left, toNow: Math.max(0, left) };
}

/** reads the old due fresh at save time, so a payment never goes past what is left */
export async function payWorker(p: { workerId: string; amount: number; date: string; note: string | null; createdBy: string }) {
  const old = await fetchWorkerOldDues(p.workerId);
  const split = splitWorkerPay(p.amount, old);
  for (const o of split.toOld) {
    const { error } = await supabase.from("opening_payments").insert({
      opening_balance_id: o.id, amount: o.amount, payment_date: p.date, method: "নগদ",
      note: p.note ? `${p.note} (গত বছরের বকেয়া)` : "গত বছরের বকেয়া", created_by: p.createdBy,
    } as any);
    if (error) throw error;
  }
  if (split.toNow > 0.001) {
    const { error } = await supabase.from("worker_payments").insert({
      worker_id: p.workerId, amount: split.toNow, payment_date: p.date, payment_type: "payment", note: p.note, created_by: p.createdBy,
    } as any);
    if (error) throw error;
  }
  return split;
}
