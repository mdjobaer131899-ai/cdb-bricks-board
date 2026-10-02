import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { PackageCheck, Printer, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatCard } from "@/components/stat-card";
import { supabase } from "@/integrations/supabase/client";
import { sdb } from "@/lib/season-db";
import { bn } from "@/lib/format";
import { printTable } from "@/lib/print-table";

export const Route = createFileRoute("/_authenticated/advance-sales")({
  head: () => ({
    meta: [
      { title: "অগ্রিম ইট বিক্রয় — CDB Bricks" },
      { name: "description", content: "কোন পাওনাদার কত টাকা অগ্রিম দিয়েছে আর কত ইট নিয়েছে তার হিসাব।" },
      { property: "og:title", content: "অগ্রিম ইট বিক্রয় — CDB Bricks" },
      { property: "og:description", content: "অগ্রিম টাকা ও নেওয়া ইটের হিসাব।" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdvancePage,
});

function AdvancePage() {
  const q = useQuery({
    queryKey: ["advance-sales"],
    queryFn: async () => {
      const [c, col, s] = await Promise.all([
        supabase.from("customers").select("id,name,phone").order("name"),
        sdb.from("collections").select("customer_id, amount"),
        sdb.from("sales_entries").select("customer_id, quantity, total_amount, status").eq("status", "approved"),
      ]);
      if (c.error) throw c.error; if (col.error) throw col.error; if (s.error) throw s.error;
      return (c.data ?? []).map((cu) => {
        const paid = (col.data ?? []).filter((x) => x.customer_id === cu.id).reduce((a, b) => a + Number(b.amount || 0), 0);
        const mine = (s.data ?? []).filter((x) => x.customer_id === cu.id);
        const qty = mine.reduce((a, b) => a + Number(b.quantity || 0), 0);
        const value = mine.reduce((a, b) => a + Number(b.total_amount || 0), 0);
        return { ...cu, paid, qty, value, balance: paid - value };
      }).filter((r) => r.paid > 0 || r.qty > 0);
    },
  });
  const rows = q.data ?? [];
  const adv = rows.filter((r) => r.balance > 0);
  const totAdv = adv.reduce((a, b) => a + b.balance, 0);
  const totDue = rows.filter((r) => r.balance < 0).reduce((a, b) => a - b.balance, 0);
  const lab = (b: number) => (b > 0 ? `অগ্রিম জমা ৳ ${bn(b)}` : b < 0 ? `বাকি ৳ ${bn(-b)}` : "সমান");
  const avgRate = (r: { qty: number; value: number }) => (r.qty ? r.value / r.qty : 0);

  const print = () => printTable({
    title: "অগ্রিম ইট বিক্রয় হিসাব",
    headers: ["নাম", "দিয়েছে (৳)", "ইট নিয়েছে (পিস)", "ইটের দাম (৳)", "অবস্থা"], rightCols: [1, 2, 3],
    rows: rows.map((r) => [r.name, bn(r.paid), bn(r.qty), bn(r.value), lab(r.balance)]),
    totals: [["মোট অগ্রিম জমা (ইট দেওয়া বাকি)", `৳ ${bn(totAdv)}`], ["মোট বাকি পাওনা", `৳ ${bn(totDue)}`]],
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold md:text-2xl"><PackageCheck className="h-6 w-6 text-primary" /> অগ্রিম ইট বিক্রয়</h1>
          <p className="text-sm text-muted-foreground">অগ্রিম টাকা "কালেকশন" পাতায় নিন, ইট দেওয়ার সময় চালান করুন — এখানে স্বয়ংক্রিয় হিসাব হবে।</p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="secondary"><Link to="/collections">অগ্রিম টাকা নিন</Link></Button>
          <Button variant="outline" onClick={print}><Printer className="mr-1 h-4 w-4" /> প্রিন্ট</Button>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <StatCard label="অগ্রিম জমা — ইট দেওয়া বাকি" value={`৳ ${bn(totAdv)}`} icon={Wallet} tone="warning" />
        <StatCard label="গ্রাহকের কাছে বাকি পাওনা" value={`৳ ${bn(totDue)}`} icon={Wallet} tone="destructive" />
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">পাওনাদার তালিকা</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow><TableHead>নাম</TableHead><TableHead className="text-right">দিয়েছে</TableHead><TableHead className="text-right">ইট নিয়েছে</TableHead><TableHead className="text-right">ইটের দাম</TableHead><TableHead className="text-right">অবস্থা</TableHead></TableRow></TableHeader>
            <TableBody>
              {rows.length === 0 && <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">কোনো তথ্য নেই</TableCell></TableRow>}
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell><Link to="/customers/$id" params={{ id: r.id }} className="font-medium text-primary hover:underline">{r.name}</Link><div className="text-xs text-muted-foreground">{r.phone ?? ""}</div></TableCell>
                  <TableCell className="text-right tabular-nums">৳ {bn(r.paid)}</TableCell>
                  <TableCell className="text-right tabular-nums">{bn(r.qty)} পিস</TableCell>
                  <TableCell className="text-right tabular-nums">৳ {bn(r.value)}{r.qty ? <div className="text-xs text-muted-foreground">গড় ৳ {bn(Math.round(avgRate(r) * 100) / 100)}</div> : null}</TableCell>
                  <TableCell className={`text-right font-semibold ${r.balance > 0 ? "text-warning" : r.balance < 0 ? "text-destructive" : ""}`}>{lab(r.balance)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
