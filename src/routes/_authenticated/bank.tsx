import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Landmark, Loader2, Pencil, Trash2, ArrowLeftRight } from "lucide-react";
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
import { sdb } from "@/lib/season-db";
import { bn, bnDate, isoDate } from "@/lib/format";
import { useCurrentUser } from "@/lib/use-current-user";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/bank")({
  head: () => ({
    meta: [
      { title: "ব্যাংক ও ট্রান্সফার — CDB Bricks" },
      { name: "description", content: "ব্যাংক অ্যাকাউন্ট, জমা-উত্তোলন ও ক্যাশ-ব্যাংক ট্রান্সফারের হিসাব।" },
      { property: "og:title", content: "ব্যাংক ও ট্রান্সফার — CDB Bricks" },
      { property: "og:description", content: "ব্যাংক অ্যাকাউন্ট, জমা-উত্তোলন ও ট্রান্সফারের হিসাব।" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BankPage,
});

const NONE = "__none__";

type AcctForm = { id?: string; bank_name: string; account_name: string; account_no: string; branch: string; opening_balance: string; note: string };
const emptyAcct: AcctForm = { bank_name: "", account_name: "", account_no: "", branch: "", opening_balance: "", note: "" };

type TxnForm = { id?: string; bank_account_id: string; txn_date: string; direction: string; amount: string; method: string; note: string };
const emptyTxn = (): TxnForm => ({ bank_account_id: "", txn_date: isoDate(new Date()), direction: "in", amount: "", method: "", note: "" });

type TfForm = { id?: string; transfer_date: string; from_type: string; from_bank_id: string; to_type: string; to_bank_id: string; amount: string; note: string };
const emptyTf = (): TfForm => ({ transfer_date: isoDate(new Date()), from_type: "cash", from_bank_id: NONE, to_type: "bank", to_bank_id: NONE, amount: "", note: "" });

function BankPage() {
  const qc = useQueryClient();
  const { data: me } = useCurrentUser();
  const isAdmin = me?.role === "admin";
  const [aDlg, setADlg] = useState<{ open: boolean; mode: "new" | "edit"; form: AcctForm }>({ open: false, mode: "new", form: emptyAcct });
  const [tDlg, setTDlg] = useState<{ open: boolean; mode: "new" | "edit"; form: TxnForm }>({ open: false, mode: "new", form: emptyTxn() });
  const [fDlg, setFDlg] = useState<{ open: boolean; form: TfForm }>({ open: false, form: emptyTf() });

  const acctsQ = useQuery({
    queryKey: ["bank-accounts"],
    queryFn: async () => {
      const { data, error } = await sdb.from("bank_accounts").select("*").order("bank_name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const txnsQ = useQuery({
    queryKey: ["bank-transactions"],
    queryFn: async () => {
      const { data, error } = await sdb.from("bank_transactions").select("*").order("txn_date", { ascending: false }).limit(300);
      if (error) throw error;
      return data ?? [];
    },
  });

  const tfQ = useQuery({
    queryKey: ["transfers"],
    queryFn: async () => {
      const { data, error } = await sdb.from("transfers").select("*").order("transfer_date", { ascending: false }).limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  const balances = useMemo(() => {
    const m = new Map<string, number>();
    (acctsQ.data ?? []).forEach((a: any) => m.set(a.id, Number(a.opening_balance || 0)));
    (txnsQ.data ?? []).forEach((t: any) => {
      const cur = m.get(t.bank_account_id) ?? 0;
      m.set(t.bank_account_id, cur + (t.direction === "in" ? 1 : -1) * Number(t.amount || 0));
    });
    (tfQ.data ?? []).forEach((t: any) => {
      if (t.from_type === "bank" && t.from_bank_id) m.set(t.from_bank_id, (m.get(t.from_bank_id) ?? 0) - Number(t.amount || 0));
      if (t.to_type === "bank" && t.to_bank_id) m.set(t.to_bank_id, (m.get(t.to_bank_id) ?? 0) + Number(t.amount || 0));
    });
    return m;
  }, [acctsQ.data, txnsQ.data, tfQ.data]);

  const acctName = (id: string | null) => (id ? (acctsQ.data ?? []).find((a: any) => a.id === id)?.bank_name ?? "—" : "ক্যাশ");

  const saveAcct = useMutation({
    mutationFn: async () => {
      const f = aDlg.form;
      if (!f.bank_name.trim()) throw new Error("ব্যাংকের নাম দিন");
      const payload = {
        bank_name: f.bank_name.trim(),
        account_name: f.account_name || null,
        account_no: f.account_no || null,
        branch: f.branch || null,
        opening_balance: Number(f.opening_balance || 0),
        note: f.note || null,
      };
      if (aDlg.mode === "edit" && f.id) {
        const { error } = await sdb.from("bank_accounts").update(payload).eq("id", f.id);
        if (error) throw error;
      } else {
        const { error } = await sdb.from("bank_accounts").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("সংরক্ষিত");
      setADlg({ open: false, mode: "new", form: emptyAcct });
      qc.invalidateQueries({ queryKey: ["bank-accounts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delAcct = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sdb.from("bank_accounts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("মুছে ফেলা হয়েছে"); qc.invalidateQueries({ queryKey: ["bank-accounts"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveTxn = useMutation({
    mutationFn: async () => {
      const f = tDlg.form;
      if (!f.bank_account_id) throw new Error("অ্যাকাউন্ট নির্বাচন করুন");
      const amt = Number(f.amount || 0);
      if (!(amt > 0)) throw new Error("পরিমাণ দিন");
      const payload = {
        bank_account_id: f.bank_account_id,
        txn_date: f.txn_date,
        direction: f.direction,
        amount: amt,
        method: f.method || null,
        note: f.note || null,
      };
      if (tDlg.mode === "edit" && f.id) {
        const { error } = await sdb.from("bank_transactions").update(payload).eq("id", f.id);
        if (error) throw error;
      } else {
        if (!me?.user.id) throw new Error("লগইন প্রয়োজন");
        const { error } = await sdb.from("bank_transactions").insert({ ...payload, created_by: me.user.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("সংরক্ষিত");
      setTDlg({ open: false, mode: "new", form: emptyTxn() });
      qc.invalidateQueries({ queryKey: ["bank-transactions"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delTxn = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sdb.from("bank_transactions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("মুছে ফেলা হয়েছে"); qc.invalidateQueries({ queryKey: ["bank-transactions"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveTf = useMutation({
    mutationFn: async () => {
      const f = fDlg.form;
      const amt = Number(f.amount || 0);
      if (!(amt > 0)) throw new Error("পরিমাণ দিন");
      if (f.from_type === "bank" && f.from_bank_id === NONE) throw new Error("যে ব্যাংক থেকে, তা নির্বাচন করুন");
      if (f.to_type === "bank" && f.to_bank_id === NONE) throw new Error("যে ব্যাংকে, তা নির্বাচন করুন");
      if (!me?.user.id) throw new Error("লগইন প্রয়োজন");
      const { error } = await sdb.from("transfers").insert({
        transfer_date: f.transfer_date,
        from_type: f.from_type,
        from_bank_id: f.from_type === "bank" ? f.from_bank_id : null,
        to_type: f.to_type,
        to_bank_id: f.to_type === "bank" ? f.to_bank_id : null,
        amount: amt,
        note: f.note || null,
        created_by: me.user.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("ট্রান্সফার সংরক্ষিত");
      setFDlg({ open: false, form: emptyTf() });
      qc.invalidateQueries({ queryKey: ["transfers"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delTf = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sdb.from("transfers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("মুছে ফেলা হয়েছে"); qc.invalidateQueries({ queryKey: ["transfers"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const tf = fDlg.form;
  const tx = tDlg.form;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold md:text-2xl"><Landmark className="h-6 w-6 text-primary" /> ব্যাংক ও ট্রান্সফার</h1>
          <p className="text-sm text-muted-foreground">ব্যাংক অ্যাকাউন্ট, জমা-উত্তোলন ও ক্যাশ-ব্যাংক ট্রান্সফার</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setFDlg({ open: true, form: emptyTf() })}><ArrowLeftRight className="mr-1 h-4 w-4" /> ট্রান্সফার</Button>
          <Button variant="outline" onClick={() => setTDlg({ open: true, mode: "new", form: emptyTxn() })}><Plus className="mr-1 h-4 w-4" /> লেনদেন</Button>
          {isAdmin && <Button onClick={() => setADlg({ open: true, mode: "new", form: emptyAcct })}><Plus className="mr-1 h-4 w-4" /> অ্যাকাউন্ট</Button>}
        </div>
      </div>

      <Tabs defaultValue="accounts">
        <TabsList>
          <TabsTrigger value="accounts">অ্যাকাউন্ট</TabsTrigger>
          <TabsTrigger value="txns">লেনদেন</TabsTrigger>
          <TabsTrigger value="transfers">ট্রান্সফার</TabsTrigger>
        </TabsList>

        <TabsContent value="accounts">
          <Card>
            <CardHeader><CardTitle className="text-base">ব্যাংক অ্যাকাউন্ট</CardTitle></CardHeader>
            <CardContent className="p-0">
              {acctsQ.isLoading ? (
                <div className="flex h-24 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>
              ) : (acctsQ.data ?? []).length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">কোনো অ্যাকাউন্ট নেই</div>
              ) : (
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>ব্যাংক</TableHead>
                    <TableHead>হিসাব নম্বর</TableHead>
                    <TableHead>শাখা</TableHead>
                    <TableHead className="text-right">ব্যালেন্স</TableHead>
                    <TableHead></TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {(acctsQ.data ?? []).map((a: any) => (
                      <TableRow key={a.id} className={a.is_active ? "" : "opacity-60"}>
                        <TableCell>
                          <div className="font-medium">{a.bank_name}</div>
                          <div className="text-xs text-muted-foreground">{a.account_name || "—"}</div>
                        </TableCell>
                        <TableCell>{a.account_no || "—"}</TableCell>
                        <TableCell>{a.branch || "—"}</TableCell>
                        <TableCell className="text-right font-medium tabular-nums">৳ {bn(balances.get(a.id) ?? 0)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button size="sm" variant="outline" onClick={() => setTDlg({ open: true, mode: "new", form: { ...emptyTxn(), bank_account_id: a.id } })}>লেনদেন</Button>
                            {isAdmin && (
                              <Button size="sm" variant="ghost" onClick={() => setADlg({
                                open: true, mode: "edit",
                                form: {
                                  id: a.id, bank_name: a.bank_name, account_name: a.account_name ?? "",
                                  account_no: a.account_no ?? "", branch: a.branch ?? "",
                                  opening_balance: String(a.opening_balance), note: a.note ?? "",
                                },
                              })}><Pencil className="h-3.5 w-3.5" /></Button>
                            )}
                            {isAdmin && (
                              <Button size="sm" variant="ghost" onClick={() => { if (confirm(`"${a.bank_name}" মুছে ফেলবেন?`)) delAcct.mutate(a.id); }}>
                                <Trash2 className="h-3.5 w-3.5 text-destructive" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="txns">
          <Card>
            <CardHeader><CardTitle className="text-base">জমা ও উত্তোলন</CardTitle></CardHeader>
            <CardContent className="p-0">
              {(txnsQ.data ?? []).length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">কোনো লেনদেন নেই</div>
              ) : (
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>তারিখ</TableHead>
                    <TableHead>ব্যাংক</TableHead>
                    <TableHead>ধরন</TableHead>
                    <TableHead>মাধ্যম</TableHead>
                    <TableHead className="text-right">টাকা</TableHead>
                    <TableHead></TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {(txnsQ.data ?? []).map((t: any) => (
                      <TableRow key={t.id}>
                        <TableCell className="whitespace-nowrap">{bnDate(t.txn_date)}</TableCell>
                        <TableCell>{acctName(t.bank_account_id)}</TableCell>
                        <TableCell><Badge variant={t.direction === "in" ? "default" : "outline"}>{t.direction === "in" ? "জমা" : "উত্তোলন"}</Badge></TableCell>
                        <TableCell>{t.method || "—"}</TableCell>
                        <TableCell className="text-right font-medium tabular-nums">৳ {bn(t.amount)}</TableCell>
                        <TableCell className="text-right">
                          {isAdmin && (
                            <div className="flex justify-end gap-1">
                              <Button size="sm" variant="ghost" onClick={() => setTDlg({
                                open: true, mode: "edit",
                                form: {
                                  id: t.id, bank_account_id: t.bank_account_id, txn_date: t.txn_date,
                                  direction: t.direction, amount: String(t.amount), method: t.method ?? "", note: t.note ?? "",
                                },
                              })}><Pencil className="h-3.5 w-3.5" /></Button>
                              <Button size="sm" variant="ghost" onClick={() => { if (confirm("মুছে ফেলবেন?")) delTxn.mutate(t.id); }}>
                                <Trash2 className="h-3.5 w-3.5 text-destructive" />
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="transfers">
          <Card>
            <CardHeader><CardTitle className="text-base">ট্রান্সফার</CardTitle></CardHeader>
            <CardContent className="p-0">
              {(tfQ.data ?? []).length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">কোনো ট্রান্সফার নেই</div>
              ) : (
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>তারিখ</TableHead>
                    <TableHead>থেকে</TableHead>
                    <TableHead>তে</TableHead>
                    <TableHead className="text-right">টাকা</TableHead>
                    <TableHead></TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {(tfQ.data ?? []).map((t: any) => (
                      <TableRow key={t.id}>
                        <TableCell className="whitespace-nowrap">{bnDate(t.transfer_date)}</TableCell>
                        <TableCell>{t.from_type === "cash" ? "ক্যাশ" : acctName(t.from_bank_id)}</TableCell>
                        <TableCell>{t.to_type === "cash" ? "ক্যাশ" : acctName(t.to_bank_id)}</TableCell>
                        <TableCell className="text-right font-medium tabular-nums">৳ {bn(t.amount)}</TableCell>
                        <TableCell className="text-right">
                          {isAdmin && (
                            <Button size="sm" variant="ghost" onClick={() => { if (confirm("মুছে ফেলবেন?")) delTf.mutate(t.id); }}>
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Account dialog */}
      <Dialog open={aDlg.open} onOpenChange={(o) => setADlg((s) => ({ ...s, open: o }))}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{aDlg.mode === "edit" ? "অ্যাকাউন্ট সম্পাদনা" : "নতুন ব্যাংক অ্যাকাউন্ট"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>ব্যাংকের নাম</Label><Input value={aDlg.form.bank_name} onChange={(e) => setADlg((s) => ({ ...s, form: { ...s.form, bank_name: e.target.value } }))} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>হিসাবের নাম</Label><Input value={aDlg.form.account_name} onChange={(e) => setADlg((s) => ({ ...s, form: { ...s.form, account_name: e.target.value } }))} /></div>
              <div><Label>হিসাব নম্বর</Label><Input value={aDlg.form.account_no} onChange={(e) => setADlg((s) => ({ ...s, form: { ...s.form, account_no: e.target.value } }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>শাখা</Label><Input value={aDlg.form.branch} onChange={(e) => setADlg((s) => ({ ...s, form: { ...s.form, branch: e.target.value } }))} /></div>
              <div><Label>প্রারম্ভিক ব্যালেন্স</Label><Input type="number" value={aDlg.form.opening_balance} onChange={(e) => setADlg((s) => ({ ...s, form: { ...s.form, opening_balance: e.target.value } }))} /></div>
            </div>
            <div><Label>নোট</Label><Textarea rows={2} value={aDlg.form.note} onChange={(e) => setADlg((s) => ({ ...s, form: { ...s.form, note: e.target.value } }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setADlg((s) => ({ ...s, open: false }))}>বাতিল</Button>
            <Button onClick={() => saveAcct.mutate()} disabled={saveAcct.isPending}>সংরক্ষণ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Txn dialog */}
      <Dialog open={tDlg.open} onOpenChange={(o) => setTDlg((s) => ({ ...s, open: o }))}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{tDlg.mode === "edit" ? "লেনদেন সম্পাদনা" : "নতুন লেনদেন"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>ব্যাংক অ্যাকাউন্ট</Label>
              <Select value={tx.bank_account_id} onValueChange={(v) => setTDlg((s) => ({ ...s, form: { ...s.form, bank_account_id: v } }))}>
                <SelectTrigger><SelectValue placeholder="নির্বাচন করুন" /></SelectTrigger>
                <SelectContent>{(acctsQ.data ?? []).map((a: any) => <SelectItem key={a.id} value={a.id}>{a.bank_name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>ধরন</Label>
                <Select value={tx.direction} onValueChange={(v) => setTDlg((s) => ({ ...s, form: { ...s.form, direction: v } }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="in">জমা</SelectItem>
                    <SelectItem value="out">উত্তোলন</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>তারিখ</Label><Input type="date" value={tx.txn_date} onChange={(e) => setTDlg((s) => ({ ...s, form: { ...s.form, txn_date: e.target.value } }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>টাকা (৳)</Label><Input type="number" value={tx.amount} onChange={(e) => setTDlg((s) => ({ ...s, form: { ...s.form, amount: e.target.value } }))} /></div>
              <div><Label>মাধ্যম</Label><Input value={tx.method} onChange={(e) => setTDlg((s) => ({ ...s, form: { ...s.form, method: e.target.value } }))} placeholder="চেক / নগদ" /></div>
            </div>
            <div><Label>নোট</Label><Input value={tx.note} onChange={(e) => setTDlg((s) => ({ ...s, form: { ...s.form, note: e.target.value } }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTDlg((s) => ({ ...s, open: false }))}>বাতিল</Button>
            <Button onClick={() => saveTxn.mutate()} disabled={saveTxn.isPending}>সংরক্ষণ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Transfer dialog */}
      <Dialog open={fDlg.open} onOpenChange={(o) => setFDlg((s) => ({ ...s, open: o }))}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>ট্রান্সফার</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>তারিখ</Label><Input type="date" value={tf.transfer_date} onChange={(e) => setFDlg((s) => ({ ...s, form: { ...s.form, transfer_date: e.target.value } }))} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>থেকে</Label>
                <Select value={tf.from_type} onValueChange={(v) => setFDlg((s) => ({ ...s, form: { ...s.form, from_type: v } }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">ক্যাশ</SelectItem>
                    <SelectItem value="bank">ব্যাংক</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>তে</Label>
                <Select value={tf.to_type} onValueChange={(v) => setFDlg((s) => ({ ...s, form: { ...s.form, to_type: v } }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">ক্যাশ</SelectItem>
                    <SelectItem value="bank">ব্যাংক</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {tf.from_type === "bank" && (
              <div>
                <Label>যে ব্যাংক থেকে</Label>
                <Select value={tf.from_bank_id} onValueChange={(v) => setFDlg((s) => ({ ...s, form: { ...s.form, from_bank_id: v } }))}>
                  <SelectTrigger><SelectValue placeholder="নির্বাচন করুন" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>নির্বাচন করুন</SelectItem>
                    {(acctsQ.data ?? []).map((a: any) => <SelectItem key={a.id} value={a.id}>{a.bank_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            {tf.to_type === "bank" && (
              <div>
                <Label>যে ব্যাংকে</Label>
                <Select value={tf.to_bank_id} onValueChange={(v) => setFDlg((s) => ({ ...s, form: { ...s.form, to_bank_id: v } }))}>
                  <SelectTrigger><SelectValue placeholder="নির্বাচন করুন" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>নির্বাচন করুন</SelectItem>
                    {(acctsQ.data ?? []).map((a: any) => <SelectItem key={a.id} value={a.id}>{a.bank_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div><Label>টাকা (৳)</Label><Input type="number" value={tf.amount} onChange={(e) => setFDlg((s) => ({ ...s, form: { ...s.form, amount: e.target.value } }))} /></div>
            <div><Label>নোট</Label><Input value={tf.note} onChange={(e) => setFDlg((s) => ({ ...s, form: { ...s.form, note: e.target.value } }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFDlg((s) => ({ ...s, open: false }))}>বাতিল</Button>
            <Button onClick={() => saveTf.mutate()} disabled={saveTf.isPending}>সংরক্ষণ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
