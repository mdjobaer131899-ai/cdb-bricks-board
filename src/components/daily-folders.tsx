import { useMemo, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, ChevronRight, ArrowUpCircle, ArrowDownCircle, Trash2, Calendar } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { bn, bnDate } from "@/lib/format";
import { useCurrentUser } from "@/lib/use-current-user";
import { deleteExpense } from "@/lib/expenses.functions";
import { deleteCollection } from "@/lib/collections.functions";
import { toast } from "sonner";

interface IncomeRow { id: string; amount: number; method: string | null; note: string | null; customer: string }
interface ExpenseRow { id: string; category: string; amount: number; note: string | null }
interface DayBucket {
  date: string;
  incomes: IncomeRow[];
  expenses: ExpenseRow[];
  incomeTotal: number;
  expenseTotal: number;
}

async function fetchDailyData(days: number): Promise<DayBucket[]> {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - days + 1);
  const startIso = start.toISOString().slice(0, 10);

  const [colRes, expRes] = await Promise.all([
    supabase
      .from("collections")
      .select("id, amount, method, note, payment_date, customer:customers(name)")
      .is("contract_id", null)
      .gte("payment_date", startIso)
      .order("payment_date", { ascending: false }),
    supabase
      .from("expenses")
      .select("id, category, amount, note, expense_date")
      .gte("expense_date", startIso)
      .order("expense_date", { ascending: false }),
  ]);

  const map = new Map<string, DayBucket>();
  const ensure = (d: string) => {
    if (!map.has(d)) map.set(d, { date: d, incomes: [], expenses: [], incomeTotal: 0, expenseTotal: 0 });
    return map.get(d)!;
  };

  for (const r of (colRes.data ?? []) as Array<{ id: string; amount: number; method: string | null; note: string | null; payment_date: string; customer: { name?: string } | null }>) {
    const b = ensure(r.payment_date);
    const inc: IncomeRow = { id: r.id, amount: Number(r.amount), method: r.method, note: r.note, customer: r.customer?.name ?? "—" };
    b.incomes.push(inc);
    b.incomeTotal += inc.amount;
  }
  for (const r of (expRes.data ?? []) as Array<{ id: string; category: string; amount: number; note: string | null; expense_date: string }>) {
    const b = ensure(r.expense_date);
    const ex: ExpenseRow = { id: r.id, category: r.category, amount: Number(r.amount), note: r.note };
    b.expenses.push(ex);
    b.expenseTotal += ex.amount;
  }

  return Array.from(map.values()).sort((a, b) => (a.date < b.date ? 1 : -1));
}

export function DailyIncomeExpenseFolders() {
  const { data: me } = useCurrentUser();
  const isAdmin = me?.role === "admin";
  const qc = useQueryClient();
  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [opened, setOpened] = useState<Set<string>>(new Set([todayIso]));

  const q = useQuery({ queryKey: ["daily-folders", 30], queryFn: () => fetchDailyData(30) });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["daily-folders"] });
    qc.invalidateQueries({ queryKey: ["cash-box"] });
  };

  const delExpFn = useServerFn(deleteExpense);
  const delColFn = useServerFn(deleteCollection);

  const delExpMut = useMutation({
    mutationFn: (id: string) => delExpFn({ data: { id } }),
    onSuccess: () => { invalidate(); toast.success("ব্যয় মুছে ফেলা হয়েছে"); },
    onError: (e: Error) => toast.error(e.message),
  });
  const delColMut = useMutation({
    mutationFn: (id: string) => delColFn({ data: { id } }),
    onSuccess: () => { invalidate(); toast.success("আয় মুছে ফেলা হয়েছে"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = (d: string) => {
    setOpened((prev) => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d); else next.add(d);
      return next;
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Calendar className="h-4 w-4 text-primary" /> আয়-ব্যয় তালিকা (তারিখভিত্তিক)
        </CardTitle>
        <CardDescription>প্রতিটি তারিখ ফোল্ডার — ক্লিক করে বিস্তারিত দেখুন। নগদ কালেকশন স্বয়ংক্রিয়ভাবে আয় হিসেবে গণনা।</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {q.isLoading ? (
          <div className="space-y-2 p-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
        ) : (q.data ?? []).length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">গত ৩০ দিনে কোনো আয়-ব্যয় এন্ট্রি নেই</div>
        ) : (
          <div className="divide-y">
            {(q.data ?? []).map((day) => {
              const isOpen = opened.has(day.date);
              const net = day.incomeTotal - day.expenseTotal;
              return (
                <div key={day.date}>
                  <button
                    onClick={() => toggle(day.date)}
                    className="flex w-full items-center justify-between gap-2 px-4 py-3 hover:bg-muted/50"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {isOpen ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                      <div className="text-left">
                        <div className="font-semibold text-sm">{bnDate(day.date)}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {bn(day.incomes.length)} আয় • {bn(day.expenses.length)} ব্যয়
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <Badge variant="outline" className="border-success/40 text-success">+৳{bn(day.incomeTotal)}</Badge>
                      <Badge variant="outline" className="border-destructive/40 text-destructive">−৳{bn(day.expenseTotal)}</Badge>
                      <span className={`font-bold tabular-nums ${net >= 0 ? "text-success" : "text-destructive"}`}>
                        ৳ {bn(net)}
                      </span>
                    </div>
                  </button>

                  {isOpen && (
                    <div className="bg-muted/20 px-4 py-3 space-y-3">
                      {/* Incomes */}
                      <div>
                        <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-success">
                          <ArrowUpCircle className="h-3.5 w-3.5" /> আয় ({bn(day.incomes.length)})
                        </div>
                        {day.incomes.length === 0 ? (
                          <p className="text-xs text-muted-foreground">কোনো আয় নেই</p>
                        ) : (
                          <ul className="divide-y rounded-md border bg-background">
                            {day.incomes.map((i) => (
                              <li key={i.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                                <div className="min-w-0">
                                  <p className="truncate font-medium">{i.customer}</p>
                                  <p className="text-[10px] text-muted-foreground">
                                    {i.method ?? "নগদ"}{i.note ? ` • ${i.note}` : ""}
                                  </p>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-success">৳ {bn(i.amount)}</span>
                                  {isAdmin && (
                                    <DeleteBtn label="আয়" onConfirm={() => delColMut.mutate(i.id)} />
                                  )}
                                </div>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>

                      {/* Expenses */}
                      <div>
                        <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-destructive">
                          <ArrowDownCircle className="h-3.5 w-3.5" /> ব্যয় ({bn(day.expenses.length)})
                        </div>
                        {day.expenses.length === 0 ? (
                          <p className="text-xs text-muted-foreground">কোনো ব্যয় নেই</p>
                        ) : (
                          <ul className="divide-y rounded-md border bg-background">
                            {day.expenses.map((e) => (
                              <li key={e.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                                <div className="min-w-0">
                                  <p className="truncate font-medium">{e.category}</p>
                                  {e.note && <p className="truncate text-[10px] text-muted-foreground">{e.note}</p>}
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-destructive">৳ {bn(e.amount)}</span>
                                  {isAdmin && (
                                    <DeleteBtn label="ব্যয়" onConfirm={() => delExpMut.mutate(e.id)} />
                                  )}
                                </div>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DeleteBtn({ label, onConfirm }: { label: string; onConfirm: () => void }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive">
          <Trash2 className="h-3 w-3" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{label} মুছবেন?</AlertDialogTitle>
          <AlertDialogDescription>এই {label} এন্ট্রি স্থায়ীভাবে মুছে যাবে।</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>বাতিল</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>মুছুন</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
