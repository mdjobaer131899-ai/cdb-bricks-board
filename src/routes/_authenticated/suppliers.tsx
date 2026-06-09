import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Building2, Loader2, Pencil, Wallet, Trash2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { bn, bnDate, isoDate } from "@/lib/format";
import { useCurrentUser } from "@/lib/use-current-user";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/suppliers")({
  head: () => ({ meta: [{ title: "সরবরাহকারী — CDB Bricks" }] }),
  component: SuppliersPage,
});

const MATERIAL_TYPES = ["মাটি", "কয়লা", "তুষ", "কাঠ", "অন্যান্য"];

type SupplierForm = {
  id?: string;
  name: string;
  phone: string;
  address: string;
  material_type: string;
  note: string;
};

const emptyForm: SupplierForm = { name: "", phone: "", address: "", material_type: "মাটি", note: "" };

function SuppliersPage() {
  const qc = useQueryClient();
  const { data: me } = useCurrentUser();
  const isAdmin = me?.role === "admin";

  const [search, setSearch] = useState("");
  const [dialog, setDialog] = useState<{ open: boolean; mode: "new" | "edit"; form: SupplierForm }>({
    open: false, mode: "new", form: emptyForm,
  });
  const [payDialog, setPayDialog] = useState<{ open: boolean; supplierId: string | null; amount: string; date: string; note: string }>({
    open: false, supplierId: null, amount: "", date: isoDate(new Date()), note: "",
  });

  const suppliersQ = useQuery({
    queryKey: ["suppliers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("suppliers").select("*").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const purchasesQ = useQuery({
    queryKey: ["raw-purchases-by-supplier"],
    queryFn: async () => {
      const { data, error } = await supabase.from("raw_material_purchases").select("supplier_id,total_amount");
      if (error) throw error;
      return data ?? [];
    },
  });

  const paymentsQ = useQuery({
    queryKey: ["supplier-payments"],
    queryFn: async () => {
      const { data, error } = await supabase.from("supplier_payments").select("*").order("payment_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const totals = useMemo(() => {
    const m = new Map<string, { purchased: number; paid: number }>();
    (purchasesQ.data ?? []).forEach((p: any) => {
      if (!p.supplier_id) return;
      const cur = m.get(p.supplier_id) ?? { purchased: 0, paid: 0 };
      cur.purchased += Number(p.total_amount) || 0;
      m.set(p.supplier_id, cur);
    });
    (paymentsQ.data ?? []).forEach((p: any) => {
      const cur = m.get(p.supplier_id) ?? { purchased: 0, paid: 0 };
      cur.paid += Number(p.amount) || 0;
      m.set(p.supplier_id, cur);
    });
    return m;
  }, [purchasesQ.data, paymentsQ.data]);

  const saveSupplier = useMutation({
    mutationFn: async () => {
      const f = dialog.form;
      if (!f.name.trim()) throw new Error("নাম দিন");
      const payload = {
        name: f.name.trim(),
        phone: f.phone || null,
        address: f.address || null,
        material_type: f.material_type || null,
        note: f.note || null,
      };
      if (dialog.mode === "edit" && f.id) {
        const { error } = await supabase.from("suppliers").update(payload).eq("id", f.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("suppliers").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(dialog.mode === "edit" ? "আপডেট হয়েছে" : "সরবরাহকারী যোগ করা হয়েছে");
      setDialog({ open: false, mode: "new", form: emptyForm });
      qc.invalidateQueries({ queryKey: ["suppliers"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addPayment = useMutation({
    mutationFn: async () => {
      const amt = Number(payDialog.amount);
      if (!payDialog.supplierId) throw new Error("সরবরাহকারী নির্বাচন করুন");
      if (!(amt > 0)) throw new Error("পরিমাণ লিখুন");
      const { error } = await supabase.from("supplier_payments").insert({
        supplier_id: payDialog.supplierId,
        amount: amt,
        payment_date: payDialog.date,
        note: payDialog.note || null,
        created_by: me?.user.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("পেমেন্ট সংরক্ষিত");
      setPayDialog({ open: false, supplierId: null, amount: "", date: isoDate(new Date()), note: "" });
      qc.invalidateQueries({ queryKey: ["supplier-payments"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openNew = () => setDialog({ open: true, mode: "new", form: emptyForm });
  const openEdit = (s: any) => setDialog({
    open: true, mode: "edit",
    form: {
      id: s.id, name: s.name, phone: s.phone ?? "", address: s.address ?? "",
      material_type: s.material_type ?? "মাটি", note: s.note ?? "",
    },
  });
  const openPay = (supplierId: string) => setPayDialog({
    open: true, supplierId, amount: "", date: isoDate(new Date()), note: "",
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold md:text-2xl flex items-center gap-2"><Building2 className="h-6 w-6 text-primary" /> সরবরাহকারী ব্যবস্থাপনা</h1>
          <p className="text-sm text-muted-foreground">সরবরাহকারীর তালিকা, কেনা, পেমেন্ট ও বকেয়া</p>
        </div>
        {isAdmin && <Button onClick={openNew}><Plus className="mr-1 h-4 w-4" /> নতুন সরবরাহকারী</Button>}
      </div>

      <Tabs defaultValue="list">
        <TabsList>
          <TabsTrigger value="list">তালিকা ও বকেয়া</TabsTrigger>
          <TabsTrigger value="payments"><Wallet className="mr-1 h-4 w-4" /> পেমেন্ট ইতিহাস</TabsTrigger>
        </TabsList>

        <TabsContent value="list">
          <Card>
            <CardContent className="p-0">
              {suppliersQ.isLoading ? <div className="flex h-24 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div> :
              (suppliersQ.data ?? []).length === 0 ? <div className="py-10 text-center text-sm text-muted-foreground">কোনো সরবরাহকারী নেই</div> :
              <Table>
                <TableHeader><TableRow>
                  <TableHead>নাম</TableHead>
                  <TableHead>উপকরণ</TableHead>
                  <TableHead className="text-right">মোট কেনা</TableHead>
                  <TableHead className="text-right">মোট দেওয়া</TableHead>
                  <TableHead className="text-right">বকেয়া</TableHead>
                  <TableHead></TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {(suppliersQ.data ?? []).map((s: any) => {
                    const t = totals.get(s.id) ?? { purchased: 0, paid: 0 };
                    const due = Math.max(0, t.purchased - t.paid);
                    return (
                      <TableRow key={s.id}>
                        <TableCell>
                          <div className="font-medium">{s.name}</div>
                          <div className="text-xs text-muted-foreground">{s.phone || "—"}{s.address ? ` • ${s.address}` : ""}</div>
                        </TableCell>
                        <TableCell>{s.material_type ? <Badge variant="outline">{s.material_type}</Badge> : "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">৳ {bn(t.purchased)}</TableCell>
                        <TableCell className="text-right tabular-nums">৳ {bn(t.paid)}</TableCell>
                        <TableCell className="text-right tabular-nums font-medium">৳ {bn(due)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            {isAdmin && <Button size="sm" variant="ghost" onClick={() => openEdit(s)}><Pencil className="h-3.5 w-3.5" /></Button>}
                            {isAdmin && <Button size="sm" variant="outline" onClick={() => openPay(s.id)}>পেমেন্ট</Button>}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payments">
          <Card>
            <CardHeader><CardTitle className="text-base">সাম্প্রতিক পেমেন্ট</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader><TableRow><TableHead>তারিখ</TableHead><TableHead>সরবরাহকারী</TableHead><TableHead>নোট</TableHead><TableHead className="text-right">পরিমাণ</TableHead></TableRow></TableHeader>
                <TableBody>
                  {(paymentsQ.data ?? []).slice(0, 100).map((p: any) => {
                    const s = (suppliersQ.data ?? []).find((x: any) => x.id === p.supplier_id);
                    return (
                      <TableRow key={p.id}>
                        <TableCell className="text-xs">{bnDate(p.payment_date)}</TableCell>
                        <TableCell>{s?.name ?? "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{p.note || "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">৳ {bn(p.amount)}</TableCell>
                      </TableRow>
                    );
                  })}
                  {(paymentsQ.data ?? []).length === 0 && <TableRow><TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">কোনো পেমেন্ট নেই</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Supplier add/edit dialog */}
      <Dialog open={dialog.open} onOpenChange={(o) => setDialog((s) => ({ ...s, open: o }))}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{dialog.mode === "edit" ? "সরবরাহকারী সম্পাদনা" : "নতুন সরবরাহকারী"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>নাম</Label><Input value={dialog.form.name} onChange={(e) => setDialog((s) => ({ ...s, form: { ...s.form, name: e.target.value } }))} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>ফোন</Label><Input value={dialog.form.phone} onChange={(e) => setDialog((s) => ({ ...s, form: { ...s.form, phone: e.target.value } }))} /></div>
              <div>
                <Label>উপকরণের ধরন</Label>
                <Select value={dialog.form.material_type} onValueChange={(v) => setDialog((s) => ({ ...s, form: { ...s.form, material_type: v } }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{MATERIAL_TYPES.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>ঠিকানা</Label><Input value={dialog.form.address} onChange={(e) => setDialog((s) => ({ ...s, form: { ...s.form, address: e.target.value } }))} /></div>
            <div><Label>নোট</Label><Textarea rows={2} value={dialog.form.note} onChange={(e) => setDialog((s) => ({ ...s, form: { ...s.form, note: e.target.value } }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog((s) => ({ ...s, open: false }))}>বাতিল</Button>
            <Button onClick={() => saveSupplier.mutate()} disabled={saveSupplier.isPending}>সংরক্ষণ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payment dialog */}
      <Dialog open={payDialog.open} onOpenChange={(o) => setPayDialog((s) => ({ ...s, open: o }))}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>পেমেন্ট — {(suppliersQ.data ?? []).find((s: any) => s.id === payDialog.supplierId)?.name ?? ""}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div><Label>পরিমাণ (৳)</Label><Input type="number" value={payDialog.amount} onChange={(e) => setPayDialog((s) => ({ ...s, amount: e.target.value }))} /></div>
            <div><Label>তারিখ</Label><Input type="date" value={payDialog.date} onChange={(e) => setPayDialog((s) => ({ ...s, date: e.target.value }))} /></div>
            <div><Label>নোট</Label><Input value={payDialog.note} onChange={(e) => setPayDialog((s) => ({ ...s, note: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayDialog((s) => ({ ...s, open: false }))}>বাতিল</Button>
            <Button onClick={() => addPayment.mutate()} disabled={addPayment.isPending}>সংরক্ষণ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
