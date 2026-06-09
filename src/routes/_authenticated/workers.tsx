import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Users2, Loader2, Calendar, Wallet } from "lucide-react";
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
import { bn, bnDate, isoDate } from "@/lib/format";
import { useCurrentUser } from "@/lib/use-current-user";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/workers")({
  head: () => ({ meta: [{ title: "শ্রমিক ব্যবস্থাপনা — CDB Bricks" }] }),
  component: WorkersPage,
});

function WorkersPage() {
  const qc = useQueryClient();
  const { data: me } = useCurrentUser();
  const isAdmin = me?.role === "admin";
  const [openNew, setOpenNew] = useState(false);
  const [date, setDate] = useState(isoDate(new Date()));
  const [payOpen, setPayOpen] = useState<string | null>(null);
  const [payAmt, setPayAmt] = useState("");

  const workersQ = useQuery({
    queryKey: ["workers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("workers").select("*").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const attQ = useQuery({
    queryKey: ["worker-attendance", date],
    queryFn: async () => {
      const { data, error } = await supabase.from("worker_attendance").select("*").eq("date", date);
      if (error) throw error;
      return data ?? [];
    },
  });

  const payQ = useQuery({
    queryKey: ["worker-payments"],
    queryFn: async () => {
      const { data, error } = await supabase.from("worker_payments").select("*").order("payment_date", { ascending: false }).limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  const dues = useMemo(() => {
    const map = new Map<string, { earned: number; paid: number; advance: number }>();
    (workersQ.data ?? []).forEach((w: any) => map.set(w.id, { earned: 0, paid: 0, advance: 0 }));
    return map;
  }, [workersQ.data]);

  const [form, setForm] = useState({ name: "", phone: "", role: "মিস্ত্রী", daily_wage: "" });
  const createWorker = useMutation({
    mutationFn: async () => {
      if (!form.name) throw new Error("নাম দিন");
      const { error } = await supabase.from("workers").insert({
        name: form.name, phone: form.phone || null, role: form.role, daily_wage: Number(form.daily_wage) || 0,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("শ্রমিক যোগ করা হয়েছে"); setOpenNew(false); setForm({ name: "", phone: "", role: "মিস্ত্রী", daily_wage: "" }); qc.invalidateQueries({ queryKey: ["workers"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleAtt = useMutation({
    mutationFn: async ({ workerId, present }: { workerId: string; present: boolean }) => {
      const existing = (attQ.data ?? []).find((a: any) => a.worker_id === workerId);
      if (existing) {
        const { error } = await supabase.from("worker_attendance").update({ present }).eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("worker_attendance").insert({ worker_id: workerId, date, present, created_by: me?.user.id ?? null });
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["worker-attendance", date] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const payMut = useMutation({
    mutationFn: async (workerId: string) => {
      const amt = Number(payAmt);
      if (!(amt > 0)) throw new Error("পরিমাণ লিখুন");
      const { error } = await supabase.from("worker_payments").insert({
        worker_id: workerId, amount: amt, payment_date: isoDate(new Date()), created_by: me?.user.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("পেমেন্ট সংরক্ষিত"); setPayOpen(null); setPayAmt(""); qc.invalidateQueries({ queryKey: ["worker-payments"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold md:text-2xl flex items-center gap-2"><Users2 className="h-6 w-6 text-primary" /> শ্রমিক ব্যবস্থাপনা</h1>
          <p className="text-sm text-muted-foreground">শ্রমিকের হাজিরা, মজুরি ও পেমেন্ট</p>
        </div>
        {isAdmin && (
          <Dialog open={openNew} onOpenChange={setOpenNew}>
            <DialogTrigger asChild><Button><Plus className="mr-1 h-4 w-4" /> নতুন শ্রমিক</Button></DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader><DialogTitle>নতুন শ্রমিক</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>নাম</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                <div><Label>ফোন</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
                <div>
                  <Label>ভূমিকা</Label>
                  <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="মিস্ত্রী">মিস্ত্রী</SelectItem>
                      <SelectItem value="লোডার">লোডার</SelectItem>
                      <SelectItem value="ড্রাইভার">ড্রাইভার</SelectItem>
                      <SelectItem value="অন্যান্য">অন্যান্য</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>দৈনিক মজুরি (৳)</Label><Input type="number" value={form.daily_wage} onChange={(e) => setForm({ ...form, daily_wage: e.target.value })} /></div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpenNew(false)}>বাতিল</Button>
                <Button onClick={() => createWorker.mutate()} disabled={createWorker.isPending}>সংরক্ষণ</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Tabs defaultValue="list">
        <TabsList>
          <TabsTrigger value="list">তালিকা</TabsTrigger>
          <TabsTrigger value="attendance"><Calendar className="mr-1 h-4 w-4" /> হাজিরা</TabsTrigger>
          <TabsTrigger value="payments"><Wallet className="mr-1 h-4 w-4" /> পেমেন্ট</TabsTrigger>
        </TabsList>

        <TabsContent value="list">
          <Card><CardContent className="p-0">
            {workersQ.isLoading ? <div className="flex h-24 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div> :
            (workersQ.data ?? []).length === 0 ? <div className="py-10 text-center text-sm text-muted-foreground">কোনো শ্রমিক নেই</div> :
            <Table>
              <TableHeader><TableRow><TableHead>নাম</TableHead><TableHead>ভূমিকা</TableHead><TableHead>ফোন</TableHead><TableHead className="text-right">দৈনিক মজুরি</TableHead></TableRow></TableHeader>
              <TableBody>
                {(workersQ.data ?? []).map((w: any) => (
                  <TableRow key={w.id}>
                    <TableCell className="font-medium">{w.name}</TableCell>
                    <TableCell><Badge variant="outline">{w.role}</Badge></TableCell>
                    <TableCell className="text-xs">{w.phone || "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">৳ {bn(w.daily_wage)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="attendance">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">তারিখ অনুযায়ী হাজিরা</CardTitle>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-auto" />
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader><TableRow><TableHead>নাম</TableHead><TableHead>ভূমিকা</TableHead><TableHead className="text-center">উপস্থিত</TableHead></TableRow></TableHeader>
                <TableBody>
                  {(workersQ.data ?? []).map((w: any) => {
                    const rec = (attQ.data ?? []).find((a: any) => a.worker_id === w.id);
                    const present = rec?.present ?? false;
                    return (
                      <TableRow key={w.id}>
                        <TableCell>{w.name}</TableCell>
                        <TableCell><Badge variant="outline">{w.role}</Badge></TableCell>
                        <TableCell className="text-center">
                          <Button size="sm" variant={present ? "default" : "outline"} onClick={() => toggleAtt.mutate({ workerId: w.id, present: !present })}>
                            {present ? "✓ উপস্থিত" : "অনুপস্থিত"}
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payments">
          <Card>
            <CardHeader><CardTitle className="text-base">পেমেন্ট</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader><TableRow><TableHead>নাম</TableHead><TableHead>ভূমিকা</TableHead><TableHead className="text-right">দিন</TableHead><TableHead className="text-right">পরিশোধিত</TableHead><TableHead></TableHead></TableRow></TableHeader>
                <TableBody>
                  {(workersQ.data ?? []).map((w: any) => {
                    const paid = (payQ.data ?? []).filter((p: any) => p.worker_id === w.id).reduce((s: number, p: any) => s + Number(p.amount), 0);
                    return (
                      <TableRow key={w.id}>
                        <TableCell>{w.name}</TableCell>
                        <TableCell><Badge variant="outline">{w.role}</Badge></TableCell>
                        <TableCell className="text-right">—</TableCell>
                        <TableCell className="text-right tabular-nums">৳ {bn(paid)}</TableCell>
                        <TableCell>
                          <Dialog open={payOpen === w.id} onOpenChange={(o) => { setPayOpen(o ? w.id : null); setPayAmt(""); }}>
                            <DialogTrigger asChild><Button size="sm" variant="outline">পেমেন্ট</Button></DialogTrigger>
                            <DialogContent className="max-w-sm">
                              <DialogHeader><DialogTitle>{w.name} — পেমেন্ট</DialogTitle></DialogHeader>
                              <div><Label>পরিমাণ (৳)</Label><Input type="number" value={payAmt} onChange={(e) => setPayAmt(e.target.value)} /></div>
                              <DialogFooter><Button onClick={() => payMut.mutate(w.id)} disabled={payMut.isPending}>সংরক্ষণ</Button></DialogFooter>
                            </DialogContent>
                          </Dialog>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card className="mt-4">
            <CardHeader><CardTitle className="text-base">সাম্প্রতিক পেমেন্ট</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader><TableRow><TableHead>তারিখ</TableHead><TableHead>শ্রমিক</TableHead><TableHead className="text-right">পরিমাণ</TableHead></TableRow></TableHeader>
                <TableBody>
                  {(payQ.data ?? []).slice(0, 50).map((p: any) => {
                    const w = (workersQ.data ?? []).find((x: any) => x.id === p.worker_id);
                    return (
                      <TableRow key={p.id}>
                        <TableCell className="text-xs">{bnDate(p.payment_date)}</TableCell>
                        <TableCell>{w?.name ?? "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">৳ {bn(p.amount)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
