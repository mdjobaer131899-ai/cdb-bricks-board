import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Boxes, Loader2, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/stat-card";
import { supabase } from "@/integrations/supabase/client";
import { sdb } from "@/lib/season-db";
import { bn, bnDate, isoDate } from "@/lib/format";
import { useCurrentUser } from "@/lib/use-current-user";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/kacha-bricks")({
  head: () => ({
    meta: [
      { title: "কাঁচা ইট — CDB Bricks" },
      { name: "description", content: "সরদারভিত্তিক কাঁচা ইট উৎপাদন, ভাটায় লোড ও নষ্ট ইটের হিসাব।" },
      { property: "og:title", content: "কাঁচা ইট — CDB Bricks" },
      { property: "og:description", content: "সরদারভিত্তিক কাঁচা ইট উৎপাদন, লোড ও নষ্টের হিসাব।" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: KachaBricksPage,
});

const TYPES = [
  { value: "production", label: "উৎপাদন (ছাঁচা)" },
  { value: "load", label: "ভাটায় লোড" },
  { value: "damage", label: "নষ্ট" },
];

type Form = { id?: string; entry_date: string; entry_type: string; sardar_id: string; quantity: string; rate: string; amount: string; note: string };
const NO_SARDAR = "__none__";
const empty = (): Form => ({ entry_date: isoDate(new Date()), entry_type: "production", sardar_id: NO_SARDAR, quantity: "", rate: "", amount: "", note: "" });

function KachaBricksPage() {
  const qc = useQueryClient();
  const { data: me } = useCurrentUser();
  const isAdmin = me?.role === "admin";
  const [dlg, setDlg] = useState<{ open: boolean; mode: "new" | "edit"; form: Form }>({ open: false, mode: "new", form: empty() });

  const sardarsQ = useQuery({
    queryKey: ["sardars"],
    queryFn: async () => {
      const { data, error } = await sdb.from("sardars").select("id,name,is_active").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const entriesQ = useQuery({
    queryKey: ["kacha-brick-entries"],
    queryFn: async () => {
      const { data, error } = await sdb.from("kacha_brick_entries").select("*").order("entry_date", { ascending: false }).limit(300);
      if (error) throw error;
      return data ?? [];
    },
  });

  const sardarName = (id: string | null) => (id ? (sardarsQ.data ?? []).find((s: any) => s.id === id)?.name ?? "—" : "—");

  const totals = useMemo(() => {
    let produced = 0, loaded = 0, damaged = 0, cost = 0;
    (entriesQ.data ?? []).forEach((e: any) => {
      const q = Number(e.quantity || 0);
      if (e.entry_type === "production") { produced += q; cost += Number(e.amount || 0); }
      else if (e.entry_type === "load") loaded += q;
      else damaged += q;
    });
    return { produced, loaded, damaged, cost, stock: Math.max(0, produced - loaded - damaged) };
  }, [entriesQ.data]);

  const save = useMutation({
    mutationFn: async () => {
      const f = dlg.form;
      const qty = Number(f.quantity || 0);
      if (!(qty > 0)) throw new Error("পরিমাণ দিন");
      const rate = Number(f.rate || 0);
      const amount = f.amount !== "" ? Number(f.amount) : qty * rate;
      const payload = {
        entry_date: f.entry_date,
        entry_type: f.entry_type,
        sardar_id: f.sardar_id === NO_SARDAR ? null : f.sardar_id,
        quantity: qty,
        rate,
        amount,
        note: f.note || null,
      };
      if (dlg.mode === "edit" && f.id) {
        const { error } = await sdb.from("kacha_brick_entries").update(payload).eq("id", f.id);
        if (error) throw error;
      } else {
        if (!me?.user.id) throw new Error("লগইন প্রয়োজন");
        const { error } = await sdb.from("kacha_brick_entries").insert({ ...payload, created_by: me.user.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("সংরক্ষিত");
      setDlg({ open: false, mode: "new", form: empty() });
      qc.invalidateQueries({ queryKey: ["kacha-brick-entries"] });
      qc.invalidateQueries({ queryKey: ["kacha-by-sardar"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sdb.from("kacha_brick_entries").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("মুছে ফেলা হয়েছে"); qc.invalidateQueries({ queryKey: ["kacha-brick-entries"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const f = dlg.form;
  const autoAmount = f.amount !== "" ? Number(f.amount) : Number(f.quantity || 0) * Number(f.rate || 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold md:text-2xl"><Boxes className="h-6 w-6 text-primary" /> কাঁচা ইট</h1>
          <p className="text-sm text-muted-foreground">সরদারভিত্তিক ছাঁচা, ভাটায় লোড ও নষ্টের হিসাব</p>
        </div>
        <Button onClick={() => setDlg({ open: true, mode: "new", form: empty() })}><Plus className="mr-1 h-4 w-4" /> নতুন এন্ট্রি</Button>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <StatCard label="মোট ছাঁচা" value={bn(totals.produced)} icon={Boxes} tone="primary" />
        <StatCard label="ভাটায় লোড" value={bn(totals.loaded)} icon={Boxes} tone="info" />
        <StatCard label="কাঁচা স্টক" value={bn(totals.stock)} icon={Boxes} tone="success" />
        <StatCard label="মোট মজুরি" value={`৳ ${bn(totals.cost)}`} icon={Boxes} tone="warning" />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">এন্ট্রি তালিকা</CardTitle></CardHeader>
        <CardContent className="p-0">
          {entriesQ.isLoading ? (
            <div className="flex h-24 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : (entriesQ.data ?? []).length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">কোনো এন্ট্রি নেই</div>
          ) : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>তারিখ</TableHead>
                <TableHead>ধরন</TableHead>
                <TableHead>সরদার</TableHead>
                <TableHead className="text-right">পরিমাণ</TableHead>
                <TableHead className="text-right">রেট</TableHead>
                <TableHead className="text-right">টাকা</TableHead>
                <TableHead></TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {(entriesQ.data ?? []).map((e: any) => (
                  <TableRow key={e.id}>
                    <TableCell className="whitespace-nowrap">{bnDate(e.entry_date)}</TableCell>
                    <TableCell><Badge variant="outline">{TYPES.find((t) => t.value === e.entry_type)?.label ?? e.entry_type}</Badge></TableCell>
                    <TableCell>{sardarName(e.sardar_id)}</TableCell>
                    <TableCell className="text-right tabular-nums">{bn(e.quantity)}</TableCell>
                    <TableCell className="text-right tabular-nums">{bn(e.rate)}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">৳ {bn(e.amount)}</TableCell>
                    <TableCell className="text-right">
                      {isAdmin && (
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" onClick={() => setDlg({
                            open: true, mode: "edit",
                            form: {
                              id: e.id, entry_date: e.entry_date, entry_type: e.entry_type,
                              sardar_id: e.sardar_id ?? NO_SARDAR, quantity: String(e.quantity),
                              rate: String(e.rate), amount: String(e.amount), note: e.note ?? "",
                            },
                          })}><Pencil className="h-3.5 w-3.5" /></Button>
                          <Button size="sm" variant="ghost" onClick={() => { if (confirm("মুছে ফেলবেন?")) del.mutate(e.id); }}>
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dlg.open} onOpenChange={(o) => setDlg((s) => ({ ...s, open: o }))}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{dlg.mode === "edit" ? "এন্ট্রি সম্পাদনা" : "নতুন কাঁচা ইট এন্ট্রি"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div><Label>তারিখ</Label><Input type="date" value={f.entry_date} onChange={(e) => setDlg((s) => ({ ...s, form: { ...s.form, entry_date: e.target.value } }))} /></div>
              <div>
                <Label>ধরন</Label>
                <Select value={f.entry_type} onValueChange={(v) => setDlg((s) => ({ ...s, form: { ...s.form, entry_type: v } }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>সরদার</Label>
              <Select value={f.sardar_id} onValueChange={(v) => setDlg((s) => ({ ...s, form: { ...s.form, sardar_id: v } }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_SARDAR}>নির্বাচন করা হয়নি</SelectItem>
                  {(sardarsQ.data ?? []).filter((s: any) => s.is_active).map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>পরিমাণ (পিস)</Label><Input type="number" value={f.quantity} onChange={(e) => setDlg((s) => ({ ...s, form: { ...s.form, quantity: e.target.value } }))} /></div>
              <div><Label>রেট</Label><Input type="number" value={f.rate} onChange={(e) => setDlg((s) => ({ ...s, form: { ...s.form, rate: e.target.value } }))} /></div>
            </div>
            <div>
              <Label>টাকা (৳)</Label>
              <Input type="number" value={f.amount} placeholder={String(autoAmount || "")} onChange={(e) => setDlg((s) => ({ ...s, form: { ...s.form, amount: e.target.value } }))} />
              <p className="mt-1 text-xs text-muted-foreground">খালি রাখলে পরিমাণ × রেট = ৳ {bn(autoAmount)}</p>
            </div>
            <div><Label>নোট</Label><Textarea rows={2} value={f.note} onChange={(e) => setDlg((s) => ({ ...s, form: { ...s.form, note: e.target.value } }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDlg((s) => ({ ...s, open: false }))}>বাতিল</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>সংরক্ষণ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
