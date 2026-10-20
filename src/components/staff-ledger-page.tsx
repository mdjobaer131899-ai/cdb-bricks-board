import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarCheck, CalendarX, Pencil, Plus, Printer, Trash2, Wallet } from "lucide-react";
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
import { dailyEarned, fetchPayRates, rateAt, salaryEarned, type PayRate } from "@/lib/salary-accrual";
import { ExpenseEntryDialog } from "@/components/expense-entry";
import { fetchAllRows } from "@/lib/fetch-all";

type Mode = "daily" | "salary";
const ROLE_LABEL: Record<string, string> = { daily: "ডেলি", mestri: "মেস্তুরি", manager: "ম্যানেজার" };
const ROLE_SUGGEST = ["ইঞ্জিন মেস্তুরি", "ম্যানেজার", "সহকারী ম্যানেজার", "হিসাবরক্ষক", "ক্যাশিয়ার", "পাহারাদার", "ড্রাইভার", "মেকানিক", "ইলেকট্রিশিয়ান", "বাবুর্চি"];

/** attendance row → the mark the earnings rule reads (no row = present) */
const markOf = (a: any) => ({ date: String(a.date), present: a.present !== false, half: !!a.is_half_day });

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
      return fetchAllRows<any>(() => sdb.from("worker_attendance").select("*").in("worker_id", ids).order("id"));
    },
  });
  const payQ = useQuery({
    queryKey: ["staff-pay", mode, ids.join(",")],
    enabled: ids.length > 0,
    queryFn: async () => {
      return fetchAllRows<any>(() => sdb.from("worker_payments").select("*").in("worker_id", ids).order("payment_date", { ascending: false }).order("id"));
    },
  });

  const ratesQ = useQuery({ queryKey: ["staff-pay-rates"], queryFn: fetchPayRates });
  const ratesOf = (id: string): PayRate[] => (ratesQ.data ?? []).filter((r) => r.worker_id === id);
  const wageOf = (w: any, date = today) => rateAt(ratesOf(w.id), mode === "daily" ? w.daily_wage : w.monthly_salary, date);

  const stats = useMemo(() => {
    const m = new Map<string, { days: number; halves: number; absent: number; earned: number; paid: number; due: number }>();
    for (const w of workersQ.data ?? []) {
      const rows = (attQ.data ?? []).filter((a) => a.worker_id === w.id);
      let days = 0, halves = 0, absent = 0, earned = 0;
      if (mode === "daily") {
        // present every day from joining (inside the season) unless a row marks absent or half;
        // each day at the wage in force that day (pay_rates history)
        const d = dailyEarned({ wage: w.daily_wage, join: w.join_date, leave: (w as any).leave_date, rates: ratesOf(w.id), marks: rows.map(markOf) });
        days = d.days; halves = d.halves; absent = d.absent; earned = d.earned;
      } else {
        // salaried: rows are absence entries (full or half day)
        const abs = rows.filter((a: any) => a.present === false || a.is_half_day);
        for (const a of abs) absent += (a as any).is_half_day ? 0.5 : 1;
        // Season window: later of join/season start → earliest of today/leave date/season end
        const s = salaryEarned({
          monthly: w.monthly_salary, join: w.join_date, leave: (w as any).leave_date, rates: ratesOf(w.id),
          absences: abs.map((a: any) => ({ date: a.date, half: a.is_half_day })),
        });
        days = s.days;
        earned = s.earned;
      }
      const paid = (payQ.data ?? []).filter((p) => p.worker_id === w.id).reduce((a, b) => a + Number(b.amount || 0), 0);
      m.set(w.id, { days, halves, absent, earned, paid, due: earned - paid });
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workersQ.data, attQ.data, payQ.data, ratesQ.data, mode]);
  const tot = [...stats.values()].reduce((a, b) => ({ earned: a.earned + b.earned, paid: a.paid + b.paid, due: a.due + b.due }), { earned: 0, paid: 0, due: 0 });

  const invalidate = () => qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith("staff") || q.queryKey[0] === "cash" || q.queryKey[0] === "pay-rates" });

  // ---- worker form
  const emptyW = { id: "", name: "", phone: "", role: mode === "daily" ? "daily" : "", wage: "", origWage: "", wageFrom: today, join_date: today, leave_date: "" };
  const [wDlg, setWDlg] = useState<null | typeof emptyW>(null);
  const saveW = useMutation({
    mutationFn: async () => {
      const f = wDlg!;
      if (!f.name.trim()) throw new Error("নাম দিন");
      if (mode === "daily" && !f.join_date) throw new Error("যোগদানের তারিখ দিন — সেদিন থেকে প্রতিদিন হাজিরা ধরা হবে");
      if (f.leave_date && f.join_date && f.leave_date < f.join_date) throw new Error("কাজ ছাড়ার তারিখ যোগদানের আগে হতে পারে না");
      const payload: any = {
        name: f.name.trim(), phone: f.phone || null, role: (f.role || "").trim() || (mode === "daily" ? "daily" : "ম্যানেজার"),
        daily_wage: mode === "daily" ? Number(f.wage || 0) : 0,
        monthly_salary: mode === "salary" ? Number(f.wage || 0) : 0,
        join_date: f.join_date || null,
        leave_date: f.leave_date || null,
      };
      const wage = Number(f.wage || 0);
      if (!f.id) {
        const { data, error } = await supabase.from("workers").insert(payload).select("id").single();
        if (error) throw error;
        if (wage > 0) {
          const { error: e2 } = await (supabase as any).from("pay_rates").insert({ worker_id: data.id, amount: wage, effective_from: f.join_date || today, note: "শুরুর হার" });
          if (e2) throw e2;
        }
        return;
      }
      const { error } = await supabase.from("workers").update(payload).eq("id", f.id);
      if (error) throw error;
      // A changed wage applies from the chosen date; days before keep the old wage
      if (wage !== Number(f.origWage || 0)) {
        if (!f.wageFrom) throw new Error("নতুন হার কোন তারিখ থেকে, তা দিন");
        const history = ratesOf(f.id);
        const rows: any[] = [];
        if (history.length === 0 && Number(f.origWage || 0) > 0) {
          rows.push({ worker_id: f.id, amount: Number(f.origWage), effective_from: f.join_date || "2000-01-01", note: "শুরুর হার" });
        }
        rows.push({ worker_id: f.id, amount: wage, effective_from: f.wageFrom, note: "হার বদল" });
        const { error: e2 } = await (supabase as any).from("pay_rates").upsert(rows, { onConflict: "worker_id,effective_from" });
        if (e2) throw e2;
      }
    },
    onSuccess: () => { toast.success("সংরক্ষিত"); setWDlg(null); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const delRate = useMutation({
    mutationFn: async (id: string) => { const { error } = await (supabase as any).from("pay_rates").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { toast.success("মুছে ফেলা হয়েছে"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const delW = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("workers").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { toast.success("মুছে ফেলা হয়েছে"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  // ---- payment form
  const [pDlg, setPDlg] = useState<null | { id?: string; worker_id: string; amount: string; date: string; note: string }>(null);
  // a new payment goes through the one expense form; pDlg is for editing a saved one
  const [payFor, setPayFor] = useState<string | null>(null);
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

  // ---- attendance (daily workers): everyone is present unless unticked.
  // Only absent and half days are stored; ticking someone back removes the row.
  const [attDate, setAttDate] = useState(today);
  const [attOpen, setAttOpen] = useState(false);
  const [present, setPresent] = useState<Set<string>>(new Set());
  const [half, setHalf] = useState<Set<string>>(new Set());
  const markOn = (id: string, d: string) => (attQ.data ?? []).find((a: any) => a.worker_id === id && a.date === d);
  const openAtt = (d: string) => {
    setAttDate(d);
    const on = activeOn(d);
    setPresent(new Set(on.filter((w) => markOn(w.id, d)?.present !== false || markOn(w.id, d)?.is_half_day).map((w) => w.id)));
    setHalf(new Set(on.filter((w) => markOn(w.id, d)?.is_half_day).map((w) => w.id)));
    setAttOpen(true);
  };
  /** writes one day's marks for these workers: only absent / half days get a row */
  const writeDay = async (d: string, list: Array<{ id: string; present: boolean; half: boolean }>) => {
    const wIds = list.map((x) => x.id);
    if (!wIds.length) return;
    const { error: dErr } = await supabase.from("worker_attendance").delete().eq("date", d).in("worker_id", wIds);
    if (dErr) throw dErr;
    const rows = list.filter((x) => !x.present || x.half)
      .map((x) => ({ worker_id: x.id, date: d, present: x.present, is_half_day: x.present && x.half, created_by: me!.user.id }));
    if (rows.length) {
      const { error } = await supabase.from("worker_attendance").insert(rows as any);
      // RLS lets only an admin or the row's writer remove a row; then the old one is still there
      if (error) throw (error as any).code === "23505" ? new Error("এই দিনের হাজিরা অ্যাডমিন দিয়েছেন — বদলাতে অ্যাডমিনকে বলুন") : error;
    }
  };
  const saveAtt = useMutation({
    mutationFn: async () => {
      await writeDay(attDate, activeOn(attDate).map((w) => ({ id: w.id, present: present.has(w.id), half: present.has(w.id) && half.has(w.id) })));
    },
    onSuccess: () => { toast.success("হাজিরা সংরক্ষিত"); setAttOpen(false); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });
  // one tap in the list: today present ↔ absent
  const toggleToday = useMutation({
    mutationFn: async (p: { id: string; present: boolean }) => { await writeDay(today, [{ id: p.id, present: p.present, half: false }]); },
    onSuccess: (_d, p) => { toast.success(p.present ? "আজ উপস্থিত" : "আজ অনুপস্থিত"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  // ---- salaried absence (leave) entries
  const [absDlg, setAbsDlg] = useState<null | { worker_id: string; date: string; half: boolean; note: string }>(null);
  const saveAbs = useMutation({
    mutationFn: async () => {
      const f = absDlg!;
      const { error } = await supabase.from("worker_attendance").insert({ worker_id: f.worker_id, date: f.date, present: false, is_half_day: f.half, note: f.note || null, created_by: me!.user.id } as any);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("অনুপস্থিতি যোগ হয়েছে"); setAbsDlg(null); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const delAbs = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("worker_attendance").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { toast.success("মুছে ফেলা হয়েছে"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });
  // who was on the payroll on a date (joined, not left, active)
  const activeOn = (d: string) => (workersQ.data ?? []).filter((w: any) =>
    w.active !== false && (!w.join_date || w.join_date <= d) && (!w.leave_date || w.leave_date >= d));

  // ---- many days at once: everyone selected marked absent (kiln closed, rain, leave)
  const [bulk, setBulk] = useState<null | { from: string; to: string; ids: Set<string> }>(null);
  const saveBulk = useMutation({
    mutationFn: async () => {
      const b = bulk!;
      if (!b.from || !b.to) throw new Error("শুরু ও শেষ তারিখ দিন");
      if (b.to < b.from) throw new Error("শেষ তারিখ শুরুর আগে হতে পারে না");
      if (b.ids.size === 0) throw new Error("কাউকে বাছাই করুন");
      const rows: any[] = [];
      for (let t = new Date(`${b.from}T00:00:00Z`); t <= new Date(`${b.to}T00:00:00Z`); t = new Date(t.getTime() + 86400000)) {
        const d = t.toISOString().slice(0, 10);
        for (const w of activeOn(d)) if (b.ids.has(w.id)) rows.push({ worker_id: w.id, date: d, present: false, is_half_day: false, created_by: me!.user.id });
      }
      if (rows.length === 0) throw new Error("এই দিনগুলোতে বাছাই করা কেউ কাজে ছিল না");
      const { error: dErr } = await supabase.from("worker_attendance").delete().in("worker_id", [...b.ids]).gte("date", b.from).lte("date", b.to);
      if (dErr) throw dErr;
      for (let i = 0; i < rows.length; i += 500) {
        const { error } = await supabase.from("worker_attendance").insert(rows.slice(i, i + 500) as any);
        if (error) throw error;
      }
      return rows.length;
    },
    onSuccess: (n) => { toast.success(`${bn(n ?? 0)}টি দিন অনুপস্থিত ধরা হয়েছে`); setBulk(null); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const fmtDays = (s: { days: number; halves: number; absent?: number }) =>
    `${bn(s.days)} দিন${s.halves ? ` (${bn(s.halves)}টি হাফ)` : ""}${s.absent ? ` · অনুপস্থিত ${bn(s.absent)}` : ""}`;

  const [detail, setDetail] = useState<any>(null);
  const nameOf = (id: string) => (workersQ.data ?? []).find((w) => w.id === id)?.name ?? "—";

  const printAll = () =>
    printTable({
      title: mode === "daily" ? "ডেলি শ্রমিক হিসাব" : "মেস্তুরি ও ম্যানেজার বেতন হিসাব",
      headers: ["নাম", "ধরন", mode === "daily" ? "হাজিরা (দিন)" : "মাস", "পাওনা", "পরিশোধ", "বাকি"],
      rightCols: [2, 3, 4, 5],
      rows: (workersQ.data ?? []).map((w) => {
        const s = stats.get(w.id)!;
        return [w.name, ROLE_LABEL[w.role] ?? w.role, mode === "daily" ? fmtDays(s) : `${bn(s.days)} দিন${s.absent ? ` (অনুপস্থিত ${bn(s.absent)})` : ""}`, `৳ ${bn(s.earned)}`, `৳ ${bn(s.paid)}`, `৳ ${bn(s.due)}`];
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
          <p className="text-sm text-muted-foreground">{mode === "daily" ? "যোগদানের দিন থেকে প্রতিদিন উপস্থিত ধরা হয়; কেউ না এলে সেদিনের টিক তুলে দিন (হাফ দিন = অর্ধেক মজুরি)" : "প্রতিদিন মাসিক বেতন ÷ ৩০ টাকা যোগ হয়; অনুপস্থিত দিনের টাকা বাদ"}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={printAll}><Printer className="mr-1 h-4 w-4" /> প্রিন্ট</Button>
          {mode === "daily" && <Button variant="secondary" onClick={() => openAtt(today)}><CalendarCheck className="mr-1 h-4 w-4" /> হাজিরা</Button>}
          {mode === "daily" && <Button variant="outline" onClick={() => setBulk({ from: today, to: today, ids: new Set(activeOn(today).map((w) => w.id)) })}><CalendarX className="mr-1 h-4 w-4" /> কয়েক দিন বন্ধ</Button>}
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
              {mode === "daily" && <TableHead className="w-12 text-center">আজ</TableHead>}
              <TableHead>নাম</TableHead>
              <TableHead className="text-right">{mode === "daily" ? "হাজিরা" : "মাসিক"}</TableHead>
              <TableHead className="text-right">পাওনা</TableHead>
              <TableHead className="text-right">পরিশোধ</TableHead>
              <TableHead className="text-right">বাকি</TableHead>
              <TableHead></TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {(workersQ.data ?? []).length === 0 && <TableRow><TableCell colSpan={mode === "daily" ? 7 : 6} className="py-8 text-center text-muted-foreground">কেউ যোগ করা হয়নি</TableCell></TableRow>}
              {(workersQ.data ?? []).map((w) => {
                const s = stats.get(w.id) ?? { days: 0, halves: 0, absent: 0, earned: 0, paid: 0, due: 0 };
                const onToday = activeOn(today).some((x) => x.id === w.id);
                const mk = markOn(w.id, today);
                const inToday = onToday && (mk?.present !== false || !!mk?.is_half_day);
                return (
                  <TableRow key={w.id}>
                    {mode === "daily" && (
                      <TableCell className="text-center">
                        {onToday ? (
                          <Checkbox aria-label={`${w.name} আজ উপস্থিত`} className="h-6 w-6" checked={inToday} disabled={toggleToday.isPending}
                            onCheckedChange={(c) => toggleToday.mutate({ id: w.id, present: !!c })} />
                        ) : <span className="text-xs text-muted-foreground">—</span>}
                      </TableCell>
                    )}
                    <TableCell>
                      <button className="font-medium text-primary hover:underline" onClick={() => setDetail(w)}>{w.name}</button>
                      <div className="text-xs text-muted-foreground">{ROLE_LABEL[w.role] ?? w.role} • {mode === "daily" ? `দৈনিক ৳ ${bn(wageOf(w))}` : `মাসিক ৳ ${bn(wageOf(w))}`}{(w as any).leave_date ? ` • কাজ ছেড়েছে ${bnDate((w as any).leave_date)}` : ""}{mode === "daily" && !w.join_date ? " • যোগদানের তারিখ নেই" : ""}</div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{mode === "daily" ? fmtDays(s) : <>{bn(s.days)} দিন{s.absent > 0 && <div className="text-xs text-destructive">অনুপস্থিত {bn(s.absent)} দিন</div>}</>}</TableCell>
                    <TableCell className="text-right tabular-nums">৳ {bn(s.earned)}</TableCell>
                    <TableCell className="text-right tabular-nums text-success">৳ {bn(s.paid)}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums text-warning">৳ {bn(s.due)}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <Button size="sm" variant="outline" onClick={() => setPayFor(w.id)}>টাকা দিন</Button>
                      {mode === "salary" && <Button size="sm" variant="ghost" className="ml-1" onClick={() => setAbsDlg({ worker_id: w.id, date: today, half: false, note: "" })}>ছুটি/অনুপস্থিত</Button>}
                      {isAdmin && <>
                        <Button size="sm" variant="ghost" onClick={() => setWDlg({ id: w.id, name: w.name, phone: w.phone ?? "", role: w.role, wage: String(wageOf(w)), origWage: String(wageOf(w)), wageFrom: today, join_date: w.join_date ?? today, leave_date: (w as any).leave_date ?? "" })}><Pencil className="h-3.5 w-3.5" /></Button>
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
            {wDlg.id && Number(wDlg.wage || 0) !== Number(wDlg.origWage || 0) && (
              <div className="space-y-1 rounded-lg border border-warning/40 bg-warning/10 p-2">
                <Label>নতুন {mode === "daily" ? "মজুরি" : "বেতন"} কোন তারিখ থেকে চালু</Label>
                <Input type="date" value={wDlg.wageFrom} onChange={(e) => setWDlg({ ...wDlg, wageFrom: e.target.value })} />
                <p className="text-xs text-muted-foreground">এই তারিখের আগের দিনগুলো আগের হার ৳ {bn(Number(wDlg.origWage || 0))} এ গোনা হবে।</p>
              </div>
            )}
            {wDlg.id && ratesOf(wDlg.id).length > 0 && (
              <div className="space-y-1">
                <Label>{mode === "daily" ? "মজুরির" : "বেতনের"} ইতিহাস</Label>
                <div className="divide-y rounded-lg border text-sm">
                  {[...ratesOf(wDlg.id)].reverse().map((r: any) => (
                    <div key={r.id} className="flex items-center justify-between px-2 py-1.5">
                      <span>{r.effective_from <= "2000-01-01" ? "শুরু থেকে" : `${bnDate(r.effective_from)} থেকে`}</span>
                      <span className="flex items-center gap-1"><b>৳ {bn(r.amount)}</b>
                        {ratesOf(wDlg.id).length > 1 && <Button size="sm" variant="ghost" onClick={() => confirm("এই হার মুছবেন?") && delRate.mutate(r.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="space-y-1">
              <Label>কাজ ছাড়ার তারিখ (থাকলে)</Label>
              <Input type="date" value={wDlg.leave_date} onChange={(e) => setWDlg({ ...wDlg, leave_date: e.target.value })} />
              <p className="text-xs text-muted-foreground">{mode === "daily"
                ? "যোগদান (বা মৌসুম শুরু) থেকে প্রতিদিন মজুরি যোগ হয়। কেউ কাজ ছেড়ে দিলে এই তারিখ দিন, নইলে তার হাজিরা চলতেই থাকবে।"
                : "বেতন জমবে মৌসুম শুরু বা যোগদান (যেটা পরে) থেকে আজ বা কাজ ছাড়ার দিন পর্যন্ত। আগের মৌসুমের বাকি \"পূর্বের বকেয়া ও জের\" পাতায় রাখুন।"}</p>
            </div>
          </div>}
          <DialogFooter><Button onClick={() => saveW.mutate()} disabled={saveW.isPending}>সংরক্ষণ</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* payment dialog */}
      <ExpenseEntryDialog open={!!payFor} onOpenChange={(o) => { if (!o) setPayFor(null); }}
        head={mode === "daily" ? "daily" : "staff"} lockHead partyId={payFor} onDone={invalidate} />

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

      {/* attendance dialog: everyone ticked unless marked absent that day */}
      <Dialog open={attOpen} onOpenChange={setAttOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>দৈনিক হাজিরা</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>তারিখ</Label><Input type="date" value={attDate} max={today} onChange={(e) => e.target.value && openAtt(e.target.value)} /></div>
            <p className="rounded-lg bg-muted px-3 py-2 text-sm">সবাই উপস্থিত ধরা আছে। যে আসেনি, তার টিক তুলে দিন।</p>
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" variant="outline" className="h-10" onClick={() => { setPresent(new Set(activeOn(attDate).map((w) => w.id))); setHalf(new Set()); }}>সবাই উপস্থিত</Button>
              <Button type="button" variant="outline" className="h-10" onClick={() => { setPresent(new Set()); setHalf(new Set()); }}>সবাই অনুপস্থিত</Button>
            </div>
            <div className="max-h-72 space-y-2 overflow-y-auto">
              {activeOn(attDate).length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">এই দিনে কেউ কাজে ছিল না</p>}
              {activeOn(attDate).map((w) => (
                <label key={w.id} className={`flex items-center gap-3 rounded-lg border p-2 ${present.has(w.id) ? "" : "border-destructive/40 bg-destructive/5"}`}>
                  <Checkbox className="h-6 w-6" checked={present.has(w.id)} onCheckedChange={(c) => { const n = new Set(present); c ? n.add(w.id) : n.delete(w.id); setPresent(n); }} />
                  <span className="flex-1">{w.name}{!present.has(w.id) && <span className="ml-1 text-xs text-destructive">অনুপস্থিত</span>}</span>
                  <span onClick={(e) => e.preventDefault()} className="flex items-center gap-1 text-xs">
                    <Checkbox checked={present.has(w.id) && half.has(w.id)} onCheckedChange={(c) => { const n = new Set(half); c ? n.add(w.id) : n.delete(w.id); setHalf(n); if (c) setPresent(new Set(present).add(w.id)); }} /> হাফ
                  </span>
                  <span className="w-14 text-right text-xs text-muted-foreground">৳ {bn(!present.has(w.id) ? 0 : half.has(w.id) ? wageOf(w, attDate) / 2 : wageOf(w, attDate))}</span>
                </label>
              ))}
            </div>
            <p className="text-sm">উপস্থিত {bn(activeOn(attDate).filter((w) => present.has(w.id)).length)} জন{[...half].filter((id) => present.has(id)).length ? ` (হাফ ${bn([...half].filter((id) => present.has(id)).length)})` : ""} • এই দিনের মজুরি ৳ {bn(activeOn(attDate).filter((w) => present.has(w.id)).reduce((a, w) => a + wageOf(w, attDate) * (half.has(w.id) ? 0.5 : 1), 0))}</p>
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
            const marks = (attQ.data ?? []).filter((a: any) => a.worker_id === detail.id && (a.present === false || a.is_half_day)).sort((a, b) => b.date.localeCompare(a.date));
            const pays = (payQ.data ?? []).filter((p) => p.worker_id === detail.id);
            return (
              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg border p-2"><div className="text-xs text-muted-foreground">পাওনা</div>৳ {bn(s.earned)}</div>
                  <div className="rounded-lg border p-2"><div className="text-xs text-muted-foreground">পরিশোধ</div>৳ {bn(s.paid)}</div>
                  <div className="rounded-lg border p-2"><div className="text-xs text-muted-foreground">বাকি</div><b>৳ {bn(s.due)}</b></div>
                </div>
                {mode === "daily" && <div>
                  <div><b>হাজিরা:</b> {fmtDays(s)}{detail.join_date ? ` — ${bnDate(detail.join_date)} থেকে প্রতিদিন উপস্থিত ধরা` : ""}</div>
                  <div className="mt-1"><b>অনুপস্থিত / হাফ দিন:</b> {marks.length === 0 ? "নেই" : <ul className="mt-1 space-y-1">{marks.map((a: any) => (
                    <li key={a.id} className="flex items-center justify-between rounded border px-2 py-1">
                      <span>{bnDate(a.date)} — {a.is_half_day ? "হাফ দিন" : "আসেনি"}</span>
                      <Button size="sm" variant="ghost" aria-label="মুছুন (উপস্থিত ধরা হবে)" onClick={() => confirm("এই দিন উপস্থিত ধরবেন?") && delAbs.mutate(a.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                    </li>))}</ul>}</div>
                </div>}
                {mode === "salary" && (() => {
                  const abs = marks;
                  return <div><b>অনুপস্থিতি / ছুটি:</b> {abs.length === 0 ? "—" : <ul className="mt-1 space-y-1">{abs.map((a: any) => (
                    <li key={a.id} className="flex items-center justify-between rounded border px-2 py-1">
                      <span>{bnDate(a.date)} — {a.is_half_day ? "হাফ দিন" : "পুরো দিন"} {a.note ? `(${a.note})` : ""}</span>
                      <Button size="sm" variant="ghost" onClick={() => confirm("মুছবেন?") && delAbs.mutate(a.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                    </li>))}</ul>}
                    <div className="mt-1 text-xs text-muted-foreground">কাজের দিন {bn(s.days)} • বাদ {bn(s.absent)} দিন × ৳ {bn(Math.round(Number(detail.monthly_salary || 0) / 30))}</div>
                  </div>;
                })()}
                <div><b>পেমেন্ট:</b>{pays.length === 0 ? " —" : <ul className="mt-1 list-disc pl-5">{pays.map((p) => <li key={p.id}>{bnDate(p.payment_date)} — ৳ {bn(p.amount)} {p.note ? `(${p.note})` : ""}</li>)}</ul>}</div>
              </div>
            );
          })()}
          <DialogFooter><Button variant="outline" onClick={() => printDetail(detail)}><Printer className="mr-1 h-4 w-4" /> প্রিন্ট</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* absence dialog (salaried) */}
      <Dialog open={!!absDlg} onOpenChange={(o) => !o && setAbsDlg(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>ছুটি / অনুপস্থিতি — {absDlg ? nameOf(absDlg.worker_id) : ""}</DialogTitle></DialogHeader>
          {absDlg && <div className="space-y-3">
            <div><Label>তারিখ</Label><Input type="date" value={absDlg.date} onChange={(e) => setAbsDlg({ ...absDlg, date: e.target.value })} /></div>
            <label className="flex items-center gap-2"><Checkbox checked={absDlg.half} onCheckedChange={(c) => setAbsDlg({ ...absDlg, half: !!c })} /> হাফ দিন (অর্ধেক টাকা বাদ)</label>
            <div><Label>নোট</Label><Input value={absDlg.note} onChange={(e) => setAbsDlg({ ...absDlg, note: e.target.value })} /></div>
          </div>}
          <DialogFooter><Button onClick={() => saveAbs.mutate()} disabled={saveAbs.isPending}>সংরক্ষণ</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      {/* many days absent (kiln closed, rain, leave) */}
      <Dialog open={!!bulk} onOpenChange={(o) => !o && setBulk(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>কয়েক দিন অনুপস্থিত / ভাটা বন্ধ</DialogTitle></DialogHeader>
          {bulk && <div className="space-y-3">
            <p className="text-sm text-muted-foreground">বাছাই করা সবাইকে এই দিনগুলোতে অনুপস্থিত ধরা হবে, ওই দিনগুলোর মজুরি যোগ হবে না। ভুল হলে নাম খুলে দিনটা মুছে দিন।</p>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>শুরু</Label><Input type="date" value={bulk.from} onChange={(e) => setBulk({ ...bulk, from: e.target.value })} /></div>
              <div><Label>শেষ</Label><Input type="date" value={bulk.to} onChange={(e) => setBulk({ ...bulk, to: e.target.value })} /></div>
            </div>
            <div className="max-h-60 space-y-2 overflow-y-auto">
              {(workersQ.data ?? []).filter((w: any) => w.active !== false).map((w: any) => (
                <label key={w.id} className="flex items-center gap-3 rounded-lg border p-2">
                  <Checkbox checked={bulk.ids.has(w.id)} onCheckedChange={(c) => { const n = new Set(bulk.ids); c ? n.add(w.id) : n.delete(w.id); setBulk({ ...bulk, ids: n }); }} />
                  <span className="flex-1">{w.name}</span>
                  <span className="text-xs text-muted-foreground">{w.join_date ? `যোগদান ${bnDate(w.join_date)}` : ""}</span>
                </label>
              ))}
            </div>
          </div>}
          <DialogFooter><Button onClick={() => saveBulk.mutate()} disabled={saveBulk.isPending}>অনুপস্থিত ধরুন</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
