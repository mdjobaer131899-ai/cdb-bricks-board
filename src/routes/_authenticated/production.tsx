import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Package, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/lib/use-current-user";
import { fetchActiveBrickTypes } from "@/lib/sales-queries";
import { bn, bnDate, isoDate } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/production")({
  head: () => ({ meta: [{ title: "প্রোডাকশন — CDB Bricks" }] }),
  component: ProductionPage,
});

function ProductionPage() {
  const qc = useQueryClient();
  const { data: me } = useCurrentUser();
  const [open, setOpen] = useState(false);

  const bricksQ = useQuery({ queryKey: ["brick-types-active"], queryFn: fetchActiveBrickTypes });
  const listQ = useQuery({
    queryKey: ["production-entries"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("production_entries")
        .select("id, production_date, quantity, notes, created_at, brick_type:brick_types(name)")
        .order("production_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  const delMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("production_entries").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("মুছে ফেলা হয়েছে");
      qc.invalidateQueries({ queryKey: ["production-entries"] });
      qc.invalidateQueries({ queryKey: ["current-stock"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "ব্যর্থ"),
  });

  const rows = listQ.data ?? [];
  const todayTotal = rows
    .filter((r) => r.production_date === isoDate(new Date()))
    .reduce((s, r) => s + Number(r.quantity), 0);

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
        <CardHeader><CardTitle className="text-base">সাম্প্রতিক উৎপাদন</CardTitle></CardHeader>
        <CardContent className="p-0">
          {listQ.isLoading ? (
            <div className="flex h-32 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : rows.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">এখনো কোনো এন্ট্রি নেই</div>
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
                  {rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="text-xs">{bnDate(r.production_date)}</TableCell>
                      <TableCell>{r.brick_type?.name ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">{bn(r.quantity)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r.notes ?? "—"}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => delMut.mutate(r.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
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
    const { error } = await supabase.from("production_entries").insert({
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
