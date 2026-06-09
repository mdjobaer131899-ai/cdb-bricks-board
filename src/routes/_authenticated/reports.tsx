import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarIcon, FileDown, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { fetchSales, fetchAllCustomers, fetchCollections, type SaleRow } from "@/lib/sales-queries";
import { useCurrentUser } from "@/lib/use-current-user";
import { bn, bnDate, isoDate } from "@/lib/format";
import { exportReportPdf, type PdfColumn } from "@/lib/pdf-export";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({
    meta: [
      { title: "রিপোর্ট — CDB Bricks" },
      { name: "description", content: "তারিখভিত্তিক বিক্রয় রিপোর্ট তৈরি করুন, গ্রাহক ও ইটের ধরন অনুযায়ী বিশ্লেষণ দেখুন এবং PDF এক্সপোর্ট করুন।" },
      { property: "og:title", content: "রিপোর্ট — CDB Bricks" },
      { property: "og:description", content: "তারিখভিত্তিক বিক্রয় রিপোর্ট তৈরি করুন, গ্রাহক ও ইটের ধরন অনুযায়ী বিশ্লেষণ দেখুন এবং PDF এক্সপোর্ট করুন।" },
      { property: "og:url", content: "/reports" },
    ],
    links: [{ rel: "canonical", href: "/reports" }],
  }),
  component: ReportsPage,
});

function ReportsPage() {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold tracking-tight md:text-2xl">রিপোর্ট সেন্টার</h2>
        <p className="text-sm text-muted-foreground">বিক্রয় বিশ্লেষণ ও PDF এক্সপোর্ট</p>
      </div>
      <Tabs defaultValue="daily">
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-5">
          <TabsTrigger value="daily">দৈনিক</TabsTrigger>
          <TabsTrigger value="range">তারিখ পরিসীমা</TabsTrigger>
          <TabsTrigger value="customer">গ্রাহক সারাংশ</TabsTrigger>
          <TabsTrigger value="advance">অগ্রিম চালান</TabsTrigger>
          <TabsTrigger value="profit">গ্রাহকভিত্তিক বিশ্লেষণ</TabsTrigger>
        </TabsList>
        <TabsContent value="daily" className="mt-4"><DailyReport /></TabsContent>
        <TabsContent value="range" className="mt-4"><RangeReport /></TabsContent>
        <TabsContent value="customer" className="mt-4"><CustomerReport /></TabsContent>
        <TabsContent value="advance" className="mt-4"><AdvanceReport /></TabsContent>
        <TabsContent value="profit" className="mt-4"><CustomerProfitReport /></TabsContent>
      </Tabs>
    </div>
  );
}

function DatePicker({ value, onChange, label }: { value: Date; onChange: (d: Date) => void; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className={cn("gap-2 font-normal")}>
          <CalendarIcon className="h-3.5 w-3.5" />
          {label ? <span className="text-muted-foreground">{label}:</span> : null}
          {format(value, "dd MMM yyyy")}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar mode="single" selected={value} onSelect={(d) => d && (onChange(d), setOpen(false))} className="pointer-events-auto p-3" />
      </PopoverContent>
    </Popover>
  );
}

function LoadingTable() { return <div className="space-y-2 p-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>; }

function useAdminName() {
  const { data: me } = useCurrentUser();
  return me?.fullName ?? "Admin";
}

async function downloadPdf(opts: Parameters<typeof exportReportPdf>[0]) {
  try {
    await exportReportPdf(opts);
    toast.success("PDF তৈরি হয়েছে");
  } catch (e) {
    toast.error("PDF তৈরি ব্যর্থ: " + (e as Error).message);
  }
}

/* ---------------- 1. Daily Report ---------------- */
function DailyReport() {
  const [date, setDate] = useState<Date>(new Date());
  const [exporting, setExporting] = useState(false);
  const admin = useAdminName();
  const d = isoDate(date);
  const q = useQuery({
    queryKey: ["report-daily", d],
    queryFn: () => fetchSales({ from: d, to: d, limit: 1000 }),
  });
  const sales = (q.data ?? []).filter((s) => s.status === "approved");
  const totals = sales.reduce((t, s) => ({ challans: t.challans + 1, bricks: t.bricks + s.quantity, amount: t.amount + Number(s.total_amount) }), { challans: 0, bricks: 0, amount: 0 });

  async function onExport() {
    setExporting(true);
    const columns: PdfColumn[] = [
      { header: "Challan", dataKey: "challan_no" },
      { header: "Customer", dataKey: "customer" },
      { header: "Brick Type", dataKey: "brick" },
      { header: "Qty", dataKey: "qty", align: "right" },
      { header: "Rate", dataKey: "rate", align: "right" },
      { header: "Amount", dataKey: "amount", align: "right" },
    ];
    const rows = sales.map((s) => ({
      challan_no: s.challan_no,
      customer: s.customer?.name ?? "—",
      brick: s.brick_type?.name ?? "—",
      qty: bn(s.quantity),
      rate: bn(s.unit_price),
      amount: "৳ " + bn(s.total_amount),
    }));
    await downloadPdf({
      filename: `daily-report-${d}.pdf`,
      reportTitle: "Daily Sales Report — দৈনিক বিক্রয় রিপোর্ট",
      subtitle: `তারিখ: ${bnDate(date)}`,
      adminName: admin,
      columns, rows,
      footerSummary: [
        { label: "মোট চালান", value: bn(totals.challans) },
        { label: "মোট ইট", value: bn(totals.bricks) },
        { label: "মোট টাকা", value: "৳ " + bn(totals.amount) },
      ],
    });
    setExporting(false);
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
        <CardTitle className="text-base">দৈনিক বিক্রয় রিপোর্ট</CardTitle>
        <div className="flex gap-2">
          <DatePicker value={date} onChange={setDate} label="তারিখ" />
          <Button size="sm" onClick={onExport} disabled={exporting || sales.length === 0}>
            {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileDown className="mr-2 h-4 w-4" />} Export PDF
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {q.isLoading ? <LoadingTable /> : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>চালান</TableHead><TableHead>গ্রাহক</TableHead><TableHead>ইটের ধরন</TableHead>
                <TableHead className="text-right">পরিমাণ</TableHead><TableHead className="text-right">দর</TableHead><TableHead className="text-right">মোট</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {sales.length === 0 ? <TableRow><TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">কোনো তথ্য নেই</TableCell></TableRow>
                : sales.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-mono text-xs">{s.challan_no}</TableCell>
                    <TableCell className="font-medium">{s.customer?.name ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{s.brick_type?.name ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{bn(s.quantity)}</TableCell>
                    <TableCell className="text-right tabular-nums">৳ {bn(s.unit_price)}</TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">৳ {bn(s.total_amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {sales.length > 0 && (
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

/* ---------------- 2. Date Range Report ---------------- */
function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-xl font-bold tabular-nums mt-1">{value}</div>
      </CardContent>
    </Card>
  );
}

function RangeReport() {
  const [from, setFrom] = useState<Date>(new Date(Date.now() - 29 * 86400000));
  const [to, setTo] = useState<Date>(new Date());
  const [exporting, setExporting] = useState(false);
  const admin = useAdminName();
  const fromS = isoDate(from), toS = isoDate(to);
  const q = useQuery({
    queryKey: ["report-range", fromS, toS],
    queryFn: () => fetchSales({ from: fromS, to: toS, limit: 2000 }),
  });
  const sales = (q.data ?? []).filter((s) => s.status === "approved");
  const totals = sales.reduce((t, s) => ({ challans: t.challans + 1, bricks: t.bricks + s.quantity, amount: t.amount + Number(s.total_amount), customers: t.customers.add(s.customer?.id ?? "") }),
    { challans: 0, bricks: 0, amount: 0, customers: new Set<string>() });

  async function onExport() {
    setExporting(true);
    const columns: PdfColumn[] = [
      { header: "Date", dataKey: "date" },
      { header: "Challan", dataKey: "challan_no" },
      { header: "Customer", dataKey: "customer" },
      { header: "Brick", dataKey: "brick" },
      { header: "Qty", dataKey: "qty", align: "right" },
      { header: "Amount", dataKey: "amount", align: "right" },
    ];
    const rows = sales.map((s) => ({
      date: bnDate(s.sale_date),
      challan_no: s.challan_no,
      customer: s.customer?.name ?? "—",
      brick: s.brick_type?.name ?? "—",
      qty: bn(s.quantity),
      amount: "৳ " + bn(s.total_amount),
    }));
    await downloadPdf({
      filename: `range-report-${fromS}_to_${toS}.pdf`,
      reportTitle: "Date Range Sales Report — তারিখ পরিসীমা রিপোর্ট",
      subtitle: `${bnDate(from)} — ${bnDate(to)}`,
      adminName: admin, columns, rows,
      footerSummary: [
        { label: "মোট চালান", value: bn(totals.challans) },
        { label: "মোট ইট", value: bn(totals.bricks) },
        { label: "মোট গ্রাহক", value: bn(totals.customers.size) },
        { label: "মোট টাকা", value: "৳ " + bn(totals.amount) },
      ],
    });
    setExporting(false);
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-3 flex flex-wrap gap-2 items-center">
          <DatePicker value={from} onChange={setFrom} label="From" />
          <span className="text-muted-foreground">→</span>
          <DatePicker value={to} onChange={setTo} label="To" />
          <Button size="sm" className="ml-auto" onClick={onExport} disabled={exporting || sales.length === 0}>
            {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileDown className="mr-2 h-4 w-4" />} Export PDF
          </Button>
        </CardContent>
      </Card>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="মোট চালান" value={bn(totals.challans)} />
        <MetricCard label="মোট ইট" value={bn(totals.bricks)} />
        <MetricCard label="মোট গ্রাহক" value={bn(totals.customers.size)} />
        <MetricCard label="মোট টাকা" value={"৳ " + bn(totals.amount)} />
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">বিস্তারিত তালিকা</CardTitle></CardHeader>
        <CardContent className="p-0">
          {q.isLoading ? <LoadingTable /> : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>তারিখ</TableHead><TableHead>চালান</TableHead><TableHead>গ্রাহক</TableHead>
                  <TableHead>ইট</TableHead><TableHead className="text-right">পরিমাণ</TableHead><TableHead className="text-right">মোট</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {sales.length === 0 ? <TableRow><TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">কোনো তথ্য নেই</TableCell></TableRow>
                  : sales.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="text-xs">{bnDate(s.sale_date)}</TableCell>
                      <TableCell className="font-mono text-xs">{s.challan_no}</TableCell>
                      <TableCell className="font-medium">{s.customer?.name ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{s.brick_type?.name ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{bn(s.quantity)}</TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">৳ {bn(s.total_amount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ---------------- 3. Customer Summary Report ---------------- */
function CustomerReport() {
  const [customerId, setCustomerId] = useState<string>("");
  const [exporting, setExporting] = useState(false);
  const admin = useAdminName();
  const cq = useQuery({ queryKey: ["customers-all"], queryFn: fetchAllCustomers });
  const sq = useQuery({
    queryKey: ["report-customer", customerId],
    queryFn: () => fetchSales({ limit: 2000 }),
    enabled: !!customerId,
  });

  const sales = useMemo(() => (sq.data ?? []).filter((s) => s.status === "approved" && s.customer?.id === customerId), [sq.data, customerId]);
  const totalDeliveries = sales.length;
  const totalAdvance = sales.filter((s) => s.sale_type === "advance").reduce((t, s) => t + s.quantity, 0);
  const totalAmount = sales.reduce((t, s) => t + Number(s.total_amount), 0);

  const perBrick = useMemo(() => {
    const map = new Map<string, { name: string; bricks: number; amount: number }>();
    sales.forEach((s) => {
      const k = s.brick_type?.id ?? "—";
      const cur = map.get(k) ?? { name: s.brick_type?.name ?? "—", bricks: 0, amount: 0 };
      cur.bricks += s.quantity; cur.amount += Number(s.total_amount);
      map.set(k, cur);
    });
    return Array.from(map.values()).sort((a, b) => b.bricks - a.bricks);
  }, [sales]);

  const customer = (cq.data ?? []).find((c) => c.id === customerId);

  async function onExport() {
    if (!customer) return;
    setExporting(true);
    const columns: PdfColumn[] = [
      { header: "Brick Type", dataKey: "brick" },
      { header: "Total Bricks", dataKey: "bricks", align: "right" },
      { header: "Total Amount", dataKey: "amount", align: "right" },
    ];
    const rows = perBrick.map((p) => ({ brick: p.name, bricks: bn(p.bricks), amount: "৳ " + bn(p.amount) }));
    await downloadPdf({
      filename: `customer-${customer.name}.pdf`,
      reportTitle: "Customer Summary Report — গ্রাহক সারাংশ",
      subtitle: `${customer.name}${customer.phone ? " · " + customer.phone : ""}`,
      adminName: admin, columns, rows,
      footerSummary: [
        { label: "মোট ডেলিভারি", value: bn(totalDeliveries) },
        { label: "মোট অগ্রিম ইট", value: bn(totalAdvance) },
        { label: "মোট টাকা", value: "৳ " + bn(totalAmount) },
      ],
    });
    setExporting(false);
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-3 flex flex-wrap gap-2 items-center">
          <Select value={customerId} onValueChange={setCustomerId}>
            <SelectTrigger className="w-64 h-9"><SelectValue placeholder="গ্রাহক নির্বাচন করুন" /></SelectTrigger>
            <SelectContent>
              {(cq.data ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="sm" className="ml-auto" onClick={onExport} disabled={exporting || !customerId || sales.length === 0}>
            {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileDown className="mr-2 h-4 w-4" />} Export PDF
          </Button>
        </CardContent>
      </Card>

      {!customerId ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">একজন গ্রাহক নির্বাচন করুন</CardContent></Card>
      ) : sq.isLoading ? <Card><CardContent><LoadingTable /></CardContent></Card> : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <MetricCard label="মোট ডেলিভারি" value={bn(totalDeliveries)} />
            <MetricCard label="মোট অগ্রিম ইট" value={bn(totalAdvance)} />
            <MetricCard label="মোট টাকা" value={"৳ " + bn(totalAmount)} />
          </div>
          <Card>
            <CardHeader><CardTitle className="text-base">ইটের ধরন অনুযায়ী</CardTitle></CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>ইটের ধরন</TableHead>
                    <TableHead className="text-right">মোট ইট</TableHead>
                    <TableHead className="text-right">মোট টাকা</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {perBrick.length === 0 ? <TableRow><TableCell colSpan={3} className="py-8 text-center text-sm text-muted-foreground">কোনো তথ্য নেই</TableCell></TableRow>
                    : perBrick.map((p) => (
                      <TableRow key={p.name}>
                        <TableCell className="font-medium">{p.name}</TableCell>
                        <TableCell className="text-right tabular-nums">{bn(p.bricks)}</TableCell>
                        <TableCell className="text-right tabular-nums font-semibold">৳ {bn(p.amount)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

/* ---------------- 4. Advance Deliveries Report ---------------- */
function AdvanceReport() {
  const [from, setFrom] = useState<Date>(new Date(Date.now() - 89 * 86400000));
  const [to, setTo] = useState<Date>(new Date());
  const [exporting, setExporting] = useState(false);
  const admin = useAdminName();
  const fromS = isoDate(from), toS = isoDate(to);
  const q = useQuery({
    queryKey: ["report-advance", fromS, toS],
    queryFn: () => fetchSales({ from: fromS, to: toS, limit: 2000 }),
  });
  const sales: SaleRow[] = (q.data ?? []).filter((s) => s.sale_type === "advance");
  const totalBricks = sales.reduce((t, s) => t + s.quantity, 0);

  async function onExport() {
    setExporting(true);
    const columns: PdfColumn[] = [
      { header: "Date", dataKey: "date" },
      { header: "Challan", dataKey: "challan_no" },
      { header: "Customer", dataKey: "customer" },
      { header: "Brick Type", dataKey: "brick" },
      { header: "Qty", dataKey: "qty", align: "right" },
      { header: "Status", dataKey: "status" },
    ];
    const rows = sales.map((s) => ({
      date: bnDate(s.sale_date),
      challan_no: s.challan_no,
      customer: s.customer?.name ?? "—",
      brick: s.brick_type?.name ?? "—",
      qty: bn(s.quantity),
      status: s.status,
    }));
    await downloadPdf({
      filename: `advance-deliveries-${fromS}_to_${toS}.pdf`,
      reportTitle: "Advance Deliveries Report — অগ্রিম চালান রিপোর্ট",
      subtitle: `${bnDate(from)} — ${bnDate(to)}`,
      adminName: admin, columns, rows,
      footerSummary: [
        { label: "মোট চালান", value: bn(sales.length) },
        { label: "মোট অগ্রিম ইট", value: bn(totalBricks) },
      ],
    });
    setExporting(false);
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-3 flex flex-wrap gap-2 items-center">
          <DatePicker value={from} onChange={setFrom} label="From" />
          <span className="text-muted-foreground">→</span>
          <DatePicker value={to} onChange={setTo} label="To" />
          <Button size="sm" className="ml-auto" onClick={onExport} disabled={exporting || sales.length === 0}>
            {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileDown className="mr-2 h-4 w-4" />} Export PDF
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">অগ্রিম চালান তালিকা</CardTitle>
          <Badge variant="outline">{bn(sales.length)} টি · {bn(totalBricks)} ইট</Badge>
        </CardHeader>
        <CardContent className="p-0">
          {q.isLoading ? <LoadingTable /> : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>তারিখ</TableHead><TableHead>চালান</TableHead><TableHead>গ্রাহক</TableHead>
                  <TableHead>ইট</TableHead><TableHead className="text-right">পরিমাণ</TableHead><TableHead>স্ট্যাটাস</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {sales.length === 0 ? <TableRow><TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">কোনো অগ্রিম চালান নেই</TableCell></TableRow>
                  : sales.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="text-xs">{bnDate(s.sale_date)}</TableCell>
                      <TableCell className="font-mono text-xs">{s.challan_no}</TableCell>
                      <TableCell className="font-medium">{s.customer?.name ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{s.brick_type?.name ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{bn(s.quantity)}</TableCell>
                      <TableCell><Badge variant={s.status === "approved" ? "default" : s.status === "pending" ? "secondary" : "destructive"}>{s.status}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ---------------- 5. Customer Profit Analysis ---------------- */
function CustomerProfitReport() {
  const now = new Date();
  const [from, setFrom] = useState<Date>(new Date(now.getFullYear(), now.getMonth(), 1));
  const [to, setTo] = useState<Date>(new Date());
  const [exporting, setExporting] = useState(false);
  const admin = useAdminName();
  const fromS = isoDate(from), toS = isoDate(to);

  const sq = useQuery({
    queryKey: ["report-profit-sales", fromS, toS],
    queryFn: () => fetchSales({ from: fromS, to: toS, limit: 5000 }),
  });

  const cq = useQuery({
    queryKey: ["report-profit-collections", fromS, toS],
    queryFn: () => fetchCollections({ from: fromS, to: toS }),
  });

  const customerQ = useQuery({ queryKey: ["customers-all"], queryFn: fetchAllCustomers });

  const rows = useMemo(() => {
    const sales = (sq.data ?? []).filter((s) => s.status === "approved");
    const collections = cq.data ?? [];
    const customers = customerQ.data ?? [];

    const map = new Map<string, { name: string; sales: number; bricks: number; collection: number }>();

    for (const s of sales) {
      const cid = s.customer?.id;
      if (!cid) continue;
      const cur = map.get(cid) ?? { name: s.customer!.name, sales: 0, bricks: 0, collection: 0 };
      cur.sales += Number(s.total_amount);
      cur.bricks += s.quantity;
      map.set(cid, cur);
    }

    for (const c of collections) {
      const name = customers.find((x) => x.id === c.customer_id)?.name;
      const cur = map.get(c.customer_id) ?? { name: name ?? "—", sales: 0, bricks: 0, collection: 0 };
      cur.collection += Number(c.amount);
      map.set(c.customer_id, cur);
    }

    return Array.from(map.entries())
      .map(([id, v]) => ({ id, ...v, due: v.sales - v.collection }))
      .sort((a, b) => b.sales - a.sales);
  }, [sq.data, cq.data, customerQ.data]);

  const totals = useMemo(() => ({
    sales: rows.reduce((t, r) => t + r.sales, 0),
    bricks: rows.reduce((t, r) => t + r.bricks, 0),
    collection: rows.reduce((t, r) => t + r.collection, 0),
    due: rows.reduce((t, r) => t + r.due, 0),
  }), [rows]);

  async function onExport() {
    setExporting(true);
    const columns: PdfColumn[] = [
      { header: "গ্রাহক", dataKey: "customer" },
      { header: "মোট বিক্রি", dataKey: "sales", align: "right" },
      { header: "মোট ইট", dataKey: "bricks", align: "right" },
      { header: "মোট কালেকশন", dataKey: "collection", align: "right" },
      { header: "বর্তমান বকেয়া", dataKey: "due", align: "right" },
    ];
    const pdfRows = rows.map((r) => ({
      customer: r.name,
      sales: "৳ " + bn(r.sales),
      bricks: bn(r.bricks),
      collection: "৳ " + bn(r.collection),
      due: "৳ " + bn(r.due),
    }));
    await downloadPdf({
      filename: `customer-profit-${fromS}_to_${toS}.pdf`,
      reportTitle: "গ্রাহকভিত্তিক বিশ্লেষণ",
      subtitle: `${bnDate(from)} — ${bnDate(to)}`,
      adminName: admin,
      columns,
      rows: pdfRows,
      footerSummary: [
        { label: "মোট বিক্রি", value: "৳ " + bn(totals.sales) },
        { label: "মোট ইট", value: bn(totals.bricks) },
        { label: "মোট কালেকশন", value: "৳ " + bn(totals.collection) },
        { label: "সর্বমোট বকেয়া", value: "৳ " + bn(totals.due) },
      ],
    });
    setExporting(false);
  }

  const isLoading = sq.isLoading || cq.isLoading || customerQ.isLoading;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-3 flex flex-wrap gap-2 items-center">
          <DatePicker value={from} onChange={setFrom} label="From" />
          <span className="text-muted-foreground">→</span>
          <DatePicker value={to} onChange={setTo} label="To" />
          <Button size="sm" className="ml-auto" onClick={onExport} disabled={exporting || rows.length === 0}>
            {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileDown className="mr-2 h-4 w-4" />} Export PDF
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">গ্রাহকভিত্তিক বিশ্লেষণ</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? <LoadingTable /> : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>গ্রাহক</TableHead>
                    <TableHead className="text-right">মোট বিক্রি</TableHead>
                    <TableHead className="text-right">মোট ইট</TableHead>
                    <TableHead className="text-right">মোট কালেকশন</TableHead>
                    <TableHead className="text-right">বর্তমান বকেয়া</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">কোনো তথ্য নেই</TableCell>
                    </TableRow>
                  ) : (
                    rows.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">{r.name}</TableCell>
                        <TableCell className="text-right tabular-nums">৳ {bn(r.sales)}</TableCell>
                        <TableCell className="text-right tabular-nums">{bn(r.bricks)}</TableCell>
                        <TableCell className="text-right tabular-nums">৳ {bn(r.collection)}</TableCell>
                        <TableCell className={cn("text-right tabular-nums font-semibold", r.due > 0 ? "text-destructive" : r.due < 0 ? "text-emerald-600" : "")}>
                          ৳ {bn(Math.abs(r.due))}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
                {rows.length > 0 && (
                  <TableFooter>
                    <TableRow>
                      <TableCell className="font-semibold">সর্বমোট</TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">৳ {bn(totals.sales)}</TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">{bn(totals.bricks)}</TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">৳ {bn(totals.collection)}</TableCell>
                      <TableCell className={cn("text-right tabular-nums font-semibold", totals.due > 0 ? "text-destructive" : totals.due < 0 ? "text-emerald-600" : "")}>
                        ৳ {bn(Math.abs(totals.due))}
                      </TableCell>
                    </TableRow>
                  </TableFooter>
                )}
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
