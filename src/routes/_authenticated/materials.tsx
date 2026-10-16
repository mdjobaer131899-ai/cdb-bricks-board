import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, Clock, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { sdb } from "@/lib/season-db";
import { bn, bnDate, todayBD } from "@/lib/format";
import { useCurrentUser } from "@/lib/use-current-user";

/* =========================================================
   কাঁচামাল — মাটি, বালু, কয়লা, তুষ, ডিজেল, লাকড়ি
   শুধু কেনার হিসাব লেখা হয়। সব কেনা "purchases" খাতায় যায়
   (material_id দিয়ে চিহ্নিত), তাই সরবরাহকারীর বাকি, ক্যাশ বই,
   রিপোর্ট আর AI — সব জায়গায় একই হিসাব দেখায়।
   ========================================================= */

export const Route = createFileRoute("/_authenticated/materials")({
  head: () => ({ meta: [{ title: "কাঁচামাল — CDB Bricks" }] }),
  component: MaterialsPage,
});

type Material = {
  id: string;
  name: string;
  unit: string;
  buy_pattern: string; // season | refill | as_needed
  stage: string; // kacha | burn | other
  in_brick_cost: boolean;
  sort_order: number;
};

type Purchase = {
  id: string;
  purchase_date: string;
  supplier_id: string | null;
  material_id: string | null;
  item_name: string;
  quantity: number;
  unit: string | null;
  unit_price: number;
  total_amount: number;
  note: string | null;
};

const NEW_SUP = "__new__";

const LOOK: Record<string, { chip: string; initial: string }> = {
  মাটি: { chip: "bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-200", initial: "মা" },
  বালু: { chip: "bg-stone-200 text-stone-800 dark:bg-stone-800 dark:text-stone-200", initial: "বা" },
  কয়লা: { chip: "bg-stone-800 text-stone-50 dark:bg-stone-200 dark:text-stone-900", initial: "ক" },
  তুষ: { chip: "bg-yellow-100 text-yellow-900 dark:bg-yellow-950/60 dark:text-yellow-200", initial: "তু" },
  ডিজেল: { chip: "bg-blue-100 text-blue-900 dark:bg-blue-950/60 dark:text-blue-200", initial: "ডি" },
  লাকড়ি: { chip: "bg-accent text-accent-foreground", initial: "লা" },
};
const look = (name: string) =>
  LOOK[name.normalize("NFC")] ?? { chip: "bg-muted text-foreground", initial: name.trim().charAt(0) || "?" };

const PATTERN_HINT: Record<string, string> = {
  season: "মৌসুমে একবার কেনা",
  refill: "শেষ হলে আবার কেনা",
  as_needed: "দরকার মতো কেনা",
};

const tk = (n: number) => `৳${bn(Math.round(n))}`;
const daysBetween = (a: string, b: string) =>
  Math.round((new Date(b + "T12:00:00+06:00").getTime() - new Date(a + "T12:00:00+06:00").getTime()) / 86400000);

type Form = {
  id?: string;
  material_id: string;
  purchase_date: string;
  supplier_id: string;
  new_supplier: string;
  quantity: string;
  unit_price: string;
  paid_now: string;
  note: string;
};

function MaterialsPage() {
  const { data: me } = useCurrentUser();
  const isAdmin = me?.role === "admin";
  const today = todayBD();
  const [filter, setFilter] = useState<string>("all");
  const [form, setForm] = useState<Form | null>(null);

  const matQ = useQuery({
    queryKey: ["raw-materials"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("raw_materials")
        .select("id, name, unit, buy_pattern, stage, in_brick_cost, sort_order")
        .eq("active", true)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as Material[];
    },
  });

  const purQ = useQuery({
    queryKey: ["material-purchases"],
    queryFn: async () => {
      const { data, error } = await sdb
        .from("purchases")
        .select("id, purchase_date, supplier_id, material_id, item_name, quantity, unit, unit_price, total_amount, note")
        .not("material_id", "is", null)
        .order("purchase_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Purchase[];
    },
  });

  const supQ = useQuery({
    queryKey: ["suppliers"],
    queryFn: async () => (await supabase.from("suppliers").select("id,name,phone").order("name")).data ?? [],
  });

  const materials = matQ.data ?? [];
  const purchases = purQ.data ?? [];
  const supName = (id: string | null) => (supQ.data ?? []).find((s) => s.id === id)?.name ?? "—";

  // প্রতিটা কাঁচামালের মৌসুমের সারাংশ
  const cards = useMemo(() => {
    return materials.map((m) => {
      const rows = purchases.filter((p) => p.material_id === m.id).sort((a, b) => (a.purchase_date < b.purchase_date ? -1 : 1));
      const qty = rows.reduce((a, r) => a + Number(r.quantity || 0), 0);
      const amount = rows.reduce((a, r) => a + Number(r.total_amount || 0), 0);
      const last = rows[rows.length - 1] ?? null;
      const avgRate = qty > 0 ? amount / qty : 0;
      // শেষ হলে কেনা জিনিস: গড়ে কতদিন পরপর কেনা হয়
      let avgGap: number | null = null;
      if (rows.length >= 2) {
        const gaps: number[] = [];
        for (let i = 1; i < rows.length; i++) gaps.push(daysBetween(rows[i - 1].purchase_date, rows[i].purchase_date));
        const pos = gaps.filter((g) => g > 0);
        if (pos.length) avgGap = pos.reduce((a, g) => a + g, 0) / pos.length;
      }
      const sinceLast = last ? daysBetween(last.purchase_date, today) : null;
      const dueSoon = m.buy_pattern === "refill" && avgGap !== null && sinceLast !== null && sinceLast >= Math.max(1, Math.round(avgGap) - 1);
      return { m, rows, qty, amount, last, avgRate, avgGap, sinceLast, dueSoon };
    });
  }, [materials, purchases, today]);

  const seasonTotal = cards.reduce((a, c) => a + (c.m.in_brick_cost ? c.amount : 0), 0);
  const shown = filter === "all" ? purchases : purchases.filter((p) => p.material_id === filter);

  function openNew(materialId?: string) {
    const mid = materialId ?? materials[0]?.id ?? "";
    const lastOf = purchases.find((p) => p.material_id === mid);
    setForm({
      material_id: mid,
      purchase_date: today,
      supplier_id: lastOf?.supplier_id ?? NEW_SUP,
      new_supplier: "",
      quantity: "",
      unit_price: lastOf ? String(lastOf.unit_price) : "",
      paid_now: "",
      note: "",
    });
  }

  function pickMaterial(mid: string) {
    if (!form) return;
    const lastOf = purchases.find((p) => p.material_id === mid);
    setForm({
      ...form,
      material_id: mid,
      unit_price: form.id ? form.unit_price : lastOf ? String(lastOf.unit_price) : "",
      supplier_id: form.id ? form.supplier_id : (lastOf?.supplier_id ?? form.supplier_id),
    });
  }

  const save = useMutation({
    mutationFn: async () => {
      const f = form!;
      const mat = materials.find((m) => m.id === f.material_id);
      if (!mat) throw new Error("কাঁচামাল বেছে নিন");
      const qty = Number(f.quantity || 0);
      const rate = Number(f.unit_price || 0);
      if (!(qty > 0)) throw new Error("পরিমাণ দিন");
      if (!(rate >= 0)) throw new Error("দর দিন");
      if (!me?.user.id) throw new Error("লগইন প্রয়োজন");

      let supplierId: string | null = f.supplier_id === NEW_SUP ? null : f.supplier_id;
      if (f.supplier_id === NEW_SUP) {
        const name = f.new_supplier.trim();
        if (!name) throw new Error("বিক্রেতার নাম দিন");
        const found = (supQ.data ?? []).find((s) => s.name.trim() === name);
        if (found) supplierId = found.id;
        else {
          const { data, error } = await supabase.from("suppliers").insert({ name }).select("id").single();
          if (error) throw error;
          supplierId = data.id;
        }
      }

      const payload = {
        purchase_date: f.purchase_date,
        supplier_id: supplierId,
        material_id: mat.id,
        item_name: mat.name,
        quantity: qty,
        unit: mat.unit,
        unit_price: rate,
        total_amount: Math.round(qty * rate * 100) / 100,
        note: f.note.trim() || null,
      };

      if (f.id) {
        const { error } = await supabase.from("purchases").update(payload).eq("id", f.id);
        if (error) throw error;
        return;
      }
      const { error } = await supabase.from("purchases").insert({ ...payload, created_by: me.user.id });
      if (error) throw error;

      const paid = Number(f.paid_now || 0);
      if (paid > 0 && supplierId) {
        const { error: e2 } = await supabase.from("supplier_payments").insert({
          supplier_id: supplierId,
          amount: paid,
          payment_date: f.purchase_date,
          note: `${mat.name} ক্রয়ের সময় পরিশোধ`,
          created_by: me.user.id,
        });
        if (e2) throw e2;
      }
    },
    onSuccess: () => {
      toast.success("সংরক্ষিত");
      setForm(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("purchases").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => toast.success("মুছে ফেলা হয়েছে"),
    onError: (e: Error) => toast.error(e.message),
  });

  const f = form;
  const fMat = f ? materials.find((m) => m.id === f.material_id) : undefined;
  const fTotal = f ? Number(f.quantity || 0) * Number(f.unit_price || 0) : 0;
  const fPaid = f ? Number(f.paid_now || 0) : 0;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 pb-4">
      {/* শিরোনাম */}
      <div className="space-y-3 px-0.5 pt-1">
        <div>
          <h1 className="font-display text-[26px] font-extrabold leading-tight">কাঁচামাল</h1>
          <p className="text-sm font-semibold text-muted-foreground">শুধু কেনার হিসাব লিখুন, বাকিটা নিজে হিসাব হবে</p>
        </div>
        <button
          type="button"
          onClick={() => openNew()}
          disabled={!materials.length}
          className="flex h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-primary text-base font-bold text-primary-foreground shadow-sm transition active:scale-[0.99] disabled:opacity-60 md:w-auto md:px-6"
        >
          <Plus className="h-5 w-5" aria-hidden="true" />
          কাঁচামাল কেনা লিখুন
        </button>
      </div>

      {/* সতর্কতা: কেনার সময় হয়ে এসেছে */}
      {cards
        .filter((c) => c.dueSoon)
        .map((c) => (
          <div key={c.m.id} className="flex items-start gap-2.5 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
            <Clock className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            <span>
              <b>{c.m.name} কেনার সময় হয়ে এসেছে।</b> সাধারণত প্রতি {bn(Math.round(c.avgGap ?? 0))} দিনে কেনা হয়, শেষবার কেনা হয়েছে {bn(c.sinceLast ?? 0)} দিন আগে।
            </span>
          </div>
        ))}

      {/* মৌসুমের মোট */}
      <section className="bg-brick-pattern relative overflow-hidden rounded-[22px] bg-ink p-[18px] text-ink-foreground">
        <div className="text-xs font-bold tracking-[0.12em] text-stone-300">এই মৌসুমে কাঁচামালে খরচ</div>
        <div className="font-display num mt-2 text-[36px] font-extrabold leading-none">{tk(seasonTotal)}</div>
        <p className="mt-2 text-xs leading-relaxed text-stone-400">
          লাকড়ি (শ্রমিকদের রান্না) এই হিসাবে নেই। আনলোডের হিসাব ঠিক হলে (পরের ধাপ) এখানে প্রতি লাখ ইটে কয়লা আর প্রতি ইটে খরচ দেখাবে।
        </p>
      </section>

      {/* কাঁচামালের কার্ড */}
      {matQ.isLoading || purQ.isLoading ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-[132px] rounded-2xl" />
          ))}
        </div>
      ) : materials.length === 0 ? (
        <div className="flex items-start gap-2.5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          কাঁচামালের তালিকা পাওয়া যায়নি। Supabase-এ ধাপ ১-এর SQL চালানো হয়েছে কিনা দেখুন।
        </div>
      ) : (
        <section className="space-y-2">
          <h2 className="section-label px-1">এই মৌসুমে কেনা</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {cards.map((c) => {
              const lk = look(c.m.name);
              return (
                <div key={c.m.id} className="flex flex-col gap-2.5 rounded-2xl border bg-card p-3.5">
                  <div className="flex items-center gap-2.5">
                    <span className={`font-display grid h-10 w-10 shrink-0 place-items-center rounded-xl text-[17px] font-extrabold ${lk.chip}`}>{lk.initial}</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-base font-bold leading-tight">{c.m.name}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {c.m.in_brick_cost ? PATTERN_HINT[c.m.buy_pattern] ?? "" : "শ্রমিকদের রান্না · ইটের খরচে নয়"}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="num text-base font-extrabold">{tk(c.amount)}</div>
                      <div className="num text-xs text-muted-foreground">
                        {bn(c.qty)} {c.m.unit}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2 rounded-xl bg-muted/70 px-3 py-2 text-[13px]">
                    {c.last ? (
                      <>
                        <span className="min-w-0 truncate text-muted-foreground">
                          শেষ কেনা {bnDate(c.last.purchase_date)} · {bn(c.last.quantity)} {c.m.unit}
                        </span>
                        <span className="shrink-0 font-bold">
                          {c.m.buy_pattern === "refill" && c.avgGap !== null ? `গড়ে ${bn(Math.round(c.avgGap))} দিনে` : `গড় দর ${tk(c.avgRate)}`}
                        </span>
                      </>
                    ) : (
                      <span className="text-muted-foreground">এখনো কেনা লেখা হয়নি</span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => openNew(c.m.id)}
                    className="flex h-10 items-center justify-center gap-1.5 rounded-xl border text-sm font-bold text-primary transition hover:bg-accent active:scale-[0.99]"
                  >
                    <Plus className="h-4 w-4" aria-hidden="true" /> {c.m.name} কেনা
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* কেনার তালিকা */}
      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2 px-1">
          <h2 className="section-label">কেনার তালিকা</h2>
          <Link to="/purchases" className="text-sm font-bold text-primary hover:underline">
            সরবরাহকারীর বাকি
          </Link>
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {[{ id: "all", name: "সব" }, ...materials].map((m) => (
            <button
              key={m.id}
              type="button"
              aria-pressed={filter === m.id}
              onClick={() => setFilter(m.id)}
              className={`h-9 shrink-0 rounded-full border px-3.5 text-sm font-semibold transition ${
                filter === m.id ? "border-primary bg-primary text-primary-foreground" : "bg-card text-foreground"
              }`}
            >
              {m.name}
            </button>
          ))}
        </div>
        <div className="overflow-hidden rounded-2xl border bg-card">
          {shown.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">কোনো কেনা নেই।</p>
          ) : (
            shown.map((p) => (
              <div key={p.id} className="flex items-center gap-3 border-b px-4 py-2.5 last:border-b-0">
                <span className={`font-display grid h-9 w-9 shrink-0 place-items-center rounded-xl text-sm font-extrabold ${look(p.item_name).chip}`}>
                  {look(p.item_name).initial}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[15px] font-semibold">
                    {p.item_name} · {bn(p.quantity)} {p.unit ?? ""}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {bnDate(p.purchase_date)} · {supName(p.supplier_id)} · দর {tk(p.unit_price)}
                    {p.note ? ` · ${p.note}` : ""}
                  </div>
                </div>
                <div className="num shrink-0 text-[15px] font-bold">{tk(p.total_amount)}</div>
                {isAdmin && (
                  <div className="flex shrink-0">
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="সম্পাদনা"
                      onClick={() =>
                        setForm({
                          id: p.id,
                          material_id: p.material_id ?? "",
                          purchase_date: p.purchase_date,
                          supplier_id: p.supplier_id ?? NEW_SUP,
                          new_supplier: "",
                          quantity: String(p.quantity),
                          unit_price: String(p.unit_price),
                          paid_now: "",
                          note: p.note ?? "",
                        })
                      }
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" aria-label="মুছুন" onClick={() => confirm("এই কেনা মুছবেন?") && del.mutate(p.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </section>

      {/* কেনার ফর্ম */}
      <Dialog open={!!f} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{f?.id ? "কেনা সম্পাদনা" : "কাঁচামাল কেনা"}</DialogTitle>
          </DialogHeader>
          {f && (
            <div className="space-y-3.5">
              <div>
                <Label>কী কিনলেন</Label>
                <div className="mt-1.5 grid grid-cols-3 gap-1.5">
                  {materials.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      aria-pressed={f.material_id === m.id}
                      onClick={() => pickMaterial(m.id)}
                      className={`h-11 rounded-xl border text-[15px] font-semibold transition ${
                        f.material_id === m.id ? "border-primary bg-primary text-primary-foreground" : "bg-card"
                      }`}
                    >
                      {m.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label htmlFor="mp-date">তারিখ</Label>
                  <Input id="mp-date" type="date" value={f.purchase_date} onChange={(e) => setForm({ ...f, purchase_date: e.target.value })} />
                </div>
                <div>
                  <Label>বিক্রেতা</Label>
                  <Select value={f.supplier_id} onValueChange={(v) => setForm({ ...f, supplier_id: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NEW_SUP}>+ নতুন বিক্রেতা</SelectItem>
                      {(supQ.data ?? []).map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {f.supplier_id === NEW_SUP && (
                <Input placeholder="বিক্রেতার নাম" value={f.new_supplier} onChange={(e) => setForm({ ...f, new_supplier: e.target.value })} />
              )}

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label htmlFor="mp-qty">পরিমাণ ({fMat?.unit ?? ""})</Label>
                  <Input id="mp-qty" type="number" inputMode="decimal" value={f.quantity} onChange={(e) => setForm({ ...f, quantity: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="mp-rate">দর (প্রতি {fMat?.unit ?? "একক"}, ৳)</Label>
                  <Input id="mp-rate" type="number" inputMode="decimal" value={f.unit_price} onChange={(e) => setForm({ ...f, unit_price: e.target.value })} />
                </div>
              </div>

              <div className="flex items-center justify-between rounded-xl bg-muted px-3.5 py-2.5">
                <span className="text-sm font-semibold text-muted-foreground">মোট দাম</span>
                <span className="font-display num text-xl font-extrabold">{tk(fTotal)}</span>
              </div>

              {!f.id && (
                <div>
                  <Label htmlFor="mp-paid">এখন নগদ পরিশোধ (৳)</Label>
                  <div className="flex gap-2">
                    <Input id="mp-paid" type="number" inputMode="decimal" value={f.paid_now} onChange={(e) => setForm({ ...f, paid_now: e.target.value })} />
                    <Button type="button" variant="outline" onClick={() => setForm({ ...f, paid_now: String(Math.round(fTotal)) })}>
                      পুরোটা
                    </Button>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {fPaid > 0 ? `৳${bn(fPaid)} ক্যাশ বই থেকে কমবে। ` : ""}
                    {fTotal - fPaid > 0.5 ? `বাকি ${tk(fTotal - fPaid)} বিক্রেতার পাওনায় যোগ হবে।` : fTotal > 0 ? "কোনো বাকি থাকবে না।" : ""}
                  </p>
                </div>
              )}

              <div>
                <Label htmlFor="mp-note">নোট (ইচ্ছা হলে)</Label>
                <Input id="mp-note" placeholder="যেমন: ট্রাক নম্বর" value={f.note} onChange={(e) => setForm({ ...f, note: e.target.value })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button className="h-11 w-full text-base" onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              সংরক্ষণ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
