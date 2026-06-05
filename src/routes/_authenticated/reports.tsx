import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DateRangeFilter, type DateRange } from "@/components/date-range-filter";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fetchSales, type SaleRow } from "@/lib/sales-queries";
import { bn, bnDate, isoDate } from "@/lib/format";
import { printReport, escapeHtml } from "@/lib/print-report";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({ meta: [{ title: "রিপোর্ট — CDB Bricks" }] }),
  component: ReportsPage,
});

function ReportsPage() {
  const [range, setRange] = useState<DateRange>({ from: new Date(Date.now() - 29 * 86400000), to: new Date() });
  const from = isoDate(range.from);
  const to = isoDate(range.to);
  const q = useQuery({ queryKey: ["sales-report", from, to], queryFn: () => fetchSales({ from, to, limit: 1000 }) });
  const sales = q.data ?? [];
  const subtitle = `${bnDate(range.from)} — ${bnDate(range.to)}`;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold tracking-tight md:text-2xl">রিপোর্ট সেন্টার</h2>
        <p className="text-sm text-muted-foreground">বিক্রয় বিশ্লেষণ ও PDF/প্রিন্ট এক্সপোর্ট</p>
      </div>
      <DateRangeFilter value={range} onChange={setRange} />

      <Tabs defaultValue="daily">
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-4">
          <TabsTrigger value="daily">দৈনিক বিক্রয়</TabsTrigger>
          <TabsTrigger value="customer">গ্রাহকওয়ারী</TabsTrigger>
          <TabsTrigger value="brick">ইটের ধরন</TabsTrigger>
          <TabsTrigger value="manager">ম্যানেজার পারফরম্যান্স</TabsTrigger>
        </TabsList>
        <TabsContent value="daily" className="mt-4"><DailyReport sales={sales} loading={q.isLoading} subtitle={subtitle} /></TabsContent>
        <TabsContent value="customer" className="mt-4"><GroupedReport sales={sales} loading={q.isLoading} subtitle={subtitle} title="গ্রাহকওয়ারী বিক্রয়" keyName="customer" /></TabsContent>
        <TabsContent value="brick" className="mt-4"><GroupedReport sales={sales} loading={q.isLoading} subtitle={subtitle} title="ইটের ধরন অনুযায়ী" keyName="brick" /></TabsContent>
        <TabsContent value="manager" className="mt-4"><GroupedReport sales={sales} loading={q.isLoading} subtitle={subtitle} title="ম্যানেজার পারফরম্যান্স" keyName="manager" /></TabsContent>
      </Tabs>
    </div>
  );
}

function LoadingTable() {
  return <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>;
}

function DailyReport({ sales, loading, subtitle }: { sales: SaleRow[]; loading: boolean; subtitle: string }) {
  const rows = useMemo(() => {
    const map = new Map<string, { date: string; challans: number; bricks: number; amount: number }>();
    sales.filter((s) => s.status === "approved").forEach((s) => {
      const k = s.sale_date;
      const cur = map.get(k) ?? { date: k, challans: 0, bricks: 0, amount: 0 };
      cur.challans += 1; cur.bricks += s.quantity; cur.amount += Number(s.total_amount);
      map.set(k, cur);
    });
    return Array.from(map.values()).sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [sales]);

  const totals = rows.reduce((t, r) => ({ challans: t.challans + r.challans, bricks: t.bricks + r.bricks, amount: t.amount + r.amount }), { challans: 0, bricks: 0, amount: 0 });

  function onPrint() {
    const body = `
      <table><thead><tr><th>তারিখ</th><th class="right">চালান</th><th class="right">ইট</th><th class="right">মোট (৳)</th></tr></thead>
      <tbody>${rows.map((r) => `<tr><td>${escapeHtml(bnDate(r.date))}</td><td class="right">${bn(r.challans)}</td><td class="right">${bn(r.bricks)}</td><td class="right">৳ ${bn(r.amount)}</td></tr>`).join("")}</tbody></table>
      <div class="totals"><div class="row grand"><span>সর্বমোট</span><span>চালান ${bn(totals.challans)} · ইট ${bn(totals.bricks)} · ৳ ${bn(totals.amount)}</span></div></div>`;
    printReport({ title: "দৈনিক বিক্রয় রিপোর্ট", subtitle, bodyHtml: body });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">দৈনিক বিক্রয়</CardTitle>
        <Button size="sm" variant="outline" onClick={onPrint}><Printer className="mr-2 h-4 w-4" /> PDF / প্রিন্ট</Button>
      </CardHeader>
      <CardContent>
        {loading ? <LoadingTable /> : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>তারিখ</TableHead><TableHead className="text-right">চালান</TableHead><TableHead className="text-right">ইট</TableHead><TableHead className="text-right">মোট (৳)</TableHead></TableRow></TableHeader>
              <TableBody>
                {rows.length === 0 ? <TableRow><TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">কোনো তথ্য নেই</TableCell></TableRow>
                  : rows.map((r) => (
                  <TableRow key={r.date}>
                    <TableCell>{bnDate(r.date)}</TableCell>
                    <TableCell className="text-right tabular-nums">{bn(r.challans)}</TableCell>
                    <TableCell className="text-right tabular-nums">{bn(r.bricks)}</TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">৳ {bn(r.amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {rows.length > 0 && (
              <div className="border-t bg-muted/40 px-4 py-3 text-sm flex justify-between font-semibold">
                <span>সর্বমোট</span>
                <span>চালান {bn(totals.challans)} · ইট {bn(totals.bricks)} · ৳ {bn(totals.amount)}</span>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function GroupedReport({ sales, loading, subtitle, title, keyName }: { sales: SaleRow[]; loading: boolean; subtitle: string; title: string; keyName: "customer" | "brick" | "manager" }) {
  const rows = useMemo(() => {
    const map = new Map<string, { name: string; challans: number; bricks: number; amount: number }>();
    sales.filter((s) => s.status === "approved").forEach((s) => {
      const name = keyName === "customer" ? (s.customer?.name ?? "—") : keyName === "brick" ? (s.brick_type?.name ?? "—") : s.manager_name;
      const cur = map.get(name) ?? { name, challans: 0, bricks: 0, amount: 0 };
      cur.challans += 1; cur.bricks += s.quantity; cur.amount += Number(s.total_amount);
      map.set(name, cur);
    });
    return Array.from(map.values()).sort((a, b) => b.amount - a.amount);
  }, [sales, keyName]);

  const totals = rows.reduce((t, r) => ({ challans: t.challans + r.challans, bricks: t.bricks + r.bricks, amount: t.amount + r.amount }), { challans: 0, bricks: 0, amount: 0 });
  const heading = keyName === "customer" ? "গ্রাহক" : keyName === "brick" ? "ইটের ধরন" : "ম্যানেজার";

  function onPrint() {
    const body = `
      <table><thead><tr><th>${heading}</th><th class="right">চালান</th><th class="right">ইট</th><th class="right">মোট (৳)</th></tr></thead>
      <tbody>${rows.map((r) => `<tr><td>${escapeHtml(r.name)}</td><td class="right">${bn(r.challans)}</td><td class="right">${bn(r.bricks)}</td><td class="right">৳ ${bn(r.amount)}</td></tr>`).join("")}</tbody></table>
      <div class="totals"><div class="row grand"><span>সর্বমোট</span><span>চালান ${bn(totals.challans)} · ইট ${bn(totals.bricks)} · ৳ ${bn(totals.amount)}</span></div></div>`;
    printReport({ title, subtitle, bodyHtml: body });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">{title}</CardTitle>
        <Button size="sm" variant="outline" onClick={onPrint}><Printer className="mr-2 h-4 w-4" /> PDF / প্রিন্ট</Button>
      </CardHeader>
      <CardContent>
        {loading ? <LoadingTable /> : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>{heading}</TableHead><TableHead className="text-right">চালান</TableHead><TableHead className="text-right">ইট</TableHead><TableHead className="text-right">মোট (৳)</TableHead></TableRow></TableHeader>
              <TableBody>
                {rows.length === 0 ? <TableRow><TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">কোনো তথ্য নেই</TableCell></TableRow>
                  : rows.map((r) => (
                  <TableRow key={r.name}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell className="text-right tabular-nums">{bn(r.challans)}</TableCell>
                    <TableCell className="text-right tabular-nums">{bn(r.bricks)}</TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">৳ {bn(r.amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {rows.length > 0 && (
              <div className="border-t bg-muted/40 px-4 py-3 text-sm flex justify-between font-semibold">
                <span>সর্বমোট</span>
                <span>চালান {bn(totals.challans)} · ইট {bn(totals.bricks)} · ৳ {bn(totals.amount)}</span>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
