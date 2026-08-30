import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Users2, Loader2, Wallet, Pencil, Trash2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { sdb } from "@/lib/season-db";
import { bn, bnDate, isoDate } from "@/lib/format";
import { useCurrentUser } from "@/lib/use-current-user";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/workers")({
  head: () => ({ meta: [{ title: "শ্রমিক ও বেতন — CDB Bricks" }] }),
  component: WorkersPage,
});

const ROLES = ["মাটি কাটা", "ইট তৈরি", "পোড়ানো", "লোডিং", "অন্যান্য"];
const PAYMENT_TYPES = [
  { value: "salary", label: "বেতন" },
  { value: "advance", label: "অগ্রিম" },
  { value: "bonus", label: "বোনাস" },
];
const ptLabel = (v: string) => PAYMENT_TYPES.find((p) => p.value === v)?.label ?? v;

type WorkerForm = {
  id?: string;
  name: string;
  phone: string;
  role: string;
  daily_wage: string;
  monthly_salary: string;
  join_date: string;
  active: boolean;
};

const emptyForm: WorkerForm = {
  name: "", phone: "", role: "ইট তৈরি", daily_wage: "", monthly_salary: "",
  join_date: isoDate(new Date()), active: true,
};

function WorkersPage() {
  const qc = useQueryClient();
  const { data: me } = useCurrentUser();
  const isAdmin = me?.role === "admin";

  const [filter, setFilter] = useState<"all" | "active" | "inactive">("active");
  const [search, setSearch] = useState("");
  const [workerDialog, setWorkerDialog] = useState<{ open: boolean; mode: "new" | "edit"; form: WorkerForm }>({
    open: false, mode: "new", form: emptyForm,
  });
  const [payDialog, setPayDialog] = useState<{ open: boolean; workerId: string | null; amount: string; type: string; note: string; date: string }>({
    open: false, workerId: null, amount: "", type: "salary", note: "", date: isoDate(new Date()),
  });

  const workersQ = useQuery({
    queryKey: ["workers"],
    queryFn: async () => {
      const { data, error } = await sdb.from("workers").select("*").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const payQ = useQuery({
    queryKey: ["worker-payments"],
    queryFn: async () => {
      const { data, error } = await sdb.from("worker_payments").select("*").order("payment_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const totals = useMemo(() => {
    const m = new Map<string, { salary: number; advance: number; bonus: number }>();
    (payQ.data ?? []).forEach((p: any) => {
      const cur = m.get(p.worker_id) ?? { salary: 0, advance: 0, bonus: 0 };
      const amt = Number(p.amount) || 0;
      if (p.payment_type === "advance") cur.advance += amt;
      else if (p.payment_type === "bonus") cur.bonus += amt;
      else cur.salary += amt;
      m.set(p.worker_id, cur);
    });
    return m;
  }, [payQ.data]);

  const filteredWorkers = useMemo(() => {
    let list = workersQ.data ?? [];
    if (filter === "active") list = list.filter((w: any) => w.active);
    else if (filter === "inactive") list = list.filter((w: any) => !w.active);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((w: any) =>
        (w.name ?? "").toLowerCase().includes(q) ||
        (w.phone ?? "").toLowerCase().includes(q) ||
        (w.role ?? "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [workersQ.data, filter, search]);

  const delWorker = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sdb.from("workers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("মুছে ফেলা হয়েছে"); qc.invalidateQueries({ queryKey: ["workers"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveWorker = useMutation({
    mutationFn: async () => {
      const f = workerDialog.form;
      if (!f.name.trim()) throw new Error("নাম দিন");
      const payload = {
        name: f.name.trim(),
        phone: f.phone || null,
        role: f.role,
        daily_wage: Number(f.daily_wage) || 0,
        monthly_salary: Number(f.monthly_salary) || 0,
        join_date: f.join_date || null,
        active: f.active,
      };
      if (workerDialog.mode === "edit" && f.id) {
        const { error } = await sdb.from("workers").update(payload).eq("id", f.id);
        if (error) throw error;
      } else {
        const { error } = await sdb.from("workers").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(workerDialog.mode === "edit" ? "আপডেট হয়েছে" : "শ্রমিক যোগ করা হয়েছে");
      setWorkerDialog({ open: false, mode: "new", form: emptyForm });
      qc.invalidateQueries({ queryKey: ["workers"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addPayment = useMutation({
    mutationFn: async () => {
      const amt = Number(payDialog.amount);
      if (!payDialog.workerId) throw new Error("শ্রমিক নির্বাচন করুন");
      if (!(amt > 0)) throw new Error("পরিমাণ লিখুন");
      if (!me?.user.id) throw new Error("লগইন প্রয়োজন");
      const { error } = await sdb.from("worker_payments").insert({
        worker_id: payDialog.workerId,
        amount: amt,
        payment_date: payDialog.date,
        payment_type: payDialog.type,
        note: payDialog.note || null,
        created_by: me.user.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("পেমেন্ট সংরক্ষিত");
      setPayDialog({ open: false, workerId: null, amount: "", type: "salary", note: "", date: isoDate(new Date()) });
      qc.invalidateQueries({ queryKey: ["worker-payments"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openNew = () => setWorkerDialog({ open: true, mode: "new", form: emptyForm });
  const openEdit = (w: any) => setWorkerDialog({
    open: true, mode: "edit",
    form: {
      id: w.id, name: w.name, phone: w.phone ?? "", role: w.role, active: w.active,
      daily_wage: String(w.daily_wage ?? ""), monthly_salary: String(w.monthly_salary ?? ""),
      join_date: w.join_date ?? isoDate(new Date()),
    },
  });
  const openPay = (workerId: string) => setPayDialog({
    open: true, workerId, amount: "", type: "salary", note: "", date: isoDate(new Date()),
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold md:text-2xl flex items-center gap-2"><Users2 className="h-6 w-6 text-primary" /> শ্রমিক ও বেতন ব্যবস্থাপনা</h1>
          <p className="text-sm text-muted-foreground">শ্রমিকের তালিকা, বেতন, অগ্রিম ও বকেয়া</p>
        </div>
        {isAdmin && <Button onClick={openNew}><Plus className="mr-1 h-4 w-4" /> নতুন শ্রমিক</Button>}
      </div>

      <Tabs defaultValue="list">
        <TabsList>
          <TabsTrigger value="list">তালিকা ও বকেয়া</TabsTrigger>
          <TabsTrigger value="payments"><Wallet className="mr-1 h-4 w-4" /> পেমেন্ট ইতিহাস</TabsTrigger>
        </TabsList>

        <TabsContent value="list">
          <Card>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-base">শ্রমিক</CardTitle>
              <div className="flex items-center gap-2">
                <div className="relative w-44">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input className="pl-8 h-9" placeholder="খুঁজুন..." value={search} onChange={(e) => setSearch(e.target.value)} />
                </div>
                <Select value={filter} onValueChange={(v: any) => setFilter(v)}>
                  <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">সক্রিয়</SelectItem>
                    <SelectItem value="inactive">নিষ্ক্রিয়</SelectItem>
                    <SelectItem value="all">সব</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {workersQ.isLoading ? <div className="flex h-24 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div> :
              filteredWorkers.length === 0 ? <div className="py-10 text-center text-sm text-muted-foreground">কোনো শ্রমিক নেই</div> :
              <Table>
                <TableHeader><TableRow>
                  <TableHead>নাম</TableHead>
                  <TableHead>ভূমিকা</TableHead>
                  <TableHead className="text-right">মাসিক বেতন</TableHead>
                  <TableHead className="text-right">দেয়া বেতন</TableHead>
                  <TableHead className="text-right">অগ্রিম</TableHead>
                  <TableHead className="text-right">বকেয়া</TableHead>
                  <TableHead></TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {filteredWorkers.map((w: any) => {
                    const t = totals.get(w.id) ?? { salary: 0, advance: 0, bonus: 0 };
                    const due = Math.max(0, Number(w.monthly_salary || 0) - t.salary - t.advance);
                    return (
                      <TableRow key={w.id}>
                        <TableCell>
                          <div className="font-medium">{w.name} {!w.active && <Badge variant="outline" className="ml-1">নিষ্ক্রিয়</Badge>}</div>
                          <div className="text-xs text-muted-foreground">{w.phone || "—"}{w.join_date ? ` • যোগদান ${bnDate(w.join_date)}` : ""}</div>
                        </TableCell>
                        <TableCell><Badge variant="outline">{w.role}</Badge></TableCell>
                        <TableCell className="text-right tabular-nums">৳ {bn(w.monthly_salary)}</TableCell>
                        <TableCell className="text-right tabular-nums">৳ {bn(t.salary)}</TableCell>
                        <TableCell className="text-right tabular-nums">৳ {bn(t.advance)}</TableCell>
                        <TableCell className="text-right tabular-nums font-medium">৳ {bn(due)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            {isAdmin && <Button size="sm" variant="ghost" onClick={() => openEdit(w)}><Pencil className="h-3.5 w-3.5" /></Button>}
                            {isAdmin && <Button size="sm" variant="outline" onClick={() => openPay(w.id)}>পেমেন্ট</Button>}
                            {isAdmin && <Button size="sm" variant="ghost" onClick={() => { if (confirm(`"${w.name}" মুছে ফেলবেন?`)) delWorker.mutate(w.id); }}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>}
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
                <TableHeader><TableRow><TableHead>তারিখ</TableHead><TableHead>শ্রমিক</TableHead><TableHead>ধরন</TableHead><TableHead>নোট</TableHead><TableHead className="text-right">পরিমাণ</TableHead></TableRow></TableHeader>
                <TableBody>
                  {(payQ.data ?? []).slice(0, 100).map((p: any) => {
                    const w = (workersQ.data ?? []).find((x: any) => x.id === p.worker_id);
                    return (
                      <TableRow key={p.id}>
                        <TableCell className="text-xs">{bnDate(p.payment_date)}</TableCell>
                        <TableCell>{w?.name ?? "—"}</TableCell>
                        <TableCell><Badge variant="outline">{ptLabel(p.payment_type)}</Badge></TableCell>
                        <TableCell className="text-xs text-muted-foreground">{p.note || "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">৳ {bn(p.amount)}</TableCell>
                      </TableRow>
                    );
                  })}
                  {(payQ.data ?? []).length === 0 && <TableRow><TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">কোনো পেমেন্ট নেই</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Worker add/edit dialog */}
      <Dialog open={workerDialog.open} onOpenChange={(o) => setWorkerDialog((s) => ({ ...s, open: o }))}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{workerDialog.mode === "edit" ? "শ্রমিক সম্পাদনা" : "নতুন শ্রমিক"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>নাম</Label><Input value={workerDialog.form.name} onChange={(e) => setWorkerDialog((s) => ({ ...s, form: { ...s.form, name: e.target.value } }))} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>ফোন</Label><Input value={workerDialog.form.phone} onChange={(e) => setWorkerDialog((s) => ({ ...s, form: { ...s.form, phone: e.target.value } }))} /></div>
              <div>
                <Label>ভূমিকা</Label>
                <Select value={workerDialog.form.role} onValueChange={(v) => setWorkerDialog((s) => ({ ...s, form: { ...s.form, role: v } }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>দৈনিক মজুরি (৳)</Label><Input type="number" value={workerDialog.form.daily_wage} onChange={(e) => setWorkerDialog((s) => ({ ...s, form: { ...s.form, daily_wage: e.target.value } }))} /></div>
              <div><Label>মাসিক বেতন (৳)</Label><Input type="number" value={workerDialog.form.monthly_salary} onChange={(e) => setWorkerDialog((s) => ({ ...s, form: { ...s.form, monthly_salary: e.target.value } }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>যোগদানের তারিখ</Label><Input type="date" value={workerDialog.form.join_date} onChange={(e) => setWorkerDialog((s) => ({ ...s, form: { ...s.form, join_date: e.target.value } }))} /></div>
              <div>
                <Label>অবস্থা</Label>
                <Select value={workerDialog.form.active ? "1" : "0"} onValueChange={(v) => setWorkerDialog((s) => ({ ...s, form: { ...s.form, active: v === "1" } }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">সক্রিয়</SelectItem>
                    <SelectItem value="0">নিষ্ক্রিয়</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWorkerDialog((s) => ({ ...s, open: false }))}>বাতিল</Button>
            <Button onClick={() => saveWorker.mutate()} disabled={saveWorker.isPending}>সংরক্ষণ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payment dialog */}
      <Dialog open={payDialog.open} onOpenChange={(o) => setPayDialog((s) => ({ ...s, open: o }))}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>পেমেন্ট — {(workersQ.data ?? []).find((w: any) => w.id === payDialog.workerId)?.name ?? ""}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>ধরন</Label>
              <Select value={payDialog.type} onValueChange={(v) => setPayDialog((s) => ({ ...s, type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{PAYMENT_TYPES.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
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
