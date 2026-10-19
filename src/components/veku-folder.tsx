import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Banknote, Clock, Loader2, Pencil, Plus, Printer, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/fetch-all";
import { ASSET_PREFIX } from "@/lib/cash-queries";
import { ExpenseEntryDialog, type ExpenseEdit } from "@/components/expense-entry";
import { HOUR, VEKU_ITEM, VEKU_TYPE, parseVekuNote as parseNote } from "@/components/contract-config";
import { bn, bnDate } from "@/lib/format";
import { useCurrentUser } from "@/lib/use-current-user";
import { printTable } from "@/lib/print-table";

/**
 * ভেকু (excavators) owned jointly with partners. The kiln pays the vekus by the hour, and
 * the money it hands over (diesel, mobil/grease, parts, the driver's pay) counts against that.
 *  - a veku is a suppliers row with material_type VEKU_TYPE ("ভেকু ১", "ভেকু ২", more can be added)
 *  - hours worked are a purchases row: item_name VEKU_ITEM, quantity = hours, unit "ঘণ্টা",
 *    unit_price = rate per hour, note "চালক: X · …"
 *  - money given is a supplier_payments row, note "<kind> · চালক: X · …"
 * The vekus are shown as one account (equal owners); a chip narrows it to one veku.
 * The kiln's share of buying them is a fixed asset (expenses "সম্পদ — ভেকু…"), shown on top.
 * Dues are all-time.
 */
// settings live in contract-config.ts so the one expense form can use them too
export { VEKU_ITEM, VEKU_TYPE } from "@/components/contract-config";

const tk = (n: number) => `৳${bn(Math.round(n))}`;

type Veku = { id: string; name: string; note: string | null };
type Bill = { id: string; supplier_id: string | null; purchase_date: string; quantity: number; unit: string | null; unit_price: number; total_amount: number; note: string | null };
type Pay = { id: string; supplier_id: string; payment_date: string; amount: number; note: string | null };

type Entry = { partyId?: string; focus?: "bill" | "pay"; edit?: ExpenseEdit };

export function VekuFolder({ onBack }: { onBack: () => void }) {
  const qc = useQueryClient();
  const { data: me } = useCurrentUser();
  const isAdmin = me?.role === "admin";

  const vekusQ = useQuery({
    queryKey: ["veku-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("suppliers").select("id, name, note").eq("material_type", VEKU_TYPE).order("name");
      if (error) throw error;
      return (data ?? []) as Veku[];
    },
  });
  const ids = (vekusQ.data ?? []).map((v) => v.id);
  const billsQ = useQuery({
    queryKey: ["veku-bills"],
    queryFn: () => fetchAllRows<Bill>(() => supabase.from("purchases")
      .select("id, supplier_id, purchase_date, quantity, unit, unit_price, total_amount, note").eq("item_name", VEKU_ITEM).order("id")),
  });
  const paysQ = useQuery({
    queryKey: ["veku-payments", ids.join(",")],
    enabled: ids.length > 0,
    queryFn: () => fetchAllRows<Pay>(() => supabase.from("supplier_payments")
      .select("id, supplier_id, payment_date, amount, note").in("supplier_id", ids).order("id")),
  });
  // the kiln's share of buying the vekus (fixed asset)
  const assetQ = useQuery({
    queryKey: ["veku-asset"],
    queryFn: async () => {
      const { data, error } = await supabase.from("expenses").select("amount, expense_date").like("category", `${ASSET_PREFIX}ভেকু%`);
      if (error) throw error;
      return (data ?? []).reduce((a, r: any) => a + Number(r.amount || 0), 0);
    },
  });

  const vekus = vekusQ.data ?? [];
  const nameOf = (id: string | null) => vekus.find((v) => v.id === id)?.name ?? "—";
  const [filter, setFilter] = useState<string>("all");
  const inFilter = (sid: string | null) => filter === "all" || sid === filter;

  // empty placeholders (no hours, no money) are not shown
  const bills = (billsQ.data ?? []).filter((b) => b.supplier_id && ids.includes(b.supplier_id) && (Number(b.total_amount) > 0 || Number(b.quantity) > 0));
  const pays = paysQ.data ?? [];

  const stats = useMemo(() => {
    const fb = bills.filter((b) => inFilter(b.supplier_id));
    const fp = pays.filter((p) => inFilter(p.supplier_id));
    const hours = fb.reduce((a, b) => a + (b.unit === HOUR ? Number(b.quantity || 0) : 0), 0);
    const bill = fb.reduce((a, b) => a + Number(b.total_amount || 0), 0);
    const paid = fp.reduce((a, p) => a + Number(p.amount || 0), 0);
    const byKind = new Map<string, number>();
    for (const p of fp) {
      const k = parseNote(p.note).kind || "অন্যান্য";
      byKind.set(k, (byKind.get(k) ?? 0) + Number(p.amount || 0));
    }
    return { hours, bill, paid, due: bill - paid, byKind: [...byKind].sort((a, b) => b[1] - a[1]) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bills, pays, filter]);

  const rows = useMemo(() => [
    ...bills.filter((b) => inFilter(b.supplier_id)).map((b) => ({ key: `b${b.id}`, date: b.purchase_date, bill: b, pay: null as Pay | null })),
    ...pays.filter((p) => inFilter(p.supplier_id)).map((p) => ({ key: `p${p.id}`, date: p.payment_date, bill: null as Bill | null, pay: p })),
  ].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [bills, pays, filter]);

  const invalidate = () => {
    for (const key of [["veku-list"], ["veku-bills"], ["veku-payments"], ["suppliers"], ["purchases"], ["supplier-payments"], ["cash"], ["cash-book"], ["profit-loss"]]) {
      qc.invalidateQueries({ queryKey: key });
    }
  };

  // hours and money: the one expense form
  const [entry, setEntry] = useState<Entry | null>(null);
  const [vekuForm, setVekuForm] = useState<{ id?: string; name: string; note: string } | null>(null);

  const saveVeku = useMutation({
    mutationFn: async () => {
      const f = vekuForm!;
      const name = f.name.trim();
      if (!name) throw new Error("ভেকুর নাম দিন");
      if (!f.id && vekus.some((v) => v.name.trim() === name)) throw new Error(`"${name}" আগেই আছে`);
      const payload = { name, note: f.note.trim() || null, material_type: VEKU_TYPE };
      const { error } = f.id
        ? await supabase.from("suppliers").update(payload).eq("id", f.id)
        : await supabase.from("suppliers").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("সংরক্ষিত"); setVekuForm(null); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (v: { table: "purchases" | "supplier_payments"; id: string }) => {
      const { error } = await supabase.from(v.table).delete().eq("id", v.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("মুছে ফেলা হয়েছে"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const loading = vekusQ.isLoading || billsQ.isLoading || (ids.length > 0 && paysQ.isLoading);
  const asset = assetQ.data ?? 0;
  const scope = filter === "all" ? "সব ভেকু" : nameOf(filter);

  const print = () => printTable({
    title: `ভেকুর হিসাব — ${scope}`,
    headers: ["তারিখ", "ভেকু", "বিবরণ", "চালক", "কাজের বিল", "দেওয়া"],
    rightCols: [4, 5],
    rows: [...rows].reverse().map((r) => {
      if (r.bill) {
        const n = parseNote(r.bill.note);
        const label = r.bill.unit === HOUR ? `কাজ ${bn(Number(r.bill.quantity))} ঘণ্টা × ${tk(Number(r.bill.unit_price))}` : "কাজের বিল";
        return [bnDate(r.date), nameOf(r.bill.supplier_id), [label, n.rest].filter(Boolean).join(" — "), n.driver, tk(Number(r.bill.total_amount)), ""];
      }
      const n = parseNote(r.pay!.note);
      return [bnDate(r.date), nameOf(r.pay!.supplier_id), [n.kind || "টাকা দেওয়া", n.rest].filter(Boolean).join(" — "), n.driver, "", tk(Number(r.pay!.amount))];
    }),
    totals: [["মোট ঘণ্টা", bn(stats.hours)], ["কাজের বিল", tk(stats.bill)], ["দেওয়া / খরচ", tk(stats.paid)], [stats.due < 0 ? "ভাটা বেশি দিয়েছে" : "বাকি", tk(Math.abs(stats.due))]],
  });

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 pb-28 md:pb-6">
      <div className="flex items-center gap-3 pt-1">
        <button type="button" onClick={onBack} aria-label="মালামাল ক্রয় ও খরচে ফিরে যান"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border bg-card transition active:scale-95">
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="font-display truncate text-[24px] font-extrabold leading-tight">ভেকু</h1>
          <p className="text-sm font-semibold text-muted-foreground">কত ঘণ্টা কাজ, কত টাকা দেওয়া, কত বাকি</p>
        </div>
        <Button variant="outline" size="icon" className="h-11 w-11 shrink-0 rounded-xl" onClick={print} aria-label="প্রিন্ট">
          <Printer className="h-5 w-5" />
        </Button>
      </div>

      <section className="bg-brick-pattern relative overflow-hidden rounded-[20px] bg-ink p-[18px] text-ink-foreground">
        <div className="text-xs font-bold tracking-[0.12em] text-stone-300">
          {stats.due < 0 ? "ভাটা বেশি দিয়েছে" : "ভেকু পাবে (বাকি)"} · {scope}
        </div>
        {loading ? <Skeleton className="mt-3 h-10 w-40 bg-white/10" /> : (
          <div className={`mt-2 font-display num text-[40px] font-extrabold leading-none ${stats.due < 0 ? "text-sky-300" : ""}`}>{tk(Math.abs(stats.due))}</div>
        )}
        <div className="mt-3.5 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl border border-white/10 bg-white/[0.07] px-2 py-2">
            <div className="text-[11px] font-semibold text-stone-300">মোট ঘণ্টা</div>
            <div className="num text-sm font-bold">{bn(stats.hours)}</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.07] px-2 py-2">
            <div className="text-[11px] font-semibold text-stone-300">কাজের বিল</div>
            <div className="num text-sm font-bold">{tk(stats.bill)}</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.07] px-2 py-2">
            <div className="text-[11px] font-semibold text-emerald-200">দেওয়া / খরচ</div>
            <div className="num text-sm font-bold text-emerald-300">{tk(stats.paid)}</div>
          </div>
        </div>
        {stats.hours > 0 && <div className="num mt-2 text-xs text-stone-300">গড়ে ঘণ্টায় {tk(stats.bill / stats.hours)}</div>}
        {asset > 0 && filter === "all" && (
          <div className="num mt-1 text-xs text-stone-300">ভেকুতে ভাটার অংশ (সম্পদ): {tk(asset)}</div>
        )}
      </section>

      {/* one account, or one veku */}
      <div className="flex flex-wrap gap-1.5">
        {[{ id: "all", name: "সব ভেকু" }, ...vekus].map((v) => (
          <button key={v.id} type="button" onClick={() => setFilter(v.id)}
            className={`h-10 rounded-full px-4 text-sm font-semibold ${filter === v.id ? "bg-primary text-primary-foreground" : "border bg-card"}`}>{v.name}</button>
        ))}
        {isAdmin && (
          <button type="button" onClick={() => setVekuForm({ name: `ভেকু ${bn(vekus.length + 1)}`, note: "" })}
            className="flex h-10 items-center gap-1 rounded-full border border-dashed px-3 text-sm font-semibold text-muted-foreground">
            <Plus className="h-4 w-4" /> নতুন ভেকু
          </button>
        )}
        {isAdmin && filter !== "all" && (
          <button type="button" aria-label="নাম বদলান" onClick={() => { const v = vekus.find((x) => x.id === filter); if (v) setVekuForm({ id: v.id, name: v.name, note: v.note ?? "" }); }}
            className="grid h-10 w-10 place-items-center rounded-full border text-muted-foreground"><Pencil className="h-4 w-4" /></button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button className="h-12 gap-2 rounded-2xl text-base font-bold" disabled={vekus.length === 0} onClick={() => setEntry({ partyId: filter !== "all" ? filter : undefined, focus: "pay" })}>
          <Banknote className="h-5 w-5" /> খরচ / টাকা
        </Button>
        <Button variant="outline" className="h-12 gap-2 rounded-2xl text-base font-bold" disabled={vekus.length === 0} onClick={() => setEntry({ partyId: filter !== "all" ? filter : undefined, focus: "bill" })}>
          <Clock className="h-5 w-5" /> ঘণ্টা লিখুন
        </Button>
      </div>

      {stats.byKind.length > 0 && (
        <section className="rounded-2xl border bg-card p-3.5">
          <div className="text-sm font-bold">কোন খাতে কত দেওয়া হলো</div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {stats.byKind.map(([k, v]) => (
              <div key={k} className="flex items-center justify-between rounded-xl bg-muted/50 px-3 py-2 text-sm">
                <span>{k}</span><b className="num">{tk(v)}</b>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-2xl border bg-card">
        <div className="border-b px-3.5 py-2.5 text-sm font-bold">হিসাবের খাতা · {scope}</div>
        {loading ? (
          <div className="space-y-2 p-3"><Skeleton className="h-12" /><Skeleton className="h-12" /></div>
        ) : vekus.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">এখনো কোনো ভেকু যোগ করা হয়নি। উপরে "নতুন ভেকু" চাপুন।</div>
        ) : rows.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">এখনো কোনো এন্ট্রি নেই</div>
        ) : (
          <div className="divide-y">
            {rows.map((r) => {
              const isBill = !!r.bill;
              const n = parseNote(isBill ? r.bill!.note : r.pay!.note);
              const sid = isBill ? r.bill!.supplier_id : r.pay!.supplier_id;
              const label = isBill
                ? (r.bill!.unit === HOUR ? `কাজ ${bn(Number(r.bill!.quantity))} ঘণ্টা × ${tk(Number(r.bill!.unit_price))}` : "কাজের বিল")
                : n.kind || "টাকা দেওয়া";
              const amount = isBill ? Number(r.bill!.total_amount) : Number(r.pay!.amount);
              return (
                <div key={r.key} className="flex items-center gap-2 px-3.5 py-2.5">
                  <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${isBill ? "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-200" : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200"}`}>
                    {isBill ? <Clock className="h-4 w-4" /> : <Banknote className="h-4 w-4" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="break-words text-sm font-semibold">{label}</div>
                    <div className="break-words text-xs text-muted-foreground">
                      {[bnDate(r.date), filter === "all" ? nameOf(sid) : "", n.driver ? `চালক ${n.driver}` : "", n.rest].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                  <b className={`num shrink-0 text-sm ${isBill ? "" : "text-success"}`}>{isBill ? "+" : "−"}{tk(amount)}</b>
                  {isAdmin && (
                    <div className="flex shrink-0">
                      <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="সম্পাদনা" onClick={() => {
                        if (r.bill) setEntry({ edit: { table: "purchases", id: r.bill.id, supplier_id: r.bill.supplier_id, date: r.bill.purchase_date, item_name: VEKU_ITEM, quantity: Number(r.bill.quantity), unit: r.bill.unit, unit_price: Number(r.bill.unit_price), total: Number(r.bill.total_amount), note: r.bill.note } });
                        else setEntry({ edit: { table: "supplier_payments", id: r.pay!.id, supplier_id: r.pay!.supplier_id, date: r.pay!.payment_date, amount: Number(r.pay!.amount), note: r.pay!.note } });
                      }}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" aria-label="মুছুন" onClick={() => {
                        if (confirm("এই এন্ট্রি মুছবেন?")) del.mutate(r.bill ? { table: "purchases", id: r.bill.id } : { table: "supplier_payments", id: r.pay!.id });
                      }}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <ExpenseEntryDialog
        open={!!entry}
        onOpenChange={(o) => { if (!o) setEntry(null); }}
        head="veku"
        lockHead
        partyId={entry?.partyId ?? null}
        focus={entry?.focus}
        edit={entry?.edit ?? null}
        onDone={invalidate}
      />

      {/* add / rename a veku */}
      <Dialog open={!!vekuForm} onOpenChange={(o) => !o && setVekuForm(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{vekuForm?.id ? "ভেকুর নাম বদলান" : "নতুন ভেকু"}</DialogTitle>
            <DialogDescription>যেমন "ভেকু ৩" বা রং/মডেল দিয়ে চেনার মতো নাম।</DialogDescription>
          </DialogHeader>
          {vekuForm && (
            <div className="space-y-3">
              <div className="space-y-1.5"><Label>নাম *</Label><Input className="h-11" value={vekuForm.name} onChange={(e) => setVekuForm({ ...vekuForm, name: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>নোট</Label><Input className="h-11" placeholder="যেমন: ভাড়ায় আনা, মালিকের নাম" value={vekuForm.note} onChange={(e) => setVekuForm({ ...vekuForm, note: e.target.value })} /></div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setVekuForm(null)}>বাতিল</Button>
            <Button onClick={() => saveVeku.mutate()} disabled={saveVeku.isPending}>{saveVeku.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}সংরক্ষণ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
