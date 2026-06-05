export const bn = (n: number | string | null | undefined) => {
  if (n === null || n === undefined || n === "") return "০";
  const num = typeof n === "string" ? Number(n) : n;
  if (!Number.isFinite(num)) return "০";
  return num.toLocaleString("bn-BD");
};

export const bnDate = (d: string | Date) => {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("bn-BD", { day: "2-digit", month: "short", year: "numeric" });
};

export const isoDate = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};
