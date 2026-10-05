import { createFileRoute } from "@tanstack/react-router";
import { accruedMonths } from "@/lib/salary-accrual";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Users2, Loader2, Pencil, Trash2, Search } from "lucide-react";
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
import { bn, bnDate } from "@/lib/format";
import { useCurrentUser } from "@/lib/use-current-user";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/sardars")({
  head: () => ({
    meta: [
      { title: "সরদার — CDB Bricks" },
      { name: "description", content: "সরদার ও সরদার গ্রুপের তালিকা এবং কাঁচা ইটের হিসাব।" },
      { property: "og:title", content: "সরদার — CDB Bricks" },
      { property: "og:description", content: "সরদার ও সরদার গ্রুপের তালিকা এবং কাঁচা ইটের হিসাব।" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SardarsPage,
});

type SardarForm = { id?: string; name: string; phone: string; address: string; group_id: string; note: string; is_active: boolean; kind: string; mill_name: string; monthly_salary: string; join_date: string };
const NO_GROUP = "__none__";
const emptySardar: SardarForm = { name: "", phone: "", address: "", group_id: NO_GROUP, note: "", is_active: true, kind: "mill", mill_name: "", monthly_salary: "", join_date: new Date().toISOString().slice(0, 10) };
const KINDS: Record<string, string> = { mill: "মিল (কাঁচা ইট)", load: "লোড (ঢোকানো)", unload: "আনলোড (বের করা)", burn: "পুড়াই মেস্তুরি (মাসিক বেতন)" };
const monthsSince = (d?: string | null) => accruedMonths(d);
type GroupForm = { id?: string; name: string; note: string };
const emptyGroup: GroupForm = { name: "", note: "" };

function SardarsPage() {
  const qc = useQueryClient();
  const { data: me } = useCurrentUser();
  const isAdmin = me?.role === "admin";
  const [search, setSearch] = useState("");
  const [dlg, setDlg] = useState<{ open: boolean; mode: "new" | "edit"; form: SardarForm }>({ open: false, mode: "new", form: emptySardar });
  const [gDlg, setGDlg] = useState<{ open: boolean; mode: "new" | "edit"; form: GroupForm }>({ open: false, mode: "new", form: emptyGroup });

  const groupsQ = useQuery({
    queryKey: ["sardar-groups"],
    queryFn: async () => {
      const { data, error } = await sdb.from("sardar_groups").select("*").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const sardarsQ = useQuery({
    queryKey: ["sardars"],
    queryFn: async () => {
      const { data, error } = await sdb.from("sardars").select("*").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const kachaQ = useQuery({
    queryKey: ["kacha-by-sardar"],
    queryFn: async () => {
      const { data, error } = await sdb.from("kacha_brick_entries").select("id,sardar_id,quantity,amount,entry_type,entry_date,note");
      if (error) throw error;
      return data ?? [];
    },
  });

  const workQ = useQuery({
    queryKey: ["sardar-work-by-sardar"],
    queryFn: async () => {
      const { data, error } = await sdb
        .from("sardar_work_entries")
        .select("id,sardar_id,entry_date,quantity,rate,amount,note,category:work_categories(name,unit)")
        .order("entry_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const payQ = useQuery({
    queryKey: ["sardar-payments-by-sardar"],
    queryFn: async () => {
      const { data, error } = await sdb
        .from("sardar_payments")
        .select("id,sardar_id,payment_date,amount,payment_type,method,note")
        .order("payment_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const stats = useMemo(() => {
    const m = new Map<string, { qty: number; kacha: number; work: number; earned: number; paid: number; due: number }>();
    const get = (id: string) => {
      let cur = m.get(id);
      if (!cur) { cur = { qty: 0, kacha: 0, work: 0, earned: 0, paid: 0, due: 0 }; m.set(id, cur); }
      return cur;
    };
    (kachaQ.data ?? []).forEach((k: any) => {
      if (!k.sardar_id) return;
      const cur = get(k.sardar_id);
      if (k.entry_type === "production") {
        cur.qty += Number(k.quantity || 0);
        cur.kacha += Number(k.amount || 0);
      }
    });
    (workQ.data ?? []).forEach((w: any) => {
      if (!w.sardar_id) return;
      get(w.sardar_id).work += Number(w.amount || 0);
    });
    (payQ.data ?? []).forEach((p: any) => {
      if (!p.sardar_id) return;
      get(p.sardar_id).paid += Number(p.amount || 0);
    });
    for (const sd of (sardarsQ.data ?? []) as any[]) {
      if (sd.kind === "burn") { const c = get(sd.id); c.kacha = 0; c.qty = 0; c.work = monthsSince(sd.join_date) * Number(sd.monthly_salary || 0); }
    }
    for (const v of m.values()) {
      v.earned = v.kacha + v.work;
      v.due = v.earned - v.paid;
    }
    return m;
  }, [kachaQ.data, workQ.data, payQ.data, sardarsQ.data]);

  const [detail, setDetail] = useState<any | null>(null);
  const openingQ = useQuery({
    queryKey: ["opening-balances", "sardar", detail?.id],
    enabled: !!detail?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("opening_balance_summary")
        .select("amount, paid_amount, remaining_amount, fiscal_year")
        .eq("sardar_id", detail!.id);
      if (error) throw error;
      return (data ?? []).reduce(
        (a: any, r: any) => ({ amount: a.amount + Number(r.amount || 0), paid: a.paid + Number(r.paid_amount || 0), due: a.due + Number(r.remaining_amount || 0) }),
        { amount: 0, paid: 0, due: 0 },
      );
    },
  });

  const detailRows = useMemo(() => {
    if (!detail) return [] as Array<{ id: string; date: string; label: string; credit: number; debit: number }>;
    const rows: Array<{ id: string; date: string; label: string; credit: number; debit: number }> = [];
    (kachaQ.data ?? []).forEach((k: any) => {
      if (k.sardar_id !== detail.id || k.entry_type !== "production") return;
      rows.push({ id: `k-${k.id}`, date: k.entry_date, label: `কাঁচা ইট — ${bn(Number(k.quantity || 0))} পিস`, credit: Number(k.amount || 0), debit: 0 });
    });
    (workQ.data ?? []).forEach((w: any) => {
      if (w.sardar_id !== detail.id) return;
      rows.push({ id: `w-${w.id}`, date: w.entry_date, label: `${w.category?.name ?? "কাজ"} — ${bn(Number(w.quantity || 0))} ${w.category?.unit ?? ""}`, credit: Number(w.amount || 0), debit: 0 });
    });
    (payQ.data ?? []).forEach((p: any) => {
      if (p.sardar_id !== detail.id) return;
      rows.push({ id: `p-${p.id}`, date: p.payment_date, label: `পেমেন্ট${p.payment_type === "advance" ? " (অগ্রিম)" : ""}${p.method ? ` • ${p.method}` : ""}`, credit: 0, debit: Number(p.amount || 0) });
    });
    return rows.sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [detail, kachaQ.data, workQ.data, payQ.data]);

  const groupName = (id: string | null) => (id ? (groupsQ.data ?? []).find((g: any) => g.id === id)?.name ?? "—" : "—");


  const filtered = useMemo(() => {
    const list = sardarsQ.data ?? [];
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter((s: any) => (s.name ?? "").toLowerCase().includes(q) || (s.phone ?? "").toLowerCase().includes(q) || (s.address ?? "").toLowerCase().includes(q));
  }, [sardarsQ.data, search]);

  const saveSardar = useMutation({
    mutationFn: async () => {
      const f = dlg.form;
      if (!f.name.trim()) throw new Error("নাম দিন");
      const payload = {
        name: f.name.trim(),
        phone: f.phone || null,
        address: f.address || null,
        group_id: f.group_id === NO_GROUP ? null : f.group_id,
        note: f.note || null,
        is_active: f.is_active,
        kind: f.kind,
        mill_name: f.kind === "mill" ? f.mill_name || null : null,
        monthly_salary: f.kind === "burn" ? Number(f.monthly_salary || 0) : 0,
        join_date: f.kind === "burn" ? f.join_date || null : null,
      };
      if (dlg.mode === "edit" && f.id) {
        const { error } = await sdb.from("sardars").update(payload).eq("id", f.id);
        if (error) throw error;
      } else {
        const { error } = await sdb.from("sardars").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("সংরক্ষিত");
      setDlg({ open: false, mode: "new", form: emptySardar });
      qc.invalidateQueries({ queryKey: ["sardars"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delSardar = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sdb.from("sardars").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("মুছে ফেলা হয়েছে"); qc.invalidateQueries({ queryKey: ["sardars"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveGroup = useMutation({
    mutationFn: async () => {
      const f = gDlg.form;
      if (!f.name.trim()) throw new Error("গ্রুপের নাম দিন");
      const payload = { name: f.name.trim(), note: f.note || null };
      if (gDlg.mode === "edit" && f.id) {
        const { error } = await sdb.from("sardar_groups").update(payload).eq("id", f.id);
        if (error) throw error;
      } else {
        const { error } = await sdb.from("sardar_groups").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("সংরক্ষিত");
      setGDlg({ open: false, mode: "new", form: emptyGroup });
      qc.invalidateQueries({ queryKey: ["sardar-groups"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delGroup = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sdb.from("sardar_groups").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("মুছে ফেলা হয়েছে"); qc.invalidateQueries({ queryKey: ["sardar-groups"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold md:text-2xl"><Users2 className="h-6 w-6 text-primary" /> সরদার</h1>
          <p className="text-sm text-muted-foreground">সরদার, গ্রুপ ও কাঁচা ইটের হিসাব</p>
        </div>
        {isAdmin && <Button onClick={() => setDlg({ open: true, mode: "new", form: emptySardar })}><Plus className="mr-1 h-4 w-4" /> নতুন সরদার</Button>}
      </div>

      <Tabs defaultValue="list">
        <TabsList>
          <TabsTrigger value="list">সরদার তালিকা</TabsTrigger>
          <TabsTrigger value="groups">গ্রুপ</TabsTrigger>
        </TabsList>

        <TabsContent value="list">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-base">সরদার</CardTitle>
              <div className="relative w-full max-w-xs">
                <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input className="h-9 pl-8" placeholder="খুঁজুন..." value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {sardarsQ.isLoading ? (
                <div className="flex h-24 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>
              ) : filtered.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">কোনো সরদার নেই</div>
              ) : (
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>নাম</TableHead>
                    <TableHead>গ্রুপ</TableHead>
                    <TableHead className="text-right">কাঁচা ইট</TableHead>
                    <TableHead className="text-right">মোট মজুরি</TableHead>
                    <TableHead className="text-right">নিয়েছে</TableHead>
                    <TableHead className="text-right">বাকি</TableHead>
                    <TableHead></TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {filtered.map((s: any) => {
                      const t = stats.get(s.id) ?? { qty: 0, kacha: 0, work: 0, earned: 0, paid: 0, due: 0 };
                      return (
                        <TableRow key={s.id} className={s.is_active ? "" : "opacity-60"}>
                          <TableCell>
                            <button type="button" className="text-left font-medium text-primary underline-offset-2 hover:underline" onClick={() => setDetail(s)}>
                              {s.name}
                            </button>
                            <div className="text-xs text-muted-foreground">{s.phone || "—"}{s.address ? ` • ${s.address}` : ""}</div>
                          </TableCell>
                          <TableCell><Badge variant="outline">{KINDS[s.kind] ?? s.kind}{s.mill_name ? ` — ${s.mill_name}` : ""}</Badge></TableCell>
                          <TableCell className="text-right tabular-nums">{s.kind === "burn" ? `মাসিক ৳ ${bn(s.monthly_salary)}` : bn(t.qty)}</TableCell>
                          <TableCell className="text-right tabular-nums">৳ {bn(t.earned)}</TableCell>
                          <TableCell className="text-right tabular-nums text-destructive">৳ {bn(t.paid)}</TableCell>
                          <TableCell className={`text-right font-semibold tabular-nums ${t.due > 0 ? "text-warning" : "text-success"}`}>৳ {bn(t.due)}</TableCell>
                          <TableCell className="text-right">
                            {isAdmin && (
                              <div className="flex justify-end gap-1">
                                <Button size="sm" variant="ghost" onClick={() => setDlg({
                                  open: true, mode: "edit",
                                  form: { id: s.id, name: s.name, phone: s.phone ?? "", address: s.address ?? "", group_id: s.group_id ?? NO_GROUP, note: s.note ?? "", is_active: s.is_active, kind: s.kind ?? "mill", mill_name: s.mill_name ?? "", monthly_salary: String(s.monthly_salary ?? ""), join_date: s.join_date ?? new Date().toISOString().slice(0, 10) },
                                })}><Pencil className="h-3.5 w-3.5" /></Button>
                                <Button size="sm" variant="ghost" onClick={() => { if (confirm(`"${s.name}" মুছে ফেলবেন?`)) delSardar.mutate(s.id); }}>
                                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                </Button>
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>

              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="groups">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-base">সরদার গ্রুপ</CardTitle>
              {isAdmin && <Button size="sm" onClick={() => setGDlg({ open: true, mode: "new", form: emptyGroup })}><Plus className="mr-1 h-4 w-4" /> নতুন গ্রুপ</Button>}
            </CardHeader>
            <CardContent className="p-0">
              {(groupsQ.data ?? []).length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">কোনো গ্রুপ নেই</div>
              ) : (
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>নাম</TableHead>
                    <TableHead>সদস্য</TableHead>
                    <TableHead>নোট</TableHead>
                    <TableHead></TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {(groupsQ.data ?? []).map((g: any) => (
                      <TableRow key={g.id}>
                        <TableCell className="font-medium">{g.name}</TableCell>
                        <TableCell>{bn((sardarsQ.data ?? []).filter((s: any) => s.group_id === g.id).length)} জন</TableCell>
                        <TableCell>{g.note || "—"}</TableCell>
                        <TableCell className="text-right">
                          {isAdmin && (
                            <div className="flex justify-end gap-1">
                              <Button size="sm" variant="ghost" onClick={() => setGDlg({ open: true, mode: "edit", form: { id: g.id, name: g.name, note: g.note ?? "" } })}><Pencil className="h-3.5 w-3.5" /></Button>
                              <Button size="sm" variant="ghost" onClick={() => { if (confirm(`"${g.name}" মুছে ফেলবেন?`)) delGroup.mutate(g.id); }}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
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

      <Dialog open={dlg.open} onOpenChange={(o) => setDlg((s) => ({ ...s, open: o }))}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{dlg.mode === "edit" ? "সরদার সম্পাদনা" : "নতুন সরদার"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>নাম</Label><Input value={dlg.form.name} onChange={(e) => setDlg((s) => ({ ...s, form: { ...s.form, name: e.target.value } }))} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>ফোন</Label><Input value={dlg.form.phone} onChange={(e) => setDlg((s) => ({ ...s, form: { ...s.form, phone: e.target.value } }))} /></div>
              <div>
                <Label>গ্রুপ</Label>
                <Select value={dlg.form.group_id} onValueChange={(v) => setDlg((s) => ({ ...s, form: { ...s.form, group_id: v } }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_GROUP}>গ্রুপ নেই</SelectItem>
                    {(groupsQ.data ?? []).map((g: any) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>কাজের ধরন</Label>
                <Select value={dlg.form.kind} onValueChange={(v) => setDlg((s) => ({ ...s, form: { ...s.form, kind: v } }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(KINDS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              {dlg.form.kind === "mill" && (
                <div><Label>মিলের নাম</Label><Input placeholder="যেমন: মিল ১" value={dlg.form.mill_name} onChange={(e) => setDlg((s) => ({ ...s, form: { ...s.form, mill_name: e.target.value } }))} /></div>
              )}
            </div>
            {dlg.form.kind === "burn" && (
              <div className="grid grid-cols-2 gap-2">
                <div><Label>মাসিক বেতন (৳)</Label><Input type="number" inputMode="decimal" value={dlg.form.monthly_salary} onChange={(e) => setDlg((s) => ({ ...s, form: { ...s.form, monthly_salary: e.target.value } }))} /></div>
                <div><Label>যোগদানের তারিখ</Label><Input type="date" value={dlg.form.join_date} onChange={(e) => setDlg((s) => ({ ...s, form: { ...s.form, join_date: e.target.value } }))} /></div>
                <p className="col-span-2 text-xs text-muted-foreground">পুড়াই মেস্তুরির ইটের সংখ্যা গণনা হবে না — মাস × মাসিক বেতন হিসেবে পাওনা হবে।</p>
              </div>
            )}
            <div><Label>ঠিকানা</Label><Input value={dlg.form.address} onChange={(e) => setDlg((s) => ({ ...s, form: { ...s.form, address: e.target.value } }))} /></div>
            <div><Label>নোট</Label><Textarea rows={2} value={dlg.form.note} onChange={(e) => setDlg((s) => ({ ...s, form: { ...s.form, note: e.target.value } }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDlg((s) => ({ ...s, open: false }))}>বাতিল</Button>
            <Button onClick={() => saveSardar.mutate()} disabled={saveSardar.isPending}>সংরক্ষণ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={gDlg.open} onOpenChange={(o) => setGDlg((s) => ({ ...s, open: o }))}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{gDlg.mode === "edit" ? "গ্রুপ সম্পাদনা" : "নতুন গ্রুপ"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>নাম</Label><Input value={gDlg.form.name} onChange={(e) => setGDlg((s) => ({ ...s, form: { ...s.form, name: e.target.value } }))} /></div>
            <div><Label>নোট</Label><Textarea rows={2} value={gDlg.form.note} onChange={(e) => setGDlg((s) => ({ ...s, form: { ...s.form, note: e.target.value } }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGDlg((s) => ({ ...s, open: false }))}>বাতিল</Button>
            <Button onClick={() => saveGroup.mutate()} disabled={saveGroup.isPending}>সংরক্ষণ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
          <DialogHeader><DialogTitle>{detail?.name} — বিস্তারিত হিসাব</DialogTitle></DialogHeader>
          {detail && (() => {
            const t = stats.get(detail.id) ?? { qty: 0, kacha: 0, work: 0, earned: 0, paid: 0, due: 0 };
            return (
              <div className="space-y-4">
                <div className="text-xs text-muted-foreground">
                  {detail.phone || "—"}{detail.address ? ` • ${detail.address}` : ""} • গ্রুপ: {groupName(detail.group_id)}
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <div className="rounded-lg border p-2"><p className="text-[11px] text-muted-foreground">কাঁচা ইট</p><p className="font-bold tabular-nums">{bn(t.qty)}</p></div>
                  <div className="rounded-lg border p-2"><p className="text-[11px] text-muted-foreground">মোট মজুরি</p><p className="font-bold tabular-nums">৳ {bn(t.earned)}</p></div>
                  <div className="rounded-lg border p-2"><p className="text-[11px] text-muted-foreground">নিয়েছে</p><p className="font-bold tabular-nums text-destructive">৳ {bn(t.paid)}</p></div>
                  <div className="rounded-lg border p-2"><p className="text-[11px] text-muted-foreground">বাকি</p><p className={`font-bold tabular-nums ${t.due > 0 ? "text-warning" : "text-success"}`}>৳ {bn(t.due)}</p></div>
                </div>
                {openingQ.data && openingQ.data.amount > 0 && (
                  <div className="rounded-lg border border-warning/40 bg-warning/5 p-2 text-xs">
                    <span className="font-semibold">গত মৌসুমের পাওনা:</span> ৳ {bn(openingQ.data.amount)} • পরিশোধ ৳ {bn(openingQ.data.paid)} •{" "}
                    <span className="font-semibold text-warning">বাকি ৳ {bn(openingQ.data.due)}</span>
                    <div className="text-muted-foreground">পরিশোধ করুন "পূর্বের বকেয়া ও জের" পাতা থেকে — এ সিজনের খরচে যোগ হবে না।</div>
                  </div>
                )}
                {detail.note && <p className="rounded-lg bg-muted p-2 text-xs">{detail.note}</p>}
                {detailRows.length === 0 ? (
                  <div className="py-8 text-center text-sm text-muted-foreground">কোনো লেনদেন নেই</div>
                ) : (
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>তারিখ</TableHead>
                      <TableHead>বিবরণ</TableHead>
                      <TableHead className="text-right">পাওনা</TableHead>
                      <TableHead className="text-right">প্রদান</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {detailRows.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="whitespace-nowrap text-xs">{bnDate(r.date)}</TableCell>
                          <TableCell className="text-xs">{r.label}</TableCell>
                          <TableCell className="text-right tabular-nums">{r.credit ? `৳ ${bn(r.credit)}` : "—"}</TableCell>
                          <TableCell className="text-right tabular-nums text-destructive">{r.debit ? `৳ ${bn(r.debit)}` : "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>

  );
}
