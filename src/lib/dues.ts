import type { KilnSnapshot } from "@/services/gemini";
import { bn } from "@/lib/format";

/**
 * পাওনা-দেনা: who owes the kiln and whom the kiln owes, built from the one snapshot
 * (services/gemini.ts getKilnSnapshot), so the dues page, the dashboard tiles and the AI
 * always show the same numbers. Rules: customers = all approved non-contract challans −
 * collections; sardars and staff = this season's earnings − this season's pay (old dues are
 * the opening balances); suppliers, contract people and loans = all-time; a fixed-price
 * booking = money taken − bricks delivered at its price (lib/bookings.ts).
 */
export type DuePerson = { name: string; amount: number; sub?: string; to?: string; params?: Record<string, string> };
export type DueLine = { key: string; label: string; total: number; people: DuePerson[]; to: string; search?: Record<string, string> };

const sum = (xs: DuePerson[]) => xs.reduce((a, x) => a + x.amount, 0);
const CONTRACT_TYPE_LABEL: Record<string, string> = { "গাড়ি ভাড়া": "গাড়ির মালিক", "জমি ভাড়া": "জমির মালিক", "পরিচ্ছন্ন কর্মী": "পরিচ্ছন্ন কর্মী", "ভেকু": "ভেকু" };

function line(key: string, label: string, people: DuePerson[], to: string, search?: Record<string, string>): DueLine {
  const sorted = people.filter((p) => p.amount > 0.5).sort((a, b) => b.amount - a.amount);
  return { key, label, total: sum(sorted), people: sorted, to, search };
}

export function buildDues(s: KilnSnapshot): { receive: DueLine[]; pay: DueLine[] } {
  const open = (kind: string) => s.opening.filter((o) => o.kind === kind && o.remaining > 0.5).map((o) => ({ name: o.name, amount: o.remaining }));
  const loansBy = (dir: string) => {
    const m = new Map<string, number>();
    for (const l of s.loans) if (l.direction === dir) m.set(l.party, (m.get(l.party) ?? 0) + l.amount);
    for (const p of s.loanPaid) if (p.direction === dir) m.set(p.party, (m.get(p.party) ?? 0) - p.amount);
    return [...m].map(([name, amount]) => ({ name, amount }));
  };
  const supplierSub = (type: string) => CONTRACT_TYPE_LABEL[type] ?? (type || undefined);

  const receive = [
    line("customer-due", "গ্রাহকের বাকি", s.customers.map((c) => ({ name: c.name, amount: c.balance, to: "/customers/$id", params: { id: c.id } })), "/collections"),
    line("old-receivable", "গত বছরের পাওনা", open("customer_receivable"), "/opening-balances"),
    line("sardar-advance", "সরদারের কাছে দাদন", s.sardars.map((x) => ({ name: x.name, amount: -x.due, sub: x.kindLabel })), "/sardars"),
    line("staff-advance", "স্টাফ ও শ্রমিকের কাছে অগ্রিম", s.workers.map((w) => ({ name: w.name, amount: -w.due, sub: w.isDaily ? "ডেলি" : "মেস্তুরি / ম্যানেজার" })), "/salaries"),
    line("supplier-advance", "সাপ্লায়ারকে আগাম দেওয়া", s.suppliers.map((x) => ({ name: x.name, amount: -x.due, sub: supplierSub(x.material) })), "/purchases"),
    line("loan-given", "দেওয়া ঋণ", loansBy("given"), "/loans"),
  ].filter((l) => l.total > 0.5);

  const pay = [
    line("sardar-due", "সরদার পাবে", s.sardars.map((x) => ({ name: x.name, amount: x.due, sub: x.kindLabel })), "/sardars"),
    line("staff-due", "স্টাফ ও শ্রমিক পাবে", s.workers.map((w) => ({ name: w.name, amount: w.due, sub: w.isDaily ? "ডেলি" : "মেস্তুরি / ম্যানেজার" })), "/salaries"),
    line("supplier-due", "সাপ্লায়ার, ভেকু, গাড়ি ও জমির মালিক পাবে", s.suppliers.map((x) => ({ name: x.name, amount: x.due, sub: supplierSub(x.material) })), "/purchases"),
    line("booking-owed", "ঠিক দামে বুকিং (ইট দেওয়া বাকি)", (s.bookings ?? []).map((b) => ({ name: b.customer, amount: b.owed, sub: `${b.no} · ${bn(b.trucksLeft)} গাড়ি বাকি`, to: "/customers/$id", params: { id: b.customerId } })), "/advance-sales", { t: "booking" }),
    line("customer-advance", "গ্রাহকের অগ্রিম (ইট দেওয়া বাকি)", s.customers.map((c) => ({ name: c.name, amount: -c.balance, to: "/customers/$id", params: { id: c.id } })), "/advance-sales"),
    line("old-brick-due", "গত বছরের অগ্রিম (ইট দেওয়া বাকি)", open("customer_brick_due"), "/opening-balances"),
    line("old-payable", "পূর্বের দেনা", [...open("sardar_payable"), ...open("other_payable")], "/opening-balances"),
    line("loan-taken", "নেওয়া ঋণ", loansBy("taken"), "/loans"),
  ].filter((l) => l.total > 0.5);

  return { receive, pay };
}
