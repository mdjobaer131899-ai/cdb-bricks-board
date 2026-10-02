import { printReport, escapeHtml } from "@/lib/print-report";

/** যেকোনো তালিকা সহজে প্রিন্ট করার সহায়ক */
export function printTable(opts: {
  title: string;
  subtitle?: string;
  headers: string[];
  rows: (string | number)[][];
  rightCols?: number[];
  totals?: [string, string][];
}) {
  const right = new Set(opts.rightCols ?? []);
  const th = opts.headers.map((h, i) => `<th class="${right.has(i) ? "right" : ""}">${escapeHtml(h)}</th>`).join("");
  const body = opts.rows
    .map((r) => `<tr>${r.map((c, i) => `<td class="${right.has(i) ? "right" : ""}">${escapeHtml(String(c ?? ""))}</td>`).join("")}</tr>`)
    .join("");
  const totals = opts.totals?.length
    ? `<div class="totals">${opts.totals.map(([k, v], i) => `<div class="row ${i === opts.totals!.length - 1 ? "grand" : ""}"><span>${escapeHtml(k)}</span><span>${escapeHtml(v)}</span></div>`).join("")}</div>`
    : "";
  printReport({
    title: opts.title,
    subtitle: opts.subtitle,
    bodyHtml: `<table><thead><tr>${th}</tr></thead><tbody>${body || `<tr><td colspan="${opts.headers.length}">কোনো তথ্য নেই</td></tr>`}</tbody></table>${totals}`,
  });
}
