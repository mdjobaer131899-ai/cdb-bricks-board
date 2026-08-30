import { supabase } from "@/integrations/supabase/client";
import { sdb } from "@/lib/season-db";

function toCsv(rows: any[]): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const esc = (v: any) => {
    if (v === null || v === undefined) return "";
    const s = typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(","), ...rows.map((r) => headers.map((h) => esc(r[h])).join(","))].join("\n");
}

function download(name: string, content: string, mime = "text/csv;charset=utf-8") {
  const blob = new Blob(["\ufeff" + content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export async function exportAllData(monthYM?: string) {
  const dateFilter = (col: string) => monthYM
    ? { gte: `${monthYM}-01`, lte: `${monthYM}-31` }
    : null;

  const tables = [
    { name: "customers", q: sdb.from("customers").select("*") },
    { name: "sales_entries", q: sdb.from("sales_entries").select("*"), dateCol: "sale_date" },
    { name: "collections", q: sdb.from("collections").select("*"), dateCol: "payment_date" },
    { name: "expenses", q: sdb.from("expenses").select("*"), dateCol: "expense_date" },
    { name: "raw_material_purchases", q: sdb.from("raw_material_purchases").select("*"), dateCol: "purchase_date" },
    { name: "worker_payments", q: sdb.from("worker_payments").select("*"), dateCol: "payment_date" },
    { name: "vehicle_expenses", q: sdb.from("vehicle_expenses").select("*"), dateCol: "expense_date" },
  ];

  for (const t of tables) {
    let q: any = t.q;
    const f = (t as any).dateCol ? dateFilter((t as any).dateCol) : null;
    if (f && (t as any).dateCol) q = q.gte((t as any).dateCol, f.gte).lte((t as any).dateCol, f.lte);
    const { data, error } = await q;
    if (error) throw new Error(`${t.name}: ${error.message}`);
    const csv = toCsv(data ?? []);
    download(`${t.name}${monthYM ? "_" + monthYM : ""}.csv`, csv);
    await new Promise((r) => setTimeout(r, 200));
  }
}
