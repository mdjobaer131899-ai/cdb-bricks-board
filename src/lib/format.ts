export const bn = (n: number | string | null | undefined) => {
  if (n === null || n === undefined || n === "") return "০";
  const num = typeof n === "string" ? Number(n) : n;
  if (!Number.isFinite(num)) return "০";
  return num.toLocaleString("bn-BD");
};

export const bnDate = (d: string | Date) => {
  const date = typeof d === "string" ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d}T00:00:00+06:00` : d) : d;
  return date.toLocaleDateString("bn-BD", { timeZone: "Asia/Dhaka", day: "2-digit", month: "short", year: "numeric" });
};

/** বাংলাদেশ সময় (Asia/Dhaka) অনুযায়ী YYYY-MM-DD */
export const isoDate = (d: Date) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
  return parts; // en-CA → YYYY-MM-DD
};

/** আজকের তারিখ (ঢাকা সময়) */
export const todayBD = () => isoDate(new Date());

/** ঢাকা সময় অনুযায়ী তারিখ ও সময় */
export const bnDateTime = (d: string | Date) => {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("bn-BD", {
    timeZone: "Asia/Dhaka",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};
