import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarCheck, Pencil, Plus, Printer, Trash2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { StatCard } from "@/components/stat-card";
import { supabase } from "@/integrations/supabase/client";
import { sdb } from "@/lib/season-db";
import { bn, bnDate, isoDate } from "@/lib/format";
import { useCurrentUser } from "@/lib/use-current-user";
import { printTable } from "@/lib/print-table";
import { toast } from "sonner";

type Mode = "daily" | "salary";
const ROLE_LABEL: Record<string, string> = { daily: "ডেলি", mestri: "মেস্তুরি", manager: "ম্যানেজার" };
const ROLE_SUGGEST = ["ইঞ্জিন মেস্তুরি", "ম্যানেজার", "সহকারী ম্যানেজার", "হিসাবরক্ষক", "ক্যাশিয়ার", "পাহারাদার", "ড্রাইভার", "মেকানিক", "ইলেকট্রিশিয়ান", "বাবুর্চি"];

const dayVal = (a: { present: boolean; is_half_day?: boolean | null }) => (a.is_half_day ? 0.5 : 1);

export function StaffLedgerPage({ mode }: { mode: Mode }) {
  const qc = useQueryClient();
  const { data: me } = useCurrentUser();
  const isAdmin = me?.role === "admin";
  const today = isoDate(new Date());

  const workersQ = useQuery({
    queryKey: ["staff", mode],
    queryFn: async () => {
      const base = supabase.from("workers").select("*"); const { data, error } = await (mode === "daily" ? base.eq("role", "daily") : base.neq("role", "daily")).order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
  const ids = (workersQ.data ?? []).map((w) => w.id);
  const attQ = useQuery({
    queryKey: ["staff-att", mode, ids.join(",")],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data, error } = await sdb.from("worker_attendance").select("*").in("worker_id", ids);
      if (error) throw error;
      return data ?? [];
    },
  });
  const payQ = useQuery({
    queryKey: ["staff-pay", mode, ids.join(",")],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data, error } = await sdb.from("worker_payments").select("*").in("worker_id", ids).order("payment_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const stats = useMemo(() => {
    const m = new Map<string, { days: number; halves: number; absent: number; earned: number; paid: number; due: number }>();
    for (const w of workersQ.data ?? []) {
      const rows = (attQ.data ?? []).filter((a) => a.worker_id === w.id);
      let days = 0, halves = 0, absent = 0, earned = 0;
      if (mode === "daily") {
        for (const a of rows) if (a.present) { days += dayVal(a as any); if ((a as any).is_half_day) halves++; }
        earned = days * Number(w.daily_wage || 0);
      } else {
        // salaried: rows are absence entries (full or half day)
        for (const a of rows) absent += (a as any).is_half_day ? 0.5 : 1;
        days = accruedDays(w.join_date);
        const sal = Number(w.monthly_salary || 0);
        earned = Math.max(0, Math.round(accruedMonths(w.join_date) * sal - absent * (sal / 30)));
      }
      const paid = (payQ.data ?? []).filter((p) => p.worker_id === w.id).reduce((a, b) => a + Number(b.amount || 0), 0);
      m.set(w.id, { days, halves, absent, earned, paid, due: earned - paid });
    }
    return m;
  }, [workersQ.data, attQ.data, payQ.data, mode]);
  const tot = [...stats.values()].reduce((a, b) => ({ earned: a.earned + b.earned, paid: a.paid + b.paid, due: a.due + b.due }), { earned: 0, paid: 0, due: 0 });

  const invalidate = () => qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith("staff") || q.queryKey[0] === "cash" });

  // ---- worker form
  const emptyW = { id: "", name: "", phone: "", role: mode === "daily" ? "daily" : "", wage: "", join_date: today };
  const [wDlg, setWDlg] = useState<null | typeof emptyW>(null);
  const saveW = useMutation({
    mutationFn: async () => {
      const f = wDlg!;
      if (!f.name.trim()) throw new Error("নাম দিন");
      const payload: any = {
        name: f.name.trim(), phone: f.phone || null, role: (f.role || "").trim() || (mode === "daily" ? "daily" : "ম্যানেজার"),
        daily_wage: mode === "daily" ? Number(f.wage || 0) : 0,
        monthly_salary: mode === "salary" ? Number(f.wage || 0) : 0,
        join_date: f.join_date || null,
      };
      const { error } = f.id ? await supabase.from("workers").update(payload).eq("id", f.id) : await supabase.from("workers").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("সংরক্ষিত"); setWDlg(null); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const delW = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("workers").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { toast.success("মুছে ফেলা হয়েছে"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  // ---- payment form
  const [pDlg, setPDlg] = useState<null | { id?: string; worker_id: string; amount: string; date: string; note: string }>(null);
  const saveP = useMutation({
    mutationFn: async () => {
      const f = pDlg!;
      const amount = Number(f.amount || 0);
      if (!(amount > 0)) throw new Error("টাকার পরিমাণ দিন");
      const payload = { worker_id: f.worker_id, amount, payment_date: f.date, note: f.note || null, payment_type: "payment" };
      const { error } = f.id
        ? await supabase.from("worker_payments").update(payload).eq("id", f.id)
        : await supabase.from("worker_payments").insert({ ...payload, created_by: me!.user.id });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("পেমেন্ট সংরক্ষিত"); setPDlg(null); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const delP = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("worker_payments").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { toast.success("মুছে ফেলা হয়েছে"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  // ---- attendance
  const [attDate, setAttDate] = useState(today);
  const [attOpen, setAttOpen] = useState(false);
  const [present, setPresent] = useState<Set<string>>(new Set());
  const openAtt = (d: string) => {
    setAttDate(d);
    setPresent(new Set((attQ.data ?? []).filter((a) => a.date === d && a.present).map((a) => a.worker_id)));
    setAttOpen(true);
  };
  const saveAtt = useMutation({
    mutationFn: async () => {
      const { error: dErr } = await supabase.from("worker_attendance").delete().eq("date", attDate).in("worker_id", ids);
      if (dErr) throw dErr;
      const rows = ids.map((id) => ({ worker_id: id, date: attDate, present: present.has(id), created_by: me!.user.id }));
      if (rows.length) { const { error } = await supabase.from("worker_attendance").insert(rows); if (error) throw error; }
    },
    onSuccess: () => { toast.success("হাজিরা সংরক্ষিত"); setAttOpen(false); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const [detail, setDetail] = useState<any>(null);
  const nameOf = (id: string) => (workersQ.data ?? []).find((w) => w.id === id)?.name ?? "—";

  const printAll = () =>
    printTable({
      title: mode === "daily" ? "ডেলি শ্রমিক হিসাব" : "মেস্তুরি ও ম্যানেজার বেতন হিসাব",
      headers: ["নাম", "ধরন", mode === "daily" ? "হাজিরা (দিন)" : "মাস", "পাওনা", "পরিশোধ", "বাকি"],
      rightCols: [2, 3, 4, 5],
      rows: (workersQ.data ?? []).map((w) => {
        const s = stats.get(w.id)!;
        return [w.name, ROLE_LABEL[w.role] ?? w.role, bn(mode === "daily" ? s.days : monthsSince(w.join_date)), `৳ ${bn(s.earned)}`, `৳ ${bn(s.paid)}`, `৳ ${bn(s.due)}`];
      }),
      totals: [["মোট পাওনা", `৳ ${bn(tot.earned)}`], ["মোট পরিশোধ", `৳ ${bn(tot.paid)}`], ["মোট বাকি", `৳ ${bn(tot.due)}`]],
    });

  const printDetail = (w: any) => {
    const s = stats.get(w.id)!;
    const pays = (payQ.data ?? []).filter((p) => p.worker_id === w.id);
    printTable({
      title: `${w.name} — হিসাব বিবরণী`,
      subtitle: `${ROLE_LABEL[w.role] ?? ""} • পাওনা ৳ ${bn(s.earned)}`,
      headers: ["তারিখ", "নোট", "টাকা"],
      rightCols: [2],
      rows: pays.map((p) => [bnDate(p.payment_date), p.note ?? "", `৳ ${bn(p.amount)}`]),
      totals: [["পাওনা", `৳ ${bn(s.earned)}`], ["পরিশোধ", `৳ ${bn(s.paid)}`], ["বাকি", `৳ ${bn(s.due)}`]],
    });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold md:text-2xl">{mode === "daily" ? "ডেলি শ্রমিক" : "মেস্তুরি ও ম্যানেজার বেতন"}</h1>
          <p className="text-sm text-muted-foreground">{mode === "daily" ? "দৈনিক হাজিরা × মজুরি = পাওনা; কত নিল ও কত বাকি" : "নির্দিষ্ট মাসিক টাকা; কত নিল ও কত বাকি"}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={printAll}><Printer className="mr-1 h-4 w-4" /> প্রিন্ট</Button>
          {mode === "daily" && <Button variant="secondary" onClick={() => openAtt(today)}><CalendarCheck className="mr-1 h-4 w-4" /> হাজিরা</Button>}
          <Button onClick={() => setWDlg({ ...emptyW })}><Plus className="mr-1 h-4 w-4" /> নতুন</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <StatCard label="মোট পাওনা" value={`৳ ${bn(tot.earned)}`} icon={Wallet} tone="primary" />
        <StatCard label="মোট পরিশোধ" value={`৳ ${bn(tot.paid)}`} icon={Wallet} tone="success" />
        <StatCard label="মোট বাকি" value={`৳ ${bn(tot.due)}`} icon={Wallet} tone="warning" />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">তালিকা</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>নাম</TableHead>
              <TableHead className="text-right">{mode === "daily" ? "হাজিরা" : "মাসিক"}</TableHead>
              <TableHead className="text-right">পাওনা</TableHead>
              <TableHead className="text-right">পরিশোধ</TableHead>
              <TableHead className="text-right">বাকি</TableHead>
              <TableHead></TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {(workersQ.data ?? []).length === 0 && <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">কেউ যোগ করা হয়নি</TableCell></TableRow>}
              {(workersQ.data ?? []).map((w) => {
                const s = stats.get(w.id) ?? { days: 0, earned: 0, paid: 0, due: 0 };
                return (
                  <TableRow key={w.id}>
                    <TableCell>
                      <button className="font-medium text-primary hover:underline" onClick={() => setDetail(w)}>{w.name}</button>
                      <div className="text-xs text-muted-foreground">{ROLE_LABEL[w.role] ?? w.role} • {mode === "daily" ? `দৈনিক ৳ ${bn(w.daily_wage)}` : `মাসিক ৳ ${bn(w.monthly_salary)}`}</div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{mode === "daily" ? `${bn(s.days)} দিন` : `${bn(monthsSince(w.join_date))} মাস`}</TableCell>
                    <TableCell className="text-right tabular-nums">৳ {bn(s.earned)}</TableCell>
                    <TableCell className="text-right tabular-nums text-success">৳ {bn(s.paid)}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums text-warning">৳ {bn(s.due)}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <Button size="sm" variant="outline" onClick={() => setPDlg({ worker_id: w.id, amount: "", date: today, note: "" })}>টাকা দিন</Button>
                      {isAdmin && <>
                        <Button size="sm" variant="ghost" onClick={() => setWDlg({ id: w.id, name: w.name, phone: w.phone ?? "", role: w.role, wage: String(mode === "daily" ? w.daily_wage : w.monthly_salary), join_date: w.join_date ?? today })}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => confirm(`"${w.name}" মুছবেন?`) && delW.mutate(w.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                      </>}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">পেমেন্ট তালিকা</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow><TableHead>তারিখ</TableHead><TableHead>নাম</TableHead><TableHead>নোট</TableHead><TableHead className="text-right">টাকা</TableHead><TableHead></TableHead></TableRow></TableHeader>
            <TableBody>
              {(payQ.data ?? []).map((p) => (
                <TableRow key={p.id}>
                  <TableCell>{bnDate(p.payment_date)}</TableCell>
                  <TableCell>{nameOf(p.worker_id)}</TableCell>
                  <TableCell className="text-muted-foreground">{p.note ?? ""}</TableCell>
                  <TableCell className="text-right tabular-nums">৳ {bn(p.amount)}</TableCell>
                  <TableCell className="text-right">{isAdmin && <>
                    <Button size="sm" variant="ghost" onClick={() => setPDlg({ id: p.id, worker_id: p.worker_id, amount: String(p.amount), date: p.payment_date, note: p.note ?? "" })}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => confirm("মুছবেন?") && delP.mutate(p.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                  </>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* worker dialog */}
      <Dialog open={!!wDlg} onOpenChange={(o) => !o && setWDlg(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{wDlg?.id ? "সম্পাদনা" : "নতুন যোগ"}</DialogTitle></DialogHeader>
          {wDlg && <div className="space-y-3">
            <div><Label>নাম</Label><Input value={wDlg.name} onChange={(e) => setWDlg({ ...wDlg, name: e.target.value })} /></div>
            <div><Label>ফোন</Label><Input value={wDlg.phone} onChange={(e) => setWDlg({ ...wDlg, phone: e.target.value })} /></div>
            {mode === "salary" && (
              <div><Label>পদ</Label>
                <Input list="staff-role-suggest" placeholder="যেমন: ইঞ্জিন মেস্তুরি" value={ROLE_LABEL[wDlg.role] && wDlg.role !== "daily" ? ROLE_LABEL[wDlg.role] : wDlg.role} onChange={(e) => setWDlg({ ...wDlg, role: e.target.value })} />
                <datalist id="staff-role-suggest">{ROLE_SUGGEST.map((r) => <option key={r} value={r} />)}</datalist>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <div><Label>{mode === "daily" ? "দৈনিক মজুরি (৳)" : "মাসিক বেতন (৳)"}</Label><Input type="number" value={wDlg.wage} onChange={(e) => setWDlg({ ...wDlg, wage: e.target.value })} /></div>
              <div><Label>যোগদানের তারিখ</Label><Input type="date" value={wDlg.join_date} onChange={(e) => setWDlg({ ...wDlg, join_date: e.target.value })} /></div>
            </div>
          </div>}
          <DialogFooter><Button onClick={() => saveW.mutate()} disabled={saveW.isPending}>সংরক্ষণ</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* payment dialog */}
      <Dialog open={!!pDlg} onOpenChange={(o) => !o && setPDlg(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>টাকা প্রদান — {pDlg ? nameOf(pDlg.worker_id) : ""}</DialogTitle></DialogHeader>
          {pDlg && <div className="space-y-3">
            <div><Label>তারিখ</Label><Input type="date" value={pDlg.date} onChange={(e) => setPDlg({ ...pDlg, date: e.target.value })} /></div>
            <div><Label>টাকা (৳)</Label><Input type="number" value={pDlg.amount} onChange={(e) => setPDlg({ ...pDlg, amount: e.target.value })} /></div>
            <div><Label>নোট</Label><Input value={pDlg.note} onChange={(e) => setPDlg({ ...pDlg, note: e.target.value })} /></div>
          </div>}
          <DialogFooter><Button onClick={() => saveP.mutate()} disabled={saveP.isPending}>সংরক্ষণ</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* attendance dialog */}
      <Dialog open={attOpen} onOpenChange={setAttOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>দৈনিক হাজিরা</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>তারিখ</Label><Input type="date" value={attDate} onChange={(e) => openAtt(e.target.value)} /></div>
            <div className="max-h-72 space-y-2 overflow-y-auto">
              {(workersQ.data ?? []).map((w) => (
                <label key={w.id} className="flex items-center gap-3 rounded-lg border p-2">
                  <Checkbox checked={present.has(w.id)} onCheckedChange={(c) => { const n = new Set(present); c ? n.add(w.id) : n.delete(w.id); setPresent(n); }} />
                  <span className="flex-1">{w.name}</span>
                  <span className="text-xs text-muted-foreground">৳ {bn(w.daily_wage)}</span>
                </label>
              ))}
            </div>
            <p className="text-sm">উপস্থিত {bn(present.size)} জন • আজকের মজুরি ৳ {bn((workersQ.data ?? []).filter((w) => present.has(w.id)).reduce((a, w) => a + Number(w.daily_wage || 0), 0))}</p>
          </div>
          <DialogFooter><Button onClick={() => saveAtt.mutate()} disabled={saveAtt.isPending}>সংরক্ষণ</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* detail */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{detail?.name} — বিস্তারিত</DialogTitle></DialogHeader>
          {detail && (() => {
            const s = stats.get(detail.id)!;
            const att = (attQ.data ?? []).filter((a) => a.worker_id === detail.id && a.present).sort((a, b) => b.date.localeCompare(a.date));
            const pays = (payQ.data ?? []).filter((p) => p.worker_id === detail.id);
            return (
              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg border p-2"><div className="text-xs text-muted-foreground">পাওনা</div>৳ {bn(s.earned)}</div>
                  <div className="rounded-lg border p-2"><div className="text-xs text-muted-foreground">পরিশোধ</div>৳ {bn(s.paid)}</div>
                  <div className="rounded-lg border p-2"><div className="text-xs text-muted-foreground">বাকি</div><b>৳ {bn(s.due)}</b></div>
                </div>
                {mode === "daily" && <div><b>উপস্থিতি:</b> {att.length ? att.map((a) => bnDate(a.date)).join(", ") : "—"}</div>}
                <div><b>পেমেন্ট:</b>{pays.length === 0 ? " —" : <ul className="mt-1 list-disc pl-5">{pays.map((p) => <li key={p.id}>{bnDate(p.payment_date)} — ৳ {bn(p.amount)} {p.note ? `(${p.note})` : ""}</li>)}</ul>}</div>
              </div>
            );
          })()}
          <DialogFooter><Button variant="outline" onClick={() => printDetail(detail)}><Printer className="mr-1 h-4 w-4" /> প্রিন্ট</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
