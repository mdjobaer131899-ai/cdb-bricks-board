import { supabase } from "@/integrations/supabase/client";
import { bn, bnDate, todayBD } from "@/lib/format";

/** a loan whose date is this many days away or less is shown as coming up */
export const LOAN_SOON_DAYS = 7;

/** days from today (Dhaka) to a YYYY-MM-DD date; negative when it has passed */
export function daysUntil(date: string, today = todayBD()): number {
  const [y1, m1, d1] = today.split("-").map(Number);
  const [y2, m2, d2] = date.slice(0, 10).split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

export type LoanDue = { tone: "overdue" | "near" | "later"; text: string };

/** how close a loan's due date is (loans.due_date); null when no date or nothing left to pay */
export function loanDue(dueDate: string | null | undefined, remaining: number, today = todayBD()): LoanDue | null {
  if (!dueDate || remaining <= 0.5) return null;
  const d = daysUntil(dueDate, today);
  if (d < 0) return { tone: "overdue", text: `তারিখ পেরিয়েছে ${bn(-d)} দিন আগে (${bnDate(dueDate)})` };
  if (d === 0) return { tone: "near", text: "আজই শেষ তারিখ" };
  if (d === 1) return { tone: "near", text: `কাল শেষ তারিখ (${bnDate(dueDate)})` };
  if (d <= LOAN_SOON_DAYS) return { tone: "near", text: `আর ${bn(d)} দিন (${bnDate(dueDate)})` };
  return { tone: "later", text: `শেষ তারিখ ${bnDate(dueDate)}` };
}

export const LOAN_DUE_CLASS: Record<LoanDue["tone"], string> = {
  overdue: "text-destructive",
  near: "text-warning",
  later: "text-muted-foreground",
};

export type LoanWithDue = {
  id: string;
  party: string;
  direction: "taken" | "given";
  remaining: number;
  due_date: string;
  due: LoanDue;
};

/** loans with something left whose date has passed or is within LOAN_SOON_DAYS, soonest first */
export async function fetchLoansDueSoon(): Promise<LoanWithDue[]> {
  const [loans, pays] = await Promise.all([
    supabase.from("loans").select("id, party_name, direction, amount, due_date").not("due_date", "is", null),
    supabase.from("loan_payments").select("loan_id, amount"),
  ]);
  if (loans.error) throw loans.error;
  if (pays.error) throw pays.error;
  const paid = new Map<string, number>();
  for (const p of pays.data ?? []) paid.set(p.loan_id, (paid.get(p.loan_id) ?? 0) + Number(p.amount || 0));
  const out: LoanWithDue[] = [];
  for (const l of loans.data ?? []) {
    const remaining = Number(l.amount || 0) - (paid.get(l.id) ?? 0);
    const due = loanDue(l.due_date, remaining);
    if (due && due.tone !== "later") {
      out.push({ id: l.id, party: l.party_name, direction: l.direction === "given" ? "given" : "taken", remaining, due_date: l.due_date!, due });
    }
  }
  return out.sort((a, b) => a.due_date.localeCompare(b.due_date));
}
