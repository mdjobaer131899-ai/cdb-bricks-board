import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowDownCircle, ArrowUpCircle, ChevronDown, ChevronUp, Lock, Pencil, Plus, Trash2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { sdb } from "@/lib/season-db";
import { bn, bnDate, isoDate } from "@/lib/format";
import { createCollection } from "@/lib/collections.functions";
import { createExpense } from "@/lib/expenses.functions";
import {
  deleteExpenseWithPassword, deleteIncomeWithPassword, updateExpenseEntry, updateIncomeEntry,
} from "@/lib/cash-book.functions";
import { toast } from "sonner";
import { fetchCashHistory } from "@/lib/cash-queries";
import { AddExpenseDialog, EXPENSE_HEADS } from "@/components/cash-box-panel";

export const Route = createFileRoute("/_authenticated/cash-book")({
  head: () => ({
    meta: [
      { title: "আয়-ব্যায় হিসাব — CDB Bricks" },
      { name: "description", content: "নগদ আয় ও ব্যয়ের এন্ট্রি, সম্পাদনা এবং এডমিন পাসওয়ার্ড দিয়ে মুছে ফেলা।" },
      { property: "og:title", content: "আয়-ব্যায় হিসাব — CDB Bricks" },
      { property: "og:description", content: "নগদ আয় ও ব্যয়ের সম্পূর্ণ হিসাব এক জায়গায়।" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: "/cash-book" }],
  }),
  component: CashBookPage,
});

const EXPENSE_CATEGORIES = EXPENSE_HEADS;

const METHODS = ["cash", "bkash", "nagad", "bank"];

type IncomeRow = {
  id: string; amount: number; payment_date: string; method: string | null; note: string | null;
  customer_id: string; customer: { name: string } | null;
};
type ExpenseRow = {
  id: string; amount: number; expense_date: string; category: string; note: string | null;
};

type Range = { from: string; to: string };

async function fetchIncomes({ from, to }: Range): Promise<IncomeRow[]> {
  let q = sdb
    .from("collections")
    .select("id, amount, payment_date, method, note, customer_id, customer:customers(name)")
    .is("contract_id", null);
  if (from) q = q.gte("payment_date", from);
  if (to) q = q.lte("payment_date", to);
  const { data, error } = await q.order("payment_date", { ascending: false }).limit(2000);
  if (error) throw error;
  return (data ?? []) as unknown as IncomeRow[];
}

async function fetchExpenses({ from, to }: Range): Promise<ExpenseRow[]> {
  let q = sdb.from("expenses").select("id, amount, expense_date, category, note");
  if (from) q = q.gte("expense_date", from);
  if (to) q = q.lte("expense_date", to);
  const { data, error } = await q.order("expense_date", { ascending: false }).limit(2000);
  if (error) throw error;
  return (data ?? []) as unknown as ExpenseRow[];
}

async function fetchCustomers() {
  const { data, error } = await sdb.from("customers").select("id, name").order("name");
  if (error) throw error;
  return (data ?? []) as Array<{ id: string; name: string }>;
}

function monthRange(offset: number): Range {
  const d = new Date();
  const s = new Date(d.getFullYear(), d.getMonth() + offset, 1);
  const e = new Date(d.getFullYear(), d.getMonth() + offset + 1, 0);
  return { from: isoDate(s), to: isoDate(e) };
}

function CashBookPage() {
  const qc = useQueryClient();
  const [hFrom, setHFrom] = useState("");
  const [hTo, setHTo] = useState("");
  const [hHead, setHHead] = useState("__all__");
  const [showHeads, setShowHeads] = useState(false);
  const incomes = useQuery({ queryKey: ["cash-book", "incomes", hFrom, hTo], queryFn: () => fetchIncomes({ from: hFrom, to: hTo }) });
  const expenses = useQuery({ queryKey: ["cash-book", "expenses", hFrom, hTo], queryFn: () => fetchExpenses({ from: hFrom, to: hTo }) });
  const customers = useQuery({ queryKey: ["customers-min"], queryFn: fetchCustomers });
  const quickRanges = useMemo(() => {
    const t = isoDate(new Date());
    return [
      { label: "পুরো সিজন", from: "", to: "" },
      { label: "আজ", from: t, to: t },
      { label: "এই মাস", ...monthRange(0) },
      { label: "গত মাস", ...monthRange(-1) },
      { label: "আগের মাস", ...monthRange(-2) },
    ];
  }, []);

  const invalidate = () => {
    for (const key of [
      ["cash-book"], ["cash-box"], ["cash-balance-total"], ["dash", "today"], ["dashboard-due"],
      ["dashboard-month"], ["collections-list"], ["cash-ledger"], ["trial-balance"], ["profit-loss"],
    ]) qc.invalidateQueries({ queryKey: key });
  };

  const history = useQuery({ queryKey: ["cash-book", "history", hFrom, hTo], queryFn: () => fetchCashHistory({ from: hFrom || undefined, to: hTo || undefined }) });
  const heads = useMemo(() => {
    const m = new Map<string, { dir: "in" | "out"; total: number }>();
    for (const r of history.data ?? []) { const c = m.get(r.head) ?? { dir: r.dir, total: 0 }; c.total += r.amount; m.set(r.head, c); }
    return [...m.entries()];
  }, [history.data]);
  const marks = useQuery({
    queryKey: ["book-marks"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("book_marks").select("entry_key, page, checked");
      if (error) throw error;
      const m: Record<string, { page: number | null; checked: boolean }> = {};
      for (const r of (data ?? []) as any[]) m[r.entry_key] = { page: r.page, checked: r.checked };
      return m;
    },
  });
  const [lastPage, setLastPage] = useState<number | null>(null);
  useEffect(() => {
    const v = Number(localStorage.getItem("cdb-last-book-page"));
    if (v > 0) setLastPage(v);
  }, []);
  const saveMark = useMutation({
    mutationFn: async (v: { key: string; page: number | null; checked: boolean }) => {
      const { error } = await (supabase as any).from("book_marks").upsert({ entry_key: v.key, page: v.page, checked: v.checked });
      if (error) throw error;
      return v;
    },
    onMutate: (v) => {
      qc.setQueryData(["book-marks"], (old: any) => ({ ...(old ?? {}), [v.key]: { page: v.page, checked: v.checked } }));
      if (v.page) { setLastPage(v.page); localStorage.setItem("cdb-last-book-page", String(v.page)); }
    },
    onError: (e: any) => { toast.error(e.message ?? "সেভ হয়নি"); qc.invalidateQueries({ queryKey: ["book-marks"] }); },
  });
  const [bookFilter, setBookFilter] = useState<"all" | "pending" | "done">("all");
  const hRows = useMemo(() => (history.data ?? []).filter((r) => {
    if (hHead !== "__all__" && r.head !== hHead) return false;
    if (bookFilter === "all") return true;
    if (r.dir !== "out") return false;
    const c = !!marks.data?.[r.id]?.checked;
    return bookFilter === "done" ? c : !c;
  }), [history.data, hHead, bookFilter, marks.data]);
  const pageTotals = useMemo(() => {
    const m = new Map<number, number>();
    for (const r of history.data ?? []) {
      const mk = marks.data?.[r.id];
      if (r.dir === "out" && mk?.checked && mk.page) m.set(mk.page, (m.get(mk.page) ?? 0) + r.amount);
    }
    return [...m.entries()].sort((a, b) => b[0] - a[0]);
  }, [history.data, marks.data]);
  const totals = useMemo(() => {
    const inc = hRows.filter((r) => r.dir === "in").reduce((a, b) => a + b.amount, 0);
    const exp = hRows.filter((r) => r.dir === "out").reduce((a, b) => a + b.amount, 0);
    return { inc, exp, net: inc - exp };
  }, [hRows]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Wallet className="h-5 w-5 text-primary" /> আয়-ব্যায়
          </h1>
          <p className="text-sm text-muted-foreground">নগদ আয় ও ব্যয় এন্ট্রি — সম্পাদনা ও মুছে ফেলা (এডমিন পাসওয়ার্ড লাগবে)</p>
        </div>
        <div className="flex gap-2">
          <IncomeDialog customers={customers.data ?? []} onDone={invalidate} />
          <AddExpenseDialog onDone={invalidate} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Stat tone="success" icon={ArrowUpCircle} label="মোট আয়" value={totals.inc} />
        <Stat tone="destructive" icon={ArrowDownCircle} label="মোট ব্যয়" value={totals.exp} />
        <Stat tone={totals.net >= 0 ? "primary" : "destructive"} icon={Wallet} label="নিট" value={totals.net} />
      </div>

      <Card>
        <CardContent className="space-y-2 pt-4">
          <div className="flex flex-wrap gap-2">
            {quickRanges.map((q) => (
              <Button key={q.label} size="sm" variant={hFrom === q.from && hTo === q.to ? "default" : "outline"} onClick={() => { setHFrom(q.from); setHTo(q.to); }}>{q.label}</Button>
            ))}
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div><Label className="text-xs">থেকে</Label><Input type="date" value={hFrom} onChange={(e) => setHFrom(e.target.value)} /></div>
            <div><Label className="text-xs">পর্যন্ত</Label><Input type="date" value={hTo} onChange={(e) => setHTo(e.target.value)} /></div>
          </div>
          <p className="text-xs text-muted-foreground">এই তারিখ বাছাই হিস্টোরি, ব্যয় তালিকা ও আয় তালিকা — তিনটিতেই কাজ করবে।</p>
        </CardContent>
      </Card>

      <Tabs defaultValue="history">
        <TabsList>
          <TabsTrigger value="history">সব আয়-ব্যয় হিস্টোরি</TabsTrigger>
          <TabsTrigger value="expense">ব্যয় তালিকা</TabsTrigger>
          <TabsTrigger value="income">আয় তালিকা</TabsTrigger>
          <TabsTrigger value="allexp">সব ব্যয় (তারিখ ক্রমে)</TabsTrigger>
        </TabsList>

        <TabsContent value="history">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">মূল ক্যাশের সব লেনদেন</CardTitle>
              <CardDescription>সব পাতার আয় ও ব্যয় — খাত ও তারিখ বেছে হিসাব করুন</CardDescription>
              <div className="flex flex-wrap items-end gap-2 pt-2">
                <div className="min-w-48"><Label className="text-xs">খাত</Label>
                  <Select value={hHead} onValueChange={setHHead}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">সব খাত</SelectItem>
                      {heads.map(([h, v]) => <SelectItem key={h} value={h}>{v.dir === "in" ? "আয়" : "ব্যয়"} — {h}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">খাতায় তোলা</Label>
                  <div className="flex gap-1">
                    {([["all", "সব"], ["pending", "খাতায় তোলা বাকি"], ["done", "খাতায় তোলা শেষ"]] as const).map(([k, l]) => (
                      <Button key={k} size="sm" variant={bookFilter === k ? "default" : "outline"} onClick={() => setBookFilter(k)}>{l}</Button>
                    ))}
                  </div>
                </div>
              </div>
              {pageTotals.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-2 text-xs">
                  {pageTotals.map(([p, t]) => (
                    <span key={p} className="rounded-full border px-2 py-1">পৃষ্ঠা {bn(p)}: <b>৳ {bn(t)}</b></span>
                  ))}
                </div>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              {heads.length > 0 && (
                <div>
                  <Button variant="outline" size="sm" className="w-full justify-between" onClick={() => setShowHeads((s) => !s)}>
                    <span>খাতভিত্তিক মোট হিসাব দেখুন ({bn(heads.length)}টি)</span>
                    {showHeads ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </Button>
                  {showHeads && (
                    <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {heads.map(([h, v]) => (
                        <button key={h} type="button" onClick={() => { setHHead(h); setShowHeads(false); }} className="flex justify-between rounded-md border p-2 text-left text-sm hover:bg-muted">
                          <span>{h}</span><b className={v.dir === "in" ? "text-success" : "text-destructive"}>৳ {bn(v.total)}</b>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {history.isLoading ? <Skeleton className="h-32" /> : hRows.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">কোনো লেনদেন নেই</div>
              ) : (
                <div className="space-y-3">
                  {Array.from(hRows.reduce((m, r) => { const k = r.date?.slice(0, 10) ?? ""; (m.get(k) ?? m.set(k, []).get(k)!).push(r); return m; }, new Map<string, typeof hRows>())).map(([d, rows]) => {
                    const inc = rows.filter((r) => r.dir === "in").reduce((a, b) => a + b.amount, 0);
                    const exp = rows.filter((r) => r.dir === "out").reduce((a, b) => a + b.amount, 0);
                    return (
                      <div key={d} className="overflow-hidden rounded-lg border">
                        <div className="flex flex-wrap items-center justify-between gap-2 bg-muted px-3 py-2">
                          <b>{bnDate(d)}</b>
                          <div className="flex gap-3 text-sm">
                            <span className="text-success">আয় ৳ {bn(inc)}</span>
                            <span className="text-destructive">ব্যয় ৳ {bn(exp)}</span>
                            <span className="font-semibold">নিট ৳ {bn(inc - exp)}</span>
                          </div>
                        </div>
                        <div className="divide-y">
                          {rows.map((r) => {
                            const mk = marks.data?.[r.id];
                            const done = r.dir === "out" && !!mk?.checked;
                            return (
                            <div key={r.id} className={`flex items-center justify-between gap-2 px-3 py-2 text-sm transition-opacity ${done ? "bg-muted/60 opacity-45" : ""}`}>
                              <div className="min-w-0 flex-1">
                                <div className="text-base font-semibold">{r.detail && r.detail !== "—" ? r.detail : r.head}</div>
                                {r.detail && r.detail !== "—" && <div className="text-xs text-muted-foreground">{r.head}</div>}
                              </div>
                              <b className={`shrink-0 tabular-nums ${r.dir === "in" ? "text-success" : "text-destructive"}`}>{r.dir === "in" ? "+" : "−"} ৳ {bn(r.amount)}</b>
                              {r.dir === "out" && (
                                <BookMarkCell
                                  key={`${r.id}-${mk?.page ?? ""}`}
                                  initialPage={mk?.page ?? null}
                                  checked={!!mk?.checked}
                                  lastPage={lastPage}
                                  onSave={(page, checked) => saveMark.mutate({ key: r.id, page, checked })}
                                />
                              )}
                            </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="expense">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">ব্যয় এন্ট্রি</CardTitle>
              <CardDescription>ওপরে বাছাই করা তারিখের সব ব্যয়</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>তারিখ</TableHead>
                      <TableHead>খাত</TableHead>
                      <TableHead>নোট</TableHead>
                      <TableHead className="text-right">টাকা</TableHead>
                      <TableHead className="text-right">অ্যাকশন</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {expenses.isLoading ? (
                      <TableRow><TableCell colSpan={5}><Skeleton className="h-6 w-full" /></TableCell></TableRow>
                    ) : (expenses.data ?? []).length === 0 ? (
                      <TableRow><TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">কোনো ব্যয় এন্ট্রি নেই</TableCell></TableRow>
                    ) : (
                      expenses.data!.map((e) => (
                        <TableRow key={e.id}>
                          <TableCell className="whitespace-nowrap">{bnDate(e.expense_date)}</TableCell>
                          <TableCell className="font-medium">{e.category}</TableCell>
                          <TableCell className="max-w-[200px] truncate text-muted-foreground">{e.note ?? "—"}</TableCell>
                          <TableCell className="text-right font-bold text-destructive whitespace-nowrap">৳ {bn(e.amount)}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <ExpenseDialog row={e} onDone={invalidate} />
                              <DeleteDialog kind="expense" id={e.id} label={`${e.category} — ৳ ${bn(e.amount)}`} onDone={invalidate} />
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="income">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">আয় এন্ট্রি</CardTitle>
              <CardDescription>নগদ আয় (চুক্তি বহির্ভূত)</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>তারিখ</TableHead>
                      <TableHead>গ্রাহক</TableHead>
                      <TableHead>মাধ্যম</TableHead>
                      <TableHead className="text-right">টাকা</TableHead>
                      <TableHead className="text-right">অ্যাকশন</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {incomes.isLoading ? (
                      <TableRow><TableCell colSpan={5}><Skeleton className="h-6 w-full" /></TableCell></TableRow>
                    ) : (incomes.data ?? []).length === 0 ? (
                      <TableRow><TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">কোনো আয় এন্ট্রি নেই</TableCell></TableRow>
                    ) : (
                      incomes.data!.map((i) => (
                        <TableRow key={i.id}>
                          <TableCell className="whitespace-nowrap">{bnDate(i.payment_date)}</TableCell>
                          <TableCell className="font-medium">{i.customer?.name ?? "—"}</TableCell>
                          <TableCell className="text-muted-foreground">{i.method ?? "—"}</TableCell>
                          <TableCell className="text-right font-bold text-success whitespace-nowrap">৳ {bn(i.amount)}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <IncomeDialog row={i} customers={customers.data ?? []} onDone={invalidate} />
                              <DeleteDialog kind="income" id={i.id} label={`${i.customer?.name ?? ""} — ৳ ${bn(i.amount)}`} onDone={invalidate} />
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="allexp">
          <AllExpenseList rows={(history.data ?? []).filter((r) => r.dir === "out")} loading={history.isLoading} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function AllExpenseList({ rows, loading }: { rows: Array<{ id: string; date: string; head: string; detail: string; amount: number }>; loading: boolean }) {
  const [asc, setAsc] = useState(true);
  const [onlyOld, setOnlyOld] = useState(false);
  const list = useMemo(() => {
    const f = onlyOld ? rows.filter((r) => r.head === "পূর্বের দায় পরিশোধ") : rows;
    return [...f].sort((a, b) => {
      const pa = a.head === "পূর্বের দায় পরিশোধ" ? 0 : 1, pb = b.head === "পূর্বের দায় পরিশোধ" ? 0 : 1;
      const d = a.date < b.date ? -1 : a.date > b.date ? 1 : pa - pb;
      return asc ? d : -d;
    });
  }, [rows, asc, onlyOld]);
  const oldTotal = rows.filter((r) => r.head === "পূর্বের দায় পরিশোধ").reduce((a, b) => a + b.amount, 0);
  const all = rows.reduce((a, b) => a + b.amount, 0);
  let run = 0;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">সব ব্যয়ের তালিকা — তারিখের সিরিয়াল অনুযায়ী</CardTitle>
        <CardDescription>পুরোনো বকেয়া পরিশোধ, সরদার, শ্রমিক, বেতন, মালামাল, ঋণ, মালিক উত্তোলন ও সব খরচ</CardDescription>
        <div className="flex flex-wrap gap-2 pt-2 text-sm">
          <span className="rounded-md border px-2 py-1">পুরোনো বকেয়া পরিশোধ: <b>৳ {bn(oldTotal)}</b></span>
          <span className="rounded-md border px-2 py-1">চলতি খরচ: <b>৳ {bn(all - oldTotal)}</b></span>
          <span className="rounded-md border px-2 py-1">মোট ব্যয়: <b>৳ {bn(all)}</b></span>
        </div>
        <div className="flex flex-wrap gap-2 pt-2 print:hidden">
          <Button size="sm" variant="outline" onClick={() => setAsc((s) => !s)}>{asc ? "পুরনো থেকে নতুন" : "নতুন থেকে পুরনো"}</Button>
          <Button size="sm" variant={onlyOld ? "default" : "outline"} onClick={() => setOnlyOld((s) => !s)}>শুধু পুরোনো বকেয়া পরিশোধ</Button>
          <Button size="sm" variant="outline" onClick={() => window.print()}>প্রিন্ট</Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ক্রম</TableHead>
                <TableHead>তারিখ</TableHead>
                <TableHead>নাম</TableHead>
                <TableHead>খাত</TableHead>
                <TableHead className="text-right">টাকা</TableHead>
                <TableHead className="text-right">মোট (চলমান)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={6}><Skeleton className="h-6 w-full" /></TableCell></TableRow>
              ) : list.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">কোনো ব্যয় নেই</TableCell></TableRow>
              ) : list.map((r, i) => {
                run += r.amount;
                return (
                  <TableRow key={r.id} className={r.head === "পূর্বের দায় পরিশোধ" ? "bg-warning/10" : ""}>
                    <TableCell>{bn(i + 1)}</TableCell>
                    <TableCell className="whitespace-nowrap">{bnDate(r.date)}</TableCell>
                    <TableCell className="font-semibold">{r.detail && r.detail !== "—" ? r.detail : "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.head}</TableCell>
                    <TableCell className="text-right font-bold text-destructive whitespace-nowrap">৳ {bn(r.amount)}</TableCell>
                    <TableCell className="text-right tabular-nums whitespace-nowrap">৳ {bn(run)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ tone, icon: Icon, label, value }: {
  tone: "success" | "destructive" | "primary";
  icon: React.ComponentType<{ className?: string }>;
  label: string; value: number;
}) {
  const cls = tone === "success" ? "bg-success/10 text-success border-success/30"
    : tone === "destructive" ? "bg-destructive/10 text-destructive border-destructive/30"
    : "bg-primary/10 text-primary border-primary/30";
  return (
    <div className={`rounded-lg border p-4 ${cls}`}>
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4" />
        <span className="text-[11px] font-semibold uppercase tracking-wide">{label}</span>
      </div>
      <p className="mt-1 text-2xl font-bold">৳ {bn(Math.abs(value))}</p>
    </div>
  );
}

function ExpenseDialog({ row, onDone }: { row?: ExpenseRow; onDone: () => void }) {
  const editing = !!row;
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState(row?.category ?? "");
  const [amount, setAmount] = useState(row ? String(row.amount) : "");
  const [date, setDate] = useState(row?.expense_date ?? isoDate(new Date()));
  const [note, setNote] = useState(row?.note ?? "");

  const create = useServerFn(createExpense);
  const update = useServerFn(updateExpenseEntry);

  const mut = useMutation({
    mutationFn: async () => {
      const amt = Number(amount);
      if (!category) throw new Error("খাত নির্বাচন করুন");
      if (!Number.isFinite(amt) || amt <= 0) throw new Error("টাকার পরিমাণ সঠিক নয়");
      if (editing) {
        return update({ data: { id: row!.id, category, amount: amt, expense_date: date, note: note || null } });
      }
      return create({ data: { category, amount: amt, expense_date: date, note: note || null } });
    },
    onSuccess: () => {
      toast.success(editing ? "ব্যয় হালনাগাদ হয়েছে" : "ব্যয় যোগ হয়েছে");
      setOpen(false);
      if (!editing) { setCategory(""); setAmount(""); setNote(""); }
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {editing ? (
          <Button variant="ghost" size="icon" className="h-7 w-7"><Pencil className="h-3.5 w-3.5" /></Button>
        ) : (
          <Button size="sm" variant="destructive" className="gap-1"><Plus className="h-3.5 w-3.5" />ব্যয় যোগ</Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? "ব্যয় সম্পাদনা" : "নতুন ব্যয় এন্ট্রি"}</DialogTitle>
          <DialogDescription>নগদ ব্যয়ের হিসাব সাথে সাথে মূল ক্যাশে প্রভাব ফেলবে।</DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); mut.mutate(); }} className="space-y-3">
          <div className="space-y-1">
            <Label>খাত *</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue placeholder="খাত নির্বাচন করুন" /></SelectTrigger>
              <SelectContent>
                {Array.from(new Set([...(category ? [category] : []), ...EXPENSE_CATEGORIES])).map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label>টাকা *</Label>
              <Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="০" />
            </div>
            <div className="space-y-1">
              <Label>তারিখ *</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>নোট</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={mut.isPending}>{editing ? "হালনাগাদ" : "সংরক্ষণ"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function IncomeDialog({ row, customers, onDone }: {
  row?: IncomeRow; customers: Array<{ id: string; name: string }>; onDone: () => void;
}) {
  const editing = !!row;
  const [open, setOpen] = useState(false);
  const [customerId, setCustomerId] = useState(row?.customer_id ?? "");
  const [amount, setAmount] = useState(row ? String(row.amount) : "");
  const [date, setDate] = useState(row?.payment_date ?? isoDate(new Date()));
  const [method, setMethod] = useState(row?.method ?? "cash");
  const [note, setNote] = useState(row?.note ?? "");

  const create = useServerFn(createCollection);
  const update = useServerFn(updateIncomeEntry);

  const mut = useMutation({
    mutationFn: async () => {
      const amt = Number(amount);
      if (!customerId) throw new Error("গ্রাহক নির্বাচন করুন");
      if (!Number.isFinite(amt) || amt <= 0) throw new Error("টাকার পরিমাণ সঠিক নয়");
      if (editing) {
        return update({ data: { id: row!.id, customer_id: customerId, amount: amt, payment_date: date, method: method || null, note: note || null } });
      }
      return create({ data: { customer_id: customerId, contract_id: null, amount: amt, payment_date: date, method: method || null, note: note || null } });
    },
    onSuccess: () => {
      toast.success(editing ? "আয় হালনাগাদ হয়েছে" : "আয় যোগ হয়েছে");
      setOpen(false);
      if (!editing) { setCustomerId(""); setAmount(""); setNote(""); }
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {editing ? (
          <Button variant="ghost" size="icon" className="h-7 w-7"><Pencil className="h-3.5 w-3.5" /></Button>
        ) : (
          <Button size="sm" className="gap-1 bg-success text-success-foreground hover:bg-success/90"><Plus className="h-3.5 w-3.5" />আয় যোগ</Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? "আয় সম্পাদনা" : "নতুন নগদ আয় এন্ট্রি"}</DialogTitle>
          <DialogDescription>চুক্তি বহির্ভূত নগদ আয়।</DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); mut.mutate(); }} className="space-y-3">
          <div className="space-y-1">
            <Label>গ্রাহক *</Label>
            <Select value={customerId} onValueChange={setCustomerId}>
              <SelectTrigger><SelectValue placeholder="গ্রাহক নির্বাচন করুন" /></SelectTrigger>
              <SelectContent>
                {customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label>টাকা *</Label>
              <Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="০" />
            </div>
            <div className="space-y-1">
              <Label>তারিখ *</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>মাধ্যম</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {METHODS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>নোট</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={mut.isPending}>{editing ? "হালনাগাদ" : "সংরক্ষণ"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteDialog({ kind, id, label, onDone }: {
  kind: "income" | "expense"; id: string; label: string; onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const delExp = useServerFn(deleteExpenseWithPassword);
  const delInc = useServerFn(deleteIncomeWithPassword);

  const mut = useMutation({
    mutationFn: async () => {
      if (!password) throw new Error("এডমিন পাসওয়ার্ড দিন");
      const fn = kind === "expense" ? delExp : delInc;
      return fn({ data: { id, password } });
    },
    onSuccess: () => {
      toast.success("এন্ট্রি মুছে ফেলা হয়েছে");
      setOpen(false); setPassword("");
      onDone();
    },
    onError: (e: Error) => toast.error(e.message || "মুছে ফেলা যায়নি"),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setPassword(""); }}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Lock className="h-4 w-4 text-destructive" />এডমিন পাসওয়ার্ড দিন</DialogTitle>
          <DialogDescription>{label} — এন্ট্রি স্থায়ীভাবে মুছে যাবে। মূল এডমিনের পাসওয়ার্ড ছাড়া মুছে ফেলা যাবে না।</DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); mut.mutate(); }} className="space-y-3">
          <div className="space-y-1">
            <Label>পাসওয়ার্ড *</Label>
            <Input type="password" value={password} autoComplete="current-password"
              onChange={(e) => setPassword(e.target.value)} placeholder="এডমিন পাসওয়ার্ড" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>বাতিল</Button>
            <Button type="submit" variant="destructive" disabled={mut.isPending}>মুছুন</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function BookMarkCell({ initialPage, checked, lastPage, onSave }: {
  initialPage: number | null; checked: boolean; lastPage: number | null;
  onSave: (page: number | null, checked: boolean) => void;
}) {
  const [val, setVal] = useState(initialPage ? String(initialPage) : "");
  const shown = val || (!checked && lastPage ? String(lastPage) : "");
  const toggle = () => {
    if (checked) { onSave(val ? Number(val) : null, false); return; }
    const p = Number(shown);
    if (!p) { toast.error("আগে খাতার পৃষ্ঠা নম্বর লিখুন"); return; }
    setVal(String(p));
    onSave(p, true);
  };
  return (
    <div className="flex shrink-0 items-center gap-1">
      <Input
        inputMode="numeric"
        aria-label="খাতার পৃষ্ঠা"
        placeholder="পৃষ্ঠা"
        className="h-9 w-16 px-2 text-center"
        value={shown}
        onChange={(e) => setVal(e.target.value.replace(/[^0-9]/g, ""))}
      />
      <Button
        type="button"
        size="icon"
        aria-label="খাতায় তোলা হয়েছে"
        variant={checked ? "default" : "outline"}
        className={`h-9 w-9 ${checked ? "bg-success text-success-foreground hover:bg-success/90" : ""}`}
        onClick={toggle}
      >
        <Check className="h-5 w-5" />
      </Button>
    </div>
  );
}
