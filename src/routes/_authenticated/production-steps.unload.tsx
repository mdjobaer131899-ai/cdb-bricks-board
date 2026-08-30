import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpFromLine, Loader2, Package, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { StatCard } from "@/components/stat-card";
import { StepBar } from "@/components/kacha-step-page";
import { sdb } from "@/lib/season-db";
import { fetchActiveBrickTypes } from "@/lib/sales-queries";
import { bn, bnDate, isoDate } from "@/lib/format";
import { useCurrentUser } from "@/lib/use-current-user";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/production-steps/unload")({
  head: () => ({
    meta: [
      { title: "বের করার হিসাব (পাকা ইট) — CDB Bricks" },
      { name: "description", content: "ভাটা থেকে পাকা ইট বের করার দৈনিক এন্ট্রি, স্টকে যোগ ও উৎপাদন খরচের হিসাব।" },
      { property: "og:title", content: "বের করার হিসাব (পাকা ইট) — CDB Bricks" },
      { property: "og:description", content: "পাকা ইট বের করার এন্ট্রি ও স্টক আপডেট।" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: UnloadStepPage,
});

type Form = { production_date: string; brick_type_id: string; quantity: string; labor_cost: string; notes: string };
const empty = (): Form => ({ production_date: isoDate(new Date()), brick_type_id: "", quantity: "", labor_cost: "", notes: "" });

function UnloadStepPage() {
  const qc = useQueryClient();
  const { data: me } = useCurrentUser();
  const isAdmin = me?.role === "admin";
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Form>(empty());

  const bricksQ = useQuery({ queryKey: ["brick-types-active"], queryFn: fetchActiveBrickTypes });

  const listQ = useQuery({
    queryKey: ["production-entries", "unload"],
    queryFn: async () => {
      const { data, error } = await sdb
        .from("production_entries")
        .select("id, production_date, brick_type_id, quantity, notes, total_cost, cost_per_brick, labor_cost, brick_type:brick_types(name)")
        .order("production_date", { ascending: false })
        .limit(300);
      if (error) throw error;
      return data ?? [];
    },
  });

  const rows = listQ.data ?? [];
  const totals = useMemo(() => {
    const t = isoDate(new Date());
    let qty = 0, today = 0, cost = 0;
    rows.forEach((r: any) => {
      qty += Number(r.quantity || 0);
      cost += Number(r.total_cost || 0);
      if (r.production_date === t) today += Number(r.quantity || 0);
    });
    return { qty, today, cost };
  }, [rows]);

  const save = useMutation({
    mutationFn: async () => {
      const qty = Number(form.quantity || 0);
      if (!form.brick_type_id) throw new Error("ইটের ধরন বেছে নিন");
      if (!(qty > 0)) throw new Error("পরিমাণ দিন");
      if (!me?.user.id) throw new Error("লগইন প্রয়োজন");
      const { error } = await sdb.from("production_entries").insert({
        production_date: form.production_date,
        brick_type_id: form.brick_type_id,
        quantity: qty,
        labor_cost: form.labor_cost ? Number(form.labor_cost) : 0,
        notes: form.notes || null,
        created_by: me.user.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("সংরক্ষিত — স্টকে যোগ হয়েছে");
      setOpen(false);
      setForm(empty());
      qc.invalidateQueries({ queryKey: ["production-entries"] });
      qc.invalidateQueries({ queryKey: ["current-stock"] });
      qc.invalidateQueries({ queryKey: ["stock-movements"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sdb.from("production_entries").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("মুছে ফেলা হয়েছে");
      qc.invalidateQueries({ queryKey: ["production-entries"] });
      qc.invalidateQueries({ queryKey: ["current-stock"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold md:text-2xl">
            <ArrowUpFromLine className="h-6 w-6 text-primary" /> বের করার হিসাব (পাকা ইট)
          </h1>
          <p className="text-sm text-muted-foreground">ধাপ ৪ — ভাটা থেকে পাকা ইট বের করা, স্টকে স্বয়ংক্রিয়ভাবে যোগ হবে</p>
        </div>
        <Button onClick={() => setOpen(true)}><Plus className="mr-1 h-4 w-4" /> নতুন এন্ট্রি</Button>
      </div>

      <Card><CardContent className="p-4"><StepBar current="unload" /></CardContent></Card>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <StatCard label="মোট পাকা ইট" value={bn(totals.qty)} icon={Package} tone="primary" />
        <StatCard label="আজকের পরিমাণ" value={bn(totals.today)} icon={Package} tone="info" />
        <StatCard label="মোট উৎপাদন খরচ" value={`৳ ${bn(Math.round(totals.cost))}`} icon={Package} tone="warning" />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">এন্ট্রি তালিকা</CardTitle></CardHeader>
        <CardContent className="p-0">
          {listQ.isLoading ? (
            <div className="flex h-24 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : rows.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">কোনো এন্ট্রি নেই</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>তারিখ</TableHead>
                  <TableHead>ইটের ধরন</TableHead>
                  <TableHead className="text-right">পরিমাণ</TableHead>
                  <TableHead className="text-right">মোট খরচ</TableHead>
                  <TableHead className="text-right">প্রতি ইট</TableHead>
                  <TableHead>মন্তব্য</TableHead>
                  <TableHead></TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {rows.map((r: any) => (
                    <TableRow key={r.id}>
                      <TableCell className="whitespace-nowrap">{bnDate(r.production_date)}</TableCell>
                      <TableCell>{r.brick_type?.name ?? "—"}</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">{bn(r.quantity)}</TableCell>
                      <TableCell className="text-right tabular-nums">৳ {bn(Math.round(Number(r.total_cost ?? 0)))}</TableCell>
                      <TableCell className="text-right tabular-nums text-primary">৳ {Number(r.cost_per_brick ?? 0).toFixed(2)}</TableCell>
                      <TableCell className="max-w-[160px] truncate text-xs text-muted-foreground">{r.notes ?? "—"}</TableCell>
                      <TableCell className="text-right">
                        {isAdmin && (
                          <Button size="sm" variant="ghost" onClick={() => { if (confirm("মুছে ফেলবেন?")) del.mutate(r.id); }}>
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>পাকা ইট বের করার এন্ট্রি</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>তারিখ</Label>
              <Input type="date" value={form.production_date} onChange={(e) => setForm({ ...form, production_date: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>ইটের ধরন</Label>
              <Select value={form.brick_type_id} onValueChange={(v) => setForm({ ...form, brick_type_id: v })}>
                <SelectTrigger><SelectValue placeholder="বেছে নিন" /></SelectTrigger>
                <SelectContent>
                  {(bricksQ.data ?? []).map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>পরিমাণ (পিস)</Label>
                <Input type="number" inputMode="numeric" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>বের করার মজুরি</Label>
                <Input type="number" inputMode="decimal" value={form.labor_cost} onChange={(e) => setForm({ ...form, labor_cost: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>মন্তব্য</Label>
              <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>বাতিল</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} সংরক্ষণ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
