import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, ClipboardList, Loader2, Pencil, Trash2, Truck, Search } from "lucide-react";
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

export const Route = createFileRoute("/_authenticated/orders")({
  head: () => ({
    meta: [
      { title: "অর্ডার ও ডেলিভারি — CDB Bricks" },
      { name: "description", content: "গ্রাহকের ইটের অর্ডার, অগ্রিম ও ডেলিভারি ট্র্যাকিং।" },
      { property: "og:title", content: "অর্ডার ও ডেলিভারি — CDB Bricks" },
      { property: "og:description", content: "গ্রাহকের ইটের অর্ডার, অগ্রিম ও ডেলিভারি ট্র্যাকিং।" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: OrdersPage,
});

const STATUS: Record<string, string> = { open: "চালু", partial: "আংশিক", completed: "সম্পন্ন", cancelled: "বাতিল" };
const NONE = "__none__";

type OrderForm = {
  id?: string; order_no: string; customer_id: string; brick_type_id: string;
  quantity: string; rate: string; advance: string; order_date: string; delivery_date: string; status: string; note: string;
};
const emptyOrder = (): OrderForm => ({
  order_no: "", customer_id: "", brick_type_id: NONE, quantity: "", rate: "", advance: "",
  order_date: isoDate(new Date()), delivery_date: "", status: "open", note: "",
});

type DelForm = { id?: string; order_id: string; delivery_date: string; quantity: string; vehicle_id: string; driver_name: string; note: string };
const emptyDel = (): DelForm => ({ order_id: "", delivery_date: isoDate(new Date()), quantity: "", vehicle_id: NONE, driver_name: "", note: "" });

function OrdersPage() {
  const qc = useQueryClient();
  const { data: me } = useCurrentUser();
  const isAdmin = me?.role === "admin";
  const [search, setSearch] = useState("");
  const [oDlg, setODlg] = useState<{ open: boolean; mode: "new" | "edit"; form: OrderForm }>({ open: false, mode: "new", form: emptyOrder() });
  const [dDlg, setDDlg] = useState<{ open: boolean; mode: "new" | "edit"; form: DelForm }>({ open: false, mode: "new", form: emptyDel() });

  const customersQ = useQuery({
    queryKey: ["customers-basic"],
    queryFn: async () => {
      const { data, error } = await sdb.from("customers").select("id,name,phone").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const brickTypesQ = useQuery({
    queryKey: ["brick-types"],
    queryFn: async () => {
      const { data, error } = await sdb.from("brick_types").select("id,name,is_active").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const vehiclesQ = useQuery({
    queryKey: ["vehicles-basic"],
    queryFn: async () => {
      const { data, error } = await sdb.from("vehicles").select("id,vehicle_no,driver_name,active").order("vehicle_no");
      if (error) throw error;
      return data ?? [];
    },
  });

  const ordersQ = useQuery({
    queryKey: ["orders"],
    queryFn: async () => {
      const { data, error } = await sdb.from("orders").select("*").order("order_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const deliveriesQ = useQuery({
    queryKey: ["deliveries"],
    queryFn: async () => {
      const { data, error } = await sdb.from("deliveries").select("*").order("delivery_date", { ascending: false }).limit(300);
      if (error) throw error;
      return data ?? [];
    },
  });

  const delivered = useMemo(() => {
    const m = new Map<string, number>();
    (deliveriesQ.data ?? []).forEach((d: any) => {
      if (!d.order_id) return;
      m.set(d.order_id, (m.get(d.order_id) ?? 0) + Number(d.quantity || 0));
    });
    return m;
  }, [deliveriesQ.data]);

  const cName = (id: string | null) => (id ? (customersQ.data ?? []).find((c: any) => c.id === id)?.name ?? "—" : "—");
  const bName = (id: string | null) => (id ? (brickTypesQ.data ?? []).find((b: any) => b.id === id)?.name ?? "—" : "—");
  const vName = (id: string | null) => (id ? (vehiclesQ.data ?? []).find((v: any) => v.id === id)?.vehicle_no ?? "—" : "—");
  const oNo = (id: string | null) => (id ? (ordersQ.data ?? []).find((o: any) => o.id === id)?.order_no ?? "—" : "—");

  const filteredOrders = useMemo(() => {
    const list = ordersQ.data ?? [];
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter((o: any) => (o.order_no ?? "").toLowerCase().includes(q) || cName(o.customer_id).toLowerCase().includes(q));
  }, [ordersQ.data, search, customersQ.data]);

  const saveOrder = useMutation({
    mutationFn: async () => {
      const f = oDlg.form;
      if (!f.customer_id) throw new Error("গ্রাহক নির্বাচন করুন");
      const qty = Number(f.quantity || 0);
      if (!(qty > 0)) throw new Error("পরিমাণ দিন");
      const payload = {
        order_no: f.order_no.trim() || `ORD-${Date.now().toString().slice(-8)}`,
        customer_id: f.customer_id,
        brick_type_id: f.brick_type_id === NONE ? null : f.brick_type_id,
        quantity: qty,
        rate: Number(f.rate || 0),
        advance: Number(f.advance || 0),
        order_date: f.order_date,
        delivery_date: f.delivery_date || null,
        status: f.status,
        note: f.note || null,
      };
      if (oDlg.mode === "edit" && f.id) {
        const { error } = await sdb.from("orders").update(payload).eq("id", f.id);
        if (error) throw error;
      } else {
        if (!me?.user.id) throw new Error("লগইন প্রয়োজন");
        const { error } = await sdb.from("orders").insert({ ...payload, created_by: me.user.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("সংরক্ষিত");
      setODlg({ open: false, mode: "new", form: emptyOrder() });
      qc.invalidateQueries({ queryKey: ["orders"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delOrder = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sdb.from("orders").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("মুছে ফেলা হয়েছে"); qc.invalidateQueries({ queryKey: ["orders"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveDelivery = useMutation({
    mutationFn: async () => {
      const f = dDlg.form;
      if (!f.order_id) throw new Error("অর্ডার নির্বাচন করুন");
      const qty = Number(f.quantity || 0);
      if (!(qty > 0)) throw new Error("পরিমাণ দিন");
      const order = (ordersQ.data ?? []).find((o: any) => o.id === f.order_id);
      const payload = {
        order_id: f.order_id,
        customer_id: order?.customer_id ?? null,
        delivery_date: f.delivery_date,
        quantity: qty,
        vehicle_id: f.vehicle_id === NONE ? null : f.vehicle_id,
        driver_name: f.driver_name || null,
        note: f.note || null,
      };
      if (dDlg.mode === "edit" && f.id) {
        const { error } = await sdb.from("deliveries").update(payload).eq("id", f.id);
        if (error) throw error;
      } else {
        if (!me?.user.id) throw new Error("লগইন প্রয়োজন");
        const { error } = await sdb.from("deliveries").insert({ ...payload, created_by: me.user.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("ডেলিভারি সংরক্ষিত");
      setDDlg({ open: false, mode: "new", form: emptyDel() });
      qc.invalidateQueries({ queryKey: ["deliveries"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delDelivery = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sdb.from("deliveries").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("মুছে ফেলা হয়েছে"); qc.invalidateQueries({ queryKey: ["deliveries"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const of_ = oDlg.form;
  const df = dDlg.form;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold md:text-2xl"><ClipboardList className="h-6 w-6 text-primary" /> অর্ডার ও ডেলিভারি</h1>
          <p className="text-sm text-muted-foreground">গ্রাহকের অর্ডার, অগ্রিম ও ডেলিভারির হিসাব</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setDDlg({ open: true, mode: "new", form: emptyDel() })}><Truck className="mr-1 h-4 w-4" /> ডেলিভারি</Button>
          <Button onClick={() => setODlg({ open: true, mode: "new", form: emptyOrder() })}><Plus className="mr-1 h-4 w-4" /> নতুন অর্ডার</Button>
        </div>
      </div>

      <Tabs defaultValue="orders">
        <TabsList>
          <TabsTrigger value="orders">অর্ডার</TabsTrigger>
          <TabsTrigger value="deliveries">ডেলিভারি</TabsTrigger>
        </TabsList>

        <TabsContent value="orders">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-base">অর্ডার তালিকা</CardTitle>
              <div className="relative w-full max-w-xs">
                <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input className="h-9 pl-8" placeholder="খুঁজুন..." value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {ordersQ.isLoading ? (
                <div className="flex h-24 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>
              ) : filteredOrders.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">কোনো অর্ডার নেই</div>
              ) : (
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>অর্ডার</TableHead>
                    <TableHead>গ্রাহক</TableHead>
                    <TableHead>ইট</TableHead>
                    <TableHead className="text-right">পরিমাণ</TableHead>
                    <TableHead className="text-right">ডেলিভারি</TableHead>
                    <TableHead className="text-right">বাকি</TableHead>
                    <TableHead>অবস্থা</TableHead>
                    <TableHead></TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {filteredOrders.map((o: any) => {
                      const d = delivered.get(o.id) ?? 0;
                      const rem = Math.max(0, Number(o.quantity || 0) - d);
                      return (
                        <TableRow key={o.id}>
                          <TableCell>
                            <div className="font-medium">{o.order_no}</div>
                            <div className="text-xs text-muted-foreground">{bnDate(o.order_date)}</div>
                          </TableCell>
                          <TableCell>{cName(o.customer_id)}</TableCell>
                          <TableCell>{bName(o.brick_type_id)}</TableCell>
                          <TableCell className="text-right tabular-nums">{bn(o.quantity)}</TableCell>
                          <TableCell className="text-right tabular-nums">{bn(d)}</TableCell>
                          <TableCell className="text-right font-medium tabular-nums">{bn(rem)}</TableCell>
                          <TableCell><Badge variant={o.status === "completed" ? "default" : "outline"}>{STATUS[o.status] ?? o.status}</Badge></TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button size="sm" variant="outline" onClick={() => setDDlg({ open: true, mode: "new", form: { ...emptyDel(), order_id: o.id } })}>ডেলিভারি</Button>
                              {isAdmin && (
                                <Button size="sm" variant="ghost" onClick={() => setODlg({
                                  open: true, mode: "edit",
                                  form: {
                                    id: o.id, order_no: o.order_no, customer_id: o.customer_id,
                                    brick_type_id: o.brick_type_id ?? NONE, quantity: String(o.quantity),
                                    rate: String(o.rate), advance: String(o.advance), order_date: o.order_date,
                                    delivery_date: o.delivery_date ?? "", status: o.status, note: o.note ?? "",
                                  },
                                })}><Pencil className="h-3.5 w-3.5" /></Button>
                              )}
                              {isAdmin && (
                                <Button size="sm" variant="ghost" onClick={() => { if (confirm(`${o.order_no} মুছে ফেলবেন?`)) delOrder.mutate(o.id); }}>
                                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="deliveries">
          <Card>
            <CardHeader><CardTitle className="text-base">ডেলিভারি তালিকা</CardTitle></CardHeader>
            <CardContent className="p-0">
              {(deliveriesQ.data ?? []).length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">কোনো ডেলিভারি নেই</div>
              ) : (
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>তারিখ</TableHead>
                    <TableHead>অর্ডার</TableHead>
                    <TableHead>গ্রাহক</TableHead>
                    <TableHead>গাড়ি</TableHead>
                    <TableHead>ড্রাইভার</TableHead>
                    <TableHead className="text-right">পরিমাণ</TableHead>
                    <TableHead></TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {(deliveriesQ.data ?? []).map((d: any) => (
                      <TableRow key={d.id}>
                        <TableCell className="whitespace-nowrap">{bnDate(d.delivery_date)}</TableCell>
                        <TableCell>{oNo(d.order_id)}</TableCell>
                        <TableCell>{cName(d.customer_id)}</TableCell>
                        <TableCell>{vName(d.vehicle_id)}</TableCell>
                        <TableCell>{d.driver_name || "—"}</TableCell>
                        <TableCell className="text-right font-medium tabular-nums">{bn(d.quantity)}</TableCell>
                        <TableCell className="text-right">
                          {isAdmin && (
                            <div className="flex justify-end gap-1">
                              <Button size="sm" variant="ghost" onClick={() => setDDlg({
                                open: true, mode: "edit",
                                form: {
                                  id: d.id, order_id: d.order_id ?? "", delivery_date: d.delivery_date,
                                  quantity: String(d.quantity), vehicle_id: d.vehicle_id ?? NONE,
                                  driver_name: d.driver_name ?? "", note: d.note ?? "",
                                },
                              })}><Pencil className="h-3.5 w-3.5" /></Button>
                              <Button size="sm" variant="ghost" onClick={() => { if (confirm("মুছে ফেলবেন?")) delDelivery.mutate(d.id); }}>
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
        </TabsContent>
      </Tabs>

      {/* Order dialog */}
      <Dialog open={oDlg.open} onOpenChange={(o) => setODlg((s) => ({ ...s, open: o }))}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{oDlg.mode === "edit" ? "অর্ডার সম্পাদনা" : "নতুন অর্ডার"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>গ্রাহক</Label>
              <Select value={of_.customer_id} onValueChange={(v) => setODlg((s) => ({ ...s, form: { ...s.form, customer_id: v } }))}>
                <SelectTrigger><SelectValue placeholder="গ্রাহক নির্বাচন করুন" /></SelectTrigger>
                <SelectContent>{(customersQ.data ?? []).map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>ইটের ধরন</Label>
                <Select value={of_.brick_type_id} onValueChange={(v) => setODlg((s) => ({ ...s, form: { ...s.form, brick_type_id: v } }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>নির্বাচন করা হয়নি</SelectItem>
                    {(brickTypesQ.data ?? []).filter((b: any) => b.is_active).map((b: any) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>অবস্থা</Label>
                <Select value={of_.status} onValueChange={(v) => setODlg((s) => ({ ...s, form: { ...s.form, status: v } }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(STATUS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div><Label>পরিমাণ</Label><Input type="number" value={of_.quantity} onChange={(e) => setODlg((s) => ({ ...s, form: { ...s.form, quantity: e.target.value } }))} /></div>
              <div><Label>রেট</Label><Input type="number" value={of_.rate} onChange={(e) => setODlg((s) => ({ ...s, form: { ...s.form, rate: e.target.value } }))} /></div>
              <div><Label>অগ্রিম</Label><Input type="number" value={of_.advance} onChange={(e) => setODlg((s) => ({ ...s, form: { ...s.form, advance: e.target.value } }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>অর্ডারের তারিখ</Label><Input type="date" value={of_.order_date} onChange={(e) => setODlg((s) => ({ ...s, form: { ...s.form, order_date: e.target.value } }))} /></div>
              <div><Label>ডেলিভারির তারিখ</Label><Input type="date" value={of_.delivery_date} onChange={(e) => setODlg((s) => ({ ...s, form: { ...s.form, delivery_date: e.target.value } }))} /></div>
            </div>
            <div><Label>নোট</Label><Textarea rows={2} value={of_.note} onChange={(e) => setODlg((s) => ({ ...s, form: { ...s.form, note: e.target.value } }))} /></div>
            <p className="text-xs text-muted-foreground">মোট মূল্য: ৳ {bn(Number(of_.quantity || 0) * Number(of_.rate || 0))}</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setODlg((s) => ({ ...s, open: false }))}>বাতিল</Button>
            <Button onClick={() => saveOrder.mutate()} disabled={saveOrder.isPending}>সংরক্ষণ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delivery dialog */}
      <Dialog open={dDlg.open} onOpenChange={(o) => setDDlg((s) => ({ ...s, open: o }))}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{dDlg.mode === "edit" ? "ডেলিভারি সম্পাদনা" : "নতুন ডেলিভারি"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>অর্ডার</Label>
              <Select value={df.order_id} onValueChange={(v) => setDDlg((s) => ({ ...s, form: { ...s.form, order_id: v } }))}>
                <SelectTrigger><SelectValue placeholder="অর্ডার নির্বাচন করুন" /></SelectTrigger>
                <SelectContent>
                  {(ordersQ.data ?? []).map((o: any) => <SelectItem key={o.id} value={o.id}>{o.order_no} — {cName(o.customer_id)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>তারিখ</Label><Input type="date" value={df.delivery_date} onChange={(e) => setDDlg((s) => ({ ...s, form: { ...s.form, delivery_date: e.target.value } }))} /></div>
              <div><Label>পরিমাণ</Label><Input type="number" value={df.quantity} onChange={(e) => setDDlg((s) => ({ ...s, form: { ...s.form, quantity: e.target.value } }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>গাড়ি</Label>
                <Select value={df.vehicle_id} onValueChange={(v) => {
                  const veh = (vehiclesQ.data ?? []).find((x: any) => x.id === v);
                  setDDlg((s) => ({ ...s, form: { ...s.form, vehicle_id: v, driver_name: veh?.driver_name ?? s.form.driver_name } }));
                }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>নির্বাচন করা হয়নি</SelectItem>
                    {(vehiclesQ.data ?? []).filter((v: any) => v.active).map((v: any) => <SelectItem key={v.id} value={v.id}>{v.vehicle_no}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>ড্রাইভার</Label><Input value={df.driver_name} onChange={(e) => setDDlg((s) => ({ ...s, form: { ...s.form, driver_name: e.target.value } }))} /></div>
            </div>
            <div><Label>নোট</Label><Textarea rows={2} value={df.note} onChange={(e) => setDDlg((s) => ({ ...s, form: { ...s.form, note: e.target.value } }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDDlg((s) => ({ ...s, open: false }))}>বাতিল</Button>
            <Button onClick={() => saveDelivery.mutate()} disabled={saveDelivery.isPending}>সংরক্ষণ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
