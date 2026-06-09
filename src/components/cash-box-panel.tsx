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
import { bn, isoDate } from "@/lib/format";
import { createCollection } from "@/lib/collections.functions";
import { createExpense, deleteExpense } from "@/lib/expenses.functions";
import { useCurrentUser } from "@/lib/use-current-user";
import { toast } from "sonner";

const EXPENSE_CATEGORIES = [
  "শ্রমিক বেতন",
  "শ্রমিক মজুরি",
  "কাঁচামাল কেনা",
  "জ্বালানি / কয়লা",
  "মাটি ক্রয়",
  "যন্ত্রপাতি / মেরামত",
  "গাড়ি ভাড়া / জ্বালানি",
  "অফিস খরচ",
  "বিদ্যুৎ / পানি",
  "খাবার / আপ্যায়ন",
  "ট্যাক্স / ফি",
  "অন্যান্য",
];

type TodayIncome = { id: string; source: "contract" | "cash"; label: string; amount: number; method: string | null };
type TodayExpense = { id: string; category: string; amount: number; note: string | null };

async function fetchTodayCashBox(todayIso: string) {
  // Income in cash-box = ONLY non-contract (cash) collections.
  // Contract-linked payments (yearly_fixed/short_term/cash contracts) are tracked
  // on the contract ledger and must NOT appear in the daily cash box.
  const [colRes, expRes] = await Promise.all([
    supabase
      .from("collections")
      .select("id, amount, method, note, customer:customers(name)")
      .is("contract_id", null)
      .eq("payment_date", todayIso)
      .order("created_at", { ascending: false }),
    supabase
      .from("expenses")
      .select("id, category, amount, note")
      .eq("expense_date", todayIso)
      .order("created_at", { ascending: false }),
  ]);
  if (colRes.error) throw colRes.error;
  if (expRes.error) throw expRes.error;

  const colRows = (colRes.data ?? []) as unknown as Array<{
    id: string; amount: number; method: string | null;
    customer: { name: string } | null;
  }>;

  const incomes: TodayIncome[] = colRows.map((c) => ({
    id: `col-${c.id}`,
    source: "cash" as const,
    label: c.customer?.name ?? "—",
    amount: Number(c.amount),
    method: c.method,
  }));

  const expenses: TodayExpense[] = (expRes.data ?? []).map((e) => ({
    id: e.id,
    category: e.category,
    amount: Number(e.amount),
    note: e.note,
  }));

  return { incomes, expenses };
}

async function fetchCustomers() {
  const { data, error } = await supabase.from("customers").select("id, name").order("name");
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
    queryFn: () => fetchTodayCashBox(todayIso),
  });

  const totals = useMemo(() => {
    const income = (today.data?.incomes ?? []).reduce((a, b) => a + b.amount, 0);
    const expense = (today.data?.expenses ?? []).reduce((a, b) => a + b.amount, 0);
    return { income, expense, net: income - expense };
  }, [today.data]);

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["cash-box"] });
    qc.invalidateQueries({ queryKey: ["dash", "today"] });
    qc.invalidateQueries({ queryKey: ["dashboard-due"] });
    qc.invalidateQueries({ queryKey: ["dashboard-month"] });
    qc.invalidateQueries({ queryKey: ["dashboard-trend"] });
    qc.invalidateQueries({ queryKey: ["collections-list"] });
    qc.invalidateQueries({ queryKey: ["cash-ledger"] });
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
            sub={`${bn(today.data?.expenses.length ?? 0)} টি এন্ট্রি`}
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
                        {i.source === "contract" ? "চুক্তি" : "সরাসরি ক্যাশ"}
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
              <Badge variant="outline" className="text-[10px]">{bn(today.data?.expenses.length ?? 0)}</Badge>
            </div>
            <ul className="max-h-64 divide-y overflow-y-auto text-sm">
              {today.isLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <li key={i} className="px-3 py-2"><Skeleton className="h-4 w-full" /></li>
                ))
              ) : (today.data?.expenses ?? []).length === 0 ? (
                <li className="px-3 py-6 text-center text-xs text-muted-foreground">আজ কোনো ব্যয় নেই</li>
              ) : (
                today.data!.expenses.map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-2 px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{e.category}</p>
                      {e.note && <p className="truncate text-[10px] text-muted-foreground">{e.note}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-destructive whitespace-nowrap">৳ {bn(e.amount)}</span>
                      {isAdmin && (
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

function AddExpenseDialog({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<string>("");
  const [customCategory, setCustomCategory] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(isoDate(new Date()));
  const [note, setNote] = useState("");
  const [workerId, setWorkerId] = useState<string>("");
  const [materialId, setMaterialId] = useState<string>("");

  const workersQ = useQuery({
    queryKey: ["workers-active-select"],
    enabled: open && category === "শ্রমিক বেতন",
    queryFn: async () => {
      const { data } = await supabase.from("workers").select("id, name").eq("active", true).order("name");
      return (data ?? []) as Array<{ id: string; name: string }>;
    },
  });
  const materialsQ = useQuery({
    queryKey: ["materials-active-select"],
    enabled: open && category === "কাঁচামাল কেনা",
    queryFn: async () => {
      const { data } = await supabase.from("raw_materials").select("id, name").eq("active", true).order("name");
      return (data ?? []) as Array<{ id: string; name: string }>;
    },
  });

  type ExpenseInput = { category: string; amount: number; expense_date: string; note: string | null };
  const createFn = useServerFn(createExpense);
  const mut = useMutation({
    mutationFn: (input: ExpenseInput) => createFn({ data: input }),
    onSuccess: () => {
      toast.success("ব্যয় যোগ হয়েছে");
      setOpen(false);
      setCategory(""); setCustomCategory(""); setAmount(""); setNote(""); setWorkerId(""); setMaterialId("");
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalCat = category === "অন্যান্য" ? customCategory.trim() : category;
    const amt = Number(amount);
    if (!finalCat) return toast.error("খাত নির্বাচন করুন");
    if (!Number.isFinite(amt) || amt <= 0) return toast.error("টাকার পরিমাণ সঠিক নয়");
    let finalNote = note.trim();
    if (category === "শ্রমিক বেতন" && workerId) {
      const w = workersQ.data?.find((x) => x.id === workerId);
      if (w) finalNote = `শ্রমিক: ${w.name}${finalNote ? " — " + finalNote : ""}`;
    }
    if (category === "কাঁচামাল কেনা" && materialId) {
      const m = materialsQ.data?.find((x) => x.id === materialId);
      if (m) finalNote = `উপকরণ: ${m.name}${finalNote ? " — " + finalNote : ""}`;
    }
    mut.mutate({ category: finalCat, amount: amt, expense_date: date, note: finalNote || null });
  };

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
          <DialogDescription>ব্যয় খাত ও টাকার পরিমাণ লিখুন। আজকের ব্যয় নগদ কালেকশন থেকে বাদ যাবে।</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1">
            <Label>ব্যয়ের খাত *</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue placeholder="খাত নির্বাচন করুন" /></SelectTrigger>
              <SelectContent>
                {EXPENSE_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {category === "অন্যান্য" && (
              <Input
                className="mt-2"
                placeholder="খাতের নাম লিখুন"
                value={customCategory}
                onChange={(e) => setCustomCategory(e.target.value)}
              />
            )}
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
            <Label>নোট</Label>
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="ঐচ্ছিক" />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>বাতিল</Button>
            <Button type="submit" variant="destructive" disabled={mut.isPending}>
              {mut.isPending ? "সংরক্ষণ..." : "সংরক্ষণ"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
