import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Lock, Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { sdb } from "@/lib/season-db";
import { bn } from "@/lib/format";
import { useCurrentUser } from "@/lib/use-current-user";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/accounts/closing")({
  head: () => ({ meta: [{ title: "মাসিক ক্লোজিং — CDB Bricks" }] }),
  component: ClosingPage,
});

function ClosingPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const qc = useQueryClient();
  const { data: me } = useCurrentUser();

  const ym = `${year}-${String(month).padStart(2, "0")}`;
  const first = `${ym}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const last = `${ym}-${String(lastDay).padStart(2, "0")}`;

  const summary = useQuery({
    queryKey: ["closing-summary", ym],
    queryFn: async () => {
      const [salesRes, collRes, expRes, rmpRes, wpRes] = await Promise.all([
        sdb.from("sales_entries").select("total_amount").eq("status", "approved").gte("sale_date", first).lte("sale_date", last),
        sdb.from("collections").select("amount").gte("payment_date", first).lte("payment_date", last),
        sdb.from("expenses").select("amount").gte("expense_date", first).lte("expense_date", last),
        sdb.from("raw_material_purchases").select("total_amount").gte("purchase_date", first).lte("purchase_date", last),
        sdb.from("worker_payments").select("amount").gte("payment_date", first).lte("payment_date", last),
      ]);
      const sum = (rows: any[] | null, key: string) => (rows ?? []).reduce((s, r) => s + Number(r[key] || 0), 0);
      const sales = sum(salesRes.data, "total_amount");
      const collections = sum(collRes.data, "amount");
      const expenses = sum(expRes.data, "amount");
      const rawMaterial = sum(rmpRes.data, "total_amount");
      const labor = sum(wpRes.data, "amount");
      return { sales, collections, expenses, rawMaterial, labor, netProfit: sales - expenses - rawMaterial - labor };
    },
  });

  const closedQ = useQuery({
    queryKey: ["closed-months"],
    queryFn: async () => (await sdb.from("closed_months").select("*").order("year", { ascending: false }).order("month", { ascending: false })).data ?? [],
  });

  const isClosed = (closedQ.data ?? []).some((c: any) => c.year === year && c.month === month);

  const closeMut = useMutation({
    mutationFn: async () => {
      const { error } = await sdb.from("closed_months").insert({ year, month, closed_by: me?.user.id ?? null, snapshot: summary.data as any });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("মাস বন্ধ করা হয়েছে"); qc.invalidateQueries({ queryKey: ["closed-months"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const reopenMut = useMutation({
    mutationFn: async () => {
      const { error } = await sdb.from("closed_months").delete().eq("year", year).eq("month", month);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("মাস পুনরায় খোলা হয়েছে"); qc.invalidateQueries({ queryKey: ["closed-months"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const s = summary.data;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold md:text-2xl flex items-center gap-2"><Lock className="h-6 w-6 text-primary" /> মাসিক ক্লোজিং</h1>
        <p className="text-sm text-muted-foreground">মাস বন্ধ করলে ঐ মাসের কোনো এন্ট্রি পরিবর্তন/মুছে ফেলা যাবে না</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">মাস নির্বাচন</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div><Label>বছর</Label><Input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} className="w-28" /></div>
          <div><Label>মাস</Label><Input type="number" min={1} max={12} value={month} onChange={(e) => setMonth(Number(e.target.value))} className="w-24" /></div>
          {isClosed ? <Badge variant="secondary" className="gap-1"><CheckCircle2 className="h-3 w-3" /> বন্ধ</Badge> : <Badge variant="outline">খোলা</Badge>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">{ym} প্রিভিউ</CardTitle></CardHeader>
        <CardContent>
          {summary.isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : s ? (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              <Stat label="মোট বিক্রয়" value={s.sales} tone="success" />
              <Stat label="মোট কালেকশন" value={s.collections} tone="primary" />
              <Stat label="অন্যান্য খরচ" value={s.expenses} tone="destructive" />
              <Stat label="কাঁচামাল খরচ" value={s.rawMaterial} tone="warning" />
              <Stat label="শ্রমিক খরচ" value={s.labor} tone="warning" />
              <Stat label="নিট লাভ" value={s.netProfit} tone={s.netProfit >= 0 ? "success" : "destructive"} bold />
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="flex gap-2">
        {!isClosed ? (
          <Button onClick={() => { if (confirm(`${ym} মাস বন্ধ করতে চান? এর পর এই মাসের ডেটা পরিবর্তন করা যাবে না।`)) closeMut.mutate(); }} disabled={closeMut.isPending}>
            <Lock className="mr-2 h-4 w-4" /> মাস বন্ধ করুন
          </Button>
        ) : (
          <Button variant="outline" onClick={() => { if (confirm("মাস পুনরায় খুলতে চান?")) reopenMut.mutate(); }} disabled={reopenMut.isPending}>
            মাস পুনরায় খুলুন
          </Button>
        )}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">বন্ধ মাসের তালিকা</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow><TableHead>মাস</TableHead><TableHead>বন্ধ তারিখ</TableHead></TableRow></TableHeader>
            <TableBody>
              {(closedQ.data ?? []).map((c: any) => (
                <TableRow key={c.id}><TableCell>{c.year}-{String(c.month).padStart(2, "0")}</TableCell><TableCell className="text-xs text-muted-foreground">{new Date(c.closed_at).toLocaleDateString("bn-BD")}</TableCell></TableRow>
              ))}
              {(closedQ.data ?? []).length === 0 && <TableRow><TableCell colSpan={2} className="py-6 text-center text-sm text-muted-foreground">কোনো মাস বন্ধ নেই</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value, tone, bold }: { label: string; value: number; tone: string; bold?: boolean }) {
  const toneCls = tone === "success" ? "text-success" : tone === "destructive" ? "text-destructive" : tone === "warning" ? "text-warning" : "text-primary";
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-1 tabular-nums ${bold ? "text-2xl font-bold" : "text-lg font-semibold"} ${toneCls}`}>৳ {bn(value)}</div>
    </div>
  );
}
