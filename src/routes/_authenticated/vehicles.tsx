import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Truck, Loader2, Pencil, Trash2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { bn, bnDate, isoDate } from "@/lib/format";
import { useCurrentUser } from "@/lib/use-current-user";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/vehicles")({
  head: () => ({ meta: [{ title: "গাড়ি ব্যবস্থাপনা — CDB Bricks" }] }),
  component: VehiclesPage,
});

function VehiclesPage() {
  const qc = useQueryClient();
  const { data: me } = useCurrentUser();
  const isAdmin = me?.role === "admin";
  const [openNew, setOpenNew] = useState(false);
  const [expOpen, setExpOpen] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [editVeh, setEditVeh] = useState<any | null>(null);

  const vehiclesQ = useQuery({
    queryKey: ["vehicles"],
    queryFn: async () => (await supabase.from("vehicles").select("*").order("vehicle_no")).data ?? [],
  });
  const expensesQ = useQuery({
    queryKey: ["vehicle-expenses"],
    queryFn: async () => (await supabase.from("vehicle_expenses").select("*").order("expense_date", { ascending: false })).data ?? [],
  });
  const tripsQ = useQuery({
    queryKey: ["vehicle-trips"],
    queryFn: async () => {
      const { data } = await supabase.from("sales_entries").select("vehicle_number").eq("status", "approved").not("vehicle_number", "is", null);
      const map = new Map<string, number>();
      (data ?? []).forEach((s: any) => { if (s.vehicle_number) map.set(s.vehicle_number, (map.get(s.vehicle_number) ?? 0) + 1); });
      return map;
    },
  });

  const monthlyCost = useMemo(() => {
    const now = new Date();
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const map = new Map<string, number>();
    (expensesQ.data ?? []).forEach((e: any) => {
      if (e.expense_date?.startsWith(ym)) map.set(e.vehicle_id, (map.get(e.vehicle_id) ?? 0) + Number(e.amount));
    });
    return map;
  }, [expensesQ.data]);

  const [form, setForm] = useState({ vehicle_no: "", type: "ট্রাক", driver_name: "", driver_phone: "", capacity: "" });
  const createVeh = useMutation({
    mutationFn: async () => {
      if (!form.vehicle_no) throw new Error("গাড়ি নম্বর দিন");
      const { error } = await supabase.from("vehicles").insert({
        vehicle_no: form.vehicle_no, type: form.type, driver_name: form.driver_name || null,
        driver_phone: form.driver_phone || null, capacity: form.capacity ? Number(form.capacity) : null,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("গাড়ি যোগ"); setOpenNew(false); setForm({ vehicle_no: "", type: "ট্রাক", driver_name: "", driver_phone: "", capacity: "" }); qc.invalidateQueries({ queryKey: ["vehicles"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const [expForm, setExpForm] = useState({ category: "জ্বালানি", amount: "", expense_date: isoDate(new Date()), note: "" });
  const addExpense = useMutation({
    mutationFn: async (vehicleId: string) => {
      if (!(Number(expForm.amount) > 0)) throw new Error("পরিমাণ লিখুন");
      const { error } = await supabase.from("vehicle_expenses").insert({
        vehicle_id: vehicleId, category: expForm.category, amount: Number(expForm.amount),
        expense_date: expForm.expense_date, note: expForm.note || null, created_by: me?.user.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("খরচ সংরক্ষিত"); setExpOpen(null); setExpForm({ category: "জ্বালানি", amount: "", expense_date: isoDate(new Date()), note: "" }); qc.invalidateQueries({ queryKey: ["vehicle-expenses"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const updVeh = useMutation({
    mutationFn: async (v: any) => {
      if (!v.vehicle_no) throw new Error("গাড়ি নম্বর দিন");
      const { error } = await supabase.from("vehicles").update({
        vehicle_no: v.vehicle_no, type: v.type, driver_name: v.driver_name || null,
        driver_phone: v.driver_phone || null, capacity: v.capacity ? Number(v.capacity) : null,
      }).eq("id", v.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("আপডেট হয়েছে"); setEditVeh(null); qc.invalidateQueries({ queryKey: ["vehicles"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const delVeh = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("vehicles").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("মুছে ফেলা হয়েছে"); qc.invalidateQueries({ queryKey: ["vehicles"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const filteredVehicles = useMemo(() => {
    const list = vehiclesQ.data ?? [];
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter((v: any) =>
      (v.vehicle_no ?? "").toLowerCase().includes(q) ||
      (v.driver_name ?? "").toLowerCase().includes(q) ||
      (v.type ?? "").toLowerCase().includes(q)
    );
  }, [vehiclesQ.data, search]);

    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold md:text-2xl flex items-center gap-2"><Truck className="h-6 w-6 text-primary" /> গাড়ি ব্যবস্থাপনা</h1>
          <p className="text-sm text-muted-foreground">গাড়ির খরচ ও ট্রিপের হিসাব</p>
        </div>
        {isAdmin && (
          <Dialog open={openNew} onOpenChange={setOpenNew}>
            <DialogTrigger asChild><Button><Plus className="mr-1 h-4 w-4" /> নতুন গাড়ি</Button></DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader><DialogTitle>নতুন গাড়ি</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>গাড়ি নম্বর</Label><Input value={form.vehicle_no} onChange={(e) => setForm({ ...form, vehicle_no: e.target.value })} /></div>
                <div>
                  <Label>ধরন</Label>
                  <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ট্রাক">ট্রাক</SelectItem>
                      <SelectItem value="পিকআপ">পিকআপ</SelectItem>
                      <SelectItem value="ট্রলি">ট্রলি</SelectItem>
                      <SelectItem value="অন্যান্য">অন্যান্য</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>ড্রাইভার</Label><Input value={form.driver_name} onChange={(e) => setForm({ ...form, driver_name: e.target.value })} /></div>
                <div><Label>ড্রাইভার ফোন</Label><Input value={form.driver_phone} onChange={(e) => setForm({ ...form, driver_phone: e.target.value })} /></div>
                <div><Label>ধারণক্ষমতা</Label><Input type="number" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} /></div>
              </div>
              <DialogFooter><Button onClick={() => createVeh.mutate()} disabled={createVeh.isPending}>সংরক্ষণ</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Card><CardContent className="p-0">
        {vehiclesQ.isLoading ? <div className="flex h-24 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div> :
        (vehiclesQ.data ?? []).length === 0 ? <div className="py-10 text-center text-sm text-muted-foreground">কোনো গাড়ি নেই</div> :
        <Table>
          <TableHeader><TableRow><TableHead>নম্বর</TableHead><TableHead>ধরন</TableHead><TableHead>ড্রাইভার</TableHead><TableHead className="text-right">এ মাসের ট্রিপ</TableHead><TableHead className="text-right">এ মাসের খরচ</TableHead><TableHead></TableHead></TableRow></TableHeader>
          <TableBody>
            {(vehiclesQ.data ?? []).map((v: any) => (
              <TableRow key={v.id}>
                <TableCell className="font-mono font-medium">{v.vehicle_no}</TableCell>
                <TableCell><Badge variant="outline">{v.type}</Badge></TableCell>
                <TableCell className="text-xs">{v.driver_name || "—"}{v.driver_phone ? ` · ${v.driver_phone}` : ""}</TableCell>
                <TableCell className="text-right tabular-nums">{bn(tripsQ.data?.get(v.vehicle_no) ?? 0)}</TableCell>
                <TableCell className="text-right tabular-nums">৳ {bn(monthlyCost.get(v.id) ?? 0)}</TableCell>
                <TableCell>
                  <Dialog open={expOpen === v.id} onOpenChange={(o) => setExpOpen(o ? v.id : null)}>
                    <DialogTrigger asChild><Button size="sm" variant="outline">খরচ যোগ</Button></DialogTrigger>
                    <DialogContent className="max-w-sm">
                      <DialogHeader><DialogTitle>{v.vehicle_no} — খরচ</DialogTitle></DialogHeader>
                      <div className="space-y-3">
                        <div>
                          <Label>ক্যাটাগরি</Label>
                          <Select value={expForm.category} onValueChange={(c) => setExpForm({ ...expForm, category: c })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="জ্বালানি">জ্বালানি</SelectItem>
                              <SelectItem value="মেরামত">মেরামত</SelectItem>
                              <SelectItem value="টোল">টোল</SelectItem>
                              <SelectItem value="অন্যান্য">অন্যান্য</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div><Label>পরিমাণ (৳)</Label><Input type="number" value={expForm.amount} onChange={(e) => setExpForm({ ...expForm, amount: e.target.value })} /></div>
                        <div><Label>তারিখ</Label><Input type="date" value={expForm.expense_date} onChange={(e) => setExpForm({ ...expForm, expense_date: e.target.value })} /></div>
                        <div><Label>নোট</Label><Input value={expForm.note} onChange={(e) => setExpForm({ ...expForm, note: e.target.value })} /></div>
                      </div>
                      <DialogFooter><Button onClick={() => addExpense.mutate(v.id)} disabled={addExpense.isPending}>সংরক্ষণ</Button></DialogFooter>
                    </DialogContent>
                  </Dialog>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>}
      </CardContent></Card>

      <Card>
        <CardHeader><CardTitle className="text-base">সাম্প্রতিক খরচ</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow><TableHead>তারিখ</TableHead><TableHead>গাড়ি</TableHead><TableHead>ক্যাটাগরি</TableHead><TableHead className="text-right">পরিমাণ</TableHead></TableRow></TableHeader>
            <TableBody>
              {(expensesQ.data ?? []).slice(0, 50).map((e: any) => {
                const v = (vehiclesQ.data ?? []).find((x: any) => x.id === e.vehicle_id);
                return (
                  <TableRow key={e.id}>
                    <TableCell className="text-xs">{bnDate(e.expense_date)}</TableCell>
                    <TableCell className="font-mono">{v?.vehicle_no ?? "—"}</TableCell>
                    <TableCell><Badge variant="outline">{e.category}</Badge></TableCell>
                    <TableCell className="text-right tabular-nums">৳ {bn(e.amount)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
