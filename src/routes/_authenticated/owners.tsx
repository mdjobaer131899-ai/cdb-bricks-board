import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Crown, Pencil, Plus, Printer, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { sdb } from "@/lib/season-db";
import { bn, bnDate, isoDate } from "@/lib/format";
import { useCurrentUser } from "@/lib/use-current-user";
import { printTable } from "@/lib/print-table";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/owners")({
  head: () => ({
    meta: [
      { title: "মালিকের বিনিয়োগ — CDB Bricks" },
      { name: "description", content: "কোন মালিক কত টাকা বিনিয়োগ করেছেন ও তুলেছেন তার হিসাব।" },
      { property: "og:title", content: "মালিকের বিনিয়োগ — CDB Bricks" },
      { property: "og:description", content: "মালিকদের বিনিয়োগ ও উত্তোলন।" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: OwnersPage,
});

function OwnersPage() {
  const qc = useQueryClient();
  const { data: me } = useCurrentUser();
  const isAdmin = me?.role === "admin";
  const today = isoDate(new Date());
  const ownersQ = useQuery({ queryKey: ["owners"], queryFn: async () => (await supabase.from("owners").select("*").order("name")).data ?? [] });
  const txQ = useQuery({ queryKey: ["owner-tx"], queryFn: async () => { const { data, error } = await sdb.from("owner_transactions").select("*").order("txn_date", { ascending: false }); if (error) throw error; return data ?? []; } });
  const inv = () => ["owners", "owner-tx", "cash"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  const nameOf = (id: string) => (ownersQ.data ?? []).find((o) => o.id === id)?.name ?? "—";

  const stat = (id: string) => {
    const rows = (txQ.data ?? []).filter((t) => t.owner_id === id);
    const invest = rows.filter((t) => t.txn_type === "invest").reduce((a, b) => a + Number(b.amount), 0);
    const withdraw = rows.filter((t) => t.txn_type === "withdraw").reduce((a, b) => a + Number(b.amount), 0);
    return { invest, withdraw, net: invest - withdraw };
  };

  const [oDlg, setODlg] = useState<null | { id?: string; name: string; phone: string }>(null);
  const saveO = useMutation({
    mutationFn: async () => {
      const f = oDlg!; if (!f.name.trim()) throw new Error("নাম দিন");
      const p = { name: f.name.trim(), phone: f.phone || null };
      const { error } = f.id ? await supabase.from("owners").update(p).eq("id", f.id) : await supabase.from("owners").insert(p);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("সংরক্ষিত"); setODlg(null); inv(); }, onError: (e: Error) => toast.error(e.message),
  });
  const delO = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("owners").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { toast.success("মুছে ফেলা হয়েছে"); inv(); }, onError: (e: Error) => toast.error(e.message),
  });

  const [tDlg, setTDlg] = useState<null | { id?: string; owner_id: string; txn_type: string; amount: string; date: string; note: string }>(null);
  const saveT = useMutation({
    mutationFn: async () => {
      const f = tDlg!; const amount = Number(f.amount || 0); if (!(amount > 0)) throw new Error("টাকা দিন");
      const p = { owner_id: f.owner_id, txn_type: f.txn_type, amount, txn_date: f.date, note: f.note || null };
      const { error } = f.id ? await supabase.from("owner_transactions").update(p).eq("id", f.id) : await supabase.from("owner_transactions").insert({ ...p, created_by: me!.user.id });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("সংরক্ষিত"); setTDlg(null); inv(); }, onError: (e: Error) => toast.error(e.message),
  });
  const delT = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("owner_transactions").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { toast.success("মুছে ফেলা হয়েছে"); inv(); }, onError: (e: Error) => toast.error(e.message),
  });

  const print = () => printTable({
    title: "মালিকের বিনিয়োগ হিসাব",
    headers: ["তারিখ", "মালিক", "ধরন", "নোট", "টাকা"], rightCols: [4],
    rows: (txQ.data ?? []).map((t) => [bnDate(t.txn_date), nameOf(t.owner_id), t.txn_type === "invest" ? "বিনিয়োগ" : "উত্তোলন", t.note ?? "", `৳ ${bn(t.amount)}`]),
    totals: (ownersQ.data ?? []).map((o) => [o.name + " — নিট বিনিয়োগ", `৳ ${bn(stat(o.id).net)}`] as [string, string]),
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold md:text-2xl"><Crown className="h-6 w-6 text-primary" /> মালিকের বিনিয়োগ</h1>
          <p className="text-sm text-muted-foreground">কোন মালিক কত টাকা দিয়েছেন ও তুলেছেন</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="secondary"><Link to="/loans">ঋণ দেওয়া-নেওয়া</Link></Button>
          <Button variant="outline" onClick={print}><Printer className="mr-1 h-4 w-4" /> প্রিন্ট</Button>
          {isAdmin && <Button variant="secondary" onClick={() => setODlg({ name: "", phone: "" })}><Plus className="mr-1 h-4 w-4" /> মালিক</Button>}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {(ownersQ.data ?? []).map((o) => {
          const s = stat(o.id);
          return (
            <Card key={o.id}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-base">{o.name}</CardTitle>
                {isAdmin && <div>
                  <Button size="sm" variant="ghost" onClick={() => setODlg({ id: o.id, name: o.name, phone: o.phone ?? "" })}><Pencil className="h-3.5 w-3.5" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => confirm("মুছবেন? সব লেনদেনও মুছে যাবে") && delO.mutate(o.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                </div>}
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between"><span>বিনিয়োগ</span><b className="text-success">৳ {bn(s.invest)}</b></div>
                <div className="flex justify-between"><span>উত্তোলন</span><b className="text-destructive">৳ {bn(s.withdraw)}</b></div>
                <div className="flex justify-between border-t pt-2"><span>নিট বিনিয়োগ</span><b>৳ {bn(s.net)}</b></div>
                <div className="flex gap-2 pt-1">
                  <Button size="sm" onClick={() => setTDlg({ owner_id: o.id, txn_type: "invest", amount: "", date: today, note: "" })}>বিনিয়োগ</Button>
                  <Button size="sm" variant="outline" onClick={() => setTDlg({ owner_id: o.id, txn_type: "withdraw", amount: "", date: today, note: "" })}>উত্তোলন</Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
        {(ownersQ.data ?? []).length === 0 && <p className="text-sm text-muted-foreground">এখনো কোনো মালিক যোগ করা হয়নি।</p>}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">লেনদেন</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow><TableHead>তারিখ</TableHead><TableHead>মালিক</TableHead><TableHead>ধরন</TableHead><TableHead>নোট</TableHead><TableHead className="text-right">টাকা</TableHead><TableHead></TableHead></TableRow></TableHeader>
            <TableBody>
              {(txQ.data ?? []).map((t) => (
                <TableRow key={t.id}>
                  <TableCell>{bnDate(t.txn_date)}</TableCell><TableCell>{nameOf(t.owner_id)}</TableCell>
                  <TableCell>{t.txn_type === "invest" ? "বিনিয়োগ" : "উত্তোলন"}</TableCell>
                  <TableCell className="text-muted-foreground">{t.note ?? ""}</TableCell>
                  <TableCell className="text-right tabular-nums">৳ {bn(t.amount)}</TableCell>
                  <TableCell className="text-right whitespace-nowrap">{isAdmin && <>
                    <Button size="sm" variant="ghost" onClick={() => setTDlg({ id: t.id, owner_id: t.owner_id, txn_type: t.txn_type, amount: String(t.amount), date: t.txn_date, note: t.note ?? "" })}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => confirm("মুছবেন?") && delT.mutate(t.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                  </>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!oDlg} onOpenChange={(o) => !o && setODlg(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>মালিক</DialogTitle></DialogHeader>
          {oDlg && <div className="space-y-3">
            <div><Label>নাম</Label><Input value={oDlg.name} onChange={(e) => setODlg({ ...oDlg, name: e.target.value })} /></div>
            <div><Label>ফোন</Label><Input value={oDlg.phone} onChange={(e) => setODlg({ ...oDlg, phone: e.target.value })} /></div>
          </div>}
          <DialogFooter><Button onClick={() => saveO.mutate()} disabled={saveO.isPending}>সংরক্ষণ</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!tDlg} onOpenChange={(o) => !o && setTDlg(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>লেনদেন — {tDlg ? nameOf(tDlg.owner_id) : ""}</DialogTitle></DialogHeader>
          {tDlg && <div className="space-y-3">
            <div><Label>ধরন</Label>
              <Select value={tDlg.txn_type} onValueChange={(v) => setTDlg({ ...tDlg, txn_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="invest">বিনিয়োগ (টাকা দিলেন)</SelectItem><SelectItem value="withdraw">উত্তোলন (টাকা নিলেন)</SelectItem></SelectContent>
              </Select>
            </div>
            <div><Label>তারিখ</Label><Input type="date" value={tDlg.date} onChange={(e) => setTDlg({ ...tDlg, date: e.target.value })} /></div>
            <div><Label>টাকা (৳)</Label><Input type="number" value={tDlg.amount} onChange={(e) => setTDlg({ ...tDlg, amount: e.target.value })} /></div>
            <div><Label>নোট</Label><Input value={tDlg.note} onChange={(e) => setTDlg({ ...tDlg, note: e.target.value })} /></div>
          </div>}
          <DialogFooter><Button onClick={() => saveT.mutate()} disabled={saveT.isPending}>সংরক্ষণ</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
