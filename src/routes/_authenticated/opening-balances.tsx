import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { History, Plus, Loader2, Pencil, Trash2, HandCoins, Users, Users2, Building2, Wallet, FileText } from "lucide-react";
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
import { bn, bnDate, todayBD } from "@/lib/format";
import { useCurrentUser } from "@/lib/use-current-user";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/opening-balances")({
  head: () => ({
    meta: [
      { title: "গত বছরের বকেয়া — CDB Bricks" },
      { name: "description", content: "গত হিসাব বছরের গ্রাহক ইট বাকি, সরদার/শ্রমিক পাওনা ও অন্যান্য বকেয়ার ওপেনিং ব্যালেন্স ও পরিশোধ ট্র্যাকিং।" },
      { property: "og:title", content: "গত বছরের বকেয়া — CDB Bricks" },
      { property: "og:description", content: "ওপেনিং ব্যালেন্স, পরিশোধ ও ব্যক্তি-ভিত্তিক বিস্তারিত স্টেটমেন্ট।" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: OpeningBalancesPage,
});

type Kind = "customer_brick_due" | "sardar_payable" | "other_payable";

const KIND_LABEL: Record<Kind, string> = {
  customer_brick_due: "গ্রাহক ইট বাকি",
  sardar_payable: "সরদার/শ্রমিক পাওনা",
  other_payable: "অন্যান্য বকেয়া",
};

const OTHER_CATEGORIES = ["বাড়ি ভাড়া", "মেকানিক", "বিদ্যুৎ বিল", "সরবরাহকারী", "ঋণ", "অন্যান্য"];
const SARDAR_CATEGORIES = ["সরদার", "শ্রমিক", "মিস্ত্রি", "অন্যান্য"];
const METHODS = ["নগদ", "ব্যাংক", "বিকাশ", "নগদ (মোবাইল)", "চেক"];

type Row = {
  id: string;
  kind: Kind;
  customer_id: string | null;
  sardar_id: string | null;
  worker_id: string | null;
  party_name: string | null;
  category: string | null;
  amount: number;
  fiscal_year: number;
  as_of_date: string;
  note: string | null;
  display_name: string | null;
  paid_amount: number;
  remaining_amount: number;
};

type Form = {
  id?: string;
  kind: Kind;
  customer_id: string;
  sardar_id: string;
  worker_id: string;
  party_name: string;
  category: string;
  amount: string;
  fiscal_year: string;
  as_of_date: string;
  note: string;
};

const emptyForm = (kind: Kind): Form => ({
  kind,
  customer_id: "",
  sardar_id: "",
  worker_id: "",
  party_name: "",
  category: kind === "other_payable" ? "অন্যান্য" : kind === "sardar_payable" ? "সরদার" : "",
  amount: "",
  fiscal_year: String(new Date().getFullYear() - 1),
  as_of_date: todayBD(),
  note: "",
});

function OpeningBalancesPage() {
  const qc = useQueryClient();
  const { data: me } = useCurrentUser();
  const isAdmin = me?.role === "admin";

  const [tab, setTab] = useState<Kind>("customer_brick_due");
  const [dialog, setDialog] = useState<{ open: boolean; mode: "new" | "edit"; form: Form }>({
    open: false,
    mode: "new",
    form: emptyForm("customer_brick_due"),
  });
  const [payDialog, setPayDialog] = useState<{ open: boolean; row: Row | null; amount: string; date: string; method: string; note: string }>({
    open: false,
    row: null,
    amount: "",
    date: todayBD(),
    method: "নগদ",
    note: "",
  });
  const [detail, setDetail] = useState<Row | null>(null);

  const rowsQ = useQuery({
    queryKey: ["opening-balances"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("opening_balance_summary")
        .select("*")
        .order("display_name", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        ...r,
        amount: Number(r.amount || 0),
        paid_amount: Number(r.paid_amount || 0),
        remaining_amount: Number(r.remaining_amount || 0),
      })) as Row[];
    },
  });

  const customersQ = useQuery({
    queryKey: ["customers-all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("id,name").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const sardarsQ = useQuery({
    queryKey: ["sardars-all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("sardars").select("id,name").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const workersQ = useQuery({
    queryKey: ["workers-all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("workers").select("id,name").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const paymentsQ = useQuery({
    queryKey: ["opening-payments", detail?.id],
    enabled: !!detail?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("opening_payments")
        .select("*")
        .eq("opening_balance_id", detail!.id)
        .order("payment_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  // এই ওপেনিং ব্যালেন্সের বিপরীতে দেওয়া চালান (ইট সমন্বয়)
  const linkedSalesQ = useQuery({
    queryKey: ["opening-linked-sales", detail?.id],
    enabled: !!detail?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_entries")
        .select("id, challan_no, sale_date, quantity, total_amount, status")
        .eq("opening_balance_id", detail!.id)
        .neq("status", "rejected")
        .order("sale_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const rows = rowsQ.data ?? [];

  const totals = useMemo(() => {
    const byKind = (k: Kind) => rows.filter((r) => r.kind === k);
    const s = (list: Row[], f: (r: Row) => number) => list.reduce((a, b) => a + f(b), 0);
    return {
      customer: s(byKind("customer_brick_due"), (r) => r.amount),
      sardar: s(byKind("sardar_payable"), (r) => r.amount),
      other: s(byKind("other_payable"), (r) => r.amount),
      total: s(rows, (r) => r.amount),
      paid: s(rows, (r) => r.paid_amount),
      remaining: s(rows, (r) => r.remaining_amount),
    };
  }, [rows]);

  const save = useMutation({
    mutationFn: async () => {
      const f = dialog.form;
      const amt = Number(f.amount);
      if (!(amt > 0)) throw new Error("পরিমাণ লিখুন");
      if (f.kind === "customer_brick_due" && !f.customer_id) throw new Error("গ্রাহক নির্বাচন করুন");
      if (f.kind === "sardar_payable" && !f.sardar_id && !f.worker_id && !f.party_name.trim())
        throw new Error("সরদার/শ্রমিক নির্বাচন করুন বা নাম লিখুন");
      if (f.kind === "other_payable" && !f.party_name.trim()) throw new Error("নাম লিখুন");

      const payload: any = {
        kind: f.kind,
        customer_id: f.kind === "customer_brick_due" ? f.customer_id : null,
        sardar_id: f.kind === "sardar_payable" && f.sardar_id ? f.sardar_id : null,
        worker_id: f.kind === "sardar_payable" && f.worker_id ? f.worker_id : null,
        party_name: f.party_name.trim() || null,
        category: f.category || null,
        amount: amt,
        fiscal_year: Number(f.fiscal_year) || new Date().getFullYear() - 1,
        as_of_date: f.as_of_date,
        note: f.note || null,
      };
      if (dialog.mode === "edit" && f.id) {
        const { error } = await supabase.from("opening_balances").update(payload).eq("id", f.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("opening_balances").insert({ ...payload, created_by: me?.user.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(dialog.mode === "edit" ? "আপডেট হয়েছে" : "ওপেনিং ব্যালেন্স যোগ হয়েছে");
      setDialog({ open: false, mode: "new", form: emptyForm(tab) });
      qc.invalidateQueries({ queryKey: ["opening-balances"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addPayment = useMutation({
    mutationFn: async () => {
      const row = payDialog.row!;
      const amt = Number(payDialog.amount);
      if (!(amt > 0)) throw new Error("পরিমাণ লিখুন");
      if (amt > row.remaining_amount + 0.001) throw new Error(`বাকি আছে মাত্র ৳ ${bn(row.remaining_amount)}`);
      const { error } = await supabase.from("opening_payments").insert({
        opening_balance_id: row.id,
        amount: amt,
        payment_date: payDialog.date,
        method: payDialog.method || null,
        note: payDialog.note || null,
        created_by: me?.user.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("সংরক্ষিত হয়েছে — এটি নতুন বছরের খরচ হিসেবে গণনা হবে না");
      setPayDialog({ open: false, row: null, amount: "", date: todayBD(), method: "নগদ", note: "" });
      qc.invalidateQueries({ queryKey: ["opening-balances"] });
      qc.invalidateQueries({ queryKey: ["opening-payments"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeRow = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("opening_balances").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("মুছে ফেলা হয়েছে");
      qc.invalidateQueries({ queryKey: ["opening-balances"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removePayment = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("opening_payments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("পেমেন্ট মুছে ফেলা হয়েছে");
      qc.invalidateQueries({ queryKey: ["opening-balances"] });
      qc.invalidateQueries({ queryKey: ["opening-payments"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openNew = (kind: Kind) => setDialog({ open: true, mode: "new", form: emptyForm(kind) });
  const openEdit = (r: Row) =>
    setDialog({
      open: true,
      mode: "edit",
      form: {
        id: r.id,
        kind: r.kind,
        customer_id: r.customer_id ?? "",
        sardar_id: r.sardar_id ?? "",
        worker_id: r.worker_id ?? "",
        party_name: r.party_name ?? "",
        category: r.category ?? "",
        amount: String(r.amount),
        fiscal_year: String(r.fiscal_year),
        as_of_date: r.as_of_date,
        note: r.note ?? "",
      },
    });

  const list = rows.filter((r) => r.kind === tab);
  const f = dialog.form;

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <History className="h-5 w-5 text-primary" />
          <h1 className="text-2xl font-bold">গত বছরের বকেয়া (ওপেনিং ব্যালেন্স)</h1>
        </div>
        <Button onClick={() => openNew(tab)}>
          <Plus className="mr-1 h-4 w-4" /> নতুন এন্ট্রি
        </Button>
      </div>

      <p className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-xs text-muted-foreground">
        নিয়ম: গত বছরের বকেয়া পরিশোধ করলে সেটি নতুন বছরের খরচ হিসেবে গণনা হয় না — শুধু এখানের বকেয়া কমে ও নগদ/ব্যাংক কমে।
        গ্রাহকের গত বছরের অগ্রিমের ক্ষেত্রে টাকা ফেরত নয়, ইট সরবরাহ করলেই তার ইট-বাকি সমন্বয় হবে।
      </p>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Summary label="গ্রাহক ইট বাকি" value={totals.customer} icon={Users} tone="info" />
        <Summary label="সরদার/শ্রমিক পাওনা" value={totals.sardar} icon={Users2} tone="warning" />
        <Summary label="অন্যান্য বকেয়া" value={totals.other} icon={Building2} tone="warning" />
        <Summary label="মোট গত বছরের দায়" value={totals.total} icon={Wallet} tone="primary" />
        <Summary label="পরিশোধ হয়েছে" value={totals.paid} icon={HandCoins} tone="success" />
        <Summary label="এখনো বাকি" value={totals.remaining} icon={FileText} tone="destructive" />
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as Kind)}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="customer_brick_due">গ্রাহক ইট বাকি</TabsTrigger>
          <TabsTrigger value="sardar_payable">সরদার/শ্রমিক</TabsTrigger>
          <TabsTrigger value="other_payable">অন্যান্য</TabsTrigger>
        </TabsList>

        {(["customer_brick_due", "sardar_payable", "other_payable"] as Kind[]).map((k) => (
          <TabsContent key={k} value={k}>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{KIND_LABEL[k]}</CardTitle>
              </CardHeader>
              <CardContent>
                {rowsQ.isLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>নাম</TableHead>
                          <TableHead>{k === "customer_brick_due" ? "বছর" : "ক্যাটেগরি"}</TableHead>
                          <TableHead className="text-right">{k === "customer_brick_due" ? "গত বছরের অগ্রিম" : "ওপেনিং"}</TableHead>
                          <TableHead className="text-right">{k === "customer_brick_due" ? "সমন্বয় হয়েছে" : "পরিশোধ"}</TableHead>
                          <TableHead className="text-right">{k === "customer_brick_due" ? "ইট দেওয়া বাকি" : "বাকি"}</TableHead>
                          <TableHead className="text-right">অ্যাকশন</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {list.map((r) => (
                          <TableRow key={r.id}>
                            <TableCell>
                              <button className="font-medium text-primary hover:underline" onClick={() => setDetail(r)}>
                                {r.display_name || "—"}
                              </button>
                              {r.note && <div className="text-[11px] text-muted-foreground">{r.note}</div>}
                            </TableCell>
                            <TableCell>
                              {k === "customer_brick_due" ? (
                                <Badge variant="outline">{bn(r.fiscal_year)}</Badge>
                              ) : (
                                <Badge variant="secondary">{r.category || "—"}</Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-right">৳ {bn(r.amount)}</TableCell>
                            <TableCell className="text-right text-emerald-600">৳ {bn(r.paid_amount)}</TableCell>
                            <TableCell className={`text-right font-semibold ${r.remaining_amount > 0 ? "text-destructive" : "text-emerald-600"}`}>
                              ৳ {bn(r.remaining_amount)}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={r.remaining_amount <= 0}
                                  onClick={() =>
                                    setPayDialog({
                                      open: true,
                                      row: r,
                                      amount: "",
                                      date: todayBD(),
                                      method: r.kind === "customer_brick_due" ? "ইট সরবরাহ" : "নগদ",
                                      note: "",
                                    })
                                  }
                                >
                                  {r.kind === "customer_brick_due" ? "ইট সমন্বয়" : "পরিশোধ"}
                                </Button>
                                {isAdmin && (
                                  <>
                                    <Button size="icon" variant="ghost" onClick={() => openEdit(r)}>
                                      <Pencil className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      onClick={() => {
                                        if (confirm("এই এন্ট্রি ও এর সব পরিশোধ মুছে যাবে?")) removeRow.mutate(r.id);
                                      }}
                                    >
                                      <Trash2 className="h-4 w-4 text-destructive" />
                                    </Button>
                                  </>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                        {list.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center text-muted-foreground">
                              কোনো এন্ট্রি নেই
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>

      {/* নতুন / সম্পাদনা */}
      <Dialog open={dialog.open} onOpenChange={(o) => setDialog((d) => ({ ...d, open: o }))}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{dialog.mode === "edit" ? "সম্পাদনা" : "নতুন ওপেনিং ব্যালেন্স"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>ধরন</Label>
              <Select
                value={f.kind}
                onValueChange={(v) => setDialog((d) => ({ ...d, form: { ...emptyForm(v as Kind), id: d.form.id } }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
                    <SelectItem key={k} value={k}>{KIND_LABEL[k]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {f.kind === "customer_brick_due" && (
              <div>
                <Label>গ্রাহক</Label>
                <Select value={f.customer_id} onValueChange={(v) => setDialog((d) => ({ ...d, form: { ...d.form, customer_id: v } }))}>
                  <SelectTrigger><SelectValue placeholder="নির্বাচন করুন" /></SelectTrigger>
                  <SelectContent>
                    {(customersQ.data ?? []).map((c: any) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {f.kind === "sardar_payable" && (
              <>
                <div>
                  <Label>ক্যাটেগরি</Label>
                  <Select value={f.category} onValueChange={(v) => setDialog((d) => ({ ...d, form: { ...d.form, category: v } }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SARDAR_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>সরদার (ঐচ্ছিক)</Label>
                  <Select value={f.sardar_id} onValueChange={(v) => setDialog((d) => ({ ...d, form: { ...d.form, sardar_id: v, worker_id: "" } }))}>
                    <SelectTrigger><SelectValue placeholder="নির্বাচন করুন" /></SelectTrigger>
                    <SelectContent>
                      {(sardarsQ.data ?? []).map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>শ্রমিক (ঐচ্ছিক)</Label>
                  <Select value={f.worker_id} onValueChange={(v) => setDialog((d) => ({ ...d, form: { ...d.form, worker_id: v, sardar_id: "" } }))}>
                    <SelectTrigger><SelectValue placeholder="নির্বাচন করুন" /></SelectTrigger>
                    <SelectContent>
                      {(workersQ.data ?? []).map((w: any) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>অথবা নাম লিখুন</Label>
                  <Input value={f.party_name} onChange={(e) => setDialog((d) => ({ ...d, form: { ...d.form, party_name: e.target.value } }))} />
                </div>
              </>
            )}

            {f.kind === "other_payable" && (
              <>
                <div>
                  <Label>ক্যাটেগরি</Label>
                  <Select value={f.category} onValueChange={(v) => setDialog((d) => ({ ...d, form: { ...d.form, category: v } }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {OTHER_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>ব্যক্তি/প্রতিষ্ঠানের নাম</Label>
                  <Input value={f.party_name} onChange={(e) => setDialog((d) => ({ ...d, form: { ...d.form, party_name: e.target.value } }))} />
                </div>
              </>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{f.kind === "customer_brick_due" ? "গত বছরের অগ্রিম (৳)" : "ওপেনিং পরিমাণ (৳)"}</Label>
                <Input
                  type="number"
                  inputMode="decimal"
                  value={f.amount}
                  onChange={(e) => setDialog((d) => ({ ...d, form: { ...d.form, amount: e.target.value } }))}
                />
              </div>
              <div>
                <Label>হিসাব বছর</Label>
                <Input
                  type="number"
                  value={f.fiscal_year}
                  onChange={(e) => setDialog((d) => ({ ...d, form: { ...d.form, fiscal_year: e.target.value } }))}
                />
              </div>
            </div>

            <div>
              <Label>তারিখ</Label>
              <Input type="date" value={f.as_of_date} onChange={(e) => setDialog((d) => ({ ...d, form: { ...d.form, as_of_date: e.target.value } }))} />
            </div>
            <div>
              <Label>নোট</Label>
              <Textarea value={f.note} onChange={(e) => setDialog((d) => ({ ...d, form: { ...d.form, note: e.target.value } }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog((d) => ({ ...d, open: false }))}>বাতিল</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} সংরক্ষণ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* পরিশোধ / সমন্বয় */}
      <Dialog open={payDialog.open} onOpenChange={(o) => setPayDialog((p) => ({ ...p, open: o }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {payDialog.row?.kind === "customer_brick_due" ? "ইট সরবরাহ সমন্বয়" : "বকেয়া পরিশোধ"} — {payDialog.row?.display_name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-md bg-muted p-2 text-xs text-muted-foreground">
              বাকি: ৳ {bn(payDialog.row?.remaining_amount ?? 0)}
              {payDialog.row?.kind !== "customer_brick_due" && " • এটি নতুন বছরের খরচে যোগ হবে না"}
            </div>
            <div>
              <Label>পরিমাণ (৳)</Label>
              <Input type="number" inputMode="decimal" value={payDialog.amount} onChange={(e) => setPayDialog((p) => ({ ...p, amount: e.target.value }))} />
            </div>
            <div>
              <Label>তারিখ</Label>
              <Input type="date" value={payDialog.date} onChange={(e) => setPayDialog((p) => ({ ...p, date: e.target.value }))} />
            </div>
            <div>
              <Label>মাধ্যম</Label>
              <Select value={payDialog.method} onValueChange={(v) => setPayDialog((p) => ({ ...p, method: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(payDialog.row?.kind === "customer_brick_due" ? ["ইট সরবরাহ", ...METHODS] : METHODS).map((m) => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>নোট</Label>
              <Textarea value={payDialog.note} onChange={(e) => setPayDialog((p) => ({ ...p, note: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayDialog((p) => ({ ...p, open: false }))}>বাতিল</Button>
            <Button onClick={() => addPayment.mutate()} disabled={addPayment.isPending}>
              {addPayment.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} সংরক্ষণ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* বিস্তারিত স্টেটমেন্ট */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{detail?.display_name} — বিস্তারিত</DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2 text-center text-sm">
                <div className="rounded-lg border p-2">
                  <div className="text-[11px] text-muted-foreground">ওপেনিং</div>
                  <div className="font-bold">৳ {bn(detail.amount)}</div>
                </div>
                <div className="rounded-lg border p-2">
                  <div className="text-[11px] text-muted-foreground">{detail.kind === "customer_brick_due" ? "সমন্বয়" : "পরিশোধ"}</div>
                  <div className="font-bold text-emerald-600">৳ {bn(detail.paid_amount)}</div>
                </div>
                <div className="rounded-lg border p-2">
                  <div className="text-[11px] text-muted-foreground">বাকি</div>
                  <div className="font-bold text-destructive">৳ {bn(detail.remaining_amount)}</div>
                </div>
              </div>
              <div className="text-xs text-muted-foreground">
                {KIND_LABEL[detail.kind]} • হিসাব বছর {bn(detail.fiscal_year)} • {bnDate(detail.as_of_date)}
                {detail.category ? ` • ${detail.category}` : ""}
              </div>
              {detail.note && <div className="rounded-md bg-muted p-2 text-sm">{detail.note}</div>}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>তারিখ</TableHead>
                    <TableHead>মাধ্যম</TableHead>
                    <TableHead className="text-right">পরিমাণ</TableHead>
                    {isAdmin && <TableHead />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(paymentsQ.data ?? []).map((p: any) => (
                    <TableRow key={p.id}>
                      <TableCell>{bnDate(p.payment_date)}</TableCell>
                      <TableCell>
                        {p.method || "—"}
                        {p.note && <div className="text-[11px] text-muted-foreground">{p.note}</div>}
                      </TableCell>
                      <TableCell className="text-right">৳ {bn(Number(p.amount))}</TableCell>
                      {isAdmin && (
                        <TableCell className="text-right">
                          <Button size="icon" variant="ghost" onClick={() => removePayment.mutate(p.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                  {!paymentsQ.isLoading && (paymentsQ.data ?? []).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={isAdmin ? 4 : 3} className="text-center text-muted-foreground">
                        কোনো পরিশোধ নেই
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>

              {detail.kind === "customer_brick_due" && (
                <div className="space-y-1">
                  <div className="text-sm font-semibold">সংযুক্ত চালান (ইট সমন্বয়)</div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>তারিখ</TableHead>
                        <TableHead>চালান</TableHead>
                        <TableHead className="text-right">পরিমাণ</TableHead>
                        <TableHead className="text-right">টাকা</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(linkedSalesQ.data ?? []).map((s: any) => (
                        <TableRow key={s.id}>
                          <TableCell>{bnDate(s.sale_date)}</TableCell>
                          <TableCell>
                            {s.challan_no}
                            {s.status === "pending" && <span className="ml-1 text-[11px] text-warning">(অনুমোদন বাকি)</span>}
                          </TableCell>
                          <TableCell className="text-right">{bn(Number(s.quantity))}</TableCell>
                          <TableCell className="text-right">৳ {bn(Number(s.total_amount))}</TableCell>
                        </TableRow>
                      ))}
                      {!linkedSalesQ.isLoading && (linkedSalesQ.data ?? []).length === 0 && (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center text-muted-foreground">
                            কোনো চালান সংযুক্ত নেই
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Summary({ label, value, icon: Icon, tone }: { label: string; value: number; icon: any; tone: string }) {
  const toneClass =
    tone === "success" ? "text-emerald-600" :
    tone === "destructive" ? "text-destructive" :
    tone === "warning" ? "text-warning" :
    tone === "info" ? "text-info" : "text-primary";
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-3">
        <div className={`flex h-9 w-9 items-center justify-center rounded-lg bg-muted ${toneClass}`}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <div className="truncate text-[11px] text-muted-foreground">{label}</div>
          <div className={`text-base font-bold ${toneClass}`}>৳ {bn(value)}</div>
        </div>
      </CardContent>
    </Card>
  );
}
