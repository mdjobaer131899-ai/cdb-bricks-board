// Monthly salary accrues day by day: full months since join + (extra days / 30).
export function accruedMonths(join: string | null | undefined, now = new Date()): number {
  if (!join) return 0;
  const j = new Date(join + "T00:00:00");
  const t = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (t < j) return 0;
  let months = (t.getFullYear() - j.getFullYear()) * 12 + (t.getMonth() - j.getMonth());
  let anchor = new Date(j.getFullYear(), j.getMonth() + months, j.getDate());
  if (anchor > t) { months -= 1; anchor = new Date(j.getFullYear(), j.getMonth() + months, j.getDate()); }
  const days = Math.round((t.getTime() - anchor.getTime()) / 86400000) + 1; // today counts
  return months + Math.min(days, 30) / 30;
}

export function accruedDays(join: string | null | undefined, now = new Date()) {
  const m = accruedMonths(join, now);
  return Math.round(m * 30);
}
