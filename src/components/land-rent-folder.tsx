import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Banknote, History, LandPlot, Loader2, Pencil, Phone, Plus, Printer, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { getSeasonRange } from "@/lib/season-db";
import { fetchAllRows } from "@/lib/fetch-all";
import { bn, bnDate, todayBD } from "@/lib/format";
import { useCurrentUser } from "@/lib/use-current-user";
import { printTable } from "@/lib/print-table";

/**
 * Land rent (জমি ভাড়া). A land owner is a supplier with material_type = LAND_TYPE;
 * the rent owed is a purchases row with item_name = LAND_ITEM; money given is a
 * supplier_payments row. So hand cash, the cash book, profit/loss and dues all count
 * it with no extra table. A previous-season due is a bill dated before the season
 * starts, so it is not this season's cost but still adds to what is owed.
 */
export const LAND_TYPE = "জমি ভাড়া";
export const LAND_ITEM = "জমি ভাড়া";
const PREV_NOTE = "পূর্বের বকেয়া";
const LAND_UNITS = ["শতাংশ", "বিঘা", "কাঠা", "একর"];
const METHODS: Array<[string, string]> = [["cash", "নগদ"], ["bkash", "বিকাশ"], ["nagad", "নগদ (মোবাইল)"], ["bank", "ব্যাংক"]];

const tk = (n: number) => `৳${bn(Math.round(n))}`;
const dayBefore = (d: string) => new Date(new Date(`${d}T00:00:00Z`).getTime() - 86400000).toISOString().slice(0, 10);

type Owner = { id: string; name: string; phone: string | null; address: string | null; note: string | null };
type Bill = { id: string; supplier_id: string | null; purchase_date: string; quantity: number; unit: string | null; total_amount: number; note: string | null };
type Pay = { id: string; supplier_id: string; payment_date: string; amount: number; method: string | null; note: string | null };

type OwnerForm = { id?: string; name: string; phone: string; land: string; note: string; prevDue: string; rent: string };
type BillForm = { id?: string; owner_id: string; kind: "rent" | "prev"; date: string; area: string; unit: string; amount: string; note: string };
type PayForm = { id?: string; owner_id: string; date: string; amount: string; method: string; note: string };

export function LandRentFolder({ onBack }: { onBack: () => void }) {
  const qc = useQueryClient();
  const { data: me } = useCurrentUser();
  const isAdmin = me?.role === "admin";
  const today = todayBD();
  const season = getSeasonRange();
  const seasonStart = season?.from ?? null;
  const prevDate = seasonStart ? dayBefore(seasonStart) : today;

  const ownersQ = useQuery({
    queryKey: ["land-owners"],
    queryFn: async () => {
      const { data, error } = await supabase.from("suppliers").select("id, name, phone, address, note").eq("material_type", LAND_TYPE).order("name");
      if (error) throw error;
      return (data ?? []) as Owner[];
    },
  });
  const ownerIds = (ownersQ.data ?? []).map((o) => o.id);
  // all-time: a due does not reset with the season
  const billsQ = useQuery({
    queryKey: ["land-bills"],
    queryFn: () => fetchAllRows<Bill>(() => supabase.from("purchases")
      .select("id, supplier_id, purchase_date, quantity, unit, total_amount, note").eq("item_name", LAND_ITEM).order("id")),
  });
  const paysQ = useQuery({
    queryKey: ["land-payments", ownerIds.join(",")],
    enabled: ownerIds.length > 0,
    queryFn: () => fetchAllRows<Pay>(() => supabase.from("supplier_payments")
      .select("id, supplier_id, payment_date, amount, method, note").in("supplier_id", ownerIds).order("id")),
  });

  const owners = ownersQ.data ?? [];
  const bills = billsQ.data ?? [];
  const pays = paysQ.data ?? [];
  const isPrev = (b: Bill) => (seasonStart ? b.purchase_date < seasonStart : (b.note ?? "").startsWith(PREV_NOTE));

  const stats = useMemo(() => {
    const m = new Map<string, { prev: number; rent: number; paid: number; due: number; area: string }>();
    for (const o of owners) m.set(o.id, { prev: 0, rent: 0, paid: 0, due: 0, area: "" });
    for (const b of bills) {
      const s = b.supplier_id ? m.get(b.supplier_id) : undefined;
      if (!s) continue;
      if (isPrev(b)) s.prev += Number(b.total_amount || 0);
      else {
        s.rent += Number(b.total_amount || 0);
        if (b.unit && Number(b.quantity) > 0) s.area = `${bn(Number(b.quantity))} ${b.unit}`;
      }
    }
    for (const p of pays) { const s = m.get(p.supplier_id); if (s) s.paid += Number(p.amount || 0); }
    for (const s of m.values()) s.due = s.prev + s.rent - s.paid;
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owners, bills, pays, seasonStart]);

  const total = [...stats.values()].reduce((a, s) => ({ prev: a.prev + s.prev, rent: a.rent + s.rent, paid: a.paid + s.paid, due: a.due + s.due }), { prev: 0, rent: 0, paid: 0, due: 0 });
  const loading = ownersQ.isLoading || billsQ.isLoading || (ownerIds.length > 0 && paysQ.isLoading);

  const [ownerForm, setOwnerForm] = useState<OwnerForm | null>(null);
  const [billForm, setBillForm] = useState<BillForm | null>(null);
  const [payForm, setPayForm] = useState<PayForm | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const detail = owners.find((o) => o.id === detailId) ?? null;

  const invalidate = () => {
    for (const key of [["land-owners"], ["land-bills"], ["land-payments"], ["suppliers"], ["purchases"], ["supplier-payments"], ["cash"], ["cash-book"], ["profit-loss"]]) {
      qc.invalidateQueries({ queryKey: key });
    }
  };
  const uid = () => { if (!me?.user.id) throw new Error("আবার লগইন করুন"); return me.user.id; };

  const insertBill = async (ownerId: string, kind: "rent" | "prev", date: string, amount: number, area: number, unit: string, note: string) => {
    const qty = area > 0 ? area : 1;
    const { error } = await supabase.from("purchases").insert({
      supplier_id: ownerId, item_name: LAND_ITEM, material_id: null, purchase_date: date,
      quantity: qty, unit: area > 0 ? unit : null, unit_price: Math.round((amount / qty) * 100) / 100, total_amount: amount,
      note: kind === "prev" ? [PREV_NOTE, note].filter(Boolean).join(" — ") : note || null, created_by: uid(),
    });
    if (error) throw error;
  };

  const saveOwner = useMutation({
    mutationFn: async () => {
      const f = ownerForm!;
      if (!f.name.trim()) throw new Error("জমির মালিকের নাম দিন");
      const payload = { name: f.name.trim(), phone: f.phone.trim() || null, address: f.land.trim() || null, note: f.note.trim() || null, material_type: LAND_TYPE };
      if (f.id) {
        const { error } = await supabase.from("suppliers").update(payload).eq("id", f.id);
        if (error) throw error;
        return;
      }
      const same = owners.find((o) => o.name.trim() === payload.name);
      if (same) throw new Error(`"${payload.name}" নামে একজন জমির মালিক আগেই আছেন`);
      const { data, error } = await supabase.from("suppliers").insert(payload).select("id").single();
      if (error) throw error;
      const prev = Number(f.prevDue || 0), rent = Number(f.rent || 0);
      if (prev > 0) await insertBill(data.id, "prev", prevDate, prev, 0, "", "");
      if (rent > 0) await insertBill(data.id, "rent", today, rent, 0, "", "এই মৌসুমের ভাড়া");
    },
    onSuccess: () => { toast.success("সংরক্ষিত"); setOwnerForm(null); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveBill = useMutation({
    mutationFn: async () => {
      const f = billForm!;
      const amount = Number(f.amount);
      if (!f.owner_id) throw new Error("জমির মালিক বেছে নিন");
      if (!(amount > 0)) throw new Error("টাকার পরিমাণ দিন");
      if (!f.date) throw new Error("তারিখ দিন");
      if (f.kind === "prev" && seasonStart && f.date >= seasonStart) throw new Error("পূর্বের বকেয়ার তারিখ এই মৌসুম শুরুর আগে হতে হবে");
      const area = Number(f.area || 0);
      if (f.id) {
        const qty = area > 0 ? area : 1;
        const { error } = await supabase.from("purchases").update({
          supplier_id: f.owner_id, purchase_date: f.date, quantity: qty, unit: area > 0 ? f.unit : null,
          unit_price: Math.round((amount / qty) * 100) / 100, total_amount: amount,
          note: f.kind === "prev" ? [PREV_NOTE, f.note.replace(new RegExp(`^${PREV_NOTE}( — )?`), "")].filter(Boolean).join(" — ") : f.note || null,
        }).eq("id", f.id);
        if (error) throw error;
        return;
      }
      await insertBill(f.owner_id, f.kind, f.date, amount, area, f.unit, f.note);
    },
    onSuccess: () => { toast.success("সংরক্ষিত"); setBillForm(null); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const savePay = useMutation({
    mutationFn: async () => {
      const f = payForm!;
      const amount = Number(f.amount);
      if (!f.owner_id) throw new Error("জমির মালিক বেছে নিন");
      if (!(amount > 0)) throw new Error("টাকার পরিমাণ দিন");
      if (!f.date) throw new Error("তারিখ দিন");
      const payload = { supplier_id: f.owner_id, amount, payment_date: f.date, method: f.method, note: f.note || `${LAND_ITEM} পরিশোধ` };
      const { error } = f.id
        ? await supabase.from("supplier_payments").update(payload).eq("id", f.id)
        : await supabase.from("supplier_payments").insert({ ...payload, created_by: uid() });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("পরিশোধ সংরক্ষিত — ক্যাশ বইয়ে খরচ হিসেবে উঠেছে"); setPayForm(null); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (v: { table: "purchases" | "supplier_payments" | "suppliers"; id: string }) => {
      const { error } = await supabase.from(v.table).delete().eq("id", v.id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => { toast.success("মুছে ফেলা হয়েছে"); if (v.table === "suppliers") setDetailId(null); invalidate(); },
    onError: (e: Error) => toast.error(e.message.includes("foreign key") ? "এই মালিকের হিসাব আছে, আগে সেগুলো মুছুন" : e.message),
  });

  const newBill = (owner_id = "", kind: BillForm["kind"] = "rent"): BillForm =>
    ({ owner_id, kind, date: kind === "prev" ? prevDate : today, area: "", unit: LAND_UNITS[0], amount: "", note: "" });
  const newPay = (owner_id = ""): PayForm => ({ owner_id, date: today, amount: "", method: "cash", note: "" });

  const print = () => printTable({
    title: "জমি ভাড়ার হিসাব",
    subtitle: season ? `${bnDate(season.from)} – ${bnDate(season.to)}` : undefined,
    headers: ["জমির মালিক", "জমি", "পূর্বের বকেয়া", "এই মৌসুমের ভাড়া", "পরিশোধ", "বাকি"],
    rightCols: [2, 3, 4, 5],
    rows: owners.map((o) => {
      const s = stats.get(o.id)!;
      return [o.name, s.area || o.address || "", tk(s.prev), tk(s.rent), tk(s.paid), tk(s.due)];
    }),
    totals: [["মোট পাবে", tk(total.prev + total.rent)], ["মোট পরিশোধ", tk(total.paid)], ["মোট বাকি", tk(total.due)]],
  });

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 pb-28 md:pb-6">
      <div className="flex items-center gap-3 pt-1">
        <button type="button" onClick={onBack} aria-label="মালামাল ক্রয় ও খরচে ফিরে যান"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border bg-card transition active:scale-95">
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="font-display truncate text-[24px] font-extrabold leading-tight">জমি ভাড়া</h1>
          <p className="text-sm font-semibold text-muted-foreground">জমির মালিক কত পাবেন, কত দেওয়া হলো, কত বাকি</p>
        </div>
        <Button variant="outline" size="icon" className="h-11 w-11 shrink-0 rounded-xl" onClick={print} aria-label="প্রিন্ট">
          <Printer className="h-5 w-5" />
        </Button>
      </div>

      <section className="bg-brick-pattern relative overflow-hidden rounded-[20px] bg-ink p-[18px] text-ink-foreground">
        <div className="text-xs font-bold tracking-[0.12em] text-stone-300">মোট বাকি · জমির মালিকদের পাওনা</div>
        {loading ? <Skeleton className="mt-3 h-10 w-40 bg-white/10" /> : (
          <div className={`mt-2 font-display num text-[40px] font-extrabold leading-none ${total.due < 0 ? "text-sky-300" : ""}`}>
            {total.due < 0 ? "অগ্রিম " : ""}{tk(Math.abs(total.due))}
          </div>
        )}
        <div className="mt-3.5 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl border border-white/10 bg-white/[0.07] px-2 py-2">
            <div className="text-[11px] font-semibold text-stone-300">পূর্বের বকেয়া</div>
            <div className="num text-sm font-bold">{tk(total.prev)}</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.07] px-2 py-2">
            <div className="text-[11px] font-semibold text-stone-300">এই মৌসুমের ভাড়া</div>
            <div className="num text-sm font-bold">{tk(total.rent)}</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.07] px-2 py-2">
            <div className="text-[11px] font-semibold text-emerald-200">পরিশোধ</div>
            <div className="num text-sm font-bold text-emerald-300">{tk(total.paid)}</div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-2">
        <Button className="h-12 gap-2 rounded-2xl text-base font-bold" disabled={owners.length === 0} onClick={() => setPayForm(newPay())}>
          <Banknote className="h-5 w-5" /> টাকা দিন
        </Button>
        <Button variant="outline" className="h-12 gap-2 rounded-2xl text-base font-bold" onClick={() => setOwnerForm({ name: "", phone: "", land: "", note: "", prevDue: "", rent: "" })}>
          <Plus className="h-5 w-5" /> জমির মালিক
        </Button>
      </div>

      <section className="space-y-2">
        {loading ? (
          <><Skeleton className="h-28 rounded-2xl" /><Skeleton className="h-28 rounded-2xl" /></>
        ) : owners.length === 0 ? (
          <div className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            এখনো কোনো জমির মালিক যোগ করা হয়নি। উপরে "জমির মালিক" চেপে নাম, ভাড়া আর পূর্বের বকেয়া (থাকলে) দিন।
          </div>
        ) : owners.map((o) => {
          const s = stats.get(o.id)!;
          return (
            <div key={o.id} className="rounded-2xl border bg-card">
              <button type="button" onClick={() => setDetailId(o.id)} className="flex w-full items-start gap-3 p-3.5 text-left">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-lime-100 text-lime-800 dark:bg-lime-950/60 dark:text-lime-200">
                  <LandPlot className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block break-words text-base font-bold leading-snug">{o.name}</span>
                  <span className="block text-xs text-muted-foreground">{[s.area, o.address].filter(Boolean).join(" · ") || "জমির বিবরণ নেই"}</span>
                  <span className="num mt-1 block text-xs text-muted-foreground">
                    {s.prev > 0 && <>পূর্বের {tk(s.prev)} · </>}ভাড়া {tk(s.rent)} · দেওয়া {tk(s.paid)}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-[11px] font-semibold text-muted-foreground">{s.due < 0 ? "অগ্রিম" : "বাকি"}</span>
                  <span className={`num font-display text-lg font-extrabold ${s.due > 0 ? "text-warning" : s.due < 0 ? "text-info" : "text-success"}`}>{tk(Math.abs(s.due))}</span>
                </span>
              </button>
              <div className="grid grid-cols-2 gap-1.5 border-t p-2">
                <Button variant="ghost" className="h-10 gap-1 rounded-xl font-semibold" onClick={() => setBillForm(newBill(o.id))}><Plus className="h-4 w-4" /> ভাড়া লিখুন</Button>
                <Button variant="ghost" className="h-10 gap-1 rounded-xl font-semibold text-primary" onClick={() => setPayForm(newPay(o.id))}><Banknote className="h-4 w-4" /> টাকা দিন</Button>
              </div>
            </div>
          );
        })}
      </section>

      {/* owner form */}
      <Dialog open={!!ownerForm} onOpenChange={(o) => !o && setOwnerForm(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{ownerForm?.id ? "জমির মালিক সম্পাদনা" : "নতুন জমির মালিক"}</DialogTitle>
            {!ownerForm?.id && <DialogDescription>নামের সাথে এই মৌসুমের ভাড়া আর পূর্বের বকেয়া (থাকলে) একসাথে লিখে দিতে পারেন।</DialogDescription>}
          </DialogHeader>
          {ownerForm && (
            <div className="space-y-3">
              <div className="space-y-1.5"><Label>জমির মালিকের নাম *</Label><Input className="h-11" value={ownerForm.name} onChange={(e) => setOwnerForm({ ...ownerForm, name: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>ফোন</Label><Input className="h-11" inputMode="tel" value={ownerForm.phone} onChange={(e) => setOwnerForm({ ...ownerForm, phone: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>জমির বিবরণ (দাগ, মৌজা, কোথায়)</Label><Input className="h-11" value={ownerForm.land} onChange={(e) => setOwnerForm({ ...ownerForm, land: e.target.value })} /></div>
              {!ownerForm.id && (
                <div className="grid grid-cols-2 gap-3 rounded-2xl border p-3">
                  <div className="space-y-1.5"><Label>এই মৌসুমের ভাড়া (৳)</Label><Input className="h-11" type="number" inputMode="decimal" value={ownerForm.rent} onChange={(e) => setOwnerForm({ ...ownerForm, rent: e.target.value })} /></div>
                  <div className="space-y-1.5"><Label>পূর্বের বকেয়া (৳)</Label><Input className="h-11" type="number" inputMode="decimal" value={ownerForm.prevDue} onChange={(e) => setOwnerForm({ ...ownerForm, prevDue: e.target.value })} /></div>
                  <p className="col-span-2 text-xs text-muted-foreground">খালি রাখলে পরে "ভাড়া লিখুন" থেকে দিতে পারবেন।</p>
                </div>
              )}
              <div className="space-y-1.5"><Label>নোট</Label><Textarea rows={2} value={ownerForm.note} onChange={(e) => setOwnerForm({ ...ownerForm, note: e.target.value })} /></div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOwnerForm(null)}>বাতিল</Button>
            <Button onClick={() => saveOwner.mutate()} disabled={saveOwner.isPending}>{saveOwner.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}সংরক্ষণ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* rent / previous due form */}
      <Dialog open={!!billForm} onOpenChange={(o) => !o && setBillForm(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{billForm?.id ? "সম্পাদনা" : billForm?.kind === "prev" ? "পূর্বের বকেয়া" : "জমির ভাড়া লিখুন"}</DialogTitle>
            <DialogDescription>
              {billForm?.kind === "prev" ? "আগের মৌসুমের যে টাকা এখনো দেওয়া বাকি। এটা এই মৌসুমের খরচে ধরা হবে না, শুধু বাকিতে যোগ হবে।" : "জমির মালিক এই মৌসুমে কত টাকা পাবেন। এটা এই মৌসুমের খরচে ধরা হবে।"}
            </DialogDescription>
          </DialogHeader>
          {billForm && (
            <div className="space-y-3">
              {!billForm.id && (
                <div className="grid grid-cols-2 gap-1.5">
                  {([["rent", "এই মৌসুমের ভাড়া"], ["prev", "পূর্বের বকেয়া"]] as const).map(([k, l]) => (
                    <button key={k} type="button" onClick={() => setBillForm({ ...billForm, kind: k, date: k === "prev" ? prevDate : today })}
                      className={`h-11 rounded-xl text-sm font-bold ${billForm.kind === k ? "bg-primary text-primary-foreground" : "border bg-background"}`}>{l}</button>
                  ))}
                </div>
              )}
              <OwnerSelect owners={owners} value={billForm.owner_id} onChange={(v) => setBillForm({ ...billForm, owner_id: v })} />
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>টাকা *</Label><Input className="h-11" type="number" inputMode="decimal" value={billForm.amount} onChange={(e) => setBillForm({ ...billForm, amount: e.target.value })} /></div>
                <div className="space-y-1.5">
                  <Label>{billForm.kind === "prev" ? "কোন তারিখ পর্যন্ত" : "তারিখ"}</Label>
                  <Input className="h-11" type="date" value={billForm.date} max={billForm.kind === "prev" && seasonStart ? prevDate : undefined} onChange={(e) => setBillForm({ ...billForm, date: e.target.value })} />
                </div>
              </div>
              {billForm.kind === "rent" && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5"><Label>জমির পরিমাণ</Label><Input className="h-11" type="number" inputMode="decimal" placeholder="ঐচ্ছিক" value={billForm.area} onChange={(e) => setBillForm({ ...billForm, area: e.target.value })} /></div>
                  <div className="space-y-1.5">
                    <Label>একক</Label>
                    <Select value={billForm.unit} onValueChange={(v) => setBillForm({ ...billForm, unit: v })}>
                      <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                      <SelectContent>{LAND_UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
              )}
              <div className="space-y-1.5"><Label>নোট</Label><Textarea rows={2} value={billForm.note} onChange={(e) => setBillForm({ ...billForm, note: e.target.value })} /></div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setBillForm(null)}>বাতিল</Button>
            <Button onClick={() => saveBill.mutate()} disabled={saveBill.isPending}>{saveBill.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}সংরক্ষণ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* payment form */}
      <Dialog open={!!payForm} onOpenChange={(o) => !o && setPayForm(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{payForm?.id ? "পরিশোধ সম্পাদনা" : "জমির মালিককে টাকা দিন"}</DialogTitle>
            <DialogDescription>টাকা বাকি থেকে কমবে, আর ক্যাশ বইয়ে "জমি ভাড়া পরিশোধ" হিসেবে খরচ উঠবে।</DialogDescription>
          </DialogHeader>
          {payForm && (
            <div className="space-y-3">
              <OwnerSelect owners={owners} value={payForm.owner_id} onChange={(v) => setPayForm({ ...payForm, owner_id: v })} />
              {payForm.owner_id && stats.get(payForm.owner_id) && (
                <p className="rounded-xl bg-muted/60 p-2.5 text-sm">
                  এখন বাকি <b className="num">{tk(stats.get(payForm.owner_id)!.due)}</b>
                  {Number(payForm.amount) > 0 && <> · দেওয়ার পর <b className="num">{tk(stats.get(payForm.owner_id)!.due - (payForm.id ? 0 : Number(payForm.amount)))}</b></>}
                </p>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>টাকা *</Label><Input className="h-11" type="number" inputMode="decimal" value={payForm.amount} onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>তারিখ</Label><Input className="h-11" type="date" value={payForm.date} onChange={(e) => setPayForm({ ...payForm, date: e.target.value })} /></div>
              </div>
              <div className="space-y-1.5">
                <Label>মাধ্যম</Label>
                <div className="grid grid-cols-4 gap-1.5">
                  {METHODS.map(([k, l]) => (
                    <button key={k} type="button" onClick={() => setPayForm({ ...payForm, method: k })}
                      className={`h-10 rounded-xl text-xs font-semibold ${payForm.method === k ? "bg-primary text-primary-foreground" : "border bg-background"}`}>{l}</button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5"><Label>নোট</Label><Textarea rows={2} value={payForm.note} onChange={(e) => setPayForm({ ...payForm, note: e.target.value })} /></div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setPayForm(null)}>বাতিল</Button>
            <Button onClick={() => savePay.mutate()} disabled={savePay.isPending}>{savePay.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}সংরক্ষণ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* owner ledger */}
      <Sheet open={!!detail} onOpenChange={(o) => !o && setDetailId(null)}>
        <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto rounded-t-3xl pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
          {detail && (() => {
            const s = stats.get(detail.id)!;
            const rows = [
              ...bills.filter((b) => b.supplier_id === detail.id).map((b) => ({ key: `b${b.id}`, date: b.purchase_date, kind: isPrev(b) ? "prev" as const : "rent" as const, label: isPrev(b) ? PREV_NOTE : `ভাড়া${b.unit && Number(b.quantity) > 0 ? ` (${bn(Number(b.quantity))} ${b.unit})` : ""}`, plus: Number(b.total_amount), minus: 0, note: b.note, bill: b, pay: null as Pay | null })),
              ...pays.filter((p) => p.supplier_id === detail.id).map((p) => ({ key: `p${p.id}`, date: p.payment_date, kind: "pay" as const, label: `পরিশোধ${p.method && p.method !== "cash" ? ` (${METHODS.find(([k]) => k === p.method)?.[1] ?? p.method})` : ""}`, plus: 0, minus: Number(p.amount), note: p.note, bill: null as Bill | null, pay: p })),
            ].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.kind === "pay" ? 1 : -1));
            let run = 0;
            const withRun = rows.map((r) => { run += r.plus - r.minus; return { ...r, run }; }).reverse();
            return (
              <div className="space-y-4">
                <SheetHeader className="text-left">
                  <SheetTitle className="break-words">{detail.name}</SheetTitle>
                  <SheetDescription>{[detail.address, s.area].filter(Boolean).join(" · ") || "জমির হিসাব"}</SheetDescription>
                </SheetHeader>
                {detail.phone && (
                  <a href={`tel:${detail.phone}`} className="flex h-11 items-center justify-center gap-2 rounded-xl border text-sm font-semibold"><Phone className="h-4 w-4" />{detail.phone}</a>
                )}
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-xl border p-2"><div className="text-[11px] text-muted-foreground">মোট পাবেন</div><b className="num">{tk(s.prev + s.rent)}</b></div>
                  <div className="rounded-xl border p-2"><div className="text-[11px] text-muted-foreground">দেওয়া হয়েছে</div><b className="num text-success">{tk(s.paid)}</b></div>
                  <div className="rounded-xl border p-2"><div className="text-[11px] text-muted-foreground">{s.due < 0 ? "অগ্রিম" : "বাকি"}</div><b className={`num ${s.due > 0 ? "text-warning" : "text-info"}`}>{tk(Math.abs(s.due))}</b></div>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  <Button className="h-11 gap-1 rounded-xl text-sm font-bold" onClick={() => setPayForm(newPay(detail.id))}><Banknote className="h-4 w-4" />টাকা দিন</Button>
                  <Button variant="outline" className="h-11 gap-1 rounded-xl text-sm font-bold" onClick={() => setBillForm(newBill(detail.id))}><Plus className="h-4 w-4" />ভাড়া</Button>
                  <Button variant="outline" className="h-11 gap-1 rounded-xl text-sm font-bold" onClick={() => setBillForm(newBill(detail.id, "prev"))}><History className="h-4 w-4" />পূর্বের বকেয়া</Button>
                </div>
                <div className="divide-y rounded-2xl border">
                  {withRun.length === 0 ? <div className="p-4 text-center text-sm text-muted-foreground">এখনো কোনো এন্ট্রি নেই</div> : withRun.map((r) => (
                    <div key={r.key} className="flex items-center gap-2 px-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold">{r.label}</div>
                        <div className="text-xs text-muted-foreground">{bnDate(r.date)}{r.note && r.note !== PREV_NOTE && r.note !== `${LAND_ITEM} পরিশোধ` ? ` · ${r.note.replace(`${PREV_NOTE} — `, "")}` : ""}</div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className={`num text-sm font-bold ${r.minus ? "text-success" : ""}`}>{r.minus ? `−${tk(r.minus)}` : `+${tk(r.plus)}`}</div>
                        <div className="num text-[11px] text-muted-foreground">বাকি {tk(r.run)}</div>
                      </div>
                      {isAdmin && (
                        <div className="flex shrink-0">
                          <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="সম্পাদনা" onClick={() => {
                            if (r.bill) setBillForm({ id: r.bill.id, owner_id: detail.id, kind: r.kind === "prev" ? "prev" : "rent", date: r.bill.purchase_date, area: r.bill.unit ? String(r.bill.quantity) : "", unit: r.bill.unit ?? LAND_UNITS[0], amount: String(r.bill.total_amount), note: (r.bill.note ?? "").replace(new RegExp(`^${PREV_NOTE}( — )?`), "") });
                            if (r.pay) setPayForm({ id: r.pay.id, owner_id: detail.id, date: r.pay.payment_date, amount: String(r.pay.amount), method: r.pay.method ?? "cash", note: r.pay.note ?? "" });
                          }}><Pencil className="h-4 w-4" /></Button>
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" aria-label="মুছুন" onClick={() => {
                            if (confirm("এই এন্ট্রি মুছবেন?")) del.mutate(r.bill ? { table: "purchases", id: r.bill.id } : { table: "supplier_payments", id: r.pay!.id });
                          }}><Trash2 className="h-4 w-4" /></Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                {isAdmin && (
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="outline" className="h-10 gap-1 rounded-xl" onClick={() => setOwnerForm({ id: detail.id, name: detail.name, phone: detail.phone ?? "", land: detail.address ?? "", note: detail.note ?? "", prevDue: "", rent: "" })}><Pencil className="h-4 w-4" />নাম/তথ্য বদলান</Button>
                    <Button variant="outline" className="h-10 gap-1 rounded-xl border-destructive/40 text-destructive" disabled={withRun.length > 0} onClick={() => confirm(`"${detail.name}" মুছবেন?`) && del.mutate({ table: "suppliers", id: detail.id })}><Trash2 className="h-4 w-4" />মালিক মুছুন</Button>
                  </div>
                )}
              </div>
            );
          })()}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function OwnerSelect({ owners, value, onChange }: { owners: Owner[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label>জমির মালিক *</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-11"><SelectValue placeholder="বেছে নিন" /></SelectTrigger>
        <SelectContent>{owners.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  );
}
