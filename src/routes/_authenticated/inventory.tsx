import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Boxes, TrendingDown, TrendingUp, Loader2, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/lib/use-current-user";
import { fetchActiveBrickTypes } from "@/lib/sales-queries";
import { bn, bnDate, isoDate } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/inventory")({
  head: () => ({ meta: [{ title: "স্টক — CDB Bricks" }] }),
  component: InventoryPage,
});

function InventoryPage() {
  const qc = useQueryClient();
  const { data: me } = useCurrentUser();
  const isAdmin = me?.role === "admin";
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const stockQ = useQuery({
    queryKey: ["current-stock"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("current_stock")
        .select("brick_type_id, brick_name, quantity")
        .order("brick_name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const movementsQ = useQuery({
    queryKey: ["stock-movements"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_ledger")
        .select("id, ref_date, change, ref_type, note, brick_type:brick_types(name)")
        .order("ref_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  const bricksQ = useQuery({ queryKey: ["brick-types-active"], queryFn: fetchActiveBrickTypes });

  const filteredMovements = useMemo(() => {
    const list = movementsQ.data ?? [];
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter((m: any) =>
      (m.brick_type?.name ?? "").toLowerCase().includes(q) ||
      (m.note ?? "").toLowerCase().includes(q) ||
      (m.ref_date ?? "").includes(q)
    );
  }, [movementsQ.data, search]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold md:text-2xl flex items-center gap-2">
            <Boxes className="h-6 w-6 text-primary" /> স্টক / ইনভেন্টরি
          </h1>
          <p className="text-sm text-muted-foreground">বর্তমান মজুদ — উৎপাদন ও বিক্রির ভিত্তিতে রিয়েল-টাইম</p>
        </div>
        {isAdmin && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="mr-1 h-4 w-4" /> নতুন স্টক এন্ট্রি</Button>
            </DialogTrigger>
            <StockEntryDialog
              bricks={bricksQ.data ?? []}
              userId={me?.user.id}
              onClose={() => setOpen(false)}
              onSaved={() => {
                qc.invalidateQueries({ queryKey: ["current-stock"] });
                qc.invalidateQueries({ queryKey: ["stock-movements"] });
                qc.invalidateQueries({ queryKey: ["production-entries"] });
                setOpen(false);
              }}
            />
          </Dialog>
        )}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">বর্তমান স্টক</CardTitle></CardHeader>
        <CardContent>
          {stockQ.isLoading ? (
            <div className="flex h-24 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {(stockQ.data ?? []).map((s) => (
                <div key={s.brick_type_id} className={`rounded-xl border p-4 ${Number(s.quantity) < 0 ? "border-destructive/40 bg-destructive/5" : Number(s.quantity) < 1000 ? "border-warning/40 bg-warning/5" : "bg-card"}`}>
                  <div className="text-xs text-muted-foreground">{s.brick_name}</div>
                  <div className={`mt-1 text-2xl font-bold tabular-nums ${Number(s.quantity) < 0 ? "text-destructive" : ""}`}>
                    {bn(s.quantity)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-base">স্টক চলাচল</CardTitle>
          <div className="relative w-full max-w-xs">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8" placeholder="খুঁজুন..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {movementsQ.isLoading ? (
            <div className="flex h-24 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : filteredMovements.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">কোনো মুভমেন্ট নেই</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>তারিখ</TableHead>
                    <TableHead>ইটের ধরন</TableHead>
                    <TableHead>ধরন</TableHead>
                    <TableHead>বিবরণ</TableHead>
                    <TableHead className="text-right">পরিবর্তন</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredMovements.map((m: any) => {
                    const isIn = Number(m.change) > 0;
                    return (
                      <TableRow key={m.id}>
                        <TableCell className="text-xs whitespace-nowrap">{bnDate(m.ref_date)}</TableCell>
                        <TableCell>{m.brick_type?.name ?? "—"}</TableCell>
                        <TableCell>
                          <Badge variant={m.ref_type === "production" ? "default" : m.ref_type === "sale" ? "secondary" : "outline"}>
                            {m.ref_type === "production" ? "উৎপাদন" : m.ref_type === "sale" ? "বিক্রি" : m.ref_type === "return" ? "ফেরত" : "সমন্বয়"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{m.note ?? "—"}</TableCell>
                        <TableCell className={`text-right tabular-nums font-semibold ${isIn ? "text-success" : "text-destructive"}`}>
                          <span className="inline-flex items-center gap-1">
                            {isIn ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                            {isIn ? "+" : ""}{bn(m.change)}
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StockEntryDialog({ bricks, userId, onClose, onSaved }: { bricks: Array<{ id: string; name: string }>; userId?: string; onClose: () => void; onSaved: () => void }) {
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
    toast.success("স্টকে যোগ করা হয়েছে");
    onSaved();
  }

  return (
    <DialogContent>
      <DialogHeader><DialogTitle>নতুন স্টক এন্ট্রি</DialogTitle></DialogHeader>
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
