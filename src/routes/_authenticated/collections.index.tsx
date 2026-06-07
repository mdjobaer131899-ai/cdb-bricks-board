import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Wallet, Trash2, Banknote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { bn, bnDate } from "@/lib/format";
import { createCollection, deleteCollection } from "@/lib/collections.functions";
import { useCurrentUser } from "@/lib/use-current-user";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/collections/")({
  head: () => ({
    meta: [
      { title: "কালেকশন ব্যবস্থাপনা — CDB Bricks" },
      { name: "description", content: "গ্রাহক থেকে নেওয়া সব টাকার এন্ট্রি — চুক্তিযুক্ত ও সরাসরি ক্যাশ।" },
      { property: "og:title", content: "কালেকশন ব্যবস্থাপনা — CDB Bricks" },
    ],
    links: [{ rel: "canonical", href: "/collections" }],
  }),
  component: CollectionsPage,
});

type CollectionRow = {
  id: string;
  amount: number;
  payment_date: string;
  method: string | null;
  note: string | null;
  customer: { id: string; name: string } | null;
  contract: { id: string; contract_no: string } | null;
};

async function fetchCollections(): Promise<CollectionRow[]> {
  const { data, error } = await supabase
    .from("collections")
    .select("id, amount, payment_date, method, note, customer:customers(id, name), contract:contracts(id, contract_no)")
    .order("payment_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw error;
  return (data ?? []) as unknown as CollectionRow[];
}

type CashLedgerRow = {
  customer_id: string;
  customer_name: string;
  sales_total: number;
  collected_total: number;
  balance: number;
};

async function fetchCashLedger(): Promise<CashLedgerRow[]> {
  // Approved cash (non-contract) sales per customer
  const { data: sales, error: sErr } = await supabase
    .from("sales_entries")
    .select("customer_id, total_amount, customer:customers(id, name)")
    .eq("status", "approved")
    .is("contract_id", null)
    .limit(5000);
  if (sErr) throw sErr;

  // Non-contract collections per customer
  const { data: cols, error: cErr } = await supabase
    .from("collections")
    .select("customer_id, amount, customer:customers(id, name)")
    .is("contract_id", null)
    .limit(5000);
  if (cErr) throw cErr;

  const map = new Map<string, CashLedgerRow>();
  for (const r of (sales ?? []) as Array<{ customer_id: string; total_amount: number; customer: { id: string; name: string } | null }>) {
    const id = r.customer_id;
    const name = r.customer?.name ?? "—";
    const cur = map.get(id) ?? { customer_id: id, customer_name: name, sales_total: 0, collected_total: 0, balance: 0 };
    cur.sales_total += Number(r.total_amount) || 0;
    cur.customer_name = name;
    map.set(id, cur);
  }
  for (const r of (cols ?? []) as Array<{ customer_id: string; amount: number; customer: { id: string; name: string } | null }>) {
    const id = r.customer_id;
    const name = r.customer?.name ?? "—";
    const cur = map.get(id) ?? { customer_id: id, customer_name: name, sales_total: 0, collected_total: 0, balance: 0 };
    cur.collected_total += Number(r.amount) || 0;
    cur.customer_name = name;
    map.set(id, cur);
  }
  const rows = Array.from(map.values()).map((r) => ({ ...r, balance: r.sales_total - r.collected_total }));
  rows.sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));
  return rows;
}

async function fetchCustomers() {
  const { data, error } = await supabase.from("customers").select("id, name").order("name");
  if (error) throw error;
  return data ?? [];
}

async function fetchCustomerContracts(customerId: string) {
  const { data, error } = await supabase
    .from("contracts")
    .select("id, contract_no, contract_type, status")
    .eq("customer_id", customerId)
    .in("status", ["active"])
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

function CollectionsPage() {
  const { data: me } = useCurrentUser();
  const isAdmin = me?.role === "admin";
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["collections-list"], queryFn: fetchCollections });
  const ledger = useQuery({ queryKey: ["cash-ledger"], queryFn: fetchCashLedger });
  const [ledgerSearch, setLedgerSearch] = useState("");

  const ledgerRows = useMemo(() => {
    const rows = ledger.data ?? [];
    const q = ledgerSearch.trim().toLowerCase();
    const filtered = q ? rows.filter((r) => r.customer_name.toLowerCase().includes(q)) : rows;
    return filtered;
  }, [ledger.data, ledgerSearch]);

  const ledgerTotals = useMemo(() => {
    const rows = ledger.data ?? [];
    const sales = rows.reduce((a, r) => a + r.sales_total, 0);
    const collected = rows.reduce((a, r) => a + r.collected_total, 0);
    const due = rows.filter((r) => r.balance > 0).reduce((a, r) => a + r.balance, 0);
    const advance = rows.filter((r) => r.balance < 0).reduce((a, r) => a + Math.abs(r.balance), 0);
    return { sales, collected, due, advance };
  }, [ledger.data]);

  const totals = useMemo(() => {
    const rows = list.data ?? [];
    const today = new Date().toISOString().slice(0, 10);
    const monthStart = today.slice(0, 8) + "01";
    const todaySum = rows.filter((r) => r.payment_date === today).reduce((a, b) => a + Number(b.amount), 0);
    const monthSum = rows.filter((r) => r.payment_date >= monthStart).reduce((a, b) => a + Number(b.amount), 0);
    const totalSum = rows.reduce((a, b) => a + Number(b.amount), 0);
    return { todaySum, monthSum, totalSum, count: rows.length };
  }, [list.data]);

  const delFn = useServerFn(deleteCollection);
  const delMut = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["collections-list"] });
      qc.invalidateQueries({ queryKey: ["cash-ledger"] });
      qc.invalidateQueries({ queryKey: ["dashboard-due"] });
      qc.invalidateQueries({ queryKey: ["dashboard-trend"] });
      qc.invalidateQueries({ queryKey: ["dashboard-month"] });
      qc.invalidateQueries({ queryKey: ["dash", "today"] });
      toast.success("কালেকশন মুছে ফেলা হয়েছে");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight md:text-2xl">কালেকশন ব্যবস্থাপনা</h1>
          <p className="text-sm text-muted-foreground">গ্রাহক থেকে নেওয়া সব টাকার এন্ট্রি</p>
        </div>
        <AddCollectionDialog />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatMini label="আজকের কালেকশন" value={`৳ ${bn(totals.todaySum)}`} icon={Wallet} />
        <StatMini label="এ মাসের কালেকশন" value={`৳ ${bn(totals.monthSum)}`} icon={Banknote} />
        <StatMini label="মোট কালেকশন" value={`৳ ${bn(totals.totalSum)}`} icon={Banknote} />
        <StatMini label="মোট এন্ট্রি" value={bn(totals.count)} icon={Wallet} />
      </div>

      {/* Cash (non-contract) customer ledger */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="text-base">গ্রাহকের নগদ হিসাব</CardTitle>
            <p className="mt-0.5 text-xs text-muted-foreground">চুক্তি বহির্ভূত অনুমোদিত বিক্রয় − নেওয়া টাকা = বাকি / অতিরিক্ত</p>
          </div>
          <Input
            placeholder="গ্রাহক খুঁজুন..."
            value={ledgerSearch}
            onChange={(e) => setLedgerSearch(e.target.value)}
            className="h-8 w-40 md:w-56"
          />
        </CardHeader>
        <CardContent className="space-y-3 p-4 pt-0">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <MiniLedgerStat label="মোট নগদ বিক্রয়" value={`৳ ${bn(ledgerTotals.sales)}`} />
            <MiniLedgerStat label="মোট নেওয়া" value={`৳ ${bn(ledgerTotals.collected)}`} />
            <MiniLedgerStat label="মোট বাকি" value={`৳ ${bn(ledgerTotals.due)}`} tone="due" />
            <MiniLedgerStat label="মোট অতিরিক্ত" value={`৳ ${bn(ledgerTotals.advance)}`} tone="advance" />
          </div>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>গ্রাহক</TableHead>
                  <TableHead className="text-right">নগদ বিক্রয়</TableHead>
                  <TableHead className="text-right">নেওয়া টাকা</TableHead>
                  <TableHead className="text-right">অবস্থা</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ledger.isLoading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 4 }).map((__, j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : ledgerRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                      কোনো নগদ গ্রাহক হিসাব নেই
                    </TableCell>
                  </TableRow>
                ) : (
                  ledgerRows.map((r) => {
                    const bal = r.balance;
                    const status =
                      bal > 0
                        ? { label: `বাকি ৳ ${bn(bal)}`, cls: "bg-destructive/10 text-destructive border-destructive/30" }
                        : bal < 0
                        ? { label: `অতিরিক্ত ৳ ${bn(Math.abs(bal))}`, cls: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30" }
                        : { label: "পরিশোধিত", cls: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30" };
                    return (
                      <TableRow key={r.customer_id}>
                        <TableCell className="font-medium">{r.customer_name}</TableCell>
                        <TableCell className="text-right">৳ {bn(r.sales_total)}</TableCell>
                        <TableCell className="text-right">৳ {bn(r.collected_total)}</TableCell>
                        <TableCell className="text-right">
                          <Badge variant="outline" className={`text-[11px] ${status.cls}`}>{status.label}</Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>


      <Card>
        <CardHeader>
          <CardTitle className="text-base">কালেকশন তালিকা</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>তারিখ</TableHead>
                  <TableHead>গ্রাহক</TableHead>
                  <TableHead>চুক্তি</TableHead>
                  <TableHead className="text-right">টাকা</TableHead>
                  <TableHead className="hidden md:table-cell">মাধ্যম</TableHead>
                  <TableHead className="hidden md:table-cell">নোট</TableHead>
                  {isAdmin && <TableHead className="w-12" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: isAdmin ? 7 : 6 }).map((__, j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : (list.data ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={isAdmin ? 7 : 6} className="py-12 text-center text-sm text-muted-foreground">
                      <Wallet className="mx-auto mb-2 h-8 w-8 opacity-40" />
                      কোনো কালেকশন এন্ট্রি নেই
                    </TableCell>
                  </TableRow>
                ) : (
                  (list.data ?? []).map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{bnDate(r.payment_date)}</TableCell>
                      <TableCell className="font-medium">{r.customer?.name ?? "—"}</TableCell>
                      <TableCell>
                        {r.contract ? (
                          <Badge variant="outline" className="font-mono text-[10px]">{r.contract.contract_no}</Badge>
                        ) : (
                          <Badge variant="secondary" className="text-[10px]">সরাসরি ক্যাশ</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-semibold">৳ {bn(r.amount)}</TableCell>
                      <TableCell className="hidden md:table-cell text-xs">{r.method ?? "—"}</TableCell>
                      <TableCell className="hidden md:table-cell text-xs text-muted-foreground max-w-[220px] truncate">
                        {r.note ?? "—"}
                      </TableCell>
                      {isAdmin && (
                        <TableCell>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive">
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>কালেকশন মুছবেন?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  এই এন্ট্রি স্থায়ীভাবে মুছে যাবে। (চুক্তিযুক্ত হলে চুক্তির পেমেন্ট রেকর্ড আলাদা থাকে।)
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>বাতিল</AlertDialogCancel>
                                <AlertDialogAction onClick={() => delMut.mutate(r.id)}>মুছুন</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </TableCell>
                      )}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatMini({ label, value, icon: Icon }: { label: string; value: string; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <div className="text-[11px] text-muted-foreground">{label}</div>
          <div className="truncate text-base font-bold">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function MiniLedgerStat({ label, value, tone }: { label: string; value: string; tone?: "due" | "advance" }) {
  const toneCls =
    tone === "due"
      ? "text-destructive"
      : tone === "advance"
      ? "text-amber-600 dark:text-amber-400"
      : "text-foreground";
  return (
    <div className="rounded-md border bg-muted/30 p-2.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-sm font-bold ${toneCls}`}>{value}</div>
    </div>
  );
}

function AddCollectionDialog() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [customerId, setCustomerId] = useState<string>("");
  const [contractId, setContractId] = useState<string>("none");
  const [amount, setAmount] = useState<string>("");
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState<string>("cash");
  const [note, setNote] = useState<string>("");

  const customersQ = useQuery({ queryKey: ["customers-all"], queryFn: fetchCustomers, enabled: open });
  const contractsQ = useQuery({
    queryKey: ["customer-contracts", customerId],
    queryFn: () => fetchCustomerContracts(customerId),
    enabled: open && !!customerId,
  });

  const createFn = useServerFn(createCollection);
  const mut = useMutation({
    mutationFn: createFn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["collections-list"] });
      qc.invalidateQueries({ queryKey: ["cash-ledger"] });
      qc.invalidateQueries({ queryKey: ["dashboard-due"] });
      qc.invalidateQueries({ queryKey: ["dashboard-trend"] });
      qc.invalidateQueries({ queryKey: ["dashboard-month"] });
      qc.invalidateQueries({ queryKey: ["dash", "today"] });
      qc.invalidateQueries({ queryKey: ["contracts-all"] });
      toast.success("কালেকশন যোগ করা হয়েছে");
      setOpen(false);
      setCustomerId(""); setContractId("none"); setAmount(""); setNote(""); setMethod("cash");
      setDate(new Date().toISOString().slice(0, 10));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const submit = () => {
    const amt = Number(amount);
    if (!customerId) return toast.error("গ্রাহক নির্বাচন করুন");
    if (!Number.isFinite(amt) || amt <= 0) return toast.error("সঠিক পরিমাণ লিখুন");
    if (!date) return toast.error("তারিখ দিন");
    mut.mutate({
      data: {
        customer_id: customerId,
        contract_id: contractId !== "none" ? contractId : null,
        amount: amt,
        payment_date: date,
        method: method || null,
        note: note || null,
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus className="mr-2 h-4 w-4" /> নতুন কালেকশন</Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>নতুন কালেকশন</DialogTitle>
          <DialogDescription>গ্রাহক থেকে নেওয়া টাকার এন্ট্রি। চুক্তি থাকলে সিলেক্ট করুন।</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>গ্রাহক *</Label>
            <Select value={customerId} onValueChange={(v) => { setCustomerId(v); setContractId("none"); }}>
              <SelectTrigger><SelectValue placeholder="গ্রাহক বাছাই করুন" /></SelectTrigger>
              <SelectContent>
                {(customersQ.data ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>চুক্তি (ঐচ্ছিক)</Label>
            <Select value={contractId} onValueChange={setContractId} disabled={!customerId}>
              <SelectTrigger><SelectValue placeholder="চুক্তি ছাড়া / সরাসরি ক্যাশ" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— চুক্তি ছাড়া (সরাসরি ক্যাশ) —</SelectItem>
                {(contractsQ.data ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.contract_no}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              চুক্তি বাছাই করলে সেই চুক্তির পেমেন্ট লেজারেও যোগ হবে।
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>পরিমাণ (৳) *</Label>
              <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
            </div>
            <div className="space-y-1.5">
              <Label>তারিখ *</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>মাধ্যম</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">নগদ</SelectItem>
                <SelectItem value="bank">ব্যাংক</SelectItem>
                <SelectItem value="bkash">বিকাশ</SelectItem>
                <SelectItem value="nagad">নগদ (Nagad)</SelectItem>
                <SelectItem value="cheque">চেক</SelectItem>
                <SelectItem value="other">অন্যান্য</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>নোট</Label>
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="ঐচ্ছিক" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>বাতিল</Button>
          <Button onClick={submit} disabled={mut.isPending}>
            {mut.isPending ? "সংরক্ষণ হচ্ছে..." : "সংরক্ষণ করুন"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
