import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Printer, Share2, Loader2, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/lib/use-current-user";
import { bn, bnDate } from "@/lib/format";
import { CustomerLedger } from "@/components/customer-ledger";
import { InvoiceDocument, type InvoiceData } from "@/components/invoice-document";
import { shareNodeAsImage, downloadNodeAsImage, printNode } from "@/lib/share-invoice";

export const Route = createFileRoute("/_authenticated/customers/$id")({
  head: () => ({ meta: [{ title: "গ্রাহকের লেনদেন — CDB Bricks" }] }),
  component: CustomerDetailPage,
});

function CustomerDetailPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { data: me } = useCurrentUser();
  const isAdmin = me?.role === "admin";
  const [selectedDate, setSelectedDate] = useState("");

  const customerQ = useQuery({
    queryKey: ["customer", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("id, name, phone, address, advance_balance")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const contractsQ = useQuery({
    queryKey: ["customer-contracts", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contracts")
        .select("id, contract_no, status, contract_type, booked_quantity, delivered_quantity, booked_value, fixed_rate")
        .eq("customer_id", id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const collectionsTotalQ = useQuery({
    queryKey: ["customer-collections-total", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("collections")
        .select("amount")
        .eq("customer_id", id);
      if (error) throw error;
      return (data ?? []).reduce((s, r) => s + Number(r.amount || 0), 0);
    },
  });


  const txQ = useQuery({
    queryKey: ["customer-transactions", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_entries")
        .select("id, challan_no, sale_date, quantity, total_amount, status, brick_type:brick_types(name), custom_brick_name")
        .eq("customer_id", id)
        .order("sale_date", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const rows = txQ.data ?? [];
  const filteredRows = useMemo(
    () => rows.filter((row) => (selectedDate ? row.sale_date === selectedDate : true)),
    [rows, selectedDate],
  );

  const groupedRows = useMemo(() => {
    const groups = new Map<string, typeof filteredRows>();
    for (const row of filteredRows) {
      const current = groups.get(row.sale_date) ?? [];
      current.push(row);
      groups.set(row.sale_date, current);
    }
    return Array.from(groups.entries()).map(([date, entries]) => ({
      date,
      entries,
      totalQuantity: entries.reduce((sum, entry) => sum + (Number(entry.quantity) || 0), 0),
      totalAmount: entries.reduce((sum, entry) => sum + (Number(entry.total_amount) || 0), 0),
    }));
  }, [filteredRows]);

  const totals = useMemo(() => {
    let approved = 0, pending = 0, count = 0;
    for (const r of filteredRows) {
      count += 1;
      if (r.status === "approved") approved += Number(r.total_amount) || 0;
      if (r.status === "pending") pending += Number(r.total_amount) || 0;
    }
    return { approved, pending, count };
  }, [filteredRows]);

  if (me && !isAdmin) {
    return <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">এই পৃষ্ঠা শুধুমাত্র অ্যাডমিনদের জন্য।</CardContent></Card>;
  }

  if (customerQ.isLoading || txQ.isLoading) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  const customer = customerQ.data;
  if (!customer) return <div className="p-6 text-sm text-muted-foreground">গ্রাহক পাওয়া যায়নি।</div>;

  const invoiceRef = useRef<HTMLDivElement>(null);

  const invoiceData: InvoiceData = {
    invoiceNo: `CUST-${customer.id.slice(0, 6).toUpperCase()}`,
    date: selectedDate || (filteredRows[filteredRows.length - 1]?.sale_date ?? new Date().toISOString().slice(0, 10)),
    customerRef: customer.phone ?? null,
    salesPerson: "—",
    paymentTerms: selectedDate ? `তারিখ: ${bnDate(selectedDate)}` : "সম্পূর্ণ লেনদেন",
    to: {
      name: customer.name,
      lines: [customer.phone ?? "", customer.address ?? ""].filter(Boolean),
    },
    deliverTo: null,
    items: filteredRows.map((r) => {
      const brick = r.brick_type?.name === "অন্যান্য" ? (r.custom_brick_name || "অন্যান্য") : (r.brick_type?.name ?? "—");
      const unit = Number(r.total_amount) && Number(r.quantity) ? Number(r.total_amount) / Number(r.quantity) : 0;
      return {
        code: r.challan_no,
        description: brick,
        subDescription: `${bnDate(r.sale_date)} • ${r.status === "approved" ? "অনুমোদিত" : r.status === "pending" ? "অপেক্ষমাণ" : "প্রত্যাখ্যাত"}`,
        quantity: Number(r.quantity),
        unit: "পিস",
        price: Math.round(unit),
        total: Number(r.total_amount),
      };
    }),
    subtotal: totals.approved + totals.pending,
    total: totals.approved + totals.pending,
  };

  async function handleShare() {
    if (!invoiceRef.current) return;
    await shareNodeAsImage(invoiceRef.current, {
      title: `${customer!.name} — লেনদেন`,
      text: `${customer!.name} এর সম্পূর্ণ লেনদেন হিসাব`,
      filename: `${customer!.name}-history.png`,
    });
  }

  async function handleDownload() {
    if (!invoiceRef.current) return;
    await downloadNodeAsImage(invoiceRef.current, `${customer!.name}-history.png`);
  }

  function handlePrint() {
    if (!invoiceRef.current) return;
    printNode(invoiceRef.current, `${customer!.name} — লেনদেন`);
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="flex items-center justify-between gap-2 flex-wrap print:hidden">
        <Button variant="outline" size="sm" onClick={() => navigate({ to: "/customers" })}>
          <ArrowLeft className="mr-2 h-4 w-4" /> ফিরে যান
        </Button>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={handleShare}>
            <Share2 className="mr-2 h-4 w-4" /> শেয়ার
          </Button>
          <Button variant="outline" size="sm" onClick={handleDownload}>
            <Download className="mr-2 h-4 w-4" /> ডাউনলোড
          </Button>
          <Button size="sm" onClick={handlePrint}>
            <Printer className="mr-2 h-4 w-4" /> প্রিন্ট
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{customer.name}</CardTitle>
          <div className="text-sm text-muted-foreground space-y-0.5">
            {customer.phone && <div>মোবাইল: {customer.phone}</div>}
            {customer.address && <div>ঠিকানা: {customer.address}</div>}
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="rounded-lg border p-3">
            <div className="text-xs text-muted-foreground">মোট লেনদেন</div>
            <div className="text-lg font-semibold tabular-nums">{bn(totals.count)} টি</div>
          </div>
          <div className="rounded-lg border p-3">
            <div className="text-xs text-muted-foreground">মোট অনুমোদিত</div>
            <div className="text-lg font-semibold tabular-nums text-success">৳ {bn(totals.approved)}</div>
          </div>
          <div className="rounded-lg border p-3">
            <div className="text-xs text-muted-foreground">অপেক্ষমাণ</div>
            <div className="text-lg font-semibold tabular-nums">৳ {bn(totals.pending)}</div>
          </div>
        </CardContent>
      </Card>

      {/* 360 Summary: Contracts, Collections, Advance, Due */}
      {(() => {
        const contracts = contractsQ.data ?? [];
        const totalCollected = collectionsTotalQ.data ?? 0;
        const totalBookedQty = contracts.reduce((s, c) => s + Number(c.booked_quantity || 0), 0);
        const totalDeliveredQty = contracts.reduce((s, c) => s + Number(c.delivered_quantity || 0), 0);
        const totalBookedValue = contracts.reduce((s, c) => s + Number(c.booked_value || 0), 0);
        const advance = Number(customer.advance_balance || 0);
        // Due = approved sales - collections (positive = customer owes)
        const due = totals.approved - totalCollected;
        return (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">গ্রাহক ৩৬০° সারসংক্ষেপ</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Mini label="মোট চুক্তি বুকিং (পিস)" value={bn(totalBookedQty)} />
              <Mini label="ডেলিভারি হয়েছে" value={bn(totalDeliveredQty)} />
              <Mini label="চুক্তি বাকি" value={bn(Math.max(0, totalBookedQty - totalDeliveredQty))} tone="warning" />
              <Mini label="মোট চুক্তি মূল্য" value={`৳ ${bn(totalBookedValue)}`} />
              <Mini label="মোট কালেকশন" value={`৳ ${bn(totalCollected)}`} tone="success" />
              <Mini label="অগ্রিম জমা" value={`৳ ${bn(advance)}`} tone={advance > 0 ? "success" : undefined} />
              <Mini label={due >= 0 ? "মোট বকেয়া" : "অতিরিক্ত জমা"} value={`৳ ${bn(Math.abs(Math.round(due)))}`} tone={due > 0 ? "destructive" : "success"} />
              <Mini label="সক্রিয় চুক্তি" value={`${bn(contracts.filter((c) => c.status === "active").length)} টি`} />
            </CardContent>
          </Card>
        );
      })()}


      <Card>
        <CardHeader className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <CardTitle className="text-base">তারিখ অনুযায়ী ইনভয়েস</CardTitle>
              <p className="text-sm text-muted-foreground">একটি তারিখ বেছে নিলে ওই দিনের সব পণ্য ও টাকার হিসাব দেখা যাবে।</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="w-full sm:w-[180px]" />
              {selectedDate && (
                <Button type="button" variant="outline" onClick={() => setSelectedDate("")}>সব তারিখ</Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {groupedRows.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">এই তারিখে কোনো ইনভয়েস নেই</div>
          ) : groupedRows.map((group) => (
            <div key={group.date} className="overflow-hidden rounded-lg border">
              <div className="flex flex-col gap-2 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="font-semibold">{bnDate(group.date)}</div>
                  <div className="text-xs text-muted-foreground">মোট পণ্য: {bn(group.totalQuantity)} • মোট টাকা: ৳ {bn(group.totalAmount)}</div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>চালান #</TableHead>
                      <TableHead>পণ্যের নাম</TableHead>
                      <TableHead className="text-right">পরিমাণ</TableHead>
                      <TableHead className="text-right">টাকার পরিমান (৳)</TableHead>
                      <TableHead>অবস্থা</TableHead>
                      <TableHead className="text-right">ইনভয়েস</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {group.entries.map((r) => {
                      const brick = r.brick_type?.name === "অন্যান্য" ? (r.custom_brick_name || "অন্যান্য") : (r.brick_type?.name ?? "—");
                      return (
                        <TableRow key={r.id}>
                          <TableCell className="font-mono text-xs">{r.challan_no}</TableCell>
                          <TableCell className="text-muted-foreground">{brick}</TableCell>
                          <TableCell className="text-right tabular-nums">{bn(r.quantity)}</TableCell>
                          <TableCell className="text-right tabular-nums font-semibold">৳ {bn(Number(r.total_amount))}</TableCell>
                          <TableCell>
                            <Badge variant={r.status === "approved" ? "default" : r.status === "pending" ? "outline" : "destructive"}>
                              {r.status === "approved" ? "অনুমোদিত" : r.status === "pending" ? "অপেক্ষমাণ" : "প্রত্যাখ্যাত"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button asChild variant="outline" size="sm">
                              <Link to="/entries/$id/edit" params={{ id: r.id }}>খুলুন</Link>
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <CustomerLedger customerId={customer.id} customerName={customer.name} />

      {/* Off-screen invoice for capture/print */}
      <div style={{ position: "fixed", left: -10000, top: 0, width: 880, pointerEvents: "none", opacity: 0 }} aria-hidden>
        <InvoiceDocument ref={invoiceRef} data={invoiceData} />
      </div>
    </div>
  );
}

function Mini({ label, value, tone }: { label: string; value: string; tone?: "success" | "warning" | "destructive" }) {
  const cls =
    tone === "success" ? "text-success" :
    tone === "warning" ? "text-warning" :
    tone === "destructive" ? "text-destructive" : "";
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-base font-semibold tabular-nums ${cls}`}>{value}</div>
    </div>
  );
}
