import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Printer, ShoppingCart, Trash2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatCard } from "@/components/stat-card";
import { supabase } from "@/integrations/supabase/client";
import { sdb } from "@/lib/season-db";
import { bn, bnDate, isoDate } from "@/lib/format";
import { useCurrentUser } from "@/lib/use-current-user";
import { printTable } from "@/lib/print-table";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/purchases")({
  head: () => ({
    meta: [
      { title: "মালামাল ক্রয় ও বাকি — CDB Bricks" },
      { name: "description", content: "কারেন্ট বিল, ফুয়েল, কয়লা সহ যেকোনো মালামাল ক্রয়, পরিশোধ ও বাকির হিসাব।" },
      { property: "og:title", content: "মালামাল ক্রয় ও বাকি — CDB Bricks" },
      { property: "og:description", content: "মালামাল ক্রয় ও বাকির হিসাব।" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PurchasesPage,
});

const NEW_SUP = "__new__";

function PurchasesPage() {
  const qc = useQueryClient();
  const { data: me } = useCurrentUser();
  const isAdmin = me?.role === "admin";
  const today = isoDate(new Date());

  const supQ = useQuery({ queryKey: ["suppliers"], queryFn: async () => (await supabase.from("suppliers").select("id,name,phone").order("name")).data ?? [] });
  const purQ = useQuery({
    queryKey: ["purchases"],
    queryFn: async () => { const { data, error } = await sdb.from("purchases").select("*").order("purchase_date", { ascending: false }); if (error) throw error; return data ?? []; },
  });
  const payQ = useQuery({
    queryKey: ["supplier-payments"],
    queryFn: async () => { const { data, error } = await sdb.from("supplier_payments").select("*").order("payment_date", { ascending: false }); if (error) throw error; return data ?? []; },
  });
  const supName = (id: string | null) => (supQ.data ?? []).find((s) => s.id === id)?.name ?? "—";

  const bySup = useMemo(() => {
    return (supQ.data ?? []).map((s) => {
      const bought = (purQ.data ?? []).filter((p) => p.supplier_id === s.id).reduce((a, b) => a + Number(b.total_amount || 0), 0);
      const paid = (payQ.data ?? []).filter((p) => p.supplier_id === s.id).reduce((a, b) => a + Number(b.amount || 0), 0);
      return { ...s, bought, paid, due: bought - paid };
    }).filter((s) => s.bought || s.paid);
  }, [supQ.data, purQ.data, payQ.data]);
  const tot = bySup.reduce((a, b) => ({ bought: a.bought + b.bought, paid: a.paid + b.paid, due: a.due + b.due }), { bought: 0, paid: 0, due: 0 });

  const inv = () => { ["purchases", "supplier-payments", "suppliers", "cash"].forEach((k) => qc.invalidateQueries({ queryKey: [k] })); };

  const emptyP = { id: "", purchase_date: today, supplier_id: NEW_SUP, new_supplier: "", item_name: "", quantity: "", unit: "", unit_price: "", paid_now: "", note: "" };
  const [pDlg, setPDlg] = useState<null | typeof emptyP>(null);
  const saveP = useMutation({
    mutationFn: async () => {
      const f = pDlg!;
      if (!f.item_name.trim()) throw new Error("জিনিসের নাম দিন");
      let supplierId = f.supplier_id;
      if (supplierId === NEW_SUP) {
        if (!f.new_supplier.trim()) throw new Error("বিক্রেতার নাম দিন");
        const { data, error } = await supabase.from("suppliers").insert({ name: f.new_supplier.trim() }).select("id").single();
        if (error) throw error;
        supplierId = data.id;
      }
      const qty = Number(f.quantity || 0), price = Number(f.unit_price || 0);
      const payload = { purchase_date: f.purchase_date, supplier_id: supplierId, item_name: f.item_name.trim(), quantity: qty, unit: f.unit || null, unit_price: price, total_amount: qty * price, note: f.note || null };
      if (f.id) { const { error } = await supabase.from("purchases").update(payload).eq("id", f.id); if (error) throw error; }
      else {
        const { error } = await supabase.from("purchases").insert({ ...payload, created_by: me!.user.id }); if (error) throw error;
        const paid = Number(f.paid_now || 0);
        if (paid > 0) { const { error: e2 } = await supabase.from("supplier_payments").insert({ supplier_id: supplierId, amount: paid, payment_date: f.purchase_date, note: `${f.item_name} ক্রয়ের সময় পরিশোধ`, created_by: me!.user.id }); if (e2) throw e2; }
      }
    },
    onSuccess: () => { toast.success("সংরক্ষিত"); setPDlg(null); inv(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const delP = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("purchases").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { toast.success("মুছে ফেলা হয়েছে"); inv(); }, onError: (e: Error) => toast.error(e.message),
  });

  const [payDlg, setPayDlg] = useState<null | { id?: string; supplier_id: string; amount: string; date: string; note: string }>(null);
  const savePay = useMutation({
    mutationFn: async () => {
      const f = payDlg!; const amount = Number(f.amount || 0);
      if (!(amount > 0)) throw new Error("টাকা দিন");
      const payload = { supplier_id: f.supplier_id, amount, payment_date: f.date, note: f.note || null };
      const { error } = f.id ? await supabase.from("supplier_payments").update(payload).eq("id", f.id) : await supabase.from("supplier_payments").insert({ ...payload, created_by: me!.user.id });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("পরিশোধ সংরক্ষিত"); setPayDlg(null); inv(); }, onError: (e: Error) => toast.error(e.message),
  });
  const delPay = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("supplier_payments").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { toast.success("মুছে ফেলা হয়েছে"); inv(); }, onError: (e: Error) => toast.error(e.message),
  });

  const print = () => printTable({
    title: "মালামাল ক্রয় তালিকা",
    headers: ["তারিখ", "বিক্রেতা", "জিনিস", "পরিমাণ", "দর", "মোট"], rightCols: [3, 4, 5],
    rows: (purQ.data ?? []).map((p) => [bnDate(p.purchase_date), supName(p.supplier_id), p.item_name, `${bn(p.quantity)} ${p.unit ?? ""}`, bn(p.unit_price), `৳ ${bn(p.total_amount)}`]),
    totals: [["মোট ক্রয়", `৳ ${bn(tot.bought)}`], ["পরিশোধ", `৳ ${bn(tot.paid)}`], ["বাকি", `৳ ${bn(tot.due)}`]],
  });
  const f = pDlg;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold md:text-2xl"><ShoppingCart className="h-6 w-6 text-primary" /> মালামাল ক্রয় ও বাকি</h1>
          <p className="text-sm text-muted-foreground">কারেন্ট বিল, ফুয়েল, কয়লা, মাটি — যা কিছু আনা হয়; পরিমাণ, দাম, পরিশোধ ও বাকি</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={print}><Printer className="mr-1 h-4 w-4" /> প্রিন্ট</Button>
          <Button onClick={() => setPDlg({ ...emptyP })}><Plus className="mr-1 h-4 w-4" /> নতুন ক্রয়</Button>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <StatCard label="মোট ক্রয়" value={`৳ ${bn(tot.bought)}`} icon={ShoppingCart} tone="primary" />
        <StatCard label="পরিশোধ" value={`৳ ${bn(tot.paid)}`} icon={Wallet} tone="success" />
        <StatCard label="বাকি" value={`৳ ${bn(tot.due)}`} icon={Wallet} tone="warning" />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">বিক্রেতা অনুযায়ী বাকি</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow><TableHead>বিক্রেতা</TableHead><TableHead className="text-right">ক্রয়</TableHead><TableHead className="text-right">পরিশোধ</TableHead><TableHead className="text-right">বাকি</TableHead><TableHead></TableHead></TableRow></TableHeader>
            <TableBody>
              {bySup.length === 0 && <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">কোনো ক্রয় নেই</TableCell></TableRow>}
              {bySup.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell className="text-right tabular-nums">৳ {bn(s.bought)}</TableCell>
                  <TableCell className="text-right tabular-nums text-success">৳ {bn(s.paid)}</TableCell>
                  <TableCell className="text-right font-semibold tabular-nums text-warning">৳ {bn(s.due)}</TableCell>
                  <TableCell className="text-right"><Button size="sm" variant="outline" onClick={() => setPayDlg({ supplier_id: s.id, amount: "", date: today, note: "" })}>পরিশোধ</Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">ক্রয়ের তালিকা</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow><TableHead>তারিখ</TableHead><TableHead>জিনিস</TableHead><TableHead>বিক্রেতা</TableHead><TableHead className="text-right">পরিমাণ × দর</TableHead><TableHead className="text-right">মোট</TableHead><TableHead></TableHead></TableRow></TableHeader>
            <TableBody>
              {(purQ.data ?? []).map((p) => (
                <TableRow key={p.id}>
                  <TableCell>{bnDate(p.purchase_date)}</TableCell>
                  <TableCell className="font-medium">{p.item_name}</TableCell>
                  <TableCell>{supName(p.supplier_id)}</TableCell>
                  <TableCell className="text-right tabular-nums">{bn(p.quantity)} {p.unit ?? ""} × {bn(p.unit_price)}</TableCell>
                  <TableCell className="text-right tabular-nums">৳ {bn(p.total_amount)}</TableCell>
                  <TableCell className="text-right whitespace-nowrap">{isAdmin && <>
                    <Button size="sm" variant="ghost" onClick={() => setPDlg({ ...emptyP, id: p.id, purchase_date: p.purchase_date, supplier_id: p.supplier_id ?? NEW_SUP, item_name: p.item_name, quantity: String(p.quantity), unit: p.unit ?? "", unit_price: String(p.unit_price), note: p.note ?? "" })}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => confirm("মুছবেন?") && delP.mutate(p.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                  </>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">পরিশোধের তালিকা</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow><TableHead>তারিখ</TableHead><TableHead>বিক্রেতা</TableHead><TableHead>নোট</TableHead><TableHead className="text-right">টাকা</TableHead><TableHead></TableHead></TableRow></TableHeader>
            <TableBody>
              {(payQ.data ?? []).map((p) => (
                <TableRow key={p.id}>
                  <TableCell>{bnDate(p.payment_date)}</TableCell><TableCell>{supName(p.supplier_id)}</TableCell>
                  <TableCell className="text-muted-foreground">{p.note ?? ""}</TableCell>
                  <TableCell className="text-right tabular-nums">৳ {bn(p.amount)}</TableCell>
                  <TableCell className="text-right whitespace-nowrap">{isAdmin && <>
                    <Button size="sm" variant="ghost" onClick={() => setPayDlg({ id: p.id, supplier_id: p.supplier_id, amount: String(p.amount), date: p.payment_date, note: p.note ?? "" })}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => confirm("মুছবেন?") && delPay.mutate(p.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                  </>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!f} onOpenChange={(o) => !o && setPDlg(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{f?.id ? "ক্রয় সম্পাদনা" : "নতুন ক্রয়"}</DialogTitle></DialogHeader>
          {f && <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div><Label>তারিখ</Label><Input type="date" value={f.purchase_date} onChange={(e) => setPDlg({ ...f, purchase_date: e.target.value })} /></div>
              <div><Label>জিনিস</Label><Input placeholder="যেমন: ডিজেল, কারেন্ট বিল" value={f.item_name} onChange={(e) => setPDlg({ ...f, item_name: e.target.value })} /></div>
            </div>
            <div><Label>বিক্রেতা</Label>
              <Select value={f.supplier_id} onValueChange={(v) => setPDlg({ ...f, supplier_id: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value={NEW_SUP}>+ নতুন বিক্রেতা</SelectItem>{(supQ.data ?? []).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
              {f.supplier_id === NEW_SUP && <Input className="mt-2" placeholder="বিক্রেতার নাম" value={f.new_supplier} onChange={(e) => setPDlg({ ...f, new_supplier: e.target.value })} />}
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div><Label>পরিমাণ</Label><Input type="number" value={f.quantity} onChange={(e) => setPDlg({ ...f, quantity: e.target.value })} /></div>
              <div><Label>একক</Label><Input placeholder="লিটার" value={f.unit} onChange={(e) => setPDlg({ ...f, unit: e.target.value })} /></div>
              <div><Label>দর (৳)</Label><Input type="number" value={f.unit_price} onChange={(e) => setPDlg({ ...f, unit_price: e.target.value })} /></div>
            </div>
            <p className="text-sm">মোট: <b>৳ {bn(Number(f.quantity || 0) * Number(f.unit_price || 0))}</b></p>
            {!f.id && <div><Label>এখন পরিশোধ (৳)</Label><Input type="number" value={f.paid_now} onChange={(e) => setPDlg({ ...f, paid_now: e.target.value })} /></div>}
            <div><Label>নোট</Label><Input value={f.note} onChange={(e) => setPDlg({ ...f, note: e.target.value })} /></div>
          </div>}
          <DialogFooter><Button onClick={() => saveP.mutate()} disabled={saveP.isPending}>সংরক্ষণ</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!payDlg} onOpenChange={(o) => !o && setPayDlg(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>পরিশোধ — {payDlg ? supName(payDlg.supplier_id) : ""}</DialogTitle></DialogHeader>
          {payDlg && <div className="space-y-3">
            <div><Label>তারিখ</Label><Input type="date" value={payDlg.date} onChange={(e) => setPayDlg({ ...payDlg, date: e.target.value })} /></div>
            <div><Label>টাকা (৳)</Label><Input type="number" value={payDlg.amount} onChange={(e) => setPayDlg({ ...payDlg, amount: e.target.value })} /></div>
            <div><Label>নোট</Label><Input value={payDlg.note} onChange={(e) => setPayDlg({ ...payDlg, note: e.target.value })} /></div>
          </div>}
          <DialogFooter><Button onClick={() => savePay.mutate()} disabled={savePay.isPending}>সংরক্ষণ</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
