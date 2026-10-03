import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowDownCircle, ArrowUpCircle, Plus, Receipt, Trash2, Wallet } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { sdb } from "@/lib/season-db";
import { bn, isoDate } from "@/lib/format";
import { createCollection } from "@/lib/collections.functions";
import { createExpense, deleteExpense } from "@/lib/expenses.functions";
import { createSardarPayment } from "@/lib/sardars.functions";
import { fetchCashDay } from "@/lib/cash-queries";
import { useCurrentUser } from "@/lib/use-current-user";
import { toast } from "sonner";

export const EXPENSE_HEADS = [
  "সরদার", "ডেলি", "মেস্তুরি ও ম্যানেজার", "ভেকু",
  "কাঁচামাল", "যন্ত্রাংশ / মালামাল", "বিদ্যুৎ বিল", "আনুষাঙ্গিক",
];
const RAW_ITEMS = ["কয়লা", "মাটি", "লাকড়ি", "তুষ"];
const PART_ITEMS = ["ডিজেল", "মবিল", "কেরোসিন", "ইঞ্জিনের মালামাল"];

// আজকের নগদ আয় ও সব ধরনের নগদ ব্যয় (সাধারণ ব্যয় + সরদার/শ্রমিক/সরবরাহকারী/গাড়ি)
// একটিই হিসাব থেকে আসে — src/lib/cash-queries.ts

async function fetchCustomers() {
  const { data, error } = await sdb.from("customers").select("id, name").order("name");
  if (error) throw error;
  return data ?? [];
}


export function CashBoxPanel() {
  const { data: me } = useCurrentUser();
  const isAdmin = me?.role === "admin";
  const qc = useQueryClient();
  const todayIso = useMemo(() => isoDate(new Date()), []);
  const today = useQuery({
    queryKey: ["cash-box", todayIso],
    queryFn: () => fetchCashDay(todayIso),
  });

  const totals = useMemo(() => {
    const income = (today.data?.incomes ?? []).reduce((a, b) => a + b.amount, 0);
    const expense = (today.data?.outs ?? []).reduce((a, b) => a + b.amount, 0);
    return { income, expense, net: income - expense };
  }, [today.data]);

  const invalidateAll = () => {
    for (const key of [
      ["cash-box"], ["cash-balance-total"], ["dash", "today"], ["dashboard-due"],
      ["dashboard-month"], ["dashboard-trend"], ["collections-list"], ["cash-ledger"],
      ["sardar-balances"], ["sardar-payments"], ["trial-balance"], ["profit-loss"], ["journal-entries"],
    ]) {
      qc.invalidateQueries({ queryKey: key });
    }
  };

  const delExp = useServerFn(deleteExpense);
  const delMut = useMutation({
    mutationFn: (id: string) => delExp({ data: { id } }),
    onSuccess: () => { invalidateAll(); toast.success("ব্যয় মুছে ফেলা হয়েছে"); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Wallet className="h-4 w-4 text-primary" />আজকের আয়-ব্যয়
            </CardTitle>
            <CardDescription>শুধু নগদ বিক্রয় গণনা — চুক্তির আয় (বাৎসরিক/স্বল্পমেয়াদী/ক্যাশ চুক্তি) এতে যোগ হবে না</CardDescription>
          </div>
          <div className="flex gap-2">
            <AddIncomeDialog onDone={invalidateAll} />
            <AddExpenseDialog onDone={invalidateAll} />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <SummaryBox
            tone="success"
            icon={ArrowUpCircle}
            label="মোট আয় (আজ)"
            value={`৳ ${bn(totals.income)}`}
            sub={`${bn(today.data?.incomes.length ?? 0)} টি এন্ট্রি`}
            loading={today.isLoading}
          />
          <SummaryBox
            tone="destructive"
            icon={ArrowDownCircle}
            label="মোট ব্যয় (আজ)"
            value={`৳ ${bn(totals.expense)}`}
            sub={`${bn(today.data?.outs.length ?? 0)} টি এন্ট্রি (সরদার/শ্রমিক/গাড়িসহ)`}
            loading={today.isLoading}
          />
          <SummaryBox
            tone={totals.net >= 0 ? "primary" : "destructive"}
            icon={Wallet}
            label={totals.net >= 0 ? "হাতে নগদ (বাকি)" : "ঘাটতি"}
            value={`৳ ${bn(Math.abs(totals.net))}`}
            sub="আয় − ব্যয়"
            loading={today.isLoading}
          />
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {/* Today incomes */}
          <div className="rounded-lg border bg-success/5">
            <div className="flex items-center justify-between px-3 py-2 border-b">
              <div className="flex items-center gap-2 text-success">
                <ArrowUpCircle className="h-3.5 w-3.5" />
                <span className="text-xs font-semibold">আজকের আয় তালিকা</span>
              </div>
              <Badge variant="outline" className="text-[10px]">{bn(today.data?.incomes.length ?? 0)}</Badge>
            </div>
            <ul className="max-h-64 divide-y overflow-y-auto text-sm">
              {today.isLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <li key={i} className="px-3 py-2"><Skeleton className="h-4 w-full" /></li>
                ))
              ) : (today.data?.incomes ?? []).length === 0 ? (
                <li className="px-3 py-6 text-center text-xs text-muted-foreground">আজ কোনো আয় নেই</li>
              ) : (
                today.data!.incomes.map((i) => (
                  <li key={i.id} className="flex items-center justify-between gap-2 px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{i.label}</p>
                      <p className="text-[10px] text-muted-foreground">
                        সরাসরি ক্যাশ
                        {i.method ? ` • ${i.method}` : ""}
                      </p>
                    </div>
                    <span className="font-bold text-success whitespace-nowrap">৳ {bn(i.amount)}</span>
                  </li>
                ))
              )}
            </ul>
          </div>

          {/* Today expenses */}
          <div className="rounded-lg border bg-destructive/5">
            <div className="flex items-center justify-between px-3 py-2 border-b">
              <div className="flex items-center gap-2 text-destructive">
                <Receipt className="h-3.5 w-3.5" />
                <span className="text-xs font-semibold">আজকের ব্যয় তালিকা</span>
              </div>
              <Badge variant="outline" className="text-[10px]">{bn(today.data?.outs.length ?? 0)}</Badge>
            </div>
            <ul className="max-h-64 divide-y overflow-y-auto text-sm">
              {today.isLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <li key={i} className="px-3 py-2"><Skeleton className="h-4 w-full" /></li>
                ))
              ) : (today.data?.outs ?? []).length === 0 ? (
                <li className="px-3 py-6 text-center text-xs text-muted-foreground">আজ কোনো ব্যয় নেই</li>
              ) : (
                today.data!.outs.map((e) => (
                  <li key={`${e.kind}-${e.id}`} className="flex items-center justify-between gap-2 px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{e.category}</p>
                      {e.note && <p className="truncate text-[10px] text-muted-foreground">{e.note}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-destructive whitespace-nowrap">৳ {bn(e.amount)}</span>
                      {isAdmin && e.deletable && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive">
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>ব্যয় মুছবেন?</AlertDialogTitle>
                              <AlertDialogDescription>এই ব্যয় এন্ট্রি স্থায়ীভাবে মুছে যাবে।</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>বাতিল</AlertDialogCancel>
                              <AlertDialogAction onClick={() => delMut.mutate(e.id)}>মুছুন</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SummaryBox({
  tone, icon: Icon, label, value, sub, loading,
}: {
  tone: "success" | "destructive" | "primary";
  icon: React.ComponentType<{ className?: string }>;
  label: string; value: string; sub?: string; loading?: boolean;
}) {
  const toneCls =
    tone === "success" ? "bg-success/10 text-success border-success/30"
    : tone === "destructive" ? "bg-destructive/10 text-destructive border-destructive/30"
    : "bg-primary/10 text-primary border-primary/30";
  return (
    <div className={`rounded-lg border p-4 ${toneCls}`}>
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4" />
        <span className="text-[11px] font-medium uppercase tracking-wide">{label}</span>
      </div>
      {loading ? (
        <Skeleton className="mt-2 h-7 w-28" />
      ) : (
        <p className="mt-1 text-2xl font-bold">{value}</p>
      )}
      {sub && <p className="mt-0.5 text-[10px] opacity-80">{sub}</p>}
    </div>
  );
}

function AddIncomeDialog({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [customerId, setCustomerId] = useState<string>("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<string>("cash");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(isoDate(new Date()));

  const custQ = useQuery({ queryKey: ["customers-min"], queryFn: fetchCustomers, enabled: open });

  type IncomeInput = {
    customer_id: string; contract_id: string | null; amount: number;
    payment_date: string; method: string | null; note: string | null;
  };
  const createFn = useServerFn(createCollection);
  const mut = useMutation({
    mutationFn: (input: IncomeInput) => createFn({ data: input }),
    onSuccess: () => {
      toast.success("নগদ আয় যোগ হয়েছে");
      setOpen(false);
      setCustomerId(""); setAmount(""); setNote(""); setMethod("cash");
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(amount);
    if (!customerId) return toast.error("গ্রাহক নির্বাচন করুন");
    if (!Number.isFinite(amt) || amt <= 0) return toast.error("টাকার পরিমাণ সঠিক নয়");
    mut.mutate({
      customer_id: customerId,
      contract_id: null,
      amount: amt,
      payment_date: date,
      method: method || null,
      note: note || null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1 bg-success text-success-foreground hover:bg-success/90">
          <Plus className="h-3.5 w-3.5" />আয় যোগ
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>নতুন নগদ আয় এন্ট্রি</DialogTitle>
          <DialogDescription>শুধু নগদ বিক্রির আয়। চুক্তির আয় চুক্তি পেজ থেকে যোগ করুন — এটি দৈনিক আয়-ব্যয়ে গণনা হবে না।</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1">
            <Label>গ্রাহক *</Label>
            <Select value={customerId} onValueChange={(v) => setCustomerId(v)}>
              <SelectTrigger><SelectValue placeholder="গ্রাহক নির্বাচন করুন" /></SelectTrigger>
              <SelectContent>
                {(custQ.data ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label>টাকা *</Label>
              <Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="০" />
            </div>
            <div className="space-y-1">
              <Label>তারিখ</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1">
            <Label>মাধ্যম</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">নগদ</SelectItem>
                <SelectItem value="bank">ব্যাংক</SelectItem>
                <SelectItem value="bkash">বিকাশ</SelectItem>
                <SelectItem value="nagad">নগদ (মোবাইল)</SelectItem>
                <SelectItem value="cheque">চেক</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>নোট</Label>
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="ঐচ্ছিক" />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>বাতিল</Button>
            <Button type="submit" disabled={mut.isPending}>{mut.isPending ? "সংরক্ষণ..." : "সংরক্ষণ"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function AddExpenseDialog({ onDone }: { onDone: () => void }) {
  const { data: me } = useCurrentUser();
  const [open, setOpen] = useState(false);
  const [head, setHead] = useState<string>("");
  const [item, setItem] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(isoDate(new Date()));
  const [note, setNote] = useState("");
  const [personId, setPersonId] = useState<string>("");
  const [sardarType, setSardarType] = useState<"payment" | "advance">("payment");
  const [hours, setHours] = useState("");
  const [rate, setRate] = useState("");
  const [vekuOwner, setVekuOwner] = useState("");
  const [vekuMode, setVekuMode] = useState<"pay" | "work">("pay");
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();

  const isSardar = head === "সরদার";
  const isDaily = head === "ডেলি";
  const isStaff = head === "মেস্তুরি ও ম্যানেজার";
  const isVeku = head === "ভেকু";
  const vekuTotal = vekuMode === "work" ? (Number(hours) || 0) * (Number(rate) || 0) : 0;
  const vekuDue = vekuTotal - (Number(amount) || 0);

  const vekuOwnersQ = useQuery({
    queryKey: ["veku-owners"],
    enabled: open && isVeku,
    queryFn: async () => {
      const { data } = await supabase.from("suppliers").select("id, name").eq("material_type", "ভেকু").order("name");
      return (data ?? []) as Array<{ id: string; name: string }>;
    },
  });
  const vekuSel = (vekuOwnersQ.data ?? []).find((s) => s.name === vekuOwner.trim());
  const vekuStatusQ = useQuery({
    queryKey: ["veku-status", vekuSel?.id],
    enabled: open && isVeku && !!vekuSel,
    queryFn: async () => {
      const [p, pay] = await Promise.all([
        supabase.from("purchases").select("total_amount").eq("supplier_id", vekuSel!.id),
        supabase.from("supplier_payments").select("amount").eq("supplier_id", vekuSel!.id),
      ]);
      const bill = (p.data ?? []).reduce((a, b: any) => a + Number(b.total_amount || 0), 0);
      const paid = (pay.data ?? []).reduce((a, b: any) => a + Number(b.amount || 0), 0);
      return { bill, paid, due: bill - paid };
    },
  });
  const vekuStatus = vekuSel ? vekuStatusQ.data : undefined;

  const sardarsQ = useQuery({
    queryKey: ["sardars-active-select"],
    enabled: open && isSardar,
    queryFn: async () => {
      const { data } = await supabase.from("sardars").select("id, name").eq("is_active", true).order("name");
      return (data ?? []) as Array<{ id: string; name: string }>;
    },
  });
  const workersQ = useQuery({
    queryKey: ["workers-all-select"],
    enabled: open && (isDaily || isStaff),
    queryFn: async () => {
      const { data } = await supabase.from("workers").select("id, name, role").eq("active", true).order("name");
      return (data ?? []) as Array<{ id: string; name: string; role: string }>;
    },
  });
  const people = isSardar
    ? sardarsQ.data ?? []
    : (workersQ.data ?? []).filter((w) => (isDaily ? w.role === "daily" : w.role !== "daily"));

  const sardarBalQ = useQuery({
    queryKey: ["sardar-balance-one", personId],
    enabled: open && isSardar && !!personId,
    queryFn: async () => {
      const { data } = await supabase.from("sardar_balances").select("*").eq("sardar_id", personId).maybeSingle();
      return data as any;
    },
  });

  function reset() {
    setHead(""); setItem(""); setAmount(""); setNote(""); setPersonId("");
    setSardarType("payment"); setHours(""); setRate(""); setVekuOwner(""); setVekuMode("pay");
  }

  const createFn = useServerFn(createExpense);
  const createSardarPay = useServerFn(createSardarPayment);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(amount || 0);
    if (!head) return toast.error("খাত নির্বাচন করুন");
    if (!isVeku && (!Number.isFinite(amt) || amt <= 0)) return toast.error("টাকার পরিমাণ সঠিক নয়");
    setBusy(true);
    try {
      const n = note.trim() || null;
      if (isSardar) {
        if (!personId) throw new Error("সরদারের নাম নির্বাচন করুন");
        await createSardarPay({ data: { sardar_id: personId, amount: amt, payment_date: date, payment_type: sardarType, method: "cash", note: n } });
      } else if (isDaily || isStaff) {
        if (!personId) throw new Error("নাম নির্বাচন করুন");
        const { error } = await supabase.from("worker_payments").insert({
          worker_id: personId, amount: amt, payment_date: date, payment_type: "payment", note: n, created_by: me!.user.id,
        });
        if (error) throw error;
      } else if (isVeku) {
        if (!vekuOwner.trim()) throw new Error("ভেকু মালিক/ড্রাইভারের নাম লিখুন");
        if (vekuMode === "work" && vekuTotal <= 0) throw new Error("ঘণ্টা ও রেট দিন");
        if (vekuMode === "pay" && !(amt > 0)) throw new Error("কত টাকা দিলেন লিখুন");
        const name = vekuOwner.trim();
        const { data: ex } = await supabase.from("suppliers").select("id").eq("name", name).maybeSingle();
        let supId = ex?.id as string | undefined;
        if (!supId) {
          const { data, error } = await supabase.from("suppliers").insert({ name, material_type: "ভেকু" }).select("id").single();
          if (error) throw error;
          supId = data.id;
        }
        if (vekuMode === "work") {
          const { error } = await supabase.from("purchases").insert({
            purchase_date: date, supplier_id: supId, item_name: "ভেকু", quantity: Number(hours), unit: "ঘণ্টা",
            unit_price: Number(rate), total_amount: vekuTotal, note: n, created_by: me!.user.id,
          });
          if (error) throw error;
        }
        if (amt > 0) {
          const { error: e2 } = await supabase.from("supplier_payments").insert({
            supplier_id: supId, amount: amt, payment_date: date,
            note: vekuMode === "work" ? `ভেকু ${bn(Number(hours))} ঘণ্টা — পরিশোধ${n ? ` (${n})` : ""}` : `ভেকু — অগ্রিম/বকেয়া পরিশোধ (কাজ ছাড়া)${n ? ` (${n})` : ""}`,
            created_by: me!.user.id,
          });
          if (e2) throw e2;
        }
        qc.invalidateQueries({ queryKey: ["purchases"] });
        qc.invalidateQueries({ queryKey: ["supplier-payments"] });
        qc.invalidateQueries({ queryKey: ["veku-status"] });
      } else {
        const sub = item.trim();
        if (head === "আনুষাঙ্গিক" && !sub) throw new Error("খরচের বিবরণ লিখুন");
        const category = sub ? `${head} — ${sub}` : head;
        await createFn({ data: { category, amount: amt, expense_date: date, note: n } });
      }
      toast.success("ব্যয় যোগ হয়েছে");
      setOpen(false); reset(); onDone();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const suggestions = head === "কাঁচামাল" ? RAW_ITEMS : head === "যন্ত্রাংশ / মালামাল" ? PART_ITEMS : [];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="destructive" className="gap-1">
          <Plus className="h-3.5 w-3.5" />ব্যয় যোগ
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>নতুন ব্যয় এন্ট্রি</DialogTitle>
          <DialogDescription>খাত বেছে নিন, তারপর নাম/বিবরণ ও টাকা লিখুন।</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1">
            <Label>ব্যয়ের খাত *</Label>
            <Select value={head} onValueChange={(v) => { setHead(v); setPersonId(""); setItem(""); }}>
              <SelectTrigger><SelectValue placeholder="খাত নির্বাচন করুন" /></SelectTrigger>
              <SelectContent>
                {EXPENSE_HEADS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {(isSardar || isDaily || isStaff) && (
            <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-2">
              <Label>{isSardar ? "সরদারের নাম *" : isDaily ? "ডেলি শ্রমিকের নাম *" : "মেস্তুরি / ম্যানেজারের নাম *"}</Label>
              <Select value={personId} onValueChange={setPersonId}>
                <SelectTrigger><SelectValue placeholder="নাম নির্বাচন করুন" /></SelectTrigger>
                <SelectContent>
                  {people.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
              {people.length === 0 && (
                <p className="text-[11px] text-muted-foreground">কোনো নাম নেই — আগে সংশ্লিষ্ট পাতায় নাম যোগ করুন।</p>
              )}
              {isSardar && (
                <Select value={sardarType} onValueChange={(v) => setSardarType(v as "payment" | "advance")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="payment">পরিশোধ (পাওনা থেকে বাদ)</SelectItem>
                    <SelectItem value="advance">অগ্রিম</SelectItem>
                  </SelectContent>
                </Select>
              )}
              {isSardar && personId && sardarBalQ.data && (
                <p className="text-[11px] text-muted-foreground">
                  পাওনা ৳ {bn(Number(sardarBalQ.data.total_due ?? 0))} • পরিশোধিত ৳ {bn(Number(sardarBalQ.data.total_paid ?? 0))} •{" "}
                  <span className="font-semibold text-foreground">বাকি ৳ {bn(Number(sardarBalQ.data.balance ?? 0))}</span>
                </p>
              )}
            </div>
          )}

          {isVeku && (
            <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-2">
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" size="sm" variant={vekuMode === "pay" ? "default" : "outline"} onClick={() => setVekuMode("pay")}>শুধু টাকা দেওয়া<br />(অগ্রিম / বকেয়া)</Button>
                <Button type="button" size="sm" variant={vekuMode === "work" ? "default" : "outline"} onClick={() => setVekuMode("work")}>আজ কাজ হয়েছে<br />(ঘণ্টার বিল)</Button>
              </div>
              <div className="space-y-1">
                <Label>ভেকু মালিক / ড্রাইভার *</Label>
                <Input list="veku-owners" value={vekuOwner} onChange={(e) => setVekuOwner(e.target.value)} placeholder="নাম লিখুন বা বেছে নিন" />
                <datalist id="veku-owners">{(vekuOwnersQ.data ?? []).map((s) => <option key={s.id} value={s.name} />)}</datalist>
                {vekuStatus && (
                  <p className={`text-xs font-semibold ${vekuStatus.due > 0 ? "text-destructive" : vekuStatus.due < 0 ? "text-success" : "text-muted-foreground"}`}>
                    এখন পর্যন্ত: মোট বিল ৳ {bn(vekuStatus.bill)}, দেওয়া ৳ {bn(vekuStatus.paid)} —{" "}
                    {vekuStatus.due > 0 ? `বাকি ৳ ${bn(vekuStatus.due)}` : vekuStatus.due < 0 ? `অগ্রিম দেওয়া আছে ৳ ${bn(-vekuStatus.due)}` : "পরিশোধিত"}
                  </p>
                )}
              </div>
              {vekuMode === "work" && (<>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label>কত ঘণ্টা *</Label>
                  <Input type="number" min="0" step="0.25" value={hours} onChange={(e) => setHours(e.target.value)} placeholder="০" />
                </div>
                <div className="space-y-1">
                  <Label>ঘণ্টার রেট *</Label>
                  <Input type="number" min="0" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="০" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-md bg-background p-2">আজকের বিল<br /><b>৳ {bn(vekuTotal)}</b></div>
                <div className="rounded-md bg-background p-2">আজকের বাকি<br /><b className={vekuDue > 0 ? "text-destructive" : "text-success"}>৳ {bn(Math.max(vekuDue, 0))}</b></div>
              </div>
              </>)}
              <p className="text-[11px] text-muted-foreground">{vekuMode === "pay" ? "কাজ ছাড়া টাকা দিলে তা ভেকু মালিকের হিসাবে জমা হবে — আগের বকেয়া থেকে কাটবে, না থাকলে অগ্রিম হিসেবে থাকবে।" : "বাকি টাকা ভেকু মালিকের নামে জমা থাকবে; আগের অগ্রিম থাকলে তা থেকে সমন্বয় হবে।"}</p>
            </div>
          )}

          {!(isSardar || isDaily || isStaff || isVeku) && head && head !== "বিদ্যুৎ বিল" && (
            <div className="space-y-1">
              <Label>{head === "আনুষাঙ্গিক" ? "খরচের বিবরণ *" : "কী কেনা হলো (নিজে লিখুন বা বেছে নিন)"}</Label>
              <Input list="exp-items" value={item} onChange={(e) => setItem(e.target.value)} placeholder="যেমন: কয়লা / ডিজেল / চা-নাস্তা" />
              <datalist id="exp-items">{suggestions.map((s) => <option key={s} value={s} />)}</datalist>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label>{isVeku ? (vekuMode === "pay" ? "কত টাকা দিলেন *" : "আজ পরিশোধ (ঐচ্ছিক)") : "টাকা *"}</Label>
              <Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="০" />
            </div>
            <div className="space-y-1">
              <Label>তারিখ</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1">
            <Label>নোট</Label>
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="ঐচ্ছিক — যা খুশি লিখুন" />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>বাতিল</Button>
            <Button type="submit" variant="destructive" disabled={busy}>{busy ? "সংরক্ষণ..." : "সংরক্ষণ"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
