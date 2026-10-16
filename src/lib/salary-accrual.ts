import { todayBD } from "@/lib/format";
import { getSeasonRange } from "@/lib/season-db";
import { supabase } from "@/integrations/supabase/client";

/**
 * One place for what a person has EARNED (not paid). Every page, the expense form
 * and the AI use these, so a sardar or salaried worker shows the same due everywhere.
 *
 * Earnings are counted inside the selected season, the same window the payments are
 * read in (sdb). Anything unpaid from an earlier season belongs in opening balances
 * (পূর্বের বকেয়া ও জের), not here. All dates are Dhaka calendar dates (YYYY-MM-DD).
 */

const utc = (d: string) => new Date(`${d}T00:00:00Z`);
const later = (a: string, b: string) => (a > b ? a : b);
const earlier = (a: string, b: string) => (a < b ? a : b);

/**
 * Salary months between two dates, both days included: full months plus the extra
 * days as a fraction of 30 (capped at one month), so pay accrues day by day.
 */
export function monthsBetween(start: string, end: string): number {
  const j = utc(start);
  const t = utc(end);
  if (t < j) return 0;
  // Same day-of-month `n` months after the start, clamped to the month's last day (31 Jan → 28 Feb)
  const plusMonths = (n: number) => {
    const y = j.getUTCFullYear(), m = j.getUTCMonth() + n;
    const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    return new Date(Date.UTC(y, m, Math.min(j.getUTCDate(), lastDay)));
  };
  let months = (t.getUTCFullYear() - j.getUTCFullYear()) * 12 + (t.getUTCMonth() - j.getUTCMonth());
  let anchor = plusMonths(months);
  while (months > 0 && anchor > t) {
    months -= 1;
    anchor = plusMonths(months);
  }
  const days = Math.round((t.getTime() - anchor.getTime()) / 86400000) + 1;
  return months + Math.min(days, 30) / 30;
}

/**
 * The days salary accrues for: from the later of join date and season start,
 * to the earliest of today, leave date and season end. Null when nothing accrues
 * (no join date, not joined yet, or left before the season).
 */
export function salaryWindow(join: string | null | undefined, leave?: string | null, today = todayBD()) {
  if (!join) return null;
  const season = getSeasonRange();
  let start = join;
  let end = today;
  if (leave) end = earlier(end, leave);
  if (season) {
    start = later(start, season.from);
    end = earlier(end, season.to);
  }
  if (end < start) return null;
  return { start, end };
}

export type SalaryEarned = { months: number; days: number; earned: number; start: string | null; end: string | null };

/** One row of pay_rates: daily wage for daily workers, monthly salary otherwise */
export type PayRate = { worker_id?: string | null; sardar_id?: string | null; amount: number | string; effective_from: string };

const dayBefore = (d: string) => new Date(utc(d).getTime() - 86400000).toISOString().slice(0, 10);

/**
 * The rate in force on a date: the latest pay_rates row on or before it. Days before
 * the first row use the first row; with no rows at all, the person's current value.
 */
export function rateAt(rates: PayRate[] | undefined, fallback: number | string | null | undefined, date: string): number {
  const list = [...(rates ?? [])].sort((a, b) => (a.effective_from < b.effective_from ? -1 : 1));
  if (!list.length) return Number(fallback || 0);
  let cur = list[0];
  for (const r of list) if (r.effective_from <= date) cur = r;
  return Number(cur.amount || 0);
}

/** Splits [start, end] into pieces with one rate each */
function rateSegments(rates: PayRate[] | undefined, fallback: number | string | null | undefined, start: string, end: string) {
  const cuts = [...new Set((rates ?? []).map((r) => r.effective_from).filter((d) => d > start && d <= end))].sort();
  const out: Array<{ from: string; to: string; amount: number }> = [];
  let from = start;
  for (const c of cuts) {
    out.push({ from, to: dayBefore(c), amount: rateAt(rates, fallback, from) });
    from = c;
  }
  out.push({ from, to: end, amount: rateAt(rates, fallback, from) });
  return out;
}

/**
 * Salary earned in the season window, using the salary history when given, less
 * absent days at (that day's salary ÷ 30). Pass `absences` (dated) to price each
 * absence at its own day's rate, or `absentDays` for the plain count.
 */
export function salaryEarned(p: {
  monthly: number | string | null | undefined;
  join: string | null | undefined;
  leave?: string | null;
  absentDays?: number;
  absences?: Array<{ date: string; half?: boolean | null }>;
  rates?: PayRate[];
  today?: string;
}): SalaryEarned {
  const w = salaryWindow(p.join, p.leave, p.today);
  if (!w) return { months: 0, days: 0, earned: 0, start: null, end: null };
  let gross = 0;
  for (const seg of rateSegments(p.rates, p.monthly, w.start, w.end)) gross += monthsBetween(seg.from, seg.to) * seg.amount;
  let cut = 0;
  if (p.absences) {
    for (const a of p.absences) {
      if (a.date < w.start || a.date > w.end) continue;
      cut += (a.half ? 0.5 : 1) * (rateAt(p.rates, p.monthly, a.date) / 30);
    }
  } else {
    cut = (p.absentDays ?? 0) * (rateAt(p.rates, p.monthly, w.end) / 30);
  }
  const months = monthsBetween(w.start, w.end);
  return { months, days: Math.round(months * 30), earned: Math.max(0, Math.round(gross - cut)), start: w.start, end: w.end };
}

/** Daily worker: each present day (half day = 0.5) at the wage in force that day */
export function dailyEarned(p: {
  wage: number | string | null | undefined;
  days: Array<{ date: string; value: number }>;
  rates?: PayRate[];
}): number {
  return Math.round(p.days.reduce((a, d) => a + d.value * rateAt(p.rates, p.wage, d.date), 0));
}

/** kacha_brick_entries types that earn a sardar money ('damage' only records broken bricks) */
export const SARDAR_EARNING_TYPES = new Set(["production", "load", "unload"]);

type SardarLike = { id: string; kind?: string | null; monthly_salary?: number | string | null; join_date?: string | null; leave_date?: string | null };
type KachaLike = { sardar_id: string | null; entry_type: string; quantity?: number | string | null; amount?: number | string | null };
type WorkLike = { sardar_id: string | null; quantity?: number | string | null; amount?: number | string | null };

/**
 * What a sardar earned in the rows given (callers pass season-scoped rows):
 * burn sardars (পুড়াই মেস্তুরি) earn a monthly salary (with its history from
 * pay_rates); mill, load and unload sardars earn their kacha entries plus old
 * per-category work entries.
 */
export function sardarEarned(sd: SardarLike, kacha: KachaLike[], work: WorkLike[] = [], payRates: PayRate[] = []) {
  if (sd.kind === "burn") {
    const s = salaryEarned({
      monthly: sd.monthly_salary, join: sd.join_date, leave: sd.leave_date,
      rates: payRates.filter((r) => r.sardar_id === sd.id),
    });
    return { qty: 0, kacha: 0, work: s.earned, earned: s.earned, salary: s };
  }
  let qty = 0, kachaAmt = 0, workAmt = 0;
  for (const k of kacha) {
    if (k.sardar_id !== sd.id || !SARDAR_EARNING_TYPES.has(k.entry_type)) continue;
    qty += Number(k.quantity || 0);
    kachaAmt += Number(k.amount || 0);
  }
  for (const w of work) {
    if (w.sardar_id !== sd.id) continue;
    workAmt += Number(w.amount || 0);
  }
  return { qty, kacha: kachaAmt, work: workAmt, earned: kachaAmt + workAmt, salary: null as SalaryEarned | null };
}

/** Reads pay_rates (all of it is small) for the earnings functions above */
export async function fetchPayRates(): Promise<PayRate[]> {
  const { data, error } = await (supabase as any).from("pay_rates").select("id, worker_id, sardar_id, amount, effective_from, note").order("effective_from");
  if (error) throw error;
  return (data ?? []) as PayRate[];
}
