import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CalendarClock, Wallet, Banknote, FileText, Truck, CreditCard, AlertTriangle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/lib/use-current-user";
import { bn, bnDate } from "@/lib/format";
import { deleteContract } from "@/lib/contracts.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/contracts/$id")({
  head: ({ params }) => ({
    meta: [{ title: `চুক্তি ${params.id.slice(0, 8)} — CDB Bricks` }],
  }),
  component: ContractDetailPage,
});

const TYPE_META = {
  yearly_fixed: { label: "বার্ষিক ফিক্সড রেট", Icon: CalendarClock, color: "text-blue-600" },
  short_term: { label: "স্বল্পমেয়াদী", Icon: Wallet, color: "text-amber-600" },
  cash: { label: "নগদ অ্যাকাউন্ট", Icon: Banknote, color: "text-emerald-600" },
} as const;

const STATUS = {
  active: { label: "সক্রিয়", variant: "default" as const },
  completed: { label: "সম্পন্ন", variant: "secondary" as const },
  expired: { label: "মেয়াদোত্তীর্ণ", variant: "destructive" as const },
  suspended: { label: "স্থগিত", variant: "outline" as const },
};

async function fetchContractDetail(id: string) {
  const [contractRes, paymentsRes, salesRes] = await Promise.all([
    supabase.from("contracts").select("*, customer:customers(id, name, phone, address)").eq("id", id).single(),
    supabase.from("contract_payments").select("*").eq("contract_id", id).order("payment_date", { ascending: false }),
    supabase.from("sales_entries").select("id, challan_no, sale_date, quantity, unit_price, total_amount, status").eq("contract_id", id).order("sale_date", { ascending: false }),
  ]);
  if (contractRes.error) throw contractRes.error;
  return { contract: contractRes.data, payments: paymentsRes.data ?? [], sales: salesRes.data ?? [] };
}

function ContractDetailPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ["contract-detail", id], queryFn: () => fetchContractDetail(id) });

  if (q.isLoading) {
    return <div className="space-y-3"><Skeleton className="h-32" /><Skeleton className="h-64" /></div>;
  }
  if (q.error || !q.data) {
    return <div className="text-sm text-destructive">চুক্তি লোড করা যায়নি</div>;
  }

  const c = q.data.contract;
  const meta = TYPE_META[c.contract_type as keyof typeof TYPE_META];
  const Icon = meta.Icon;
  const status = STATUS[c.status as keyof typeof STATUS];

  const deliveredQty = q.data.sales.reduce((s, x) => s + Number(x.quantity), 0);
  const deliveredValue = q.data.sales.reduce((s, x) => s + Number(x.total_amount), 0);
  const totalPaid = q.data.payments.reduce((s, x) => s + Number(x.amount), 0);
  const usedPct = Number(c.booked_quantity) > 0 ? Math.min(100, (deliveredQty / Number(c.booked_quantity)) * 100) : 0;
  const remainingQty = Math.max(0, Number(c.booked_quantity) - deliveredQty);
  const remainingValue = Math.max(0, Number(c.booked_value) - deliveredValue);
  const balance = totalPaid - deliveredValue;

  // expiry warning
  const expiryDays = c.expiry_date ? Math.ceil((new Date(c.expiry_date).getTime() - Date.now()) / 86400000) : null;
  const showExpiryAlert = expiryDays !== null && expiryDays <= 7 && expiryDays >= 0 && c.status === "active";

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigate({ to: "/contracts" })}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-mono text-lg font-bold md:text-xl">{c.contract_no}</h1>
              <Badge variant={status.variant}>{status.label}</Badge>
            </div>
            <p className="text-sm text-muted-foreground flex items-center gap-1.5">
              <Icon className={`h-3.5 w-3.5 ${meta.color}`} />
              {meta.label}
            </p>
          </div>
        </div>
      </div>

      {showExpiryAlert && (
        <Card className="border-amber-500/40 bg-amber-50 dark:bg-amber-950/20">
          <CardContent className="flex items-center gap-3 py-3">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            <div className="text-sm">
              <strong>মেয়াদ {expiryDays === 0 ? "আজই" : `${bn(expiryDays)} দিনে`} শেষ</strong>
              <span className="ml-2 text-muted-foreground">({bnDate(c.expiry_date!)})</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Customer + key facts */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Card className="md:col-span-1">
          <CardHeader><CardTitle className="text-sm">গ্রাহক</CardTitle></CardHeader>
          <CardContent>
            <Link to="/customers/$id" params={{ id: c.customer?.id ?? "" }} className="text-base font-bold text-primary hover:underline">
              {c.customer?.name ?? "—"}
            </Link>
            <div className="mt-1 text-xs text-muted-foreground">{c.customer?.phone}</div>
            <div className="text-xs text-muted-foreground">{c.customer?.address}</div>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader><CardTitle className="text-sm">চুক্তি ব্যবহার</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {Number(c.booked_quantity) > 0 ? (
              <>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">ডেলিভারি / বুকিং (ট্রাক)</span>
                  <span className="font-bold">{bn(deliveredQty)} / {bn(c.booked_quantity)}</span>
                </div>
                <Progress value={usedPct} className="h-2" />
                <div className="grid grid-cols-2 gap-3 pt-1 text-xs">
                  <div><div className="text-muted-foreground">অবশিষ্ট ট্রাক</div><div className="text-base font-bold">{bn(remainingQty)}</div></div>
                  <div><div className="text-muted-foreground">অবশিষ্ট মূল্য</div><div className="text-base font-bold">৳ {bn(Math.round(remainingValue))}</div></div>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">নগদ অ্যাকাউন্ট — বুকিং নেই, লেনদেন অনুসারে গণনা।</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Financial summary */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="ফিক্সড রেট" value={c.fixed_rate ? `৳ ${bn(c.fixed_rate)}` : "—"} />
        <Stat label="মোট অ্যাডভান্স" value={`৳ ${bn(totalPaid)}`} />
        <Stat label="মোট ডেলিভারি মূল্য" value={`৳ ${bn(Math.round(deliveredValue))}`} />
        <Stat
          label={balance >= 0 ? "জমা ব্যালেন্স" : "বকেয়া"}
          value={`৳ ${bn(Math.abs(Math.round(balance)))}`}
          tone={balance >= 0 ? "positive" : "negative"}
        />
      </div>

      {/* Ledger tabs */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">লেজার</CardTitle>
          <CardDescription>পেমেন্ট ও ডেলিভারি ইতিহাস</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="deliveries">
            <TabsList>
              <TabsTrigger value="deliveries" className="gap-2"><Truck className="h-3.5 w-3.5" /> ডেলিভারি ({bn(q.data.sales.length)})</TabsTrigger>
              <TabsTrigger value="payments" className="gap-2"><CreditCard className="h-3.5 w-3.5" /> পেমেন্ট ({bn(q.data.payments.length)})</TabsTrigger>
            </TabsList>

            <TabsContent value="deliveries" className="mt-3">
              {q.data.sales.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  <FileText className="mx-auto mb-2 h-8 w-8 opacity-40" />
                  এখনো কোনো ডেলিভারি নেই
                </div>
              ) : (
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>চালান</TableHead><TableHead>তারিখ</TableHead>
                    <TableHead>পরিমাণ</TableHead><TableHead>রেট</TableHead><TableHead className="text-right">মোট</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {q.data.sales.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell className="font-mono text-xs">{s.challan_no}</TableCell>
                        <TableCell className="text-xs">{bnDate(s.sale_date)}</TableCell>
                        <TableCell>{bn(s.quantity)}</TableCell>
                        <TableCell>৳ {bn(s.unit_price)}</TableCell>
                        <TableCell className="text-right font-medium">৳ {bn(s.total_amount)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>

            <TabsContent value="payments" className="mt-3">
              {q.data.payments.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  <CreditCard className="mx-auto mb-2 h-8 w-8 opacity-40" />
                  কোনো পেমেন্ট নেই
                </div>
              ) : (
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>তারিখ</TableHead><TableHead>পদ্ধতি</TableHead>
                    <TableHead>মন্তব্য</TableHead><TableHead className="text-right">পরিমাণ</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {q.data.payments.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="text-xs">{bnDate(p.payment_date)}</TableCell>
                        <TableCell className="text-xs">{p.method ?? "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{p.note ?? "—"}</TableCell>
                        <TableCell className="text-right font-medium">৳ {bn(p.amount)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {c.notes && (
        <Card>
          <CardHeader><CardTitle className="text-sm">মন্তব্য</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground whitespace-pre-wrap">{c.notes}</CardContent>
        </Card>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "positive" | "negative" }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`mt-1 text-lg font-bold tracking-tight ${tone === "negative" ? "text-destructive" : tone === "positive" ? "text-emerald-600" : ""}`}>
          {value}
        </div>
      </CardContent>
    </Card>
  );
}
