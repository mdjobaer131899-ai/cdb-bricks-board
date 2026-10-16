import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react";
import { CloudRain, Factory, Loader2, Pencil, Plus, Settings2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { ProcessStepBar } from "@/components/process-step-bar";
import { supabase } from "@/integrations/supabase/client";
import { sdb } from "@/lib/season-db";
import { bn, bnDate, todayBD } from "@/lib/format";
import { useCurrentUser } from "@/lib/use-current-user";
import { fetchAllRows } from "@/lib/fetch-all";
import {
  DAMAGE_REASONS, RATE_LABEL, fetchMills, fetchProductionRates, rateOn,
  type Mill, type ProductionRate, type RateKind,
} from "@/lib/production";
import { toast } from "sonner";

export type KachaStep = "production" | "load" | "damage";

const STEP_ORDER: Array<{ key: KachaStep | "unload"; label: string }> = [
  { key: "production", label: "কাঁচা ইট" },
  { key: "load", label: "ঢোকানো" },
  { key: "unload", label: "বের করা" },
];

export function StepBar({ current }: { current: KachaStep | "unload" }) {
  const idx = STEP_ORDER.findIndex((s) => s.key === current);
  return (
    <ProcessStepBar
      steps={STEP_ORDER.map((s, i) => ({
        label: s.label,
        status: i < idx ? "done" : i === idx ? "current" : "upcoming",
      }))}
    />
  );
}

const tk = (n: number) => `৳${bn(Math.round(n))}`;
const NONE = "__none__";

type Form = {
  id?: string;
  type: "work" | "damage";
  entry_date: string;
  mill_id: string;
  sardar_id: string;
  quantity: string;
  rate: string;
  rateTouched: boolean;
  amount: string;
  reason: string;
  note: string;
};

const emptyForm = (type: Form["type"]): Form => ({
  type, entry_date: todayBD(), mill_id: NONE, sardar_id: NONE, quantity: "", rate: "", rateTouched: false,
  amount: "", reason: DAMAGE_REASONS[0], note: "",
});

interface Props {
  step: "production" | "load";
  title: string;
  subtitle: string;
  icon: LucideIcon;
  totalLabel: string;
  qtyLabel?: string;
}

export function KachaStepPage({ step, title, subtitle, icon: Icon, totalLabel, qtyLabel = "পরিমাণ (পিস)" }: Props) {
  const qc = useQueryClient();
  const { data: me } = useCurrentUser();
  const isAdmin = me?.role === "admin";
  const isMillStep = step === "production";
  const rateKind: RateKind = step;

  const [dlg, setDlg] = useState<{ open: boolean; form: Form }>({ open: false, form: emptyForm("work") });
  const [rateDlg, setRateDlg] = useState(false);
  const [millDlg, setMillDlg] = useState<Mill | null>(null);

  const sardarsQ = useQuery({
    queryKey: ["sardars"],
    queryFn: async () => {
      const { data, error } = await sdb.from("sardars").select("*").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
  const millsQ = useQuery({ queryKey: ["mills"], queryFn: fetchMills, enabled: isMillStep });
  const ratesQ = useQuery({ queryKey: ["production-rates"], queryFn: fetchProductionRates });

  const types = isMillStep ? ["production", "damage"] : [step];
  const entriesQ = useQuery({
    queryKey: ["kacha-brick-entries", step],
    queryFn: () => fetchAllRows<any>(() =>
      sdb.from("kacha_brick_entries").select("*").in("entry_type", types)
        .order("entry_date", { ascending: false }).order("id")),
  });

  const rows = entriesQ.data ?? [];
  const sardars = (sardarsQ.data ?? []) as any[];
  const mills = millsQ.data ?? [];
  const sardarName = (id: string | null) => (id ? sardars.find((s) => s.id === id)?.name ?? "—" : "—");
  const millName = (id: string | null) => (id ? mills.find((m) => m.id === id)?.name ?? "" : "");
  const stepSardars = sardars.filter((s) => s.kind === (isMillStep ? "mill" : "load") && s.is_active !== false);

  const today = todayBD();
  const currentRate = rateOn(ratesQ.data, rateKind, today);

  const totals = useMemo(() => {
    let qty = 0, amount = 0, todayQty = 0, damaged = 0;
    const perMill = new Map<string, number>();
    rows.forEach((e: any) => {
      const q = Number(e.quantity || 0);
      if (e.entry_type === "damage") { damaged += q; return; }
      qty += q;
      amount += Number(e.amount || 0);
      if (e.entry_date === today) todayQty += q;
      if (e.mill_id) perMill.set(e.mill_id, (perMill.get(e.mill_id) ?? 0) + q);
    });
    return { qty, amount, todayQty, damaged, perMill };
  }, [rows, today]);

  const invalidate = () => {
    for (const key of [["kacha-brick-entries"], ["kacha-by-sardar"], ["mills"], ["production-rates"]]) qc.invalidateQueries({ queryKey: key });
  };

  // Fill sardar and rate from the mill and the date unless the user typed a rate
  const patch = (p: Partial<Form>) => setDlg((s) => {
    const f = { ...s.form, ...p };
    if (("mill_id" in p) && f.mill_id !== NONE) {
      const m = mills.find((x) => x.id === f.mill_id);
      if (m?.sardar_id) f.sardar_id = m.sardar_id;
    }
    if (f.type === "work" && !f.rateTouched && ("entry_date" in p || "mill_id" in p)) {
      const r = rateOn(ratesQ.data, rateKind, f.entry_date);
      f.rate = r != null ? String(r) : "";
    }
    return { ...s, form: f };
  });

  const openNew = (type: Form["type"]) => {
    const f = emptyForm(type);
    if (type === "work") {
      const r = rateOn(ratesQ.data, rateKind, f.entry_date);
      f.rate = r != null ? String(r) : "";
    }
    setDlg({ open: true, form: f });
  };

  const openEdit = (e: any) => setDlg({
    open: true,
    form: {
      id: e.id, type: e.entry_type === "damage" ? "damage" : "work", entry_date: e.entry_date,
      mill_id: e.mill_id ?? NONE, sardar_id: e.sardar_id ?? NONE, quantity: String(e.quantity ?? ""),
      rate: String(e.rate ?? ""), rateTouched: true, amount: String(e.amount ?? ""),
      reason: e.damage_reason ?? DAMAGE_REASONS[0], note: e.note ?? "",
    },
  });

  const f = dlg.form;
  const autoAmount = Math.round((Number(f.quantity || 0) / 1000) * Number(f.rate || 0));

  const save = useMutation({
    mutationFn: async () => {
      const qty = Number(f.quantity || 0);
      if (!(qty > 0)) throw new Error("পরিমাণ দিন");
      if (!f.entry_date) throw new Error("তারিখ দিন");
      let payload: Record<string, unknown>;
      if (f.type === "damage") {
        payload = {
          entry_date: f.entry_date, entry_type: "damage", mill_id: f.mill_id === NONE ? null : f.mill_id,
          sardar_id: null, quantity: qty, rate: 0, amount: 0, damage_reason: f.reason, note: f.note || null,
        };
      } else {
        if (isMillStep && mills.length > 0 && f.mill_id === NONE) throw new Error("মিল বেছে নিন");
        const rate = Number(f.rate || 0);
        payload = {
          entry_date: f.entry_date, entry_type: step, mill_id: isMillStep && f.mill_id !== NONE ? f.mill_id : null,
          sardar_id: f.sardar_id === NONE ? null : f.sardar_id, quantity: qty, rate,
          amount: f.amount !== "" ? Number(f.amount) : Math.round((qty / 1000) * rate),
          damage_reason: null, note: f.note || null,
        };
      }
      if (f.id) {
        const { error } = await sdb.from("kacha_brick_entries").update(payload as any).eq("id", f.id);
        if (error) throw error;
      } else {
        if (!me?.user.id) throw new Error("লগইন প্রয়োজন");
        const { error } = await sdb.from("kacha_brick_entries").insert({ ...payload, created_by: me.user.id } as any);
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.success("সংরক্ষিত"); setDlg({ open: false, form: emptyForm("work") }); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sdb.from("kacha_brick_entries").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("মুছে ফেলা হয়েছে"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  // group entries by day for the list
  const days = useMemo(() => {
    const m = new Map<string, any[]>();
    for (const r of rows) (m.get(r.entry_date) ?? m.set(r.entry_date, []).get(r.entry_date)!).push(r);
    return [...m.entries()];
  }, [rows]);

  return (
    <div className="mx-auto max-w-3xl space-y-4 pb-28 md:pb-6">
      <div>
        <h1 className="flex items-center gap-2 font-display text-[26px] font-extrabold leading-tight">
          <Icon className="h-6 w-6 text-primary" /> {title}
        </h1>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>

      <Card><CardContent className="p-4"><StepBar current={step} /></CardContent></Card>

      {/* Totals */}
      <section className="bg-brick-pattern relative overflow-hidden rounded-[20px] bg-ink p-[18px] text-ink-foreground">
        <div className="text-xs font-bold tracking-[0.12em] text-stone-300">{totalLabel} · এই সিজন</div>
        <div className="mt-2 font-display num text-[36px] font-extrabold leading-none">{bn(totals.qty)} <span className="text-base font-bold text-stone-300">পিস</span></div>
        <div className={`mt-3.5 grid gap-2 ${isMillStep ? "grid-cols-3" : "grid-cols-2"}`}>
          <div className="rounded-xl border border-white/10 bg-white/[0.07] px-3 py-2">
            <div className="text-xs font-semibold text-stone-300">আজ</div>
            <div className="num text-base font-bold">{bn(totals.todayQty)}</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.07] px-3 py-2">
            <div className="text-xs font-semibold text-stone-300">মজুরি</div>
            <div className="num text-base font-bold text-amber-200">{tk(totals.amount)}</div>
          </div>
          {isMillStep && (
            <div className="rounded-xl border border-white/10 bg-white/[0.07] px-3 py-2">
              <div className="text-xs font-semibold text-red-200">নষ্ট</div>
              <div className="num text-base font-bold text-red-300">{bn(totals.damaged)}</div>
            </div>
          )}
        </div>
      </section>

      {/* Actions */}
      <div className={`grid gap-2 ${isMillStep ? "grid-cols-2" : "grid-cols-1"}`}>
        <Button className="h-12 gap-2 rounded-2xl text-base font-bold" onClick={() => openNew("work")}>
          <Plus className="h-5 w-5" /> নতুন এন্ট্রি
        </Button>
        {isMillStep && (
          <Button variant="outline" className="h-12 gap-2 rounded-2xl border-destructive/40 text-base font-bold text-destructive" onClick={() => openNew("damage")}>
            <CloudRain className="h-5 w-5" /> নষ্ট ইট
          </Button>
        )}
      </div>

      {/* Current rate */}
      <section className="flex items-center justify-between gap-3 rounded-[20px] border bg-card p-4">
        <div className="min-w-0">
          <div className="text-xs font-semibold text-muted-foreground">{RATE_LABEL[rateKind]} — এখনকার রেট</div>
          {ratesQ.isLoading ? <Skeleton className="mt-1 h-6 w-32" /> : currentRate != null ? (
            <div className="num font-display text-xl font-extrabold">{tk(currentRate)} <span className="text-sm font-semibold text-muted-foreground">প্রতি হাজার</span></div>
          ) : (
            <div className="text-sm font-semibold text-warning">রেট বসানো হয়নি</div>
          )}
        </div>
        {isAdmin && (
          <Button variant="outline" className="h-10 shrink-0 gap-1 rounded-xl" onClick={() => setRateDlg(true)}>
            <Settings2 className="h-4 w-4" /> রেট বদলান
          </Button>
        )}
      </section>

      {/* Mills */}
      {isMillStep && (
        <section className="rounded-[20px] border bg-card p-4">
          <h2 className="flex items-center gap-2 text-base font-bold"><Factory className="h-4 w-4" /> মিল</h2>
          <p className="text-xs text-muted-foreground">{isAdmin ? "মিলে চাপলে সরদার বদলাতে পারবেন। আগের এন্ট্রি আগের সরদারেরই থাকবে।" : "কোন মিলে কে আছেন"}</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {millsQ.isLoading ? <><Skeleton className="h-20" /><Skeleton className="h-20" /></> : mills.map((m) => (
              <button
                key={m.id}
                type="button"
                disabled={!isAdmin}
                onClick={() => setMillDlg(m)}
                className="rounded-2xl border bg-background p-3 text-left transition active:scale-[0.98] disabled:active:scale-100"
              >
                <div className="text-sm font-bold">{m.name}</div>
                <div className="truncate text-xs text-muted-foreground">{m.sardar_id ? sardarName(m.sardar_id) : "সরদার নেই"}</div>
                <div className="num mt-1 text-base font-extrabold">{bn(totals.perMill.get(m.id) ?? 0)} <span className="text-xs font-semibold text-muted-foreground">পিস</span></div>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Entries */}
      <section className="overflow-hidden rounded-[20px] border bg-card">
        <div className="border-b p-3 text-sm font-bold">এন্ট্রি তালিকা</div>
        {entriesQ.isLoading ? (
          <div className="space-y-2 p-3"><Skeleton className="h-14" /><Skeleton className="h-14" /></div>
        ) : days.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">কোনো এন্ট্রি নেই</div>
        ) : days.map(([d, list]) => (
          <div key={d}>
            <div className="flex items-center justify-between bg-muted/70 px-3 py-2 text-xs">
              <b className="text-sm">{bnDate(d)}</b>
              <span className="num font-semibold">{bn(list.filter((e) => e.entry_type !== "damage").reduce((a, e) => a + Number(e.quantity || 0), 0))} পিস</span>
            </div>
            <div className="divide-y">
              {list.map((e: any) => {
                const damaged = e.entry_type === "damage";
                return (
                  <div key={e.id} className="flex items-center gap-3 px-3 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="font-bold leading-snug">
                        {damaged ? <span className="text-destructive">নষ্ট — {e.damage_reason ?? "কারণ নেই"}</span> : sardarName(e.sardar_id)}
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {[millName(e.mill_id), damaged ? null : `${bn(Number(e.quantity) / 1000)} হাজার × ${tk(Number(e.rate || 0))}`, e.note].filter(Boolean).join(" · ")}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className={`num font-display text-base font-extrabold ${damaged ? "text-destructive" : ""}`}>{damaged ? "−" : ""}{bn(e.quantity)}</div>
                      {!damaged && <div className="num text-xs font-semibold text-muted-foreground">{tk(Number(e.amount || 0))}</div>}
                    </div>
                    {isAdmin && (
                      <div className="flex shrink-0 flex-col gap-1">
                        <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="সম্পাদনা" onClick={() => openEdit(e)}><Pencil className="h-4 w-4" /></Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" aria-label="মুছুন" onClick={() => { if (confirm("মুছে ফেলবেন?")) del.mutate(e.id); }}><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </section>

      {/* Entry form */}
      <Dialog open={dlg.open} onOpenChange={(o) => setDlg((s) => ({ ...s, open: o }))}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{f.type === "damage" ? "নষ্ট কাঁচা ইট" : f.id ? "এন্ট্রি সম্পাদনা" : title}</DialogTitle>
            {f.type === "damage" && <DialogDescription>বৃষ্টি বা ভাঙায় কত কাঁচা ইট গেল। মজুরিতে প্রভাব নেই।</DialogDescription>}
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>তারিখ</Label>
              <Input type="date" className="h-11" value={f.entry_date} onChange={(e) => patch({ entry_date: e.target.value })} />
            </div>

            {isMillStep && mills.length > 0 && (
              <div className="space-y-1.5">
                <Label>মিল{f.type === "work" ? " *" : ""}</Label>
                <div className="grid grid-cols-4 gap-1.5">
                  {mills.filter((m) => m.is_active).map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => patch({ mill_id: f.mill_id === m.id && f.type === "damage" ? NONE : m.id })}
                      className={`h-11 rounded-xl text-sm font-bold transition ${f.mill_id === m.id ? "bg-primary text-primary-foreground" : "border bg-background"}`}
                    >
                      {m.name.replace("মিল ", "")}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {f.type === "work" && (
              <div className="space-y-1.5">
                <Label>সরদার</Label>
                <Select value={f.sardar_id} onValueChange={(v) => patch({ sardar_id: v })}>
                  <SelectTrigger className="h-11"><SelectValue placeholder="বেছে নিন" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>— নেই —</SelectItem>
                    {stepSardars.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                    {f.sardar_id !== NONE && !stepSardars.some((s) => s.id === f.sardar_id) && (
                      <SelectItem value={f.sardar_id}>{sardarName(f.sardar_id)}</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className={`grid gap-3 ${f.type === "work" ? "grid-cols-2" : "grid-cols-1"}`}>
              <div className="space-y-1.5">
                <Label>{qtyLabel}</Label>
                <Input type="number" inputMode="numeric" className="h-11" value={f.quantity} onChange={(e) => patch({ quantity: e.target.value })} />
              </div>
              {f.type === "work" && (
                <div className="space-y-1.5">
                  <Label>রেট (প্রতি হাজার)</Label>
                  <Input type="number" inputMode="decimal" className="h-11" value={f.rate} onChange={(e) => patch({ rate: e.target.value, rateTouched: true })} />
                </div>
              )}
            </div>

            {f.type === "damage" && (
              <div className="space-y-1.5">
                <Label>কারণ</Label>
                <div className="flex flex-wrap gap-1.5">
                  {DAMAGE_REASONS.map((r) => (
                    <button key={r} type="button" onClick={() => patch({ reason: r })}
                      className={`h-9 rounded-full px-3 text-sm font-semibold ${f.reason === r ? "bg-destructive text-destructive-foreground" : "border bg-background"}`}>
                      {r}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {f.type === "work" && (
              <div className="space-y-1.5">
                <Label>টাকা (খালি রাখলে নিজে হিসাব হবে)</Label>
                <Input type="number" inputMode="decimal" className="h-11" placeholder={String(autoAmount)} value={f.amount} onChange={(e) => patch({ amount: e.target.value })} />
              </div>
            )}

            <div className="space-y-1.5">
              <Label>মন্তব্য</Label>
              <Textarea rows={2} value={f.note} onChange={(e) => patch({ note: e.target.value })} />
            </div>

            {f.type === "work" && (
              <div className="flex justify-between rounded-xl bg-muted/60 p-3 text-sm font-semibold">
                <span>মজুরি ({bn(Number(f.quantity || 0) / 1000)} হাজার)</span>
                <span className="num">{tk(f.amount !== "" ? Number(f.amount) : autoAmount)}</span>
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDlg((s) => ({ ...s, open: false }))}>বাতিল</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} সংরক্ষণ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {rateDlg && <RateDialog kind={rateKind} rates={ratesQ.data ?? []} onClose={() => setRateDlg(false)} onDone={invalidate} />}
      {millDlg && <MillDialog mill={millDlg} sardars={sardars.filter((s) => s.kind === "mill")} onClose={() => setMillDlg(null)} onDone={invalidate} />}
    </div>
  );
}

/** Add a per-thousand rate from a date; earlier entries keep their own rate */
export function RateDialog({ kind, rates, onClose, onDone }: { kind: RateKind; rates: ProductionRate[]; onClose: () => void; onDone: () => void }) {
  const [rate, setRate] = useState("");
  const [from, setFrom] = useState(todayBD());
  const history = rates.filter((r) => r.kind === kind);
  const save = useMutation({
    mutationFn: async () => {
      const v = Number(rate);
      if (!(v >= 0) || rate === "") throw new Error("রেট দিন");
      if (!from) throw new Error("কোন তারিখ থেকে দিন");
      const { error } = await (supabase as any).from("production_rates")
        .upsert({ kind, rate: v, effective_from: from }, { onConflict: "kind,effective_from" });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("রেট সংরক্ষিত"); onDone(); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("production_rates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("মুছে ফেলা হয়েছে"); onDone(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{RATE_LABEL[kind]} — রেট</DialogTitle>
          <DialogDescription>নতুন রেট শুধু এই তারিখ থেকে নতুন এন্ট্রিতে বসবে। আগের এন্ট্রির টাকা বদলাবে না।</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5"><Label>রেট (প্রতি হাজার)</Label><Input type="number" inputMode="decimal" className="h-11" value={rate} onChange={(e) => setRate(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>কোন তারিখ থেকে</Label><Input type="date" className="h-11" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        </div>
        <Button className="h-11 w-full" onClick={() => save.mutate()} disabled={save.isPending}>সংরক্ষণ</Button>
        {history.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-xs font-semibold text-muted-foreground">আগের রেট</div>
            <div className="divide-y rounded-xl border">
              {history.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                  <span>{bnDate(r.effective_from)} থেকে</span>
                  <span className="flex items-center gap-1">
                    <b className="num">{tk(r.rate)}</b>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" aria-label="মুছুন" onClick={() => { if (confirm("এই রেট মুছবেন?")) remove.mutate(r.id); }}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function MillDialog({ mill, sardars, onClose, onDone }: { mill: Mill; sardars: any[]; onClose: () => void; onDone: () => void }) {
  const [sardarId, setSardarId] = useState(mill.sardar_id ?? NONE);
  const save = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).from("mills").update({ sardar_id: sardarId === NONE ? null : sardarId }).eq("id", mill.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("মিলের সরদার বদলানো হয়েছে"); onDone(); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mill.name} — সরদার</DialogTitle>
          <DialogDescription>নতুন এন্ট্রিতে এই সরদার বসবে। আগের এন্ট্রি আগের সরদারেরই থাকবে।</DialogDescription>
        </DialogHeader>
        <Select value={sardarId} onValueChange={setSardarId}>
          <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>— কেউ না —</SelectItem>
            {sardars.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <DialogFooter><Button className="h-11" onClick={() => save.mutate()} disabled={save.isPending}>সংরক্ষণ</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
