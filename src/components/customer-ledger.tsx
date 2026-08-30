import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Printer, FileDown, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { sdb } from "@/lib/season-db";
import { bn, bnDate } from "@/lib/format";
import { printReport, escapeHtml } from "@/lib/print-report";

interface LedgerRow {
  date: string;
  description: string;
  debit: number;   // owed (sale)
  credit: number;  // paid (collection / advance)
  balance: number; // running due
  ref: string;
}

interface Props { customerId: string; customerName: string; }

export function CustomerLedger({ customerId, customerName }: Props) {
  const q = useQuery({
    queryKey: ["ledger", customerId],
    queryFn: async () => {
      const [salesRes, colRes] = await Promise.all([
        sdb.from("sales_entries").select("id, challan_no, sale_date, total_amount, status, sale_type, quantity, contract_id, brick_type:brick_types(name)").eq("customer_id", customerId).eq("status", "approved").order("sale_date"),
        sdb.from("collections").select("id, amount, payment_date, method, note, contract_id, contract:contracts(contract_no)").eq("customer_id", customerId).order("payment_date"),
      ]);
      return {
        sales: salesRes.data ?? [],
        collections: colRes.data ?? [],
      };
    },
  });

  const rows: LedgerRow[] = useMemo(() => {
    if (!q.data) return [];
    const events: Omit<LedgerRow, "balance">[] = [];

    for (const s of q.data.sales as Array<{ challan_no: string; sale_date: string; total_amount: number; sale_type: string; quantity: number; brick_type: { name?: string } | null }>) {
      if (s.sale_type === "advance") continue; // advance contract sales accounted via booked_value
      events.push({
        date: s.sale_date,
        description: `চালান ${s.challan_no} — ${s.brick_type?.name ?? "ইট"} (${bn(s.quantity)})`,
        debit: Number(s.total_amount || 0),
        credit: 0,
        ref: s.challan_no,
      });
    }
    for (const c of q.data.contracts as Array<{ contract_no: string; booked_value: number; created_at: string; contract_type: string }>) {
      events.push({
        date: c.created_at.slice(0, 10),
        description: `চুক্তি ${c.contract_no} (${c.contract_type === "yearly_fixed" ? "বার্ষিক" : c.contract_type === "short_term" ? "স্বল্পমেয়াদী" : "নগদ"}) — বুকিং`,
        debit: Number(c.booked_value || 0),
        credit: 0,
        ref: c.contract_no,
      });
    }
    for (const p of q.data.collections as Array<{ amount: number; payment_date: string; method: string | null; note: string | null }>) {
      events.push({
        date: p.payment_date,
        description: `কালেকশন${p.method ? ` (${p.method})` : ""}${p.note ? ` — ${p.note}` : ""}`,
        debit: 0,
        credit: Number(p.amount || 0),
        ref: "—",
      });
    }
    for (const p of q.data.payments as Array<{ amount: number; payment_date: string; method: string | null; contract: { contract_no?: string } | null }>) {
      events.push({
        date: p.payment_date,
        description: `চুক্তি পেমেন্ট ${p.contract?.contract_no ?? ""}${p.method ? ` (${p.method})` : ""}`,
        debit: 0,
        credit: Number(p.amount || 0),
        ref: p.contract?.contract_no ?? "—",
      });
    }
    events.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    let bal = 0;
    return events.map((e) => {
      bal += e.debit - e.credit;
      return { ...e, balance: bal };
    });
  }, [q.data]);

  const totals = useMemo(() => {
    const debit = rows.reduce((s, r) => s + r.debit, 0);
    const credit = rows.reduce((s, r) => s + r.credit, 0);
    return { debit, credit, balance: debit - credit };
  }, [rows]);

  function doPrint() {
    const body = `
      <table>
        <thead><tr><th>তারিখ</th><th>বিবরণ</th><th class="right">ডেবিট (পাওনা)</th><th class="right">ক্রেডিট (প্রাপ্ত)</th><th class="right">ব্যালেন্স</th></tr></thead>
        <tbody>
          ${rows.map((r) => `<tr>
            <td>${bnDate(r.date)}</td>
            <td>${escapeHtml(r.description)}</td>
            <td class="right">${r.debit ? `৳ ${bn(r.debit)}` : "—"}</td>
            <td class="right">${r.credit ? `৳ ${bn(r.credit)}` : "—"}</td>
            <td class="right">৳ ${bn(r.balance)}</td>
          </tr>`).join("")}
        </tbody>
      </table>
      <div class="totals">
        <div class="row"><span>মোট ডেবিট</span><span>৳ ${bn(totals.debit)}</span></div>
        <div class="row"><span>মোট ক্রেডিট</span><span>৳ ${bn(totals.credit)}</span></div>
        <div class="row grand"><span>বর্তমান বকেয়া</span><span>৳ ${bn(totals.balance)}</span></div>
      </div>
    `;
    printReport({ title: "গ্রাহক লেজার", subtitle: customerName, bodyHtml: body });
  }

  function doCsv() {
    const header = ["তারিখ", "বিবরণ", "ডেবিট", "ক্রেডিট", "ব্যালেন্স"];
    const lines = [header.join(",")];
    for (const r of rows) lines.push([r.date, `"${r.description.replace(/"/g, '""')}"`, r.debit, r.credit, r.balance].join(","));
    lines.push(["", "মোট", totals.debit, totals.credit, totals.balance].join(","));
    const blob = new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ledger-${customerName}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap">
        <div>
          <CardTitle className="text-base">গ্রাহক লেজার (ব্যাংক স্টেটমেন্ট স্টাইল)</CardTitle>
          <CardDescription>চুক্তি বুকিং + চালান (ডেবিট) ও কালেকশন/পেমেন্ট (ক্রেডিট)</CardDescription>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={doCsv}><FileSpreadsheet className="mr-1 h-4 w-4" /> Excel</Button>
          <Button variant="outline" size="sm" onClick={doPrint}><FileDown className="mr-1 h-4 w-4" /> PDF</Button>
          <Button size="sm" onClick={doPrint}><Printer className="mr-1 h-4 w-4" /> প্রিন্ট</Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {q.isLoading ? (
          <div className="space-y-2 p-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8" />)}</div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>তারিখ</TableHead>
                  <TableHead>বিবরণ</TableHead>
                  <TableHead className="text-right">ডেবিট (পাওনা)</TableHead>
                  <TableHead className="text-right">ক্রেডিট (প্রাপ্ত)</TableHead>
                  <TableHead className="text-right">ব্যালেন্স</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">কোনো লেনদেন নেই</TableCell></TableRow>
                ) : rows.map((r, i) => (
                  <TableRow key={i} className="text-sm">
                    <TableCell className="text-xs whitespace-nowrap">{bnDate(r.date)}</TableCell>
                    <TableCell>{r.description}</TableCell>
                    <TableCell className="text-right tabular-nums text-warning">{r.debit ? `৳ ${bn(r.debit)}` : "—"}</TableCell>
                    <TableCell className="text-right tabular-nums text-success">{r.credit ? `৳ ${bn(r.credit)}` : "—"}</TableCell>
                    <TableCell className={`text-right tabular-nums font-semibold ${r.balance > 0 ? "text-destructive" : r.balance < 0 ? "text-success" : ""}`}>৳ {bn(r.balance)}</TableCell>
                  </TableRow>
                ))}
                {rows.length > 0 && (
                  <TableRow className="bg-muted/40 font-semibold">
                    <TableCell colSpan={2}>মোট</TableCell>
                    <TableCell className="text-right tabular-nums">৳ {bn(totals.debit)}</TableCell>
                    <TableCell className="text-right tabular-nums">৳ {bn(totals.credit)}</TableCell>
                    <TableCell className={`text-right tabular-nums ${totals.balance > 0 ? "text-destructive" : "text-success"}`}>৳ {bn(totals.balance)}</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
