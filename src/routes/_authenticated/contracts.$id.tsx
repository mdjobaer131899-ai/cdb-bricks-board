import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, FileText, Truck, CreditCard, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
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

async function fetchContract(id: string) {
  const [contractRes, summaryRes, paymentsRes, salesRes] = await Promise.all([
    supabase.from("contracts").select("*, customer:customers(id, name, phone, address)").eq("id", id).single(),
    supabase.from("contract_summary").select("*").eq("id", id).maybeSingle(),
    supabase.from("contract_payments").select("*").eq("contract_id", id).order("payment_date", { ascending: false }),
    supabase.from("sales_entries").select("id, challan_no, sale_date, quantity, unit_price, total_amount, status").eq("contract_id", id).order("sale_date", { ascending: false }),
  ]);
  if (contractRes.error) throw contractRes.error;
  return {
    contract: contractRes.data,
    summary: summaryRes.data,
    payments: paymentsRes.data ?? [],
    sales: salesRes.data ?? [],
  };
}

function ContractDetailPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: me } = useCurrentUser();
  const isAdmin = me?.role === "admin";
  const [deleteOpen, setDeleteOpen] = useState(false);

  const q = useQuery({ queryKey: ["contract-detail", id], queryFn: () => fetchContract(id) });

  const deleteMut = useMutation({
    mutationFn: () => deleteContract({ data: { id } }),
    onSuccess: () => {
      toast.success("চুক্তি মুছে ফেলা হয়েছে");
      queryClient.invalidateQueries({ queryKey: ["contracts-by-customer"] });
      navigate({ to: "/contracts" });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "ব্যর্থ"),
  });

  if (q.isLoading) return <div className="space-y-3"><Skeleton className="h-32" /><Skeleton className="h-64" /></div>;
  if (q.error || !q.data) return <div className="text-sm text-destructive">চুক্তি লোড করা যায়নি</div>;

  const c = q.data.contract;
  const s = q.data.summary;

  const bookedQty = Number(c.booked_quantity || 0);
  const deliveredQty = Number(s?.delivered_quantity ?? 0);
  const remainingQty = Math.max(0, bookedQty - deliveredQty);
  const truckQty = bookedQty / 2000;
  const deliveredTrucks = deliveredQty / 2000;
  const remainingTrucks = remainingQty / 2000;
  const bookedValue = Number(c.booked_value || 0);
  const collected = Number(s?.collected_amount ?? 0);
  const due = Number(s?.due_amount ?? Math.max(0, bookedValue - collected));
  const usedPct = bookedQty > 0 ? Math.min(100, (deliveredQty / bookedQty) * 100) : 0;

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
              <Badge variant={c.status === "active" ? "default" : "secondary"}>
                {c.status === "active" ? "সক্রিয়" : c.status}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">তারিখ: {bnDate(c.start_date)}</p>
          </div>
        </div>
        {isAdmin && (
          <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm">
                <Trash2 className="mr-2 h-4 w-4" /> মুছুন
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>চুক্তি মুছে ফেলবেন?</AlertDialogTitle>
                <AlertDialogDescription>{c.contract_no} স্থায়ীভাবে মুছে যাবে।</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>বাতিল</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={() => { setDeleteOpen(false); deleteMut.mutate(); }}
                >মুছুন</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>

      {/* Customer card */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">গ্রাহক</CardTitle></CardHeader>
        <CardContent>
          <Link to="/customers/$id" params={{ id: c.customer?.id ?? "" }} className="text-base font-bold text-primary hover:underline">
            {c.customer?.name ?? "—"}
          </Link>
          {c.customer?.phone && <div className="mt-1 text-xs text-muted-foreground">{c.customer.phone}</div>}
        </CardContent>
      </Card>

      {/* Live stats — quantity */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="মোট চুক্তি (পিস)" value={bn(bookedQty)} />
        <Stat label="মোট ট্রাক" value={bn(truckQty.toFixed(2))} hint="২০০০ পিস = ১ ট্রাক" />
        <Stat label="সরবরাহকৃত (পিস)" value={bn(deliveredQty)} hint={`${bn(deliveredTrucks.toFixed(2))} ট্রাক`} tone="positive" />
        <Stat label="অবশিষ্ট (পিস)" value={bn(remainingQty)} hint={`${bn(remainingTrucks.toFixed(2))} ট্রাক`} tone={remainingQty > 0 ? "warning" : "positive"} />
      </div>

      <Card>
        <CardContent className="space-y-2 py-4">
          <div className="flex justify-between text-xs"><span className="text-muted-foreground">সরবরাহ অগ্রগতি</span><span className="font-bold">{bn(Math.round(usedPct))}%</span></div>
          <Progress value={usedPct} className="h-2" />
        </CardContent>
      </Card>

      {/* Live stats — money */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="প্রতি ইট রেট" value={`৳ ${bn(c.fixed_rate ?? 0)}`} />
        <Stat label="মোট মূল্য" value={`৳ ${bn(bookedValue)}`} />
        <Stat label="আদায়কৃত" value={`৳ ${bn(collected)}`} tone="positive" />
        <Stat label="বকেয়া" value={`৳ ${bn(due)}`} tone={due > 0 ? "negative" : "positive"} />
      </div>

      {/* Ledger */}
      <Card>
        <CardHeader><CardTitle className="text-base">লেজার</CardTitle></CardHeader>
        <CardContent>
          <Tabs defaultValue="deliveries">
            <TabsList>
              <TabsTrigger value="deliveries" className="gap-2"><Truck className="h-3.5 w-3.5" /> ডেলিভারি ({bn(q.data.sales.length)})</TabsTrigger>
              <TabsTrigger value="payments" className="gap-2"><CreditCard className="h-3.5 w-3.5" /> পেমেন্ট ({bn(q.data.payments.length)})</TabsTrigger>
            </TabsList>

            <TabsContent value="deliveries" className="mt-3">
              {q.data.sales.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  <FileText className="mx-auto mb-2 h-8 w-8 opacity-40" /> এখনো কোনো ডেলিভারি নেই
                </div>
              ) : (
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>চালান</TableHead><TableHead>তারিখ</TableHead>
                    <TableHead>পিস</TableHead><TableHead>রেট</TableHead><TableHead className="text-right">মোট</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {q.data.sales.map((x) => (
                      <TableRow key={x.id}>
                        <TableCell className="font-mono text-xs">{x.challan_no}</TableCell>
                        <TableCell className="text-xs">{bnDate(x.sale_date)}</TableCell>
                        <TableCell>{bn(x.quantity)}</TableCell>
                        <TableCell>৳ {bn(x.unit_price)}</TableCell>
                        <TableCell className="text-right font-medium">৳ {bn(x.total_amount)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>

            <TabsContent value="payments" className="mt-3">
              {q.data.payments.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  <CreditCard className="mx-auto mb-2 h-8 w-8 opacity-40" /> কোনো পেমেন্ট নেই
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
    </div>
  );
}

function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "positive" | "negative" | "warning" }) {
  const cls =
    tone === "negative" ? "text-destructive" :
    tone === "positive" ? "text-success" :
    tone === "warning" ? "text-warning" : "";
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`mt-1 text-lg font-bold tracking-tight tabular-nums ${cls}`}>{value}</div>
        {hint && <div className="mt-0.5 text-[10px] text-muted-foreground">{hint}</div>}
      </CardContent>
    </Card>
  );
}
