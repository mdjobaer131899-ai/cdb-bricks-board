import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Package, Loader2, Pencil, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { sdb } from "@/lib/season-db";
import { useCurrentUser } from "@/lib/use-current-user";
import { fetchActiveBrickTypes } from "@/lib/sales-queries";
import { bn, bnDate, isoDate } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/production")({
  head: () => ({ meta: [{ title: "প্রোডাকশন — CDB Bricks" }] }),
  component: ProductionPage,
});

type EditRow = { id: string; production_date: string; brick_type_id: string; quantity: string; notes: string };

function ProductionPage() {
  const qc = useQueryClient();
  const { data: me } = useCurrentUser();
  const [open, setOpen] = useState(false);
  const [editRow, setEditRow] = useState<EditRow | null>(null);
  const [search, setSearch] = useState("");

  const bricksQ = useQuery({ queryKey: ["brick-types-active"], queryFn: fetchActiveBrickTypes });
  const listQ = useQuery({
    queryKey: ["production-entries"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("production_entries")
        .select("id, production_date, brick_type_id, quantity, notes, created_at, brick_type:brick_types(name)")
        .order("production_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return data ?? [];
    },
  });

  const delMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sdb.from("production_entries").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("মুছে ফেলা হয়েছে");
      qc.invalidateQueries({ queryKey: ["production-entries"] });
      qc.invalidateQueries({ queryKey: ["current-stock"] });
      qc.invalidateQueries({ queryKey: ["stock-movements"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "ব্যর্থ"),
  });

  const updMut = useMutation({
    mutationFn: async (r: EditRow) => {
      const qty = Number(r.quantity);
      if (!(qty > 0)) throw new Error("পরিমাণ লিখুন");
      const { error } = await sdb.from("production_entries").update({
        production_date: r.production_date,
        brick_type_id: r.brick_type_id,
        quantity: qty,
        notes: r.notes || null,
      }).eq("id", r.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("আপডেট হয়েছে");
      setEditRow(null);
      qc.invalidateQueries({ queryKey: ["production-entries"] });
      qc.invalidateQueries({ queryKey: ["current-stock"] });
      qc.invalidateQueries({ queryKey: ["stock-movements"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = listQ.data ?? [];
  const todayTotal = rows
    .filter((r) => r.production_date === isoDate(new Date()))
    .reduce((s, r) => s + Number(r.quantity), 0);

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter((r: any) =>
      (r.brick_type?.name ?? "").toLowerCase().includes(q) ||
      (r.notes ?? "").toLowerCase().includes(q) ||
      (r.production_date ?? "").includes(q)
    );
  }, [rows, search]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold md:text-2xl flex items-center gap-2">
            <Package className="h-6 w-6 text-primary" /> প্রোডাকশন
          </h1>
          <p className="text-sm text-muted-foreground">দৈনিক ইট উৎপাদন এন্ট্রি — স্টকে স্বয়ংক্রিয়ভাবে যোগ হবে</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" /> নতুন প্রোডাকশন</Button>
          </DialogTrigger>
          <NewProductionDialog
            bricks={bricksQ.data ?? []}
            userId={me?.user.id}
            onClose={() => setOpen(false)}
            onSaved={() => {
              qc.invalidateQueries({ queryKey: ["production-entries"] });
              qc.invalidateQueries({ queryKey: ["current-stock"] });
              setOpen(false);
            }}
          />
        </Dialog>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-muted-foreground">আজকের উৎপাদন</CardTitle>
          <CardDescription className="text-2xl font-bold tabular-nums text-primary">{bn(todayTotal)}</CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-base">সাম্প্রতিক উৎপাদন</CardTitle>
          <div className="relative w-full max-w-xs">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8" placeholder="খুঁজুন..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {listQ.isLoading ? (
            <div className="flex h-32 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : filtered.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">কোনো এন্ট্রি নেই</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>তারিখ</TableHead>
                    <TableHead>ইটের ধরন</TableHead>
                    <TableHead className="text-right">পরিমাণ</TableHead>
                    <TableHead>মন্তব্য</TableHead>
                    <TableHead className="text-right">অ্যাকশন</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r: any) => (
                    <TableRow key={r.id}>
                      <TableCell className="text-xs">{bnDate(r.production_date)}</TableCell>
                      <TableCell>{r.brick_type?.name ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">{bn(r.quantity)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r.notes ?? "—"}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => setEditRow({
                            id: r.id, production_date: r.production_date, brick_type_id: r.brick_type_id,
                            quantity: String(r.quantity), notes: r.notes ?? "",
                          })}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => { if (confirm("মুছে ফেলবেন?")) delMut.mutate(r.id); }}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit dialog */}
      <Dialog open={!!editRow} onOpenChange={(o) => !o && setEditRow(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>প্রোডাকশন সম্পাদনা</DialogTitle></DialogHeader>
          {editRow && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>তারিখ</Label>
                <Input type="date" value={editRow.production_date} onChange={(e) => setEditRow({ ...editRow, production_date: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>ইটের ধরন</Label>
                <Select value={editRow.brick_type_id} onValueChange={(v) => setEditRow({ ...editRow, brick_type_id: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(bricksQ.data ?? []).map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>পরিমাণ</Label>
                <Input type="number" value={editRow.quantity} onChange={(e) => setEditRow({ ...editRow, quantity: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>মন্তব্য</Label>
                <Textarea rows={2} value={editRow.notes} onChange={(e) => setEditRow({ ...editRow, notes: e.target.value })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditRow(null)}>বাতিল</Button>
            <Button onClick={() => editRow && updMut.mutate(editRow)} disabled={updMut.isPending}>সংরক্ষণ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function NewProductionDialog({ bricks, userId, onClose, onSaved }: { bricks: Array<{ id: string; name: string }>; userId?: string; onClose: () => void; onSaved: () => void }) {
  const [date, setDate] = useState(isoDate(new Date()));
  const [brickId, setBrickId] = useState("");
  const [qty, setQty] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!brickId || !qty || !userId) { toast.error("সব ঘর পূরণ করুন"); return; }
    setBusy(true);
    const { error } = await sdb.from("production_entries").insert({
      production_date: date,
      brick_type_id: brickId,
      quantity: Number(qty),
      notes: notes || null,
      created_by: userId,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("প্রোডাকশন সংরক্ষিত");
    onSaved();
  }

  return (
    <DialogContent>
      <DialogHeader><DialogTitle>নতুন প্রোডাকশন এন্ট্রি</DialogTitle></DialogHeader>
      <form onSubmit={submit} className="space-y-3">
        <div className="space-y-1.5">
          <Label>তারিখ</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label>ইটের ধরন</Label>
          <Select value={brickId} onValueChange={setBrickId}>
            <SelectTrigger><SelectValue placeholder="বেছে নিন" /></SelectTrigger>
            <SelectContent>
              {bricks.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>পরিমাণ</Label>
          <Input type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label>মন্তব্য (ঐচ্ছিক)</Label>
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>বাতিল</Button>
          <Button type="submit" disabled={busy}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            সংরক্ষণ
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
