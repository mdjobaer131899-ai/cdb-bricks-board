import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Landmark, Pencil, Plus, Printer, Trash2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatCard } from "@/components/stat-card";
import { supabase } from "@/integrations/supabase/client";
import { bn, bnDate, isoDate } from "@/lib/format";
import { useCurrentUser } from "@/lib/use-current-user";
import { printTable } from "@/lib/print-table";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/loans")({
  head: () => ({
    meta: [
      { title: "ঋণ দেওয়া-নেওয়া — CDB Bricks" },
      { name: "description", content: "কার কাছ থেকে ঋণ নেওয়া হয়েছে বা কাকে দেওয়া হয়েছে, পরিশোধ ও বাকি।" },
      { property: "og:title", content: "ঋণ দেওয়া-নেওয়া — CDB Bricks" },
      { property: "og:description", content: "ঋণ ও পরিশোধের হিসাব।" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LoansPage,
});

function LoansPage() {
  const qc = useQueryClient();
  const { data: me } = useCurrentUser();
  const isAdmin = me?.role === "admin";
  const today = isoDate(new Date());
  // ঋণ মৌসুম পেরিয়েও চলে, তাই সব সময়ের হিসাব দেখানো হয়
  const loansQ = useQuery({ queryKey: ["loans"], queryFn: async () => { const { data, error } = await supabase.from("loans").select("*").order("loan_date", { ascending: false }); if (error) throw error; return data ?? []; } });
  const payQ = useQuery({ queryKey: ["loan-payments"], queryFn: async () => { const { data, error } = await supabase.from("loan_payments").select("*").order("payment_date", { ascending: false }); if (error) throw error; return data ?? []; } });
  const inv = () => ["loans", "loan-payments", "cash"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  const paidOf = (id: string) => (payQ.data ?? []).filter((p) => p.loan_id === id).reduce((a, b) => a + Number(b.amount), 0);
  const sumDir = (d: string) => (loansQ.data ?? []).filter((l) => l.direction === d).reduce((a, l) => a + Number(l.amount) - paidOf(l.id), 0);

  const [lDlg, setLDlg] = useState<null | { id?: string; party_name: string; direction: string; amount: string; date: string; note: string }>(null);
  const saveL = useMutation({
    mutationFn: async () => {
      const f = lDlg!; const amount = Number(f.amount || 0);
      if (!f.party_name.trim() || !(amount > 0)) throw new Error("নাম ও টাকা দিন");
      const p = { party_name: f.party_name.trim(), direction: f.direction, amount, loan_date: f.date, note: f.note || null };
      const { error } = f.id ? await supabase.from("loans").update(p).eq("id", f.id) : await supabase.from("loans").insert({ ...p, created_by: me!.user.id });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("সংরক্ষিত"); setLDlg(null); inv(); }, onError: (e: Error) => toast.error(e.message),
  });
  const delL = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("loans").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { toast.success("মুছে ফেলা হয়েছে"); inv(); }, onError: (e: Error) => toast.error(e.message),
  });
  const [pDlg, setPDlg] = useState<null | { id?: string; loan_id: string; amount: string; date: string; note: string }>(null);
  const saveP = useMutation({
    mutationFn: async () => {
      const f = pDlg!; const amount = Number(f.amount || 0); if (!(amount > 0)) throw new Error("টাকা দিন");
      const p = { loan_id: f.loan_id, amount, payment_date: f.date, note: f.note || null };
      const { error } = f.id ? await supabase.from("loan_payments").update(p).eq("id", f.id) : await supabase.from("loan_payments").insert({ ...p, created_by: me!.user.id });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("পরিশোধ সংরক্ষিত"); setPDlg(null); inv(); }, onError: (e: Error) => toast.error(e.message),
  });
  const delP = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("loan_payments").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { toast.success("মুছে ফেলা হয়েছে"); inv(); }, onError: (e: Error) => toast.error(e.message),
  });
  const loanName = (id: string) => (loansQ.data ?? []).find((l) => l.id === id)?.party_name ?? "—";

  const print = () => printTable({
    title: "ঋণ দেওয়া-নেওয়ার হিসাব",
    headers: ["তারিখ", "নাম", "ধরন", "ঋণ", "পরিশোধ", "বাকি"], rightCols: [3, 4, 5],
    rows: (loansQ.data ?? []).map((l) => [bnDate(l.loan_date), l.party_name, l.direction === "taken" ? "নেওয়া" : "দেওয়া", `৳ ${bn(l.amount)}`, `৳ ${bn(paidOf(l.id))}`, `৳ ${bn(Number(l.amount) - paidOf(l.id))}`]),
    totals: [["নেওয়া ঋণ বাকি (দেনা)", `৳ ${bn(sumDir("taken"))}`], ["দেওয়া ঋণ বাকি (পাওনা)", `৳ ${bn(sumDir("given"))}`]],
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold md:text-2xl"><Landmark className="h-6 w-6 text-primary" /> ঋণ দেওয়া-নেওয়া</h1>
          <p className="text-sm text-muted-foreground">নেওয়া ঋণ = দেনা, দেওয়া ঋণ = পাওনা। পুরোনো বকেয়ার জন্য "পূর্বের বকেয়া" পাতা।</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={print}><Printer className="mr-1 h-4 w-4" /> প্রিন্ট</Button>
          <Button onClick={() => setLDlg({ party_name: "", direction: "taken", amount: "", date: today, note: "" })}><Plus className="mr-1 h-4 w-4" /> নতুন ঋণ</Button>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <StatCard label="নেওয়া ঋণ — বাকি দেনা" value={`৳ ${bn(sumDir("taken"))}`} icon={Wallet} tone="destructive" />
        <StatCard label="দেওয়া ঋণ — বাকি পাওনা" value={`৳ ${bn(sumDir("given"))}`} icon={Wallet} tone="success" />
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">ঋণের তালিকা</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow><TableHead>তারিখ</TableHead><TableHead>নাম</TableHead><TableHead className="text-right">ঋণ</TableHead><TableHead className="text-right">পরিশোধ</TableHead><TableHead className="text-right">বাকি</TableHead><TableHead></TableHead></TableRow></TableHeader>
            <TableBody>
              {(loansQ.data ?? []).length === 0 && <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">কোনো ঋণ নেই</TableCell></TableRow>}
              {(loansQ.data ?? []).map((l) => (
                <TableRow key={l.id}>
                  <TableCell>{bnDate(l.loan_date)}</TableCell>
                  <TableCell><span className="font-medium">{l.party_name}</span> <Badge variant="outline">{l.direction === "taken" ? "নেওয়া" : "দেওয়া"}</Badge></TableCell>
                  <TableCell className="text-right tabular-nums">৳ {bn(l.amount)}</TableCell>
                  <TableCell className="text-right tabular-nums">৳ {bn(paidOf(l.id))}</TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">৳ {bn(Number(l.amount) - paidOf(l.id))}</TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    <Button size="sm" variant="outline" onClick={() => setPDlg({ loan_id: l.id, amount: "", date: today, note: "" })}>পরিশোধ</Button>
                    {isAdmin && <>
                      <Button size="sm" variant="ghost" onClick={() => setLDlg({ id: l.id, party_name: l.party_name, direction: l.direction, amount: String(l.amount), date: l.loan_date, note: l.note ?? "" })}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button size="sm" variant="ghost" onClick={() => confirm("মুছবেন?") && delL.mutate(l.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                    </>}
                  </TableCell>
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
            <TableHeader><TableRow><TableHead>তারিখ</TableHead><TableHead>নাম</TableHead><TableHead>নোট</TableHead><TableHead className="text-right">টাকা</TableHead><TableHead></TableHead></TableRow></TableHeader>
            <TableBody>
              {(payQ.data ?? []).map((p) => (
                <TableRow key={p.id}>
                  <TableCell>{bnDate(p.payment_date)}</TableCell><TableCell>{loanName(p.loan_id)}</TableCell>
                  <TableCell className="text-muted-foreground">{p.note ?? ""}</TableCell>
                  <TableCell className="text-right tabular-nums">৳ {bn(p.amount)}</TableCell>
                  <TableCell className="text-right whitespace-nowrap">{isAdmin && <>
                    <Button size="sm" variant="ghost" onClick={() => setPDlg({ id: p.id, loan_id: p.loan_id, amount: String(p.amount), date: p.payment_date, note: p.note ?? "" })}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => confirm("মুছবেন?") && delP.mutate(p.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                  </>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!lDlg} onOpenChange={(o) => !o && setLDlg(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>ঋণ</DialogTitle></DialogHeader>
          {lDlg && <div className="space-y-3">
            <div><Label>নাম</Label><Input value={lDlg.party_name} onChange={(e) => setLDlg({ ...lDlg, party_name: e.target.value })} /></div>
            <div><Label>ধরন</Label>
              <Select value={lDlg.direction} onValueChange={(v) => setLDlg({ ...lDlg, direction: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="taken">ঋণ নেওয়া হলো (টাকা এলো)</SelectItem><SelectItem value="given">ঋণ দেওয়া হলো (টাকা গেল)</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>তারিখ</Label><Input type="date" value={lDlg.date} onChange={(e) => setLDlg({ ...lDlg, date: e.target.value })} /></div>
              <div><Label>টাকা (৳)</Label><Input type="number" value={lDlg.amount} onChange={(e) => setLDlg({ ...lDlg, amount: e.target.value })} /></div>
            </div>
            <div><Label>নোট</Label><Input value={lDlg.note} onChange={(e) => setLDlg({ ...lDlg, note: e.target.value })} /></div>
          </div>}
          <DialogFooter><Button onClick={() => saveL.mutate()} disabled={saveL.isPending}>সংরক্ষণ</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={!!pDlg} onOpenChange={(o) => !o && setPDlg(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>পরিশোধ — {pDlg ? loanName(pDlg.loan_id) : ""}</DialogTitle></DialogHeader>
          {pDlg && <div className="space-y-3">
            <div><Label>তারিখ</Label><Input type="date" value={pDlg.date} onChange={(e) => setPDlg({ ...pDlg, date: e.target.value })} /></div>
            <div><Label>টাকা (৳)</Label><Input type="number" value={pDlg.amount} onChange={(e) => setPDlg({ ...pDlg, amount: e.target.value })} /></div>
            <div><Label>নোট</Label><Input value={pDlg.note} onChange={(e) => setPDlg({ ...pDlg, note: e.target.value })} /></div>
          </div>}
          <DialogFooter><Button onClick={() => saveP.mutate()} disabled={saveP.isPending}>সংরক্ষণ</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
