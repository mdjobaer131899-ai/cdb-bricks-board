import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeDollarSign, Crown, Pencil, Plus, Printer, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { getSeasonRange } from "@/lib/season-db";
import { bn, bnDate, todayBD } from "@/lib/format";
import { useCurrentUser } from "@/lib/use-current-user";
import { printTable } from "@/lib/print-table";
import { rateAt, salaryEarned, type PayRate } from "@/lib/salary-accrual";
import { IncomeEntryDialog } from "@/components/income-entry";
import { ExpenseEntryDialog } from "@/components/expense-entry";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/owners")({
  head: () => ({
    meta: [
      { title: "মালিকের বিনিয়োগ — CDB Bricks" },
      { name: "description", content: "কোন মালিক কত টাকা বিনিয়োগ করেছেন, তুলেছেন, আর মালিকদের বেতনের হিসাব।" },
      { property: "og:title", content: "মালিকের বিনিয়োগ — CDB Bricks" },
      { property: "og:description", content: "মালিকদের বিনিয়োগ, উত্তোলন ও বেতন।" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: OwnersPage,
});

/**
 * Owners: investment and withdrawal are the owner's capital (all-time, not season-scoped).
 * With more than one owner each may draw a monthly salary: the rate history is pay_rates
 * (owner_id), salary taken is owner_transactions txn_type 'salary'. Salary is a business
 * cost (hand cash, cash book "মালিকের বেতন", P&L costs.ownerSalary), never a withdrawal.
 * Earned salary accrues inside the selected season like staff salaries (salary-accrual.ts).
 */
type TxType = "invest" | "withdraw" | "salary";
type Tx = { id: string; owner_id: string; txn_type: TxType; amount: number; txn_date: string; note: string | null };
type OwnerRate = PayRate & { id: string; owner_id: string; note: string | null };

const TYPE_LABEL: Record<TxType, string> = { invest: "বিনিয়োগ", withdraw: "উত্তোলন", salary: "বেতন" };
const TYPE_HELP: Record<TxType, string> = {
  invest: "মালিক ভাটায় টাকা দিলেন — হাতে নগদ বাড়বে।",
  withdraw: "মালিক নিজের বিনিয়োগ থেকে টাকা নিলেন — নিট বিনিয়োগ কমবে, এটা খরচ নয়।",
  salary: "মাসিক বেতন নিলেন — ভাটার খরচ, হাতে নগদ আর লাভ থেকে কমবে। বিনিয়োগ বদলাবে না।",
};
const TYPE_TONE: Record<TxType, string> = { invest: "text-success", withdraw: "text-destructive", salary: "text-warning" };

function OwnersPage() {
  const qc = useQueryClient();
  const { data: me } = useCurrentUser();
  const isAdmin = me?.role === "admin";
  const today = todayBD();
  const season = getSeasonRange();

  const ownersQ = useQuery({
    queryKey: ["owners"],
    queryFn: async () => {
      const { data, error } = await supabase.from("owners").select("*").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
  // capital is all-time, so read without the season filter
  const txQ = useQuery({
    queryKey: ["owner-tx"],
    queryFn: async () => {
      const { data, error } = await supabase.from("owner_transactions").select("id, owner_id, txn_type, amount, txn_date, note").order("txn_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Tx[];
    },
  });
  const ratesQ = useQuery({
    queryKey: ["owner-rates"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("pay_rates").select("id, owner_id, amount, effective_from, note").not("owner_id", "is", null).order("effective_from");
      if (error) throw error;
      return (data ?? []) as OwnerRate[];
    },
  });
  const inv = () => ["owners", "owner-tx", "owner-rates", "cash", "profit-loss"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));

  const owners = ownersQ.data ?? [];
  const txs = txQ.data ?? [];
  const nameOf = (id: string) => owners.find((o) => o.id === id)?.name ?? "—";
  // salary is only for a kiln with more than one owner
  const salaryOn = owners.length >= 2;
  const inSeason = (d: string) => !season || (d >= season.from && d <= season.to);

  const stats = useMemo(() => {
    const m = new Map<string, { invest: number; withdraw: number; net: number; rates: OwnerRate[]; monthly: number; since: string | null; earned: number; taken: number; due: number }>();
    for (const o of owners) {
      const rows = txs.filter((t) => t.owner_id === o.id);
      const sum = (type: TxType, f: (t: Tx) => boolean = () => true) => rows.filter((t) => t.txn_type === type && f(t)).reduce((a, b) => a + Number(b.amount), 0);
      const invest = sum("invest");
      const withdraw = sum("withdraw");
      const rates = (ratesQ.data ?? []).filter((r) => r.owner_id === o.id);
      const since = rates[0]?.effective_from ?? null;
      const earned = since ? salaryEarned({ monthly: 0, join: since, rates, today }).earned : 0;
      const taken = sum("salary", (t) => inSeason(t.txn_date));
      m.set(o.id, { invest, withdraw, net: invest - withdraw, rates, monthly: rateAt(rates, 0, today), since, earned, taken, due: earned - taken });
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owners, txs, ratesQ.data, today, season?.from, season?.to]);

  const [oDlg, setODlg] = useState<null | { id?: string; name: string; phone: string }>(null);
  const saveO = useMutation({
    mutationFn: async () => {
      const f = oDlg!; if (!f.name.trim()) throw new Error("নাম দিন");
      const p = { name: f.name.trim(), phone: f.phone || null };
      const { error } = f.id ? await supabase.from("owners").update(p).eq("id", f.id) : await supabase.from("owners").insert(p);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("সংরক্ষিত"); setODlg(null); inv(); }, onError: (e: Error) => toast.error(e.message),
  });
  const delO = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("owners").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { toast.success("মুছে ফেলা হয়েছে"); inv(); }, onError: (e: Error) => toast.error(e.message),
  });

  const [tDlg, setTDlg] = useState<null | { id?: string; owner_id: string; txn_type: TxType; amount: string; date: string; note: string }>(null);
  const saveT = useMutation({
    mutationFn: async () => {
      const f = tDlg!; const amount = Number(f.amount || 0); if (!(amount > 0)) throw new Error("টাকা দিন");
      if (!f.date) throw new Error("তারিখ দিন");
      const p = { owner_id: f.owner_id, txn_type: f.txn_type, amount, txn_date: f.date, note: f.note || null };
      const { error } = f.id ? await supabase.from("owner_transactions").update(p).eq("id", f.id) : await supabase.from("owner_transactions").insert({ ...p, created_by: me!.user.id });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("সংরক্ষিত"); setTDlg(null); inv(); }, onError: (e: Error) => toast.error(e.message),
  });
  const delT = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("owner_transactions").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { toast.success("মুছে ফেলা হয়েছে"); inv(); }, onError: (e: Error) => toast.error(e.message),
  });

  // monthly salary from a date; a later change never reprices earlier months
  const [rDlg, setRDlg] = useState<null | { owner_id: string; amount: string; from: string; note: string }>(null);
  const saveR = useMutation({
    mutationFn: async () => {
      const f = rDlg!;
      const amount = Number(f.amount);
      if (f.amount === "" || !(amount >= 0)) throw new Error("মাসিক বেতন লিখুন (বন্ধ করতে ০)");
      if (!f.from) throw new Error("কোন তারিখ থেকে, লিখুন");
      const db = supabase as any;
      const { data: same, error: e1 } = await db.from("pay_rates").select("id").eq("owner_id", f.owner_id).eq("effective_from", f.from).maybeSingle();
      if (e1) throw e1;
      const { error } = same
        ? await db.from("pay_rates").update({ amount, note: f.note || null }).eq("id", same.id)
        : await db.from("pay_rates").insert({ owner_id: f.owner_id, amount, effective_from: f.from, note: f.note || null, created_by: me!.user.id });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("বেতন সংরক্ষিত"); setRDlg(null); inv(); }, onError: (e: Error) => toast.error(e.message),
  });
  const delR = useMutation({
    mutationFn: async (id: string) => { const { error } = await (supabase as any).from("pay_rates").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { toast.success("মুছে ফেলা হয়েছে"); inv(); }, onError: (e: Error) => toast.error(e.message),
  });

  // new money goes through the two shared forms; tDlg is only for editing a saved row
  const [entry, setEntry] = useState<{ owner_id: string; txn_type: TxType } | null>(null);
  const newTx = (owner_id: string, txn_type: TxType) => setEntry({ owner_id, txn_type });

  const print = () => printTable({
    title: "মালিকের বিনিয়োগ ও বেতনের হিসাব",
    headers: ["তারিখ", "মালিক", "ধরন", "নোট", "টাকা"], rightCols: [4],
    rows: txs.map((t) => [bnDate(t.txn_date), nameOf(t.owner_id), TYPE_LABEL[t.txn_type] ?? t.txn_type, t.note ?? "", `৳ ${bn(t.amount)}`]),
    totals: owners.flatMap((o) => {
      const s = stats.get(o.id)!;
      const lines: Array<[string, string]> = [[`${o.name} — নিট বিনিয়োগ`, `৳ ${bn(s.net)}`]];
      if (s.since) lines.push([`${o.name} — বেতন: পাওনা / তুলেছেন / বাকি (এই মৌসুম)`, `৳ ${bn(s.earned)} / ৳ ${bn(s.taken)} / ৳ ${bn(s.due)}`]);
      return lines;
    }),
  });

  return (
    <div className="space-y-5 pb-24 md:pb-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold md:text-2xl"><Crown className="h-6 w-6 text-primary" /> মালিকের বিনিয়োগ</h1>
          <p className="text-sm text-muted-foreground">কোন মালিক কত টাকা দিয়েছেন, তুলেছেন{salaryOn ? ", আর বেতন" : ""}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="secondary"><Link to="/loans">ঋণ দেওয়া-নেওয়া</Link></Button>
          <Button variant="outline" onClick={print}><Printer className="mr-1 h-4 w-4" /> প্রিন্ট</Button>
          {isAdmin && <Button variant="secondary" onClick={() => setODlg({ name: "", phone: "" })}><Plus className="mr-1 h-4 w-4" /> মালিক</Button>}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {owners.map((o) => {
          const s = stats.get(o.id);
          if (!s) return null;
          const showSalary = salaryOn || s.rates.length > 0 || s.taken > 0;
          return (
            <Card key={o.id}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-base">{o.name}</CardTitle>
                {isAdmin && <div className="flex">
                  <Button size="icon" variant="ghost" className="h-9 w-9" aria-label="সম্পাদনা" onClick={() => setODlg({ id: o.id, name: o.name, phone: o.phone ?? "" })}><Pencil className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" className="h-9 w-9" aria-label="মুছুন" onClick={() => confirm("মুছবেন? সব লেনদেন ও বেতনের হিসাবও মুছে যাবে") && delO.mutate(o.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>}
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-xl border p-2"><div className="text-[11px] text-muted-foreground">বিনিয়োগ</div><b className="num text-success">৳ {bn(s.invest)}</b></div>
                  <div className="rounded-xl border p-2"><div className="text-[11px] text-muted-foreground">উত্তোলন</div><b className="num text-destructive">৳ {bn(s.withdraw)}</b></div>
                  <div className="rounded-xl border bg-muted/40 p-2"><div className="text-[11px] text-muted-foreground">নিট বিনিয়োগ</div><b className="num">৳ {bn(s.net)}</b></div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button className="h-10" onClick={() => newTx(o.id, "invest")}>বিনিয়োগ</Button>
                  <Button className="h-10" variant="outline" onClick={() => newTx(o.id, "withdraw")}>উত্তোলন</Button>
                </div>

                {showSalary && (
                  <div className="space-y-2 rounded-2xl border border-warning/40 bg-warning/5 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-1.5 font-bold"><BadgeDollarSign className="h-4 w-4 text-warning" /> বেতন</div>
                        <div className="num text-xs text-muted-foreground">
                          {s.since ? (s.monthly > 0 ? `মাসিক ৳ ${bn(s.monthly)} · ${bnDate(s.since)} থেকে` : "বেতন বন্ধ আছে") : "বেতন এখনো ঠিক করা হয়নি"}
                        </div>
                      </div>
                      {isAdmin && (
                        <Button size="sm" variant="outline" className="h-8 shrink-0" onClick={() => setRDlg({ owner_id: o.id, amount: s.monthly ? String(s.monthly) : "", from: s.since ? today : season?.from ?? today, note: "" })}>
                          বেতন ঠিক করুন
                        </Button>
                      )}
                    </div>
                    {s.since && (
                      <>
                        <div className="grid grid-cols-3 gap-2 text-center">
                          <div className="rounded-xl bg-background p-2"><div className="text-[11px] text-muted-foreground">এই মৌসুমে পাওনা</div><b className="num">৳ {bn(s.earned)}</b></div>
                          <div className="rounded-xl bg-background p-2"><div className="text-[11px] text-muted-foreground">তুলেছেন</div><b className="num text-success">৳ {bn(s.taken)}</b></div>
                          <div className="rounded-xl bg-background p-2"><div className="text-[11px] text-muted-foreground">{s.due < 0 ? "বেশি নিয়েছেন" : "বাকি"}</div><b className={`num ${s.due > 0 ? "text-warning" : "text-info"}`}>৳ {bn(Math.abs(s.due))}</b></div>
                        </div>
                        <Button className="h-10 w-full" variant="secondary" onClick={() => newTx(o.id, "salary")}>বেতন তুলুন</Button>
                      </>
                    )}
                    {!salaryOn && s.monthly > 0 && (
                      <p className="text-xs text-warning">এখন মালিক একজন। বেতন বন্ধ করতে "বেতন ঠিক করুন" থেকে যেদিন থেকে বন্ধ, সেদিন থেকে ০ দিন।</p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
        {owners.length === 0 && <p className="text-sm text-muted-foreground">এখনো কোনো মালিক যোগ করা হয়নি।</p>}
      </div>
      {owners.length === 1 && (
        <p className="text-xs text-muted-foreground">মালিক একাধিক হলে প্রত্যেকের কার্ডে বেতনের অংশ আসবে।</p>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">লেনদেন</CardTitle></CardHeader>
        <CardContent className="p-0">
          {txs.length === 0 ? (
            <p className="p-4 text-center text-sm text-muted-foreground">এখনো কোনো লেনদেন নেই</p>
          ) : (
            <div className="divide-y">
              {txs.map((t) => (
                <div key={t.id} className="flex items-center gap-2 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="break-words text-sm font-semibold">{nameOf(t.owner_id)} <span className={`text-xs font-bold ${TYPE_TONE[t.txn_type] ?? ""}`}>· {TYPE_LABEL[t.txn_type] ?? t.txn_type}</span></div>
                    <div className="break-words text-xs text-muted-foreground">{bnDate(t.txn_date)}{t.note ? ` · ${t.note}` : ""}</div>
                  </div>
                  <b className={`num shrink-0 text-sm ${TYPE_TONE[t.txn_type] ?? ""}`}>{t.txn_type === "invest" ? "+" : "−"}৳ {bn(t.amount)}</b>
                  {isAdmin && (
                    <div className="flex shrink-0">
                      <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="সম্পাদনা" onClick={() => setTDlg({ id: t.id, owner_id: t.owner_id, txn_type: t.txn_type, amount: String(t.amount), date: t.txn_date, note: t.note ?? "" })}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="মুছুন" onClick={() => confirm("মুছবেন?") && delT.mutate(t.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!oDlg} onOpenChange={(o) => !o && setODlg(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>মালিক</DialogTitle></DialogHeader>
          {oDlg && <div className="space-y-3">
            <div><Label>নাম</Label><Input value={oDlg.name} onChange={(e) => setODlg({ ...oDlg, name: e.target.value })} /></div>
            <div><Label>ফোন</Label><Input value={oDlg.phone} onChange={(e) => setODlg({ ...oDlg, phone: e.target.value })} /></div>
          </div>}
          <DialogFooter><Button onClick={() => saveO.mutate()} disabled={saveO.isPending}>সংরক্ষণ</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!tDlg} onOpenChange={(o) => !o && setTDlg(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{tDlg ? `${TYPE_LABEL[tDlg.txn_type]} — ${nameOf(tDlg.owner_id)}` : ""}</DialogTitle>
            {tDlg && <DialogDescription>{TYPE_HELP[tDlg.txn_type]}</DialogDescription>}
          </DialogHeader>
          {tDlg && <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>ধরন</Label>
              <div className={`grid gap-1.5 ${salaryOn || tDlg.txn_type === "salary" ? "grid-cols-3" : "grid-cols-2"}`}>
                {(["invest", "withdraw", ...(salaryOn || tDlg.txn_type === "salary" ? ["salary" as const] : [])] as TxType[]).map((k) => (
                  <button key={k} type="button" onClick={() => setTDlg({ ...tDlg, txn_type: k })}
                    className={`h-10 rounded-xl text-sm font-semibold ${tDlg.txn_type === k ? "bg-primary text-primary-foreground" : "border bg-background"}`}>{TYPE_LABEL[k]}</button>
                ))}
              </div>
            </div>
            {tDlg.txn_type === "salary" && stats.get(tDlg.owner_id) && (
              <p className="num rounded-xl bg-muted/60 p-2.5 text-sm">এই মৌসুমে বেতন বাকি <b>৳ {bn(stats.get(tDlg.owner_id)!.due)}</b></p>
            )}
            <div><Label>তারিখ</Label><Input type="date" value={tDlg.date} onChange={(e) => setTDlg({ ...tDlg, date: e.target.value })} /></div>
            <div><Label>টাকা (৳)</Label><Input type="number" inputMode="decimal" value={tDlg.amount} onChange={(e) => setTDlg({ ...tDlg, amount: e.target.value })} /></div>
            <div><Label>নোট</Label><Input value={tDlg.note} placeholder={tDlg.txn_type === "salary" ? "যেমন: সেপ্টেম্বরের বেতন" : ""} onChange={(e) => setTDlg({ ...tDlg, note: e.target.value })} /></div>
          </div>}
          <DialogFooter><Button onClick={() => saveT.mutate()} disabled={saveT.isPending}>সংরক্ষণ</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!rDlg} onOpenChange={(o) => !o && setRDlg(null)}>
        <DialogContent className="max-h-[90vh] max-w-sm overflow-y-auto">
          <DialogHeader>
            <DialogTitle>মাসিক বেতন — {rDlg ? nameOf(rDlg.owner_id) : ""}</DialogTitle>
            <DialogDescription>যে তারিখ থেকে এই বেতন চালু। আগের মাসগুলোর হিসাব বদলাবে না। বেতন বন্ধ করতে ০ দিন।</DialogDescription>
          </DialogHeader>
          {rDlg && <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>মাসিক বেতন (৳)</Label><Input type="number" inputMode="decimal" value={rDlg.amount} onChange={(e) => setRDlg({ ...rDlg, amount: e.target.value })} /></div>
              <div><Label>কবে থেকে</Label><Input type="date" value={rDlg.from} onChange={(e) => setRDlg({ ...rDlg, from: e.target.value })} /></div>
            </div>
            <div><Label>নোট</Label><Input value={rDlg.note} onChange={(e) => setRDlg({ ...rDlg, note: e.target.value })} /></div>
            {(stats.get(rDlg.owner_id)?.rates.length ?? 0) > 0 && (
              <div className="divide-y rounded-xl border">
                {[...stats.get(rDlg.owner_id)!.rates].reverse().map((r) => (
                  <div key={r.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                    <span className="flex-1">{bnDate(r.effective_from)} থেকে</span>
                    <b className="num">{Number(r.amount) > 0 ? `৳ ${bn(Number(r.amount))}` : "বন্ধ"}</b>
                    <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="মুছুন" onClick={() => confirm("এই বেতনের রেট মুছবেন?") && delR.mutate(r.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                  </div>
                ))}
              </div>
            )}
          </div>}
          <DialogFooter><Button onClick={() => saveR.mutate()} disabled={saveR.isPending}>সংরক্ষণ</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <IncomeEntryDialog open={entry?.txn_type === "invest"} onOpenChange={(o) => { if (!o) setEntry(null); }}
        head="ownerInvest" lockHead partyId={entry?.owner_id ?? null} onDone={inv} />
      <ExpenseEntryDialog open={!!entry && entry.txn_type !== "invest"} onOpenChange={(o) => { if (!o) setEntry(null); }}
        head={entry?.txn_type === "salary" ? "ownerSalary" : "ownerWithdraw"} lockHead partyId={entry?.owner_id ?? null} onDone={inv} />
    </div>
  );
}
