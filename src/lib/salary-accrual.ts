import { todayBD } from "@/lib/format";
import { getSeasonRange } from "@/lib/season-db";

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

/** Salary earned in the season window, less absent days at salary ÷ 30 per day */
export function salaryEarned(p: {
  monthly: number | string | null | undefined;
  join: string | null | undefined;
  leave?: string | null;
  absentDays?: number;
  today?: string;
}): SalaryEarned {
  const w = salaryWindow(p.join, p.leave, p.today);
  if (!w) return { months: 0, days: 0, earned: 0, start: null, end: null };
  const sal = Number(p.monthly || 0);
  const months = monthsBetween(w.start, w.end);
  const earned = Math.max(0, Math.round(months * sal - (p.absentDays ?? 0) * (sal / 30)));
  return { months, days: Math.round(months * 30), earned, start: w.start, end: w.end };
}

/** kacha_brick_entries types that earn a sardar money ('damage' only records broken bricks) */
export const SARDAR_EARNING_TYPES = new Set(["production", "load"]);

type SardarLike = { id: string; kind?: string | null; monthly_salary?: number | string | null; join_date?: string | null; leave_date?: string | null };
type KachaLike = { sardar_id: string | null; entry_type: string; quantity?: number | string | null; amount?: number | string | null };
type WorkLike = { sardar_id: string | null; quantity?: number | string | null; amount?: number | string | null };

/**
 * What a sardar earned in the rows given (callers pass season-scoped rows):
 * burn sardars (পুড়াই মেস্তুরি) earn a monthly salary; mill and load sardars earn
 * their production and load entries plus old per-category work entries.
 */
export function sardarEarned(sd: SardarLike, kacha: KachaLike[], work: WorkLike[] = []) {
  if (sd.kind === "burn") {
    const s = salaryEarned({ monthly: sd.monthly_salary, join: sd.join_date, leave: sd.leave_date });
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
