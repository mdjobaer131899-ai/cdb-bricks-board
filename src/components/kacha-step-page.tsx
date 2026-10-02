import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react";
import { Boxes, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { StatCard } from "@/components/stat-card";
import { ProcessStepBar } from "@/components/process-step-bar";
import { sdb } from "@/lib/season-db";
import { bn, bnDate, isoDate } from "@/lib/format";
import { useCurrentUser } from "@/lib/use-current-user";
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

type Form = {
  id?: string;
  entry_date: string;
  sardar_id: string;
  quantity: string;
  rate: string;
  amount: string;
  note: string;
};

const NO_SARDAR = "__none__";
const empty = (): Form => ({ entry_date: isoDate(new Date()), sardar_id: NO_SARDAR, quantity: "", rate: "", amount: "", note: "" });

interface Props {
  step: KachaStep;
  title: string;
  subtitle: string;
  icon: LucideIcon;
  /** স্ট্যাট কার্ডের লেবেল */
  totalLabel: string;
  qtyLabel?: string;
  showMoney?: boolean;
}

export function KachaStepPage({ step, title, subtitle, icon: Icon, totalLabel, qtyLabel = "পরিমাণ (পিস)", showMoney = true }: Props) {
  const qc = useQueryClient();
  const { data: me } = useCurrentUser();
  const isAdmin = me?.role === "admin";
  const [dlg, setDlg] = useState<{ open: boolean; mode: "new" | "edit"; form: Form }>({ open: false, mode: "new", form: empty() });

  const sardarsQ = useQuery({
    queryKey: ["sardars"],
    queryFn: async () => {
      const { data, error } = await sdb.from("sardars").select("*").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const entriesQ = useQuery({
    queryKey: ["kacha-brick-entries", step],
    queryFn: async () => {
      const { data, error } = await sdb
        .from("kacha_brick_entries")
        .select("*")
        .eq("entry_type", step)
        .order("entry_date", { ascending: false })
        .limit(300);
      if (error) throw error;
      return data ?? [];
    },
  });

  const rows = entriesQ.data ?? [];
  const sardarName = (id: string | null) => (id ? (sardarsQ.data ?? []).find((s: any) => s.id === id)?.name ?? "—" : "—");

  const totals = useMemo(() => {
    let qty = 0, amount = 0, today = 0;
    const t = isoDate(new Date());
    rows.forEach((e: any) => {
      qty += Number(e.quantity || 0);
      amount += Number(e.amount || 0);
      if (e.entry_date === t) today += Number(e.quantity || 0);
    });
    return { qty, amount, today };
  }, [rows]);

  const save = useMutation({
    mutationFn: async () => {
      const f = dlg.form;
      const qty = Number(f.quantity || 0);
      if (!(qty > 0)) throw new Error("পরিমাণ দিন");
      const rate = Number(f.rate || 0);
      const amount = f.amount !== "" ? Number(f.amount) : qty * rate;
      const payload = {
        entry_date: f.entry_date,
        entry_type: step,
        sardar_id: f.sardar_id === NO_SARDAR ? null : f.sardar_id,
        quantity: qty,
        rate,
        amount,
        note: f.note || null,
      };
      if (dlg.mode === "edit" && f.id) {
        const { error } = await sdb.from("kacha_brick_entries").update(payload).eq("id", f.id);
        if (error) throw error;
      } else {
        if (!me?.user.id) throw new Error("লগইন প্রয়োজন");
        const { error } = await sdb.from("kacha_brick_entries").insert({ ...payload, created_by: me.user.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("সংরক্ষিত");
      setDlg({ open: false, mode: "new", form: empty() });
      qc.invalidateQueries({ queryKey: ["kacha-brick-entries"] });
      qc.invalidateQueries({ queryKey: ["kacha-by-sardar"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sdb.from("kacha_brick_entries").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("মুছে ফেলা হয়েছে");
      qc.invalidateQueries({ queryKey: ["kacha-brick-entries"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const f = dlg.form;
  const autoAmount = f.amount !== "" ? Number(f.amount) : Number(f.quantity || 0) * Number(f.rate || 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold md:text-2xl">
            <Icon className="h-6 w-6 text-primary" /> {title}
          </h1>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>
        <Button onClick={() => setDlg({ open: true, mode: "new", form: empty() })}>
          <Plus className="mr-1 h-4 w-4" /> নতুন এন্ট্রি
        </Button>
      </div>

      <Card><CardContent className="p-4"><StepBar current={step} /></CardContent></Card>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <StatCard label={totalLabel} value={bn(totals.qty)} icon={Boxes} tone="primary" />
        <StatCard label="আজকের পরিমাণ" value={bn(totals.today)} icon={Boxes} tone="info" />
        <StatCard label={showMoney ? "মোট টাকা" : "মোট এন্ট্রি"} value={showMoney ? `৳ ${bn(totals.amount)}` : bn(rows.length)} icon={Boxes} tone="warning" />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">এন্ট্রি তালিকা</CardTitle></CardHeader>
        <CardContent className="p-0">
          {entriesQ.isLoading ? (
            <div className="flex h-24 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : rows.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">কোনো এন্ট্রি নেই</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>তারিখ</TableHead>
                  <TableHead>সরদার</TableHead>
                  <TableHead className="text-right">পরিমাণ</TableHead>
                  <TableHead className="text-right">রেট</TableHead>
                  <TableHead className="text-right">টাকা</TableHead>
                  <TableHead>মন্তব্য</TableHead>
                  <TableHead></TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {rows.map((e: any) => (
                    <TableRow key={e.id}>
                      <TableCell className="whitespace-nowrap">{bnDate(e.entry_date)}</TableCell>
                      <TableCell>{sardarName(e.sardar_id)}</TableCell>
                      <TableCell className="text-right tabular-nums">{bn(e.quantity)}</TableCell>
                      <TableCell className="text-right tabular-nums">{bn(e.rate)}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums">৳ {bn(e.amount)}</TableCell>
                      <TableCell className="max-w-[160px] truncate text-xs text-muted-foreground">{e.note ?? "—"}</TableCell>
                      <TableCell className="text-right">
                        {isAdmin && (
                          <div className="flex justify-end gap-1">
                            <Button size="sm" variant="ghost" onClick={() => setDlg({
                              open: true, mode: "edit",
                              form: {
                                id: e.id, entry_date: e.entry_date, sardar_id: e.sardar_id ?? NO_SARDAR,
                                quantity: String(e.quantity), rate: String(e.rate), amount: String(e.amount), note: e.note ?? "",
                              },
                            })}><Pencil className="h-3.5 w-3.5" /></Button>
                            <Button size="sm" variant="ghost" onClick={() => { if (confirm("মুছে ফেলবেন?")) del.mutate(e.id); }}>
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dlg.open} onOpenChange={(o) => setDlg((s) => ({ ...s, open: o }))}>
        <DialogContent>
          <DialogHeader><DialogTitle>{dlg.mode === "edit" ? "এন্ট্রি সম্পাদনা" : title} </DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>তারিখ</Label>
              <Input type="date" value={f.entry_date} onChange={(e) => setDlg((s) => ({ ...s, form: { ...s.form, entry_date: e.target.value } }))} />
            </div>
            <div className="space-y-1.5">
              <Label>সরদার</Label>
              <Select value={f.sardar_id} onValueChange={(v) => setDlg((s) => ({ ...s, form: { ...s.form, sardar_id: v } }))}>
                <SelectTrigger><SelectValue placeholder="বেছে নিন" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_SARDAR}>— নেই —</SelectItem>
                  {(sardarsQ.data ?? [])
                    .filter((s: any) => (step === "production" ? s.kind === "mill" : step === "load" ? s.kind === "load" : s.kind !== "burn"))
                    .map((s: any) => <SelectItem key={s.id} value={s.id}>{s.mill_name ? `${s.mill_name} — ${s.name}` : s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{qtyLabel}</Label>
                <Input type="number" inputMode="numeric" value={f.quantity} onChange={(e) => setDlg((s) => ({ ...s, form: { ...s.form, quantity: e.target.value } }))} />
              </div>
              <div className="space-y-1.5">
                <Label>রেট (প্রতি হাজার/পিস)</Label>
                <Input type="number" inputMode="decimal" value={f.rate} onChange={(e) => setDlg((s) => ({ ...s, form: { ...s.form, rate: e.target.value } }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>টাকা (খালি রাখলে অটো হিসাব)</Label>
              <Input type="number" inputMode="decimal" placeholder={String(autoAmount)} value={f.amount} onChange={(e) => setDlg((s) => ({ ...s, form: { ...s.form, amount: e.target.value } }))} />
            </div>
            <div className="space-y-1.5">
              <Label>মন্তব্য</Label>
              <Textarea rows={2} value={f.note} onChange={(e) => setDlg((s) => ({ ...s, form: { ...s.form, note: e.target.value } }))} />
            </div>
            <div className="rounded-md bg-muted/50 p-3 text-sm flex justify-between font-semibold">
              <span>মোট টাকা</span><span className="tabular-nums">৳ {bn(Math.round(autoAmount))}</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDlg((s) => ({ ...s, open: false }))}>বাতিল</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} সংরক্ষণ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
