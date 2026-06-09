import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Boxes, Loader2, Trash2, Pencil, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { bn, bnDate, isoDate } from "@/lib/format";
import { useCurrentUser } from "@/lib/use-current-user";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/raw-materials")({
  head: () => ({ meta: [{ title: "কাঁচামাল কেনা — CDB Bricks" }] }),
  component: RawMaterialsPage,
});

function RawMaterialsPage() {
  const qc = useQueryClient();
  const { data: me } = useCurrentUser();
  const isAdmin = me?.role === "admin";
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [editRow, setEditRow] = useState<any | null>(null);

  const typesQ = useQuery({
    queryKey: ["raw-materials"],
    queryFn: async () => {
      const { data, error } = await supabase.from("raw_materials").select("*").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const suppliersQ = useQuery({
    queryKey: ["suppliers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("suppliers").select("id, name").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const purchasesQ = useQuery({
    queryKey: ["raw-material-purchases", "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("raw_material_purchases")
        .select("*, material:raw_materials(name, unit), supplier:suppliers(name)")
        .order("purchase_date", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });

  const totals = useMemo(() => {
    const today = isoDate(new Date());
    const ym = today.slice(0, 7);
    let t = 0, m = 0, all = 0;
    (purchasesQ.data ?? []).forEach((p: any) => {
      const amt = Number(p.total_amount || 0);
      all += amt;
      if (p.purchase_date === today) t += amt;
      if ((p.purchase_date || "").slice(0, 7) === ym) m += amt;
    });
    return { t, m, all };
  }, [purchasesQ.data]);

  const [form, setForm] = useState({
    material_id: "",
    supplier_id: "",
    quantity: "",
    unit_price: "",
    purchase_date: isoDate(new Date()),
    note: "",
  });

  const resetForm = () => setForm({
    material_id: "", supplier_id: "", quantity: "", unit_price: "",
    purchase_date: isoDate(new Date()), note: "",
  });

  const createMut = useMutation({
    mutationFn: async () => {
      const qty = Number(form.quantity);
      const price = Number(form.unit_price);
      if (!form.material_id) throw new Error("উপকরণ নির্বাচন করুন");
      if (!(qty > 0)) throw new Error("পরিমাণ লিখুন");
      if (!(price >= 0)) throw new Error("একক মূল্য লিখুন");
      const { error } = await supabase.from("raw_material_purchases").insert({
        material_id: form.material_id,
        supplier_id: form.supplier_id || null,
        quantity: qty,
        unit_price: price,
        total_amount: qty * price,
        purchase_date: form.purchase_date,
        payment_method: "cash",
        note: form.note || null,
        created_by: me?.user.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("কেনার এন্ট্রি সংরক্ষিত");
      setOpen(false);
      resetForm();
      qc.invalidateQueries({ queryKey: ["raw-material-purchases"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("raw_material_purchases").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("মুছে ফেলা হয়েছে");
      qc.invalidateQueries({ queryKey: ["raw-material-purchases"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updMut = useMutation({
    mutationFn: async (r: any) => {
      const qty = Number(r.quantity);
      const price = Number(r.unit_price);
      if (!(qty > 0) || !(price >= 0)) throw new Error("পরিমাণ ও মূল্য চেক করুন");
      const { error } = await supabase.from("raw_material_purchases").update({
        material_id: r.material_id, supplier_id: r.supplier_id || null,
        quantity: qty, unit_price: price, total_amount: qty * price,
        purchase_date: r.purchase_date, note: r.note || null,
      }).eq("id", r.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("আপডেট হয়েছে"); setEditRow(null); qc.invalidateQueries({ queryKey: ["raw-material-purchases"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = useMemo(() => {
    const list = purchasesQ.data ?? [];
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter((p: any) =>
      (p.material?.name ?? "").toLowerCase().includes(q) ||
      (p.supplier?.name ?? "").toLowerCase().includes(q) ||
      (p.note ?? "").toLowerCase().includes(q) ||
      (p.purchase_date ?? "").includes(q)
    );
  }, [purchasesQ.data, search]);

  const total = (Number(form.quantity) || 0) * (Number(form.unit_price) || 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold md:text-2xl flex items-center gap-2">
            <Boxes className="h-6 w-6 text-primary" /> কাঁচামাল কেনা
          </h1>
          <p className="text-sm text-muted-foreground">মাটি, কয়লা, তুষ ইত্যাদি কেনার রেকর্ড</p>
        </div>
        {isAdmin && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="mr-1 h-4 w-4" /> নতুন কেনা</Button></DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader><DialogTitle>কাঁচামাল কেনার এন্ট্রি</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>উপকরণ ধরন</Label>
                  <Select value={form.material_id} onValueChange={(v) => setForm({ ...form, material_id: v })}>
                    <SelectTrigger><SelectValue placeholder="নির্বাচন করুন" /></SelectTrigger>
                    <SelectContent>
                      {(typesQ.data ?? []).map((m: any) => (
                        <SelectItem key={m.id} value={m.id}>{m.name} ({m.unit})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>সরবরাহকারী (ঐচ্ছিক)</Label>
                  <Select value={form.supplier_id || "none"} onValueChange={(v) => setForm({ ...form, supplier_id: v === "none" ? "" : v })}>
                    <SelectTrigger><SelectValue placeholder="নির্বাচন করুন" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— নেই —</SelectItem>
                      {(suppliersQ.data ?? []).map((s: any) => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div><Label>পরিমাণ</Label><Input type="number" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} /></div>
                  <div><Label>একক মূল্য</Label><Input type="number" value={form.unit_price} onChange={(e) => setForm({ ...form, unit_price: e.target.value })} /></div>
                </div>
                <div>
                  <Label>মোট (টাকা)</Label>
                  <Input readOnly value={bn(total)} className="bg-muted" />
                </div>
                <div><Label>তারিখ</Label><Input type="date" value={form.purchase_date} onChange={(e) => setForm({ ...form, purchase_date: e.target.value })} /></div>
                <div><Label>নোট</Label><Textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></div>
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

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">আজকের মোট খরচ</div><div className="mt-1 text-2xl font-bold tabular-nums">৳ {bn(totals.t)}</div></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">এই মাসের মোট খরচ</div><div className="mt-1 text-2xl font-bold tabular-nums">৳ {bn(totals.m)}</div></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">সর্বমোট খরচ</div><div className="mt-1 text-2xl font-bold tabular-nums">৳ {bn(totals.all)}</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-base">কেনার ইতিহাস</CardTitle>
          <div className="relative w-full max-w-xs">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8" placeholder="খুঁজুন..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {purchasesQ.isLoading ? (
            <div className="flex h-24 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : filtered.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">কোনো তথ্য নেই</div>
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
                    <TableHead className="text-right">মোট টাকা</TableHead>
                    {isAdmin && <TableHead></TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((p: any) => (
                    <TableRow key={p.id}>
                      <TableCell className="text-xs whitespace-nowrap">{bnDate(p.purchase_date)}</TableCell>
                      <TableCell>{p.material?.name ?? "—"}</TableCell>
                      <TableCell className="text-xs">{p.supplier?.name ?? p.supplier_name ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{bn(p.quantity)} {p.material?.unit}</TableCell>
                      <TableCell className="text-right tabular-nums">৳ {bn(p.unit_price)}</TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">৳ {bn(p.total_amount)}</TableCell>
                      {isAdmin && (
                        <TableCell>
                          <div className="flex justify-end gap-1">
                            <Button size="icon" variant="ghost" onClick={() => setEditRow({
                              id: p.id, material_id: p.material_id, supplier_id: p.supplier_id ?? "",
                              quantity: String(p.quantity), unit_price: String(p.unit_price),
                              purchase_date: p.purchase_date, note: p.note ?? "",
                            })}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button size="icon" variant="ghost" onClick={() => { if (confirm("মুছে ফেলবেন?")) delMut.mutate(p.id); }}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      )}
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
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>কেনা সম্পাদনা</DialogTitle></DialogHeader>
          {editRow && (
            <div className="space-y-3">
              <div>
                <Label>উপকরণ</Label>
                <Select value={editRow.material_id} onValueChange={(v) => setEditRow({ ...editRow, material_id: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(typesQ.data ?? []).map((m: any) => <SelectItem key={m.id} value={m.id}>{m.name} ({m.unit})</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>সরবরাহকারী</Label>
                <Select value={editRow.supplier_id || "none"} onValueChange={(v) => setEditRow({ ...editRow, supplier_id: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— নেই —</SelectItem>
                    {(suppliersQ.data ?? []).map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label>পরিমাণ</Label><Input type="number" value={editRow.quantity} onChange={(e) => setEditRow({ ...editRow, quantity: e.target.value })} /></div>
                <div><Label>একক মূল্য</Label><Input type="number" value={editRow.unit_price} onChange={(e) => setEditRow({ ...editRow, unit_price: e.target.value })} /></div>
              </div>
              <div><Label>তারিখ</Label><Input type="date" value={editRow.purchase_date} onChange={(e) => setEditRow({ ...editRow, purchase_date: e.target.value })} /></div>
              <div><Label>নোট</Label><Textarea rows={2} value={editRow.note} onChange={(e) => setEditRow({ ...editRow, note: e.target.value })} /></div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditRow(null)}>বাতিল</Button>
            <Button onClick={() => updMut.mutate(editRow)} disabled={updMut.isPending}>সংরক্ষণ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
