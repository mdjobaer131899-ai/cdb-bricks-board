import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Users2, Loader2, Plus, Trash2, HandCoins, Tags } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { sdb } from "@/lib/season-db";
import { bn, bnDate, todayBD } from "@/lib/format";
import { createSardarWork, deleteSardarWork, createSardarPayment, deleteSardarPayment, setSardarRate } from "@/lib/sardars.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/sardar-ledger")({
  head: () => ({
    meta: [
      { title: "সরদার হিসাব ও পাওনা — CDB Bricks" },
      { name: "description", content: "সরদার/শ্রমিক দলের কাজের পরিমাণ, রেট, মোট পাওনা, পরিশোধ ও বকেয়া এক জায়গায়।" },
      { property: "og:title", content: "সরদার হিসাব ও পাওনা — CDB Bricks" },
      { property: "og:description", content: "কাজ × রেট অনুযায়ী সরদারের পাওনা স্বয়ংক্রিয়ভাবে হিসাব হয়।" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SardarLedgerPage,
});

function SardarLedgerPage() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string>("");

  const sardarsQ = useQuery({
    queryKey: ["sardars-active"],
    queryFn: async () => {
      const { data, error } = await supabase.from("sardars").select("id, name, is_active").eq("is_active", true).order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const catsQ = useQuery({
    queryKey: ["work-categories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("work_categories").select("id, name, unit, code, is_active").eq("is_active", true).order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
  });

  const balQ = useQuery({
    queryKey: ["sardar-balances"],
    queryFn: async () => {
      const { data, error } = await supabase.from("sardar_balances").select("*").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const worksQ = useQuery({
    queryKey: ["sardar-works", selected],
    queryFn: async () => {
      let q = sdb.from("sardar_work_entries").select("id, entry_date, quantity, rate, amount, note, sardar_id, category:work_categories(name, unit), sardar:sardars(name)").order("entry_date", { ascending: false }).limit(300);
      if (selected) q = q.eq("sardar_id", selected) as typeof q;
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const paysQ = useQuery({
    queryKey: ["sardar-payments", selected],
    queryFn: async () => {
      let q = sdb.from("sardar_payments").select("id, payment_date, amount, payment_type, method, note, sardar_id, sardar:sardars(name)").order("payment_date", { ascending: false }).limit(300);
      if (selected) q = q.eq("sardar_id", selected) as typeof q;
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const ratesQ = useQuery({
    queryKey: ["sardar-rates", selected],
    queryFn: async () => {
      let q = supabase.from("sardar_rates").select("id, rate, effective_from, sardar_id, category:work_categories(name, unit), sardar:sardars(name)").order("effective_from", { ascending: false }).limit(300);
      if (selected) q = q.eq("sardar_id", selected) as typeof q;
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  function refresh() {
    for (const k of ["sardar-balances", "sardar-works", "sardar-payments", "sardar-rates", "trial-balance", "profit-loss", "journal-entries", "cash-balance"]) {
      qc.invalidateQueries({ queryKey: [k] });
    }
  }

  const delWork = useServerFn(deleteSardarWork);
  const delPay = useServerFn(deleteSardarPayment);
  const delWorkMut = useMutation({
    mutationFn: (id: string) => delWork({ data: { id } }),
    onSuccess: () => { toast.success("মুছে ফেলা হয়েছে"); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const delPayMut = useMutation({
    mutationFn: (id: string) => delPay({ data: { id } }),
    onSuccess: () => { toast.success("মুছে ফেলা হয়েছে"); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const balances = (balQ.data ?? []) as Array<Record<string, number | string | null>>;
  const shown = useMemo(
    () => (selected ? balances.filter((b) => b['sardar_id'] === selected) : balances),
    [balances, selected],
  );
  const totals = useMemo(() => {
    const due = shown.reduce((s, b) => s + Number(b['total_due'] ?? 0), 0);
    const paid = shown.reduce((s, b) => s + Number(b['total_paid'] ?? 0), 0);
    const adv = shown.reduce((s, b) => s + Number(b['total_advance'] ?? 0), 0);
    return { due, paid, adv, balance: due - paid - adv };
  }, [shown]);

  const sardars = sardarsQ.data ?? [];
  const cats = catsQ.data ?? [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold md:text-2xl">
            <Users2 className="h-6 w-6 text-primary" /> সরদার হিসাব ও পাওনা
          </h1>
          <p className="text-sm text-muted-foreground">কাজের পরিমাণ × রেট = পাওনা (স্বয়ংক্রিয়) — পেমেন্ট দিলে বকেয়া কমে</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={selected || "all"} onValueChange={(v) => setSelected(v === "all" ? "" : v)}>
            <SelectTrigger className="w-[180px]"><SelectValue placeholder="সব সরদার" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">সব সরদার</SelectItem>
              {sardars.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <WorkDialog sardars={sardars} cats={cats} onSaved={refresh} />
          <PaymentDialog sardars={sardars} onSaved={refresh} />
          <RateDialog sardars={sardars} cats={cats} onSaved={refresh} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="মোট পাওনা (কাজ)" value={totals.due} />
        <Stat label="পরিশোধ" value={totals.paid} tone="success" />
        <Stat label="অগ্রিম" value={totals.adv} tone="warning" />
        <Stat label="বর্তমান বকেয়া" value={totals.balance} tone={totals.balance > 0 ? "danger" : "success"} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">সরদার-ভিত্তিক ব্যালেন্স</CardTitle>
          <CardDescription>মোট কাজ, পাওনা, পরিশোধ, অগ্রিম ও বকেয়া</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {balQ.isLoading ? (
            <div className="flex h-24 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>সরদার</TableHead>
                    <TableHead className="text-right">মোট কাজ</TableHead>
                    <TableHead className="text-right">পাওনা</TableHead>
                    <TableHead className="text-right">পরিশোধ</TableHead>
                    <TableHead className="text-right">অগ্রিম</TableHead>
                    <TableHead className="text-right">বকেয়া</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shown.map((b) => {
                    const bal = Number(b['balance'] ?? 0);
                    return (
                      <TableRow key={String(b['sardar_id'])}>
                        <TableCell className="font-medium">{String(b['name'] ?? "—")}</TableCell>
                        <TableCell className="text-right tabular-nums">{bn(Number(b['total_quantity'] ?? 0))}</TableCell>
                        <TableCell className="text-right tabular-nums">৳ {bn(Number(b['total_due'] ?? 0))}</TableCell>
                        <TableCell className="text-right tabular-nums text-success">৳ {bn(Number(b['total_paid'] ?? 0))}</TableCell>
                        <TableCell className="text-right tabular-nums">৳ {bn(Number(b['total_advance'] ?? 0))}</TableCell>
                        <TableCell className={`text-right font-semibold tabular-nums ${bal > 0 ? "text-destructive" : "text-success"}`}>৳ {bn(bal)}</TableCell>
                      </TableRow>
                    );
                  })}
                  {shown.length === 0 && (
                    <TableRow><TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">কোনো সরদার হিসাব নেই</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Tabs defaultValue="work">
        <TabsList>
          <TabsTrigger value="work">কাজের হিসাব</TabsTrigger>
          <TabsTrigger value="pay">পেমেন্ট ইতিহাস</TabsTrigger>
          <TabsTrigger value="rate">রেট ইতিহাস</TabsTrigger>
        </TabsList>

        <TabsContent value="work">
          <Card>
            <CardContent className="p-0">
              {worksQ.isLoading ? (
                <div className="flex h-24 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>তারিখ</TableHead>
                        <TableHead>সরদার</TableHead>
                        <TableHead>খাত</TableHead>
                        <TableHead className="text-right">পরিমাণ</TableHead>
                        <TableHead className="text-right">রেট</TableHead>
                        <TableHead className="text-right">টাকা</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(worksQ.data ?? []).map((w: any) => (
                        <TableRow key={w.id}>
                          <TableCell className="whitespace-nowrap text-xs">{bnDate(w.entry_date)}</TableCell>
                          <TableCell>{w.sardar?.name ?? "—"}</TableCell>
                          <TableCell><Badge variant="outline">{w.category?.name ?? "—"}</Badge></TableCell>
                          <TableCell className="text-right tabular-nums">{bn(w.quantity)} {w.category?.unit ?? ""}</TableCell>
                          <TableCell className="text-right tabular-nums">৳ {bn(w.rate)}</TableCell>
                          <TableCell className="text-right font-semibold tabular-nums">৳ {bn(w.amount)}</TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="icon" onClick={() => { if (confirm("মুছে ফেলবেন?")) delWorkMut.mutate(w.id); }}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                      {(worksQ.data ?? []).length === 0 && (
                        <TableRow><TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">কোনো কাজের এন্ট্রি নেই</TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pay">
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>তারিখ</TableHead>
                      <TableHead>সরদার</TableHead>
                      <TableHead>ধরন</TableHead>
                      <TableHead>মাধ্যম</TableHead>
                      <TableHead className="text-right">টাকা</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(paysQ.data ?? []).map((p: any) => (
                      <TableRow key={p.id}>
                        <TableCell className="whitespace-nowrap text-xs">{bnDate(p.payment_date)}</TableCell>
                        <TableCell>{p.sardar?.name ?? "—"}</TableCell>
                        <TableCell><Badge variant={p.payment_type === "advance" ? "secondary" : "outline"}>{p.payment_type === "advance" ? "অগ্রিম" : "পেমেন্ট"}</Badge></TableCell>
                        <TableCell className="text-xs text-muted-foreground">{p.method ?? "নগদ"}</TableCell>
                        <TableCell className="text-right font-semibold tabular-nums text-success">৳ {bn(p.amount)}</TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon" onClick={() => { if (confirm("মুছে ফেলবেন?")) delPayMut.mutate(p.id); }}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {(paysQ.data ?? []).length === 0 && (
                      <TableRow><TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">কোনো পেমেন্ট নেই</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="rate">
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>প্রযোজ্য তারিখ</TableHead>
                      <TableHead>সরদার</TableHead>
                      <TableHead>খাত</TableHead>
                      <TableHead className="text-right">রেট</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(ratesQ.data ?? []).map((r: any) => (
                      <TableRow key={r.id}>
                        <TableCell className="whitespace-nowrap text-xs">{bnDate(r.effective_from)}</TableCell>
                        <TableCell>{r.sardar?.name ?? "—"}</TableCell>
                        <TableCell><Badge variant="outline">{r.category?.name ?? "—"}</Badge></TableCell>
                        <TableCell className="text-right tabular-nums">৳ {bn(r.rate)} / {r.category?.unit ?? ""}</TableCell>
                      </TableRow>
                    ))}
                    {(ratesQ.data ?? []).length === 0 && (
                      <TableRow><TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">কোনো রেট নির্ধারিত নেই</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "success" | "danger" | "warning" }) {
  const color = tone === "success" ? "text-success" : tone === "danger" ? "text-destructive" : tone === "warning" ? "text-warning" : "";
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`text-lg font-bold tabular-nums ${color}`}>৳ {bn(value)}</div>
      </CardContent>
    </Card>
  );
}

type Sardar = { id: string; name: string };
type Cat = { id: string; name: string; unit: string };

function WorkDialog({ sardars, cats, onSaved }: { sardars: Sardar[]; cats: Cat[]; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [sardarId, setSardarId] = useState("");
  const [catId, setCatId] = useState("");
  const [date, setDate] = useState(todayBD());
  const [qty, setQty] = useState("");
  const [rate, setRate] = useState("");
  const [note, setNote] = useState("");
  const save = useServerFn(createSardarWork);

  // নির্বাচিত সরদার+খাতের প্রযোজ্য রেট স্বয়ংক্রিয়ভাবে বসে
  useEffect(() => {
    if (!sardarId || !catId || !date) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("sardar_rates")
        .select("rate")
        .eq("sardar_id", sardarId)
        .eq("category_id", catId)
        .lte("effective_from", date)
        .order("effective_from", { ascending: false })
        .limit(1);
      if (!cancelled && data && data.length > 0) setRate(String(data[0]!.rate));
    })();
    return () => { cancelled = true; };
  }, [sardarId, catId, date]);

  const mut = useMutation({
    mutationFn: () => save({ data: { sardar_id: sardarId, category_id: catId, entry_date: date, quantity: Number(qty), rate: Number(rate), note: note || null } }),
    onSuccess: () => {
      toast.success("কাজের হিসাব যোগ হয়েছে");
      setQty(""); setNote(""); setOpen(false); onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const amount = (Number(qty) || 0) * (Number(rate) || 0);
  const unit = cats.find((c) => c.id === catId)?.unit ?? "";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm"><Plus className="mr-1 h-4 w-4" /> কাজ যোগ</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>সরদারের কাজের হিসাব</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>সরদার</Label>
            <Select value={sardarId} onValueChange={setSardarId}>
              <SelectTrigger><SelectValue placeholder="নির্বাচন করুন" /></SelectTrigger>
              <SelectContent>{sardars.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>কাজের খাত</Label>
            <Select value={catId} onValueChange={setCatId}>
              <SelectTrigger><SelectValue placeholder="যেমন: কাঁচা ইট, পোড়ানো, লোডিং" /></SelectTrigger>
              <SelectContent>{cats.map((c) => <SelectItem key={c.id} value={c.id}>{c.name} ({c.unit})</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>তারিখ</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>পরিমাণ {unit ? `(${unit})` : ""}</Label>
              <Input type="number" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>রেট (স্বয়ংক্রিয়, চাইলে বদলান)</Label>
            <Input type="number" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} />
          </div>
          <div className="rounded-md bg-muted/50 p-3 text-sm">
            মোট পাওনা: <span className="font-bold tabular-nums">৳ {bn(amount)}</span>
          </div>
          <div className="space-y-1.5">
            <Label>মন্তব্য</Label>
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>বাতিল</Button>
          <Button
            disabled={mut.isPending || !sardarId || !catId || !(Number(qty) > 0)}
            onClick={() => mut.mutate()}
          >সংরক্ষণ</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PaymentDialog({ sardars, onSaved }: { sardars: Sardar[]; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [sardarId, setSardarId] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayBD());
  const [type, setType] = useState<"payment" | "advance">("payment");
  const [method, setMethod] = useState("cash");
  const [note, setNote] = useState("");
  const save = useServerFn(createSardarPayment);

  const mut = useMutation({
    mutationFn: () => save({ data: { sardar_id: sardarId, amount: Number(amount), payment_date: date, payment_type: type, method, note: note || null } }),
    onSuccess: () => { toast.success("পেমেন্ট সংরক্ষিত — বকেয়া কমেছে"); setAmount(""); setNote(""); setOpen(false); onSaved(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" variant="secondary"><HandCoins className="mr-1 h-4 w-4" /> পেমেন্ট</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>সরদারকে পেমেন্ট</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>সরদার</Label>
            <Select value={sardarId} onValueChange={setSardarId}>
              <SelectTrigger><SelectValue placeholder="নির্বাচন করুন" /></SelectTrigger>
              <SelectContent>{sardars.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>টাকা</Label>
              <Input type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>তারিখ</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>ধরন</Label>
              <Select value={type} onValueChange={(v) => setType(v as "payment" | "advance")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="payment">পেমেন্ট</SelectItem>
                  <SelectItem value="advance">অগ্রিম</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>মাধ্যম</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">নগদ</SelectItem>
                  <SelectItem value="bank">ব্যাংক</SelectItem>
                  <SelectItem value="bkash">বিকাশ</SelectItem>
                  <SelectItem value="nagad">নগদ (মোবাইল)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>মন্তব্য</Label>
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>বাতিল</Button>
          <Button disabled={mut.isPending || !sardarId || !(Number(amount) > 0)} onClick={() => mut.mutate()}>সংরক্ষণ</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RateDialog({ sardars, cats, onSaved }: { sardars: Sardar[]; cats: Cat[]; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [sardarId, setSardarId] = useState("");
  const [catId, setCatId] = useState("");
  const [rate, setRate] = useState("");
  const [from, setFrom] = useState(todayBD());
  const save = useServerFn(setSardarRate);

  const mut = useMutation({
    mutationFn: () => save({ data: { sardar_id: sardarId, category_id: catId, rate: Number(rate), effective_from: from, note: null } }),
    onSuccess: () => { toast.success("নতুন রেট নির্ধারিত — পুরোনো কাজ অপরিবর্তিত"); setRate(""); setOpen(false); onSaved(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" variant="outline"><Tags className="mr-1 h-4 w-4" /> রেট</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>রেট নির্ধারণ</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>সরদার</Label>
            <Select value={sardarId} onValueChange={setSardarId}>
              <SelectTrigger><SelectValue placeholder="নির্বাচন করুন" /></SelectTrigger>
              <SelectContent>{sardars.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>কাজের খাত</Label>
            <Select value={catId} onValueChange={setCatId}>
              <SelectTrigger><SelectValue placeholder="নির্বাচন করুন" /></SelectTrigger>
              <SelectContent>{cats.map((c) => <SelectItem key={c.id} value={c.id}>{c.name} ({c.unit})</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>রেট</Label>
              <Input type="number" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>প্রযোজ্য তারিখ থেকে</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">নতুন রেট শুধু এই তারিখের পরের কাজে প্রযোজ্য হবে; পুরোনো হিসাব বদলাবে না।</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>বাতিল</Button>
          <Button disabled={mut.isPending || !sardarId || !catId || !rate} onClick={() => mut.mutate()}>সংরক্ষণ</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
