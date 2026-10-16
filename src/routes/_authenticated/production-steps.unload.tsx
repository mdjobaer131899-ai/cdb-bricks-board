import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpFromLine, Loader2, Pencil, Plus, Settings2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { RateDialog, StepBar } from "@/components/kacha-step-page";
import { supabase } from "@/integrations/supabase/client";
import { sdb } from "@/lib/season-db";
import { fetchActiveBrickTypes } from "@/lib/sales-queries";
import { fetchAllRows } from "@/lib/fetch-all";
import { UNLOAD_GRADES, fetchProductionRates, rateOn } from "@/lib/production";
import { bn, bnDate, todayBD } from "@/lib/format";
import { useCurrentUser } from "@/lib/use-current-user";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/production-steps/unload")({
  head: () => ({
    meta: [
      { title: "বের করার হিসাব (পাকা ইট) — CDB Bricks" },
      { name: "description", content: "ভাটা থেকে পাকা ইট বের করা: গ্রেড অনুযায়ী স্টকে যোগ আর আনলোড সরদারের মজুরি।" },
      { property: "og:title", content: "বের করার হিসাব (পাকা ইট) — CDB Bricks" },
      { property: "og:description", content: "পাকা ইট বের করার এন্ট্রি, গ্রেড ও মজুরি।" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: UnloadStepPage,
});

const tk = (n: number) => `৳${bn(Math.round(n))}`;
const NONE = "__none__";

type Form = {
  id?: string;
  date: string;
  sardar_id: string;
  rate: string;
  rateTouched: boolean;
  note: string;
  qty: Record<string, string>; // brick_type_id -> quantity
};

function UnloadStepPage() {
  const qc = useQueryClient();
  const { data: me } = useCurrentUser();
  const isAdmin = me?.role === "admin";
  const [form, setForm] = useState<Form | null>(null);
  const [rateDlg, setRateDlg] = useState(false);

  const bricksQ = useQuery({ queryKey: ["brick-types-active"], queryFn: fetchActiveBrickTypes });
  const ratesQ = useQuery({ queryKey: ["production-rates"], queryFn: fetchProductionRates });
  const sardarsQ = useQuery({
    queryKey: ["sardars"],
    queryFn: async () => {
      const { data, error } = await sdb.from("sardars").select("*").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  // Unload = one sardar wage line (kacha 'unload') with its grade rows (production_entries)
  const listQ = useQuery({
    queryKey: ["unload-entries"],
    queryFn: () => fetchAllRows<any>(() =>
      sdb.from("kacha_brick_entries")
        .select("id, entry_date, sardar_id, quantity, rate, amount, note, grades:production_entries(id, brick_type_id, quantity)")
        .eq("entry_type", "unload")
        .order("entry_date", { ascending: false })
        .order("id")),
  });
  // Older unloads saved before grades were linked to a sardar line
  const legacyQ = useQuery({
    queryKey: ["production-entries", "legacy"],
    queryFn: () => fetchAllRows<any>(() =>
      sdb.from("production_entries").select("id, production_date, brick_type_id, quantity, notes")
        .is("unload_entry_id", null).order("production_date", { ascending: false }).order("id")),
  });

  const grades = useMemo(() => {
    const all = (bricksQ.data ?? []) as Array<{ id: string; name: string }>;
    return UNLOAD_GRADES.map((n) => all.find((b) => b.name === n)).filter(Boolean) as Array<{ id: string; name: string }>;
  }, [bricksQ.data]);
  const gradeName = (id: string) => ((bricksQ.data ?? []) as any[]).find((b) => b.id === id)?.name ?? "—";
  const sardars = (sardarsQ.data ?? []) as any[];
  const unloadSardars = sardars.filter((s) => s.kind === "unload" && s.is_active !== false);
  const sardarName = (id: string | null) => (id ? sardars.find((s) => s.id === id)?.name ?? "—" : "—");

  const rows = listQ.data ?? [];
  const legacy = legacyQ.data ?? [];
  const today = todayBD();
  const currentRate = rateOn(ratesQ.data, "unload", today);

  const totals = useMemo(() => {
    const byGrade = new Map<string, number>();
    let qty = 0, wage = 0, todayQty = 0;
    for (const r of rows) {
      qty += Number(r.quantity || 0);
      wage += Number(r.amount || 0);
      if (r.entry_date === today) todayQty += Number(r.quantity || 0);
      for (const g of r.grades ?? []) byGrade.set(g.brick_type_id, (byGrade.get(g.brick_type_id) ?? 0) + Number(g.quantity || 0));
    }
    for (const p of legacy) {
      qty += Number(p.quantity || 0);
      if (p.production_date === today) todayQty += Number(p.quantity || 0);
      byGrade.set(p.brick_type_id, (byGrade.get(p.brick_type_id) ?? 0) + Number(p.quantity || 0));
    }
    return { qty, wage, todayQty, byGrade };
  }, [rows, legacy, today]);

  const invalidate = () => {
    for (const key of [["unload-entries"], ["production-entries"], ["kacha-brick-entries"], ["kacha-by-sardar"], ["current-stock"], ["stock"], ["production-rates"]]) {
      qc.invalidateQueries({ queryKey: key });
    }
  };

  const openNew = () => {
    const r = rateOn(ratesQ.data, "unload", today);
    setForm({ date: today, sardar_id: unloadSardars.length === 1 ? unloadSardars[0].id : NONE, rate: r != null ? String(r) : "", rateTouched: false, note: "", qty: {} });
  };
  const openEdit = (r: any) => {
    const qty: Record<string, string> = {};
    for (const g of r.grades ?? []) qty[g.brick_type_id] = String(Number(qty[g.brick_type_id] || 0) + Number(g.quantity || 0));
    setForm({ id: r.id, date: r.entry_date, sardar_id: r.sardar_id ?? NONE, rate: String(r.rate ?? ""), rateTouched: true, note: r.note ?? "", qty });
  };
  const setDate = (d: string) => setForm((f) => {
    if (!f) return f;
    const next = { ...f, date: d };
    if (!f.rateTouched) { const r = rateOn(ratesQ.data, "unload", d); next.rate = r != null ? String(r) : ""; }
    return next;
  });

  const formTotal = form ? Object.values(form.qty).reduce((a, v) => a + (Number(v) || 0), 0) : 0;
  const formWage = form ? Math.round((formTotal / 1000) * (Number(form.rate) || 0)) : 0;

  const save = useMutation({
    mutationFn: async () => {
      if (!form) return;
      if (!form.date) throw new Error("তারিখ দিন");
      if (!(formTotal > 0)) throw new Error("অন্তত একটি গ্রেডের পরিমাণ দিন");
      const { error } = await (supabase as any).rpc("save_unload", {
        p_id: form.id ?? null,
        p_date: form.date,
        p_sardar_id: form.sardar_id === NONE ? null : form.sardar_id,
        p_rate: Number(form.rate) || 0,
        p_note: form.note || null,
        p_grades: Object.entries(form.qty)
          .filter(([, v]) => Number(v) > 0)
          .map(([brick_type_id, v]) => ({ brick_type_id, quantity: Number(v) })),
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("সংরক্ষিত — স্টকে যোগ হয়েছে"); setForm(null); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      // grade rows (and their stock) go with the unload line (ON DELETE CASCADE)
      const { error } = await sdb.from("kacha_brick_entries").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("মুছে ফেলা হয়েছে"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const delLegacy = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sdb.from("production_entries").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("মুছে ফেলা হয়েছে"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mx-auto max-w-3xl space-y-4 pb-28 md:pb-6">
      <div>
        <h1 className="flex items-center gap-2 font-display text-[26px] font-extrabold leading-tight">
          <ArrowUpFromLine className="h-6 w-6 text-primary" /> বের করা (পাকা ইট)
        </h1>
        <p className="text-sm text-muted-foreground">ধাপ ৩ — ভাটা থেকে বের করা ইট গ্রেড অনুযায়ী স্টকে যায়, সাথে আনলোড সরদারের মজুরি</p>
      </div>

      <Card><CardContent className="p-4"><StepBar current="unload" /></CardContent></Card>

      <section className="bg-brick-pattern relative overflow-hidden rounded-[20px] bg-ink p-[18px] text-ink-foreground">
        <div className="text-xs font-bold tracking-[0.12em] text-stone-300">মোট বের করা · এই সিজন</div>
        <div className="mt-2 font-display num text-[36px] font-extrabold leading-none">{bn(totals.qty)} <span className="text-base font-bold text-stone-300">পিস</span></div>
        <div className="mt-3.5 grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-white/10 bg-white/[0.07] px-3 py-2">
            <div className="text-xs font-semibold text-stone-300">আজ</div>
            <div className="num text-base font-bold">{bn(totals.todayQty)}</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.07] px-3 py-2">
            <div className="text-xs font-semibold text-stone-300">আনলোড মজুরি</div>
            <div className="num text-base font-bold text-amber-200">{tk(totals.wage)}</div>
          </div>
        </div>
      </section>

      {/* Grade mix */}
      <section className="rounded-[20px] border bg-card p-4">
        <h2 className="text-base font-bold">গ্রেড অনুযায়ী</h2>
        <div className="mt-3 space-y-2.5">
          {grades.map((g) => {
            const q = totals.byGrade.get(g.id) ?? 0;
            const pct = totals.qty ? (q / totals.qty) * 100 : 0;
            return (
              <div key={g.id}>
                <div className="flex items-baseline justify-between text-sm">
                  <span className="font-semibold">{g.name}</span>
                  <span className="num"><b>{bn(q)}</b> <span className="text-xs text-muted-foreground">({bn(Math.round(pct))}%)</span></span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(pct, 100)}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <Button className="h-12 w-full gap-2 rounded-2xl text-base font-bold" onClick={openNew}>
        <Plus className="h-5 w-5" /> নতুন এন্ট্রি
      </Button>

      <section className="flex items-center justify-between gap-3 rounded-[20px] border bg-card p-4">
        <div className="min-w-0">
          <div className="text-xs font-semibold text-muted-foreground">বের করা — এখনকার রেট</div>
          {ratesQ.isLoading ? <Skeleton className="mt-1 h-6 w-32" /> : currentRate != null ? (
            <div className="num font-display text-xl font-extrabold">{tk(currentRate)} <span className="text-sm font-semibold text-muted-foreground">প্রতি হাজার</span></div>
          ) : <div className="text-sm font-semibold text-warning">রেট বসানো হয়নি</div>}
        </div>
        {isAdmin && (
          <Button variant="outline" className="h-10 shrink-0 gap-1 rounded-xl" onClick={() => setRateDlg(true)}>
            <Settings2 className="h-4 w-4" /> রেট বদলান
          </Button>
        )}
      </section>

      <section className="overflow-hidden rounded-[20px] border bg-card">
        <div className="border-b p-3 text-sm font-bold">এন্ট্রি তালিকা</div>
        {listQ.isLoading ? (
          <div className="space-y-2 p-3"><Skeleton className="h-16" /><Skeleton className="h-16" /></div>
        ) : rows.length === 0 && legacy.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">কোনো এন্ট্রি নেই</div>
        ) : (
          <div className="divide-y">
            {rows.map((r) => (
              <div key={r.id} className="flex items-start gap-3 px-3 py-3">
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-muted-foreground">{bnDate(r.entry_date)} · {sardarName(r.sardar_id)}</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {(r.grades ?? []).map((g: any) => (
                      <span key={g.id} className="rounded-full bg-muted px-2 py-0.5 text-xs"><b className="num">{bn(g.quantity)}</b> {gradeName(g.brick_type_id)}</span>
                    ))}
                  </div>
                  {r.note && <div className="mt-1 text-xs text-muted-foreground">{r.note}</div>}
                </div>
                <div className="shrink-0 text-right">
                  <div className="num font-display text-base font-extrabold">{bn(r.quantity)}</div>
                  <div className="num text-xs font-semibold text-muted-foreground">{tk(Number(r.amount || 0))}</div>
                </div>
                {isAdmin && (
                  <div className="flex shrink-0 flex-col gap-1">
                    <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="সম্পাদনা" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" aria-label="মুছুন" onClick={() => { if (confirm("এই এন্ট্রি মুছবেন? স্টক থেকেও বাদ যাবে।")) del.mutate(r.id); }}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                )}
              </div>
            ))}
            {legacy.map((p) => (
              <div key={p.id} className="flex items-center gap-3 px-3 py-3">
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-muted-foreground">{bnDate(p.production_date)} · পুরনো এন্ট্রি (সরদার ছাড়া)</div>
                  <div className="font-semibold">{gradeName(p.brick_type_id)}</div>
                </div>
                <div className="num font-display text-base font-extrabold">{bn(p.quantity)}</div>
                {isAdmin && (
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" aria-label="মুছুন" onClick={() => { if (confirm("মুছবেন? স্টক থেকেও বাদ যাবে।")) delLegacy.mutate(p.id); }}><Trash2 className="h-4 w-4" /></Button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <Dialog open={!!form} onOpenChange={(o) => { if (!o) setForm(null); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form?.id ? "এন্ট্রি সম্পাদনা" : "পাকা ইট বের করা"}</DialogTitle>
            <DialogDescription>প্রতিটি গ্রেডে কত পিস বের হলো লিখুন। মোট থেকে সরদারের মজুরি হিসাব হবে।</DialogDescription>
          </DialogHeader>
          {form && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>তারিখ</Label><Input type="date" className="h-11" value={form.date} onChange={(e) => setDate(e.target.value)} /></div>
                <div className="space-y-1.5"><Label>রেট (প্রতি হাজার)</Label><Input type="number" inputMode="decimal" className="h-11" value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value, rateTouched: true })} /></div>
              </div>
              <div className="space-y-1.5">
                <Label>আনলোড সরদার</Label>
                <Select value={form.sardar_id} onValueChange={(v) => setForm({ ...form, sardar_id: v })}>
                  <SelectTrigger className="h-11"><SelectValue placeholder="বেছে নিন" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>— নেই —</SelectItem>
                    {unloadSardars.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 rounded-2xl border p-3">
                {grades.map((g) => (
                  <div key={g.id} className="grid grid-cols-[1fr_9rem] items-center gap-2">
                    <Label className="text-sm font-semibold">{g.name}</Label>
                    <Input
                      type="number"
                      inputMode="numeric"
                      className="h-11 text-right"
                      placeholder="০"
                      value={form.qty[g.id] ?? ""}
                      onChange={(e) => setForm({ ...form, qty: { ...form.qty, [g.id]: e.target.value } })}
                    />
                  </div>
                ))}
              </div>
              <div className="space-y-1.5"><Label>মন্তব্য</Label><Textarea rows={2} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></div>
              <div className="space-y-1 rounded-xl bg-muted/60 p-3 text-sm font-semibold">
                <div className="flex justify-between"><span>মোট বের করা</span><span className="num">{bn(formTotal)} পিস</span></div>
                <div className="flex justify-between"><span>সরদারের মজুরি</span><span className="num">{tk(formWage)}</span></div>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setForm(null)}>বাতিল</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} সংরক্ষণ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {rateDlg && <RateDialog kind="unload" rates={ratesQ.data ?? []} onClose={() => setRateDlg(false)} onDone={invalidate} />}
    </div>
  );
}
