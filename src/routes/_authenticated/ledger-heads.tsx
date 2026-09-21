import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, BookOpen, Loader2, Pencil, Trash2, Search } from "lucide-react";
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

export const Route = createFileRoute("/_authenticated/ledger-heads")({
  head: () => ({
    meta: [
      { title: "খাতিয়ান — CDB Bricks" },
      { name: "description", content: "আয় ও ব্যয়ের খাত তালিকা এবং খাতভিত্তিক দৈনিক এন্ট্রি ব্যবস্থাপনা।" },
      { property: "og:title", content: "খাতিয়ান — CDB Bricks" },
      { property: "og:description", content: "আয় ও ব্যয়ের খাত তালিকা এবং খাতভিত্তিক দৈনিক এন্ট্রি।" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LedgerHeadsPage,
});

type HeadForm = { id?: string; name: string; kind: "income" | "expense"; unit: string; note: string; is_active: boolean };
const emptyHead: HeadForm = { name: "", kind: "expense", unit: "", note: "", is_active: true };

type EntryForm = { id?: string; head_id: string; entry_date: string; quantity: string; rate: string; amount: string; party_name: string; note: string };
const emptyEntry = (): EntryForm => ({ head_id: "", entry_date: isoDate(new Date()), quantity: "", rate: "", amount: "", party_name: "", note: "" });

function LedgerHeadsPage() {
  const qc = useQueryClient();
  const { data: me } = useCurrentUser();
  const isAdmin = me?.role === "admin";

  const [search, setSearch] = useState("");
  const [headDlg, setHeadDlg] = useState<{ open: boolean; mode: "new" | "edit"; form: HeadForm }>({ open: false, mode: "new", form: emptyHead });
  const [entryDlg, setEntryDlg] = useState<{ open: boolean; mode: "new" | "edit"; form: EntryForm }>({ open: false, mode: "new", form: emptyEntry() });

  const headsQ = useQuery({
    queryKey: ["ledger-heads"],
    queryFn: async () => {
      const { data, error } = await sdb.from("ledger_heads").select("*").order("kind").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const entriesQ = useQuery({
    queryKey: ["ledger-head-entries"],
    queryFn: async () => {
      const { data, error } = await sdb
        .from("ledger_head_entries")
        .select("*")
        .order("entry_date", { ascending: false })
        .limit(300);
      if (error) throw error;
      return data ?? [];
    },
  });

  const headName = (id: string) => (headsQ.data ?? []).find((h: any) => h.id === id)?.name ?? "—";
  const headKind = (id: string) => (headsQ.data ?? []).find((h: any) => h.id === id)?.kind ?? "expense";

  const totals = useMemo(() => {
    const m = new Map<string, number>();
    (entriesQ.data ?? []).forEach((e: any) => m.set(e.head_id, (m.get(e.head_id) ?? 0) + Number(e.amount || 0)));
    return m;
  }, [entriesQ.data]);

  const filteredHeads = useMemo(() => {
    const list = headsQ.data ?? [];
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter((h: any) => (h.name ?? "").toLowerCase().includes(q) || (h.unit ?? "").toLowerCase().includes(q));
  }, [headsQ.data, search]);

  const saveHead = useMutation({
    mutationFn: async () => {
      const f = headDlg.form;
      if (!f.name.trim()) throw new Error("খাতের নাম দিন");
      const payload = { name: f.name.trim(), kind: f.kind, unit: f.unit.trim() || null, note: f.note || null, is_active: f.is_active };
      if (headDlg.mode === "edit" && f.id) {
        const { error } = await sdb.from("ledger_heads").update(payload).eq("id", f.id);
        if (error) throw error;
      } else {
        const { error } = await sdb.from("ledger_heads").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(headDlg.mode === "edit" ? "খাত আপডেট হয়েছে" : "খাত যোগ হয়েছে");
      setHeadDlg({ open: false, mode: "new", form: emptyHead });
      qc.invalidateQueries({ queryKey: ["ledger-heads"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delHead = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sdb.from("ledger_heads").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("মুছে ফেলা হয়েছে"); qc.invalidateQueries({ queryKey: ["ledger-heads"] }); },
    onError: () => toast.error("এই খাতে এন্ট্রি থাকলে মুছা যাবে না"),
  });

  const saveEntry = useMutation({
    mutationFn: async () => {
      const f = entryDlg.form;
      if (!f.head_id) throw new Error("খাত নির্বাচন করুন");
      const qty = f.quantity === "" ? null : Number(f.quantity);
      const rate = f.rate === "" ? null : Number(f.rate);
      const amount = f.amount !== "" ? Number(f.amount) : (qty ?? 0) * (rate ?? 0);
      if (!(amount > 0)) throw new Error("টাকার পরিমাণ দিন");
      const payload = {
        head_id: f.head_id,
        entry_date: f.entry_date,
        quantity: qty,
        rate,
        amount,
        party_name: f.party_name || null,
        note: f.note || null,
      };
      if (entryDlg.mode === "edit" && f.id) {
        const { error } = await sdb.from("ledger_head_entries").update(payload).eq("id", f.id);
        if (error) throw error;
      } else {
        if (!me?.user.id) throw new Error("লগইন প্রয়োজন");
        const { error } = await sdb.from("ledger_head_entries").insert({ ...payload, created_by: me.user.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("সংরক্ষিত");
      setEntryDlg({ open: false, mode: "new", form: emptyEntry() });
      qc.invalidateQueries({ queryKey: ["ledger-head-entries"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delEntry = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sdb.from("ledger_head_entries").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("মুছে ফেলা হয়েছে"); qc.invalidateQueries({ queryKey: ["ledger-head-entries"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const f = entryDlg.form;
  const autoAmount = f.amount !== "" ? Number(f.amount) : (Number(f.quantity || 0) * Number(f.rate || 0));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold md:text-2xl">
            <BookOpen className="h-6 w-6 text-primary" /> খাতিয়ান
          </h1>
          <p className="text-sm text-muted-foreground">আয়-ব্যয়ের খাত তালিকা ও খাতভিত্তিক এন্ট্রি</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setEntryDlg({ open: true, mode: "new", form: emptyEntry() })}>
            <Plus className="mr-1 h-4 w-4" /> নতুন এন্ট্রি
          </Button>
          {isAdmin && (
            <Button onClick={() => setHeadDlg({ open: true, mode: "new", form: emptyHead })}>
              <Plus className="mr-1 h-4 w-4" /> নতুন খাত
            </Button>
          )}
        </div>
      </div>

      <Tabs defaultValue="heads">
        <TabsList>
          <TabsTrigger value="heads">খাত তালিকা</TabsTrigger>
          <TabsTrigger value="entries">এন্ট্রি</TabsTrigger>
        </TabsList>

        <TabsContent value="heads">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-base">খাত</CardTitle>
              <div className="relative w-full max-w-xs">
                <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input className="h-9 pl-8" placeholder="খুঁজুন..." value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {headsQ.isLoading ? (
                <div className="flex h-24 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>
              ) : filteredHeads.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">কোনো খাত নেই</div>
              ) : (
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>নাম</TableHead>
                    <TableHead>ধরন</TableHead>
                    <TableHead>একক</TableHead>
                    <TableHead className="text-right">মোট</TableHead>
                    <TableHead></TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {filteredHeads.map((h: any) => (
                      <TableRow key={h.id} className={h.is_active ? "" : "opacity-60"}>
                        <TableCell className="font-medium">{h.name}</TableCell>
                        <TableCell>
                          <Badge variant={h.kind === "income" ? "default" : "outline"}>{h.kind === "income" ? "আয়" : "ব্যয়"}</Badge>
                        </TableCell>
                        <TableCell>{h.unit || "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">৳ {bn(totals.get(h.id) ?? 0)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button size="sm" variant="outline" onClick={() => setEntryDlg({ open: true, mode: "new", form: { ...emptyEntry(), head_id: h.id } })}>এন্ট্রি</Button>
                            {isAdmin && (
                              <Button size="sm" variant="ghost" onClick={() => setHeadDlg({ open: true, mode: "edit", form: { id: h.id, name: h.name, kind: h.kind, unit: h.unit ?? "", note: h.note ?? "", is_active: h.is_active } })}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {isAdmin && (
                              <Button size="sm" variant="ghost" onClick={() => { if (confirm(`"${h.name}" মুছে ফেলবেন?`)) delHead.mutate(h.id); }}>
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

        <TabsContent value="entries">
          <Card>
            <CardHeader><CardTitle className="text-base">সাম্প্রতিক এন্ট্রি</CardTitle></CardHeader>
            <CardContent className="p-0">
              {entriesQ.isLoading ? (
                <div className="flex h-24 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>
              ) : (entriesQ.data ?? []).length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">কোনো এন্ট্রি নেই</div>
              ) : (
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>তারিখ</TableHead>
                    <TableHead>খাত</TableHead>
                    <TableHead>পক্ষ</TableHead>
                    <TableHead className="text-right">পরিমাণ</TableHead>
                    <TableHead className="text-right">রেট</TableHead>
                    <TableHead className="text-right">টাকা</TableHead>
                    <TableHead></TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {(entriesQ.data ?? []).map((e: any) => (
                      <TableRow key={e.id}>
                        <TableCell className="whitespace-nowrap">{bnDate(e.entry_date)}</TableCell>
                        <TableCell>
                          <span className="font-medium">{headName(e.head_id)}</span>{" "}
                          <Badge variant={headKind(e.head_id) === "income" ? "default" : "outline"} className="ml-1">
                            {headKind(e.head_id) === "income" ? "আয়" : "ব্যয়"}
                          </Badge>
                        </TableCell>
                        <TableCell>{e.party_name || "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">{e.quantity === null ? "—" : bn(e.quantity)}</TableCell>
                        <TableCell className="text-right tabular-nums">{e.rate === null ? "—" : bn(e.rate)}</TableCell>
                        <TableCell className="text-right font-medium tabular-nums">৳ {bn(e.amount)}</TableCell>
                        <TableCell className="text-right">
                          {isAdmin && (
                            <div className="flex justify-end gap-1">
                              <Button size="sm" variant="ghost" onClick={() => setEntryDlg({
                                open: true, mode: "edit",
                                form: {
                                  id: e.id, head_id: e.head_id, entry_date: e.entry_date,
                                  quantity: e.quantity === null ? "" : String(e.quantity),
                                  rate: e.rate === null ? "" : String(e.rate),
                                  amount: String(e.amount), party_name: e.party_name ?? "", note: e.note ?? "",
                                },
                              })}><Pencil className="h-3.5 w-3.5" /></Button>
                              <Button size="sm" variant="ghost" onClick={() => { if (confirm("এন্ট্রি মুছে ফেলবেন?")) delEntry.mutate(e.id); }}>
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
      </Tabs>

      {/* Head dialog */}
      <Dialog open={headDlg.open} onOpenChange={(o) => setHeadDlg((s) => ({ ...s, open: o }))}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{headDlg.mode === "edit" ? "খাত সম্পাদনা" : "নতুন খাত"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>নাম</Label><Input value={headDlg.form.name} onChange={(e) => setHeadDlg((s) => ({ ...s, form: { ...s.form, name: e.target.value } }))} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>ধরন</Label>
                <Select value={headDlg.form.kind} onValueChange={(v) => setHeadDlg((s) => ({ ...s, form: { ...s.form, kind: v as "income" | "expense" } }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="expense">ব্যয়</SelectItem>
                    <SelectItem value="income">আয়</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>একক (ঐচ্ছিক)</Label><Input value={headDlg.form.unit} onChange={(e) => setHeadDlg((s) => ({ ...s, form: { ...s.form, unit: e.target.value } }))} placeholder="হাজার / গাড়ি / টন" /></div>
            </div>
            <div><Label>নোট</Label><Textarea rows={2} value={headDlg.form.note} onChange={(e) => setHeadDlg((s) => ({ ...s, form: { ...s.form, note: e.target.value } }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setHeadDlg((s) => ({ ...s, open: false }))}>বাতিল</Button>
            <Button onClick={() => saveHead.mutate()} disabled={saveHead.isPending}>সংরক্ষণ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Entry dialog */}
      <Dialog open={entryDlg.open} onOpenChange={(o) => setEntryDlg((s) => ({ ...s, open: o }))}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{entryDlg.mode === "edit" ? "এন্ট্রি সম্পাদনা" : "নতুন এন্ট্রি"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>খাত</Label>
              <Select value={f.head_id} onValueChange={(v) => setEntryDlg((s) => ({ ...s, form: { ...s.form, head_id: v } }))}>
                <SelectTrigger><SelectValue placeholder="খাত নির্বাচন করুন" /></SelectTrigger>
                <SelectContent>
                  {(headsQ.data ?? []).filter((h: any) => h.is_active).map((h: any) => (
                    <SelectItem key={h.id} value={h.id}>{h.name} ({h.kind === "income" ? "আয়" : "ব্যয়"})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>তারিখ</Label><Input type="date" value={f.entry_date} onChange={(e) => setEntryDlg((s) => ({ ...s, form: { ...s.form, entry_date: e.target.value } }))} /></div>
              <div><Label>পক্ষ / নাম</Label><Input value={f.party_name} onChange={(e) => setEntryDlg((s) => ({ ...s, form: { ...s.form, party_name: e.target.value } }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>পরিমাণ</Label><Input type="number" value={f.quantity} onChange={(e) => setEntryDlg((s) => ({ ...s, form: { ...s.form, quantity: e.target.value } }))} /></div>
              <div><Label>রেট</Label><Input type="number" value={f.rate} onChange={(e) => setEntryDlg((s) => ({ ...s, form: { ...s.form, rate: e.target.value } }))} /></div>
            </div>
            <div>
              <Label>টাকা (৳)</Label>
              <Input type="number" value={f.amount} placeholder={String(autoAmount || "")} onChange={(e) => setEntryDlg((s) => ({ ...s, form: { ...s.form, amount: e.target.value } }))} />
              <p className="mt-1 text-xs text-muted-foreground">খালি রাখলে পরিমাণ × রেট = ৳ {bn(autoAmount)}</p>
            </div>
            <div><Label>নোট</Label><Textarea rows={2} value={f.note} onChange={(e) => setEntryDlg((s) => ({ ...s, form: { ...s.form, note: e.target.value } }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEntryDlg((s) => ({ ...s, open: false }))}>বাতিল</Button>
            <Button onClick={() => saveEntry.mutate()} disabled={saveEntry.isPending}>সংরক্ষণ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
