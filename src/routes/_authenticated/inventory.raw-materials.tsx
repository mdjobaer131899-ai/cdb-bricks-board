import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Package, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { sdb } from "@/lib/season-db";
import { bn, bnDate, isoDate } from "@/lib/format";
import { useCurrentUser } from "@/lib/use-current-user";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/inventory/raw-materials")({
  head: () => ({ meta: [{ title: "কাঁচামাল — CDB Bricks" }] }),
  component: RawMaterialsPage,
});

function RawMaterialsPage() {
  const qc = useQueryClient();
  const { data: me } = useCurrentUser();
  const isAdmin = me?.role === "admin";
  const [open, setOpen] = useState(false);

  const materialsQ = useQuery({
    queryKey: ["raw-materials"],
    queryFn: async () => {
      const { data, error } = await sdb.from("raw_materials").select("*").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const purchasesQ = useQuery({
    queryKey: ["raw-material-purchases"],
    queryFn: async () => {
      const { data, error } = await sdb
        .from("raw_material_purchases")
        .select("*, material:raw_materials(name, unit)")
        .order("purchase_date", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  const summary = useMemo(() => {
    const map = new Map<string, { name: string; unit: string; qty: number; cost: number }>();
    (purchasesQ.data ?? []).forEach((p: any) => {
      const key = p.material_id;
      const cur = map.get(key) ?? { name: p.material?.name ?? "—", unit: p.material?.unit ?? "", qty: 0, cost: 0 };
      cur.qty += Number(p.quantity || 0);
      cur.cost += Number(p.total_amount || 0);
      map.set(key, cur);
    });
    return Array.from(map.values());
  }, [purchasesQ.data]);

  const [form, setForm] = useState({
    material_id: "",
    supplier_name: "",
    quantity: "",
    unit_price: "",
    purchase_date: isoDate(new Date()),
    payment_method: "cash",
    note: "",
  });

  const createMut = useMutation({
    mutationFn: async () => {
      const qty = Number(form.quantity);
      const price = Number(form.unit_price);
      if (!form.material_id) throw new Error("উপকরণ নির্বাচন করুন");
      if (!(qty > 0)) throw new Error("পরিমাণ লিখুন");
      if (!(price >= 0)) throw new Error("একক মূল্য লিখুন");
      const { error } = await sdb.from("raw_material_purchases").insert({
        material_id: form.material_id,
        supplier_name: form.supplier_name || null,
        quantity: qty,
        unit_price: price,
        total_amount: qty * price,
        purchase_date: form.purchase_date,
        payment_method: form.payment_method,
        note: form.note || null,
        created_by: me?.user.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("কাঁচামাল কেনার এন্ট্রি সংরক্ষিত");
      setOpen(false);
      setForm({ ...form, quantity: "", unit_price: "", note: "", supplier_name: "" });
      qc.invalidateQueries({ queryKey: ["raw-material-purchases"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold md:text-2xl flex items-center gap-2">
            <Package className="h-6 w-6 text-primary" /> কাঁচামাল ব্যবস্থাপনা
          </h1>
          <p className="text-sm text-muted-foreground">মাটি, কয়লা, তুষ ইত্যাদি কাঁচামালের কেনা ও খরচ</p>
        </div>
        {isAdmin && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="mr-1 h-4 w-4" /> নতুন কেনা</Button></DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader><DialogTitle>কাঁচামাল কেনার এন্ট্রি</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>উপকরণ</Label>
                  <Select value={form.material_id} onValueChange={(v) => setForm({ ...form, material_id: v })}>
                    <SelectTrigger><SelectValue placeholder="নির্বাচন করুন" /></SelectTrigger>
                    <SelectContent>
                      {(materialsQ.data ?? []).map((m: any) => (
                        <SelectItem key={m.id} value={m.id}>{m.name} ({m.unit})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>সরবরাহকারী</Label><Input value={form.supplier_name} onChange={(e) => setForm({ ...form, supplier_name: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-2">
                  <div><Label>পরিমাণ</Label><Input type="number" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} /></div>
                  <div><Label>একক মূল্য</Label><Input type="number" value={form.unit_price} onChange={(e) => setForm({ ...form, unit_price: e.target.value })} /></div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div><Label>তারিখ</Label><Input type="date" value={form.purchase_date} onChange={(e) => setForm({ ...form, purchase_date: e.target.value })} /></div>
                  <div>
                    <Label>পেমেন্ট</Label>
                    <Select value={form.payment_method} onValueChange={(v) => setForm({ ...form, payment_method: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cash">নগদ</SelectItem>
                        <SelectItem value="credit">বাকি</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div><Label>নোট</Label><Textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></div>
                <div className="text-sm text-muted-foreground">মোট: ৳ {bn((Number(form.quantity) || 0) * (Number(form.unit_price) || 0))}</div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>বাতিল</Button>
                <Button onClick={() => createMut.mutate()} disabled={createMut.isPending}>
                  {createMut.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />} সংরক্ষণ
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {summary.map((s) => (
          <Card key={s.name}>
            <CardContent className="pt-4">
              <div className="text-xs text-muted-foreground">{s.name}</div>
              <div className="mt-1 text-xl font-bold tabular-nums">{bn(s.qty)} <span className="text-xs font-normal text-muted-foreground">{s.unit}</span></div>
              <div className="mt-1 text-xs text-muted-foreground">খরচ: ৳ {bn(s.cost)}</div>
            </CardContent>
          </Card>
        ))}
        {summary.length === 0 && <div className="col-span-full text-sm text-muted-foreground">এখনো কোনো কেনার রেকর্ড নেই</div>}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">কেনার ইতিহাস</CardTitle></CardHeader>
        <CardContent className="p-0">
          {purchasesQ.isLoading ? (
            <div className="flex h-24 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : (purchasesQ.data ?? []).length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">কোনো রেকর্ড নেই</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>তারিখ</TableHead>
                    <TableHead>উপকরণ</TableHead>
                    <TableHead>সরবরাহকারী</TableHead>
                    <TableHead className="text-right">পরিমাণ</TableHead>
                    <TableHead className="text-right">একক মূল্য</TableHead>
                    <TableHead className="text-right">মোট</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(purchasesQ.data ?? []).map((p: any) => (
                    <TableRow key={p.id}>
                      <TableCell className="text-xs whitespace-nowrap">{bnDate(p.purchase_date)}</TableCell>
                      <TableCell>{p.material?.name}</TableCell>
                      <TableCell className="text-xs">{p.supplier_name || "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{bn(p.quantity)} {p.material?.unit}</TableCell>
                      <TableCell className="text-right tabular-nums">৳ {bn(p.unit_price)}</TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">৳ {bn(p.total_amount)}</TableCell>
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
