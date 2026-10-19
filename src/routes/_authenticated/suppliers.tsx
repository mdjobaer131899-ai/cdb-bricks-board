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
import { sdb } from "@/lib/season-db";
import { bn, bnDate, isoDate } from "@/lib/format";
import { useCurrentUser } from "@/lib/use-current-user";
import { toast } from "sonner";
import { SettleWithBricksDialog } from "@/components/settle-with-bricks-dialog";
import { CONTRACT_TYPES } from "@/components/contract-folder";
import { ExpenseEntryDialog } from "@/components/expense-entry";

// sellers of these are paid through the raw-material head of the expense form
const RAW_TYPES = new Set(["মাটি", "বালু", "কয়লা", "তুষ", "ডিজেল", "লাকড়ি"]);

export const Route = createFileRoute("/_authenticated/suppliers")({
  head: () => ({ meta: [{ title: "সরবরাহকারী — CDB Bricks" }] }),
  component: SuppliersPage,
});

const OTHER_MATERIAL = "অন্যান্য";
const MATERIAL_TYPES = ["মাটি", "কয়লা", "তুষ", "বালু", "ডিজেল", "ইঞ্জিন মালামাল", OTHER_MATERIAL];

type SupplierForm = {
  id?: string;
  name: string;
  phone: string;
  address: string;
  material_type: string;
  /** typed material when material_type is "অন্যান্য" */
  material_other: string;
  note: string;
};

const emptyForm: SupplierForm = { name: "", phone: "", address: "", material_type: "", material_other: "", note: "" };

function SuppliersPage() {
  const qc = useQueryClient();
  const { data: me } = useCurrentUser();
  const isAdmin = me?.role === "admin";

  const [search, setSearch] = useState("");
  const [brickFor, setBrickFor] = useState<{ id: string; name: string; due: number } | null>(null);
  const [dialog, setDialog] = useState<{ open: boolean; mode: "new" | "edit"; form: SupplierForm }>({
    open: false, mode: "new", form: emptyForm,
  });
  // paying a seller: the one expense form, bill folded
  const [paySupplier, setPaySupplier] = useState<{ id: string; raw: boolean } | null>(null);

  const suppliersQ = useQuery({
    queryKey: ["suppliers"],
    queryFn: async () => {
      const { data, error } = await sdb.from("suppliers").select("*").order("name");
      if (error) throw error;
      // land owners, sweepers and vehicle owners are kept in their own folders on /purchases
      return (data ?? []).filter((x: any) => !CONTRACT_TYPES.has(x.material_type ?? ""));
    },
  });

  const purchasesQ = useQuery({
    queryKey: ["purchases-by-supplier"],
    queryFn: async () => {
      // সব কেনাকাটা (কাঁচামাল সহ) এখন একটাই খাতায়: purchases
      const { data, error } = await sdb.from("purchases").select("supplier_id,total_amount");
      if (error) throw error;
      return data ?? [];
    },
  });

  const paymentsQ = useQuery({
    queryKey: ["supplier-payments"],
    queryFn: async () => {
      const { data, error } = await sdb.from("supplier_payments").select("*").order("payment_date", { ascending: false });
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

  // A brick settlement is undone by deleting its challan (collection and payment go with it)
  const delPayment = useMutation({
    mutationFn: async (p: { id: string; sales_entry_id?: string | null }) => {
      const { error } = p.sales_entry_id
        ? await supabase.from("sales_entries").delete().eq("id", p.sales_entry_id)
        : await supabase.from("supplier_payments").delete().eq("id", p.id);
      if (error) throw error;
    },
    onSuccess: () => toast.success("মুছে ফেলা হয়েছে"),
    onError: (e: Error) => toast.error(e.message),
  });

  const saveSupplier = useMutation({
    mutationFn: async () => {
      const f = dialog.form;
      // Everything except the note is required
      if (!f.name.trim()) throw new Error("নাম লিখুন");
      if (!f.phone.trim()) throw new Error("ফোন নম্বর লিখুন");
      if (!f.material_type) throw new Error("উপকরণ বাছুন");
      const material = f.material_type === OTHER_MATERIAL ? f.material_other.trim() : f.material_type;
      if (!material) throw new Error("উপকরণটা কী, তা লিখুন");
      if (!f.address.trim()) throw new Error("ঠিকানা লিখুন");
      const payload = {
        name: f.name.trim(),
        phone: f.phone.trim(),
        address: f.address.trim(),
        material_type: material,
        note: f.note.trim() || null,
      };
      if (dialog.mode === "edit" && f.id) {
        const { error } = await sdb.from("suppliers").update(payload).eq("id", f.id);
        if (error) throw error;
      } else {
        const { error } = await sdb.from("suppliers").insert(payload);
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

  const delSupplier = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sdb.from("suppliers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("মুছে ফেলা হয়েছে"); qc.invalidateQueries({ queryKey: ["suppliers"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const filteredSuppliers = useMemo(() => {
    const list = suppliersQ.data ?? [];
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter((s: any) =>
      (s.name ?? "").toLowerCase().includes(q) ||
      (s.phone ?? "").toLowerCase().includes(q) ||
      (s.material_type ?? "").toLowerCase().includes(q) ||
      (s.address ?? "").toLowerCase().includes(q)
    );
  }, [suppliersQ.data, search]);

  const openNew = () => setDialog({ open: true, mode: "new", form: emptyForm });
  const openEdit = (s: any) => setDialog({
    open: true, mode: "edit",
    form: {
      id: s.id, name: s.name, phone: s.phone ?? "", address: s.address ?? "",
      material_type: !s.material_type ? "" : MATERIAL_TYPES.includes(s.material_type) ? s.material_type : OTHER_MATERIAL,
      material_other: s.material_type && !MATERIAL_TYPES.includes(s.material_type) ? s.material_type : "",
      note: s.note ?? "",
    },
  });
  const openPay = (supplierId: string) => {
    const s = (suppliersQ.data ?? []).find((x: any) => x.id === supplierId) as any;
    setPaySupplier({ id: supplierId, raw: RAW_TYPES.has((s?.material_type ?? "").normalize("NFC")) });
  };

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
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-base">সরবরাহকারী</CardTitle>
              <div className="relative w-full max-w-xs">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input className="pl-8 h-9" placeholder="খুঁজুন..." value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {suppliersQ.isLoading ? <div className="flex h-24 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div> :
              filteredSuppliers.length === 0 ? <div className="py-10 text-center text-sm text-muted-foreground">কোনো সরবরাহকারী নেই</div> :
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
                  {filteredSuppliers.map((s: any) => {
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
                            {isAdmin && <Button size="sm" variant="outline" onClick={() => openPay(s.id)}>টাকা দিয়ে</Button>}
                            {isAdmin && due > 0.5 && <Button size="sm" variant="outline" onClick={() => setBrickFor({ id: s.id, name: s.name, due })}>ইট দিয়ে</Button>}
                            {isAdmin && <Button size="sm" variant="ghost" onClick={() => { if (confirm(`"${s.name}" মুছে ফেলবেন?`)) delSupplier.mutate(s.id); }}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>}
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
            <CardContent className="p-0">
              {(paymentsQ.data ?? []).length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">কোনো পেমেন্ট নেই</div>
              ) : (
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>তারিখ</TableHead>
                    <TableHead>সরবরাহকারী</TableHead>
                    <TableHead>কীভাবে</TableHead>
                    <TableHead>নোট</TableHead>
                    <TableHead className="text-right">টাকা</TableHead>
                    <TableHead></TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {(paymentsQ.data ?? []).map((p: any) => (
                      <TableRow key={p.id}>
                        <TableCell>{bnDate(p.payment_date)}</TableCell>
                        <TableCell className="font-medium">{(suppliersQ.data ?? []).find((s: any) => s.id === p.supplier_id)?.name ?? "—"}</TableCell>
                        <TableCell>{p.method === "bricks" ? <Badge variant="outline">ইট দিয়ে</Badge> : "নগদ"}</TableCell>
                        <TableCell className="text-muted-foreground">{p.note ?? ""}</TableCell>
                        <TableCell className="text-right tabular-nums">৳ {bn(p.amount)}</TableCell>
                        <TableCell className="text-right">
                          {isAdmin && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                confirm(p.method === "bricks" ? "এই ইট দিয়ে শোধ বাতিল করবেন? সাথে এর চালান আর জমাও মুছে যাবে, ইট স্টকে ফিরবে।" : "এই পেমেন্ট মুছবেন?") &&
                                delPayment.mutate({ id: p.id, sales_entry_id: p.sales_entry_id })
                              }
                            >
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <SettleWithBricksDialog supplier={brickFor} onClose={() => setBrickFor(null)} />

      {/* Supplier add/edit dialog */}
      <Dialog open={dialog.open} onOpenChange={(o) => setDialog((s) => ({ ...s, open: o }))}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{dialog.mode === "edit" ? "সরবরাহকারী সম্পাদনা" : "নতুন সরবরাহকারী"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>নাম *</Label><Input value={dialog.form.name} onChange={(e) => setDialog((s) => ({ ...s, form: { ...s.form, name: e.target.value } }))} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>ফোন *</Label><Input type="tel" inputMode="tel" value={dialog.form.phone} onChange={(e) => setDialog((s) => ({ ...s, form: { ...s.form, phone: e.target.value } }))} /></div>
              <div>
                <Label>উপকরণ *</Label>
                <Select value={dialog.form.material_type} onValueChange={(v) => setDialog((s) => ({ ...s, form: { ...s.form, material_type: v } }))}>
                  <SelectTrigger><SelectValue placeholder="বাছুন" /></SelectTrigger>
                  <SelectContent>{MATERIAL_TYPES.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            {dialog.form.material_type === OTHER_MATERIAL && (
              <div><Label>উপকরণটা কী *</Label><Input placeholder="যেমন: গ্রিজ, টায়ার" value={dialog.form.material_other} onChange={(e) => setDialog((s) => ({ ...s, form: { ...s.form, material_other: e.target.value } }))} /></div>
            )}
            <div><Label>ঠিকানা *</Label><Input value={dialog.form.address} onChange={(e) => setDialog((s) => ({ ...s, form: { ...s.form, address: e.target.value } }))} /></div>
            <p className="text-xs text-muted-foreground">* চিহ্নের ঘরগুলো পূরণ না করলে সেভ হবে না। নোট ইচ্ছা হলে।</p>
            <div><Label>নোট</Label><Textarea rows={2} value={dialog.form.note} onChange={(e) => setDialog((s) => ({ ...s, form: { ...s.form, note: e.target.value } }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog((s) => ({ ...s, open: false }))}>বাতিল</Button>
            <Button onClick={() => saveSupplier.mutate()} disabled={saveSupplier.isPending}>সংরক্ষণ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ExpenseEntryDialog
        open={!!paySupplier}
        onOpenChange={(o) => { if (!o) setPaySupplier(null); }}
        head={paySupplier?.raw ? "raw" : "parts"}
        lockHead
        partyId={paySupplier?.id ?? null}
        focus="pay"
      />
    </div>
  );
}
