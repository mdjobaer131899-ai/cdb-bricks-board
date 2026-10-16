import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Clock, Loader2, Pencil, Plus, Printer, ShoppingCart, Trash2, Wallet } from "lucide-react";
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
import { printTable } from "@/lib/print-table";

/* =========================================================
   Purchases & dues — one page for everything bought:
   raw materials (soil, sand, coal, husk, diesel, firewood) and other
   goods (engine parts, electricity bill, ...). Items come from the
   raw_materials catalog; each is bought either by quantity × rate or
   as a lump total. All rows go to `purchases`; cash paid goes to
   `supplier_payments`, so supplier dues, cash book, reports and AI agree.
   ========================================================= */

export const Route = createFileRoute("/_authenticated/purchases")({
  head: () => ({
    meta: [
      { title: "মালামাল ক্রয় ও বাকি — CDB Bricks" },
      { name: "description", content: "কাঁচামাল, ইঞ্জিন মালামাল, কারেন্ট বিল সহ সব কেনাকাটা, পরিশোধ ও বাকির হিসাব।" },
    ],
  }),
  component: PurchasesPage,
});

type Item = {
  id: string;
  name: string;
  unit: string;
  item_group: string; // raw | other
  pricing: string; // unit | total
  buy_pattern: string; // season | refill | as_needed
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
const OTHER_ITEM = "__other__"; // older rows typed by hand, not in the catalog

const RAW_LOOK: Record<string, { chip: string; initial: string }> = {
  মাটি: { chip: "bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-200", initial: "মা" },
  বালু: { chip: "bg-stone-200 text-stone-800 dark:bg-stone-800 dark:text-stone-200", initial: "বা" },
  কয়লা: { chip: "bg-stone-800 text-stone-50 dark:bg-stone-200 dark:text-stone-900", initial: "ক" },
  তুষ: { chip: "bg-yellow-100 text-yellow-900 dark:bg-yellow-950/60 dark:text-yellow-200", initial: "তু" },
  ডিজেল: { chip: "bg-blue-100 text-blue-900 dark:bg-blue-950/60 dark:text-blue-200", initial: "ডি" },
  লাকড়ি: { chip: "bg-accent text-accent-foreground", initial: "লা" },
};
const look = (name: string) =>
  RAW_LOOK[name.normalize("NFC")] ?? { chip: "bg-muted text-foreground", initial: name.trim().charAt(0) || "?" };

const PATTERN_HINT: Record<string, string> = {
  season: "মৌসুমে একবার কেনা",
  refill: "শেষ হলে আবার কেনা",
  as_needed: "দরকার মতো কেনা",
};

const tk = (n: number) => `৳${bn(Math.round(n))}`;
const daysBetween = (a: string, b: string) =>
  Math.round((new Date(b + "T12:00:00+06:00").getTime() - new Date(a + "T12:00:00+06:00").getTime()) / 86400000);

type BuyForm = {
  id?: string;
  item_id: string;
  item_name_free: string; // only for OTHER_ITEM (old hand-typed rows)
  purchase_date: string;
  supplier_id: string;
  new_supplier: string;
  quantity: string;
  unit_price: string;
  total: string;
  paid_now: string;
  note: string;
};

type ItemForm = { name: string; group: "raw" | "other"; pricing: "unit" | "total"; unit: string };

function PurchasesPage() {
  const { data: me } = useCurrentUser();
  const isAdmin = me?.role === "admin";
  const today = todayBD();

  const [filter, setFilter] = useState<string>("all");
  const [buy, setBuy] = useState<BuyForm | null>(null);
  const [itemDlg, setItemDlg] = useState<ItemForm | null>(null);
  const [payDlg, setPayDlg] = useState<null | { id?: string; supplier_id: string; amount: string; date: string; note: string }>(null);

  /* ---------- data ---------- */
  const itemsQ = useQuery({
    queryKey: ["purchase-items"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("raw_materials")
        .select("id, name, unit, item_group, pricing, buy_pattern, in_brick_cost, sort_order")
        .eq("active", true)
        .order("sort_order")
        .order("name");
      if (error) throw error;
      return (data ?? []) as Item[];
    },
  });
  const supQ = useQuery({
    queryKey: ["suppliers"],
    queryFn: async () => (await supabase.from("suppliers").select("id,name,phone").order("name")).data ?? [],
  });
  const purQ = useQuery({
    queryKey: ["purchases"],
    queryFn: async () => {
      const { data, error } = await sdb
        .from("purchases")
        .select("id, purchase_date, supplier_id, material_id, item_name, quantity, unit, unit_price, total_amount, note")
        .order("purchase_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Purchase[];
    },
  });
  const payQ = useQuery({
    queryKey: ["supplier-payments"],
    queryFn: async () => {
      const { data, error } = await sdb.from("supplier_payments").select("*").order("payment_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const items = itemsQ.data ?? [];
  const rawItems = items.filter((i) => i.item_group === "raw");
  const otherItems = items.filter((i) => i.item_group !== "raw");
  const purchases = purQ.data ?? [];
  const supName = (id: string | null) => (supQ.data ?? []).find((s) => s.id === id)?.name ?? "—";
  const itemOf = (p: Purchase) => items.find((i) => i.id === p.material_id);

  /* ---------- summaries ---------- */
  const bySup = useMemo(() => {
    return (supQ.data ?? [])
      .map((s) => {
        const bought = purchases.filter((p) => p.supplier_id === s.id).reduce((a, b) => a + Number(b.total_amount || 0), 0);
        const paid = (payQ.data ?? []).filter((p) => p.supplier_id === s.id).reduce((a, b) => a + Number(b.amount || 0), 0);
        return { ...s, bought, paid, due: bought - paid };
      })
      .filter((s) => s.bought || s.paid);
  }, [supQ.data, purchases, payQ.data]);
  const tot = bySup.reduce((a, b) => ({ bought: a.bought + b.bought, paid: a.paid + b.paid, due: a.due + b.due }), { bought: 0, paid: 0, due: 0 });

  const cardFor = (it: Item) => {
    const rows = purchases.filter((p) => p.material_id === it.id).sort((a, b) => (a.purchase_date < b.purchase_date ? -1 : 1));
    const qty = rows.reduce((a, r) => a + Number(r.quantity || 0), 0);
    const amount = rows.reduce((a, r) => a + Number(r.total_amount || 0), 0);
    const last = rows[rows.length - 1] ?? null;
    let avgGap: number | null = null;
    if (rows.length >= 2) {
      const gaps: number[] = [];
      for (let i = 1; i < rows.length; i++) {
        const g = daysBetween(rows[i - 1].purchase_date, rows[i].purchase_date);
        if (g > 0) gaps.push(g);
      }
      if (gaps.length) avgGap = gaps.reduce((a, g) => a + g, 0) / gaps.length;
    }
    const sinceLast = last ? daysBetween(last.purchase_date, today) : null;
    const dueSoon = it.buy_pattern === "refill" && avgGap !== null && sinceLast !== null && sinceLast >= Math.max(1, Math.round(avgGap) - 1);
    return { it, rows, qty, amount, last, avgGap, sinceLast, dueSoon };
  };
  const rawCards = useMemo(() => rawItems.map(cardFor), [rawItems, purchases, today]);
  const otherCards = useMemo(() => otherItems.map(cardFor), [otherItems, purchases, today]);
  const untaggedTotal = purchases.filter((p) => !p.material_id).reduce((a, p) => a + Number(p.total_amount || 0), 0);
  const rawTotal = rawCards.reduce((a, c) => a + c.amount, 0);
  const otherTotal = otherCards.reduce((a, c) => a + c.amount, 0) + untaggedTotal;

  const shown =
    filter === "all"
      ? purchases
      : filter === "raw"
        ? purchases.filter((p) => itemOf(p)?.item_group === "raw")
        : purchases.filter((p) => itemOf(p)?.item_group !== "raw");

  /* ---------- buy form ---------- */
  const formItem = buy ? items.find((i) => i.id === buy.item_id) : undefined;
  const byTotal = buy ? buy.item_id === OTHER_ITEM || formItem?.pricing === "total" : false;
  const formTotal = (f: BuyForm) => {
    const it = items.find((i) => i.id === f.item_id);
    const totalOnly = f.item_id === OTHER_ITEM || it?.pricing === "total";
    if (totalOnly || f.total.trim() !== "") return Number(f.total || 0);
    return Number(f.quantity || 0) * Number(f.unit_price || 0);
  };

  function openBuy(itemId?: string) {
    const id = itemId ?? "";
    const lastOf = purchases.find((p) => p.material_id === id);
    setBuy({
      item_id: id,
      item_name_free: "",
      purchase_date: today,
      supplier_id: lastOf?.supplier_id ?? NEW_SUP,
      new_supplier: "",
      quantity: "",
      unit_price: lastOf && Number(lastOf.unit_price) > 0 ? String(lastOf.unit_price) : "",
      total: "",
      paid_now: "",
      note: "",
    });
  }

  function pickItem(id: string) {
    if (!buy) return;
    const lastOf = purchases.find((p) => p.material_id === id);
    setBuy({
      ...buy,
      item_id: id,
      unit_price: buy.id ? buy.unit_price : lastOf && Number(lastOf.unit_price) > 0 ? String(lastOf.unit_price) : "",
      supplier_id: buy.id ? buy.supplier_id : (lastOf?.supplier_id ?? buy.supplier_id),
    });
  }

  function openEdit(p: Purchase) {
    const it = itemOf(p);
    const qty = Number(p.quantity) || 0;
    const rate = Number(p.unit_price) || 0;
    const total = Number(p.total_amount) || 0;
    const totalOnly = !it || it.pricing === "total" || qty <= 0 || rate <= 0;
    setBuy({
      id: p.id,
      item_id: it ? it.id : OTHER_ITEM,
      item_name_free: it ? "" : p.item_name,
      purchase_date: p.purchase_date,
      supplier_id: p.supplier_id ?? NEW_SUP,
      new_supplier: "",
      quantity: !totalOnly ? String(qty) : "",
      unit_price: !totalOnly ? String(rate) : "",
      total: totalOnly && total > 0 ? String(total) : "",
      paid_now: "",
      note: p.note ?? "",
    });
  }

  const saveBuy = useMutation({
    mutationFn: async () => {
      const f = buy!;
      if (!me?.user.id) throw new Error("লগইন প্রয়োজন");
      const it = items.find((i) => i.id === f.item_id);
      if (!it && f.item_id !== OTHER_ITEM) throw new Error("কী কিনলেন তা বেছে নিন");
      const name = it ? it.name : f.item_name_free.trim();
      if (!name) throw new Error("জিনিসের নাম দিন");
      const totalOnly = !it || it.pricing === "total";
      const qty = totalOnly ? 0 : Number(f.quantity || 0);
      const rate = totalOnly ? 0 : Number(f.unit_price || 0);
      if (!totalOnly && !(qty > 0)) throw new Error("পরিমাণ দিন");
      const total = formTotal(f);
      if (!(total > 0)) throw new Error(totalOnly ? "মোট টাকা দিন" : "দর দিন, অথবা মোট টাকা লিখুন");

      let supplierId: string | null = f.supplier_id === NEW_SUP ? null : f.supplier_id;
      if (f.supplier_id === NEW_SUP) {
        const sname = f.new_supplier.trim();
        if (!sname) throw new Error("বিক্রেতার নাম দিন");
        const found = (supQ.data ?? []).find((s) => s.name.trim() === sname);
        if (found) supplierId = found.id;
        else {
          const { data, error } = await supabase.from("suppliers").insert({ name: sname }).select("id").single();
          if (error) throw error;
          supplierId = data.id;
        }
      }

      const payload = {
        purchase_date: f.purchase_date,
        supplier_id: supplierId,
        material_id: it ? it.id : null,
        item_name: name,
        quantity: qty,
        unit: totalOnly ? null : it!.unit,
        unit_price: rate,
        total_amount: Math.round(total * 100) / 100,
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
          note: `${name} ক্রয়ের সময় পরিশোধ`,
          created_by: me.user.id,
        });
        if (e2) throw e2;
      }
    },
    onSuccess: () => {
      toast.success("সংরক্ষিত");
      setBuy(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delBuy = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("purchases").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => toast.success("মুছে ফেলা হয়েছে"),
    onError: (e: Error) => toast.error(e.message),
  });

  /* ---------- new item ---------- */
  const saveItem = useMutation({
    mutationFn: async () => {
      const f = itemDlg!;
      const name = f.name.trim();
      if (!name) throw new Error("মালামালের নাম দিন");
      if (items.some((i) => i.name.normalize("NFC") === name.normalize("NFC"))) throw new Error("এই নামে মালামাল আগে থেকেই আছে");
      if (f.pricing === "unit" && !f.unit.trim()) throw new Error("একক দিন (যেমন: টন, লিটার, বস্তা)");
      const { data, error } = await supabase
        .from("raw_materials")
        .insert({
          name,
          unit: f.pricing === "unit" ? f.unit.trim() : "মোট",
          item_group: f.group,
          pricing: f.pricing,
          buy_pattern: "as_needed",
          stage: "other",
          in_brick_cost: true,
          sort_order: f.group === "raw" ? 20 : 60,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: (newId) => {
      toast.success("নতুন মালামাল যোগ হয়েছে");
      setItemDlg(null);
      // if the buy form is open, select the new item there
      setBuy((b) => (b ? { ...b, item_id: newId, quantity: "", unit_price: "", total: "" } : b));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  /* ---------- payments ---------- */
  const savePay = useMutation({
    mutationFn: async () => {
      const f = payDlg!;
      const amount = Number(f.amount || 0);
      if (!(amount > 0)) throw new Error("টাকা দিন");
      const payload = { supplier_id: f.supplier_id, amount, payment_date: f.date, note: f.note || null };
      const { error } = f.id
        ? await supabase.from("supplier_payments").update(payload).eq("id", f.id)
        : await supabase.from("supplier_payments").insert({ ...payload, created_by: me!.user.id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("পরিশোধ সংরক্ষিত");
      setPayDlg(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const delPay = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("supplier_payments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => toast.success("মুছে ফেলা হয়েছে"),
    onError: (e: Error) => toast.error(e.message),
  });

  const qtyText = (p: Purchase) =>
    Number(p.quantity) > 0 ? `${bn(p.quantity)} ${p.unit ?? ""} × ${tk(p.unit_price)}` : "একসাথে (মোট দাম)";

  const print = () =>
    printTable({
      title: "মালামাল ক্রয় তালিকা",
      headers: ["তারিখ", "বিক্রেতা", "জিনিস", "পরিমাণ", "দর", "মোট"],
      rightCols: [3, 4, 5],
      rows: purchases.map((p) => [
        bnDate(p.purchase_date),
        supName(p.supplier_id),
        p.item_name,
        Number(p.quantity) > 0 ? `${bn(p.quantity)} ${p.unit ?? ""}` : "একসাথে",
        Number(p.quantity) > 0 ? bn(p.unit_price) : "—",
        `৳ ${bn(p.total_amount)}`,
      ]),
      totals: [
        ["মোট ক্রয়", `৳ ${bn(tot.bought)}`],
        ["পরিশোধ", `৳ ${bn(tot.paid)}`],
        ["বাকি", `৳ ${bn(tot.due)}`],
      ],
    });

  const f = buy;
  const fTotal = f ? formTotal(f) : 0;
  const fPaid = f ? Number(f.paid_now || 0) : 0;
  const loading = itemsQ.isLoading || purQ.isLoading;

  /* ---------- small pieces ---------- */
  const ItemCard = ({ c, compact }: { c: ReturnType<typeof cardFor>; compact?: boolean }) => {
    const lk = look(c.it.name);
    return (
      <div className="flex flex-col gap-2.5 rounded-2xl border bg-card p-3.5">
        <div className="flex items-center gap-2.5">
          <span className={`font-display grid h-10 w-10 shrink-0 place-items-center rounded-xl text-[17px] font-extrabold ${lk.chip}`}>{lk.initial}</span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-base font-bold leading-tight">{c.it.name}</div>
            <div className="truncate text-xs text-muted-foreground">
              {!c.it.in_brick_cost
                ? "শ্রমিকদের রান্না · ইটের খরচে নয়"
                : c.it.pricing === "total"
                  ? "মোট দামে কেনা"
                  : (PATTERN_HINT[c.it.buy_pattern] ?? `${c.it.unit} হিসাবে কেনা`)}
            </div>
          </div>
          <div className="text-right">
            <div className="num text-base font-extrabold">{tk(c.amount)}</div>
            {c.it.pricing === "unit" && (
              <div className="num text-xs text-muted-foreground">
                {bn(c.qty)} {c.it.unit}
              </div>
            )}
          </div>
        </div>
        {!compact && (
          <div className="flex items-center justify-between gap-2 rounded-xl bg-muted/70 px-3 py-2 text-[13px]">
            {c.last ? (
              <>
                <span className="min-w-0 truncate text-muted-foreground">
                  শেষ কেনা {bnDate(c.last.purchase_date)}
                  {c.it.pricing === "unit" ? ` · ${bn(c.last.quantity)} ${c.it.unit}` : ""}
                </span>
                {c.it.buy_pattern === "refill" && c.avgGap !== null && (
                  <span className="shrink-0 font-bold">গড়ে {bn(Math.round(c.avgGap))} দিনে</span>
                )}
              </>
            ) : (
              <span className="text-muted-foreground">এখনো কেনা লেখা হয়নি</span>
            )}
          </div>
        )}
        <button
          type="button"
          onClick={() => openBuy(c.it.id)}
          className="flex h-10 items-center justify-center gap-1.5 rounded-xl border text-sm font-bold text-primary transition hover:bg-accent active:scale-[0.99]"
        >
          <Plus className="h-4 w-4" aria-hidden="true" /> {c.it.name} কেনা
        </button>
      </div>
    );
  };

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 pb-4">
      {/* header */}
      <div className="space-y-3 px-0.5 pt-1">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h1 className="font-display flex items-center gap-2 text-[26px] font-extrabold leading-tight">
              <ShoppingCart className="h-6 w-6 text-primary" aria-hidden="true" /> মালামাল ক্রয় ও বাকি
            </h1>
            <p className="text-sm font-semibold text-muted-foreground">কাঁচামাল, ইঞ্জিন মালামাল, কারেন্ট বিল সহ সব কেনাকাটা</p>
          </div>
          <div className="flex gap-2">
            <Button asChild variant="secondary" size="sm">
              <Link to="/suppliers">সাপ্লায়ার তালিকা</Link>
            </Button>
            <Button variant="outline" size="sm" onClick={print}>
              <Printer className="mr-1 h-4 w-4" /> প্রিন্ট
            </Button>
          </div>
        </div>
        <button
          type="button"
          onClick={() => openBuy()}
          disabled={!items.length}
          className="flex h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-primary text-base font-bold text-primary-foreground shadow-sm transition active:scale-[0.99] disabled:opacity-60 md:w-auto md:px-6"
        >
          <Plus className="h-5 w-5" aria-hidden="true" />
          নতুন কেনা লিখুন
        </button>
      </div>

      {/* totals */}
      <section className="grid grid-cols-3 gap-2">
        <div className="flex flex-col gap-1 rounded-2xl border bg-card p-3">
          <span className="text-xs font-semibold text-muted-foreground">মোট ক্রয়</span>
          <span className="num text-[15px] font-bold sm:text-lg">{tk(tot.bought)}</span>
        </div>
        <div className="flex flex-col gap-1 rounded-2xl border bg-card p-3">
          <span className="text-xs font-semibold text-muted-foreground">পরিশোধ</span>
          <span className="num text-[15px] font-bold text-success sm:text-lg">{tk(tot.paid)}</span>
        </div>
        <div className="flex flex-col gap-1 rounded-2xl border bg-card p-3">
          <span className="text-xs font-semibold text-muted-foreground">বাকি</span>
          <span className={`num text-[15px] font-bold sm:text-lg ${tot.due < 0 ? "text-info" : "text-warning"}`}>{tk(tot.due)}</span>
        </div>
      </section>

      {/* refill reminders */}
      {rawCards
        .filter((c) => c.dueSoon)
        .map((c) => (
          <div key={c.it.id} className="flex items-start gap-2.5 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
            <Clock className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            <span>
              <b>{c.it.name} কেনার সময় হয়ে এসেছে।</b> সাধারণত প্রতি {bn(Math.round(c.avgGap ?? 0))} দিনে কেনা হয়, শেষবার কেনা হয়েছে {bn(c.sinceLast ?? 0)} দিন আগে।
            </span>
          </div>
        ))}

      {loading ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-[132px] rounded-2xl" />
          ))}
        </div>
      ) : (
        <>
          {/* raw materials */}
          <section className="space-y-2">
            <div className="flex items-center justify-between gap-2 px-1">
              <h2 className="section-label">কাঁচামাল · {tk(rawTotal)}</h2>
              <button type="button" onClick={() => setItemDlg({ name: "", group: "raw", pricing: "unit", unit: "" })} className="flex items-center gap-1 text-sm font-bold text-primary">
                <Plus className="h-4 w-4" aria-hidden="true" /> নতুন কাঁচামাল
              </button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {rawCards.map((c) => (
                <ItemCard key={c.it.id} c={c} />
              ))}
            </div>
          </section>

          {/* other goods */}
          <section className="space-y-2">
            <div className="flex items-center justify-between gap-2 px-1">
              <h2 className="section-label">অন্যান্য মালামাল ও খরচ · {tk(otherTotal)}</h2>
              <button type="button" onClick={() => setItemDlg({ name: "", group: "other", pricing: "total", unit: "" })} className="flex items-center gap-1 text-sm font-bold text-primary">
                <Plus className="h-4 w-4" aria-hidden="true" /> নতুন মালামাল
              </button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {otherCards.map((c) => (
                <ItemCard key={c.it.id} c={c} compact />
              ))}
            </div>
            {untaggedTotal > 0 && (
              <p className="px-1 text-xs text-muted-foreground">
                তালিকার বাইরের নামে আগে লেখা কেনা: {tk(untaggedTotal)}। এগুলোর পেনসিল চেপে সঠিক মালামাল বেছে দিলে উপরের ঘরে যোগ হবে।
              </p>
            )}
          </section>
        </>
      )}

      {/* supplier dues */}
      <section className="space-y-2">
        <h2 className="section-label px-1">বিক্রেতা অনুযায়ী বাকি</h2>
        <div className="overflow-hidden rounded-2xl border bg-card">
          {bySup.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">কোনো ক্রয় নেই</p>
          ) : (
            bySup.map((s) => (
              <div key={s.id} className="flex items-center gap-3 border-b px-4 py-2.5 last:border-b-0">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[15px] font-semibold">{s.name}</div>
                  <div className="num text-xs text-muted-foreground">
                    ক্রয় {tk(s.bought)} · পরিশোধ {tk(s.paid)}
                  </div>
                </div>
                <div className="text-right">
                  <div className={`num text-[15px] font-bold ${s.due < 0 ? "text-info" : "text-warning"}`}>{tk(Math.abs(s.due))}</div>
                  <div className="text-[11px] text-muted-foreground">{s.due < 0 ? "অগ্রিম দেওয়া" : "বাকি"}</div>
                </div>
                <Button size="sm" variant="outline" onClick={() => setPayDlg({ supplier_id: s.id, amount: "", date: today, note: "" })}>
                  পরিশোধ
                </Button>
              </div>
            ))
          )}
        </div>
      </section>

      {/* purchase list */}
      <section className="space-y-2">
        <h2 className="section-label px-1">কেনার তালিকা</h2>
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {[
            { id: "all", name: "সব" },
            { id: "raw", name: "কাঁচামাল" },
            { id: "other", name: "অন্যান্য" },
          ].map((m) => (
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
                  <div className="truncate text-[15px] font-semibold">{p.item_name}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {bnDate(p.purchase_date)} · {supName(p.supplier_id)} · {qtyText(p)}
                    {p.note ? ` · ${p.note}` : ""}
                  </div>
                </div>
                <div className="num shrink-0 text-[15px] font-bold">{tk(p.total_amount)}</div>
                {isAdmin && (
                  <div className="flex shrink-0">
                    <Button size="icon" variant="ghost" aria-label="সম্পাদনা" onClick={() => openEdit(p)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" aria-label="মুছুন" onClick={() => confirm("এই কেনা মুছবেন?") && delBuy.mutate(p.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </section>

      {/* payment list */}
      <section className="space-y-2">
        <h2 className="section-label px-1">পরিশোধের তালিকা</h2>
        <div className="overflow-hidden rounded-2xl border bg-card">
          {(payQ.data ?? []).length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">কোনো পরিশোধ নেই।</p>
          ) : (
            (payQ.data ?? []).map((p) => (
              <div key={p.id} className="flex items-center gap-3 border-b px-4 py-2.5 last:border-b-0">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                  <Wallet className="h-4 w-4" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[15px] font-semibold">{supName(p.supplier_id)}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {bnDate(p.payment_date)}
                    {p.note ? ` · ${p.note}` : ""}
                  </div>
                </div>
                <div className="num shrink-0 text-[15px] font-bold text-success">{tk(p.amount)}</div>
                {isAdmin && (
                  <div className="flex shrink-0">
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="সম্পাদনা"
                      onClick={() => setPayDlg({ id: p.id, supplier_id: p.supplier_id, amount: String(p.amount), date: p.payment_date, note: p.note ?? "" })}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" aria-label="মুছুন" onClick={() => confirm("মুছবেন?") && delPay.mutate(p.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </section>

      {/* ===== buy dialog ===== */}
      <Dialog open={!!f} onOpenChange={(o) => !o && setBuy(null)}>
        <DialogContent className="max-h-[92dvh] max-w-md overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{f?.id ? "কেনা সম্পাদনা" : "নতুন কেনা"}</DialogTitle>
          </DialogHeader>
          {f && (
            <div className="space-y-3.5">
              <div className="space-y-2">
                <Label>কী কিনলেন</Label>
                <div className="text-xs font-bold text-muted-foreground">কাঁচামাল</div>
                <div className="grid grid-cols-3 gap-1.5">
                  {rawItems.map((it) => (
                    <button
                      key={it.id}
                      type="button"
                      aria-pressed={f.item_id === it.id}
                      onClick={() => pickItem(it.id)}
                      className={`min-h-11 rounded-xl border px-1 text-[14px] font-semibold transition ${f.item_id === it.id ? "border-primary bg-primary text-primary-foreground" : "bg-card"}`}
                    >
                      {it.name}
                    </button>
                  ))}
                </div>
                <div className="pt-1 text-xs font-bold text-muted-foreground">অন্যান্য</div>
                <div className="grid grid-cols-2 gap-1.5">
                  {otherItems.map((it) => (
                    <button
                      key={it.id}
                      type="button"
                      aria-pressed={f.item_id === it.id}
                      onClick={() => pickItem(it.id)}
                      className={`min-h-11 rounded-xl border px-1 text-[14px] font-semibold transition ${f.item_id === it.id ? "border-primary bg-primary text-primary-foreground" : "bg-card"}`}
                    >
                      {it.name}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setItemDlg({ name: "", group: "other", pricing: "total", unit: "" })}
                    className="flex min-h-11 items-center justify-center gap-1 rounded-xl border border-dashed text-[14px] font-bold text-primary"
                  >
                    <Plus className="h-4 w-4" aria-hidden="true" /> নতুন মালামাল
                  </button>
                </div>
                {f.item_id === OTHER_ITEM && (
                  <Input placeholder="জিনিসের নাম" value={f.item_name_free} onChange={(e) => setBuy({ ...f, item_name_free: e.target.value })} />
                )}
              </div>

              {(formItem || f.item_id === OTHER_ITEM) && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label htmlFor="pb-date">তারিখ</Label>
                      <Input id="pb-date" type="date" value={f.purchase_date} onChange={(e) => setBuy({ ...f, purchase_date: e.target.value })} />
                    </div>
                    <div>
                      <Label>বিক্রেতা</Label>
                      <Select value={f.supplier_id} onValueChange={(v) => setBuy({ ...f, supplier_id: v })}>
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
                    <Input placeholder="বিক্রেতার নাম" value={f.new_supplier} onChange={(e) => setBuy({ ...f, new_supplier: e.target.value })} />
                  )}

                  {byTotal ? (
                    <div>
                      <Label htmlFor="pb-total">মোট দাম (৳)</Label>
                      <Input id="pb-total" type="number" inputMode="decimal" placeholder="যেমন: 68580" value={f.total} onChange={(e) => setBuy({ ...f, total: e.target.value })} />
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label htmlFor="pb-qty">পরিমাণ ({formItem?.unit})</Label>
                        <Input id="pb-qty" type="number" inputMode="decimal" value={f.quantity} onChange={(e) => setBuy({ ...f, quantity: e.target.value, total: "" })} />
                      </div>
                      <div>
                        <Label htmlFor="pb-rate">দর (প্রতি {formItem?.unit}, ৳)</Label>
                        <Input id="pb-rate" type="number" inputMode="decimal" value={f.unit_price} onChange={(e) => setBuy({ ...f, unit_price: e.target.value, total: "" })} />
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between rounded-xl bg-muted px-3.5 py-2.5">
                    <span className="text-sm font-semibold text-muted-foreground">মোট দাম</span>
                    <span className="font-display num text-xl font-extrabold">{tk(fTotal)}</span>
                  </div>

                  {!f.id && (
                    <div>
                      <Label htmlFor="pb-paid">এখন নগদ দিলেন (৳)</Label>
                      <div className="flex gap-2">
                        <Input id="pb-paid" type="number" inputMode="decimal" value={f.paid_now} onChange={(e) => setBuy({ ...f, paid_now: e.target.value })} />
                        <Button type="button" variant="outline" onClick={() => setBuy({ ...f, paid_now: String(Math.round(fTotal)) })}>
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
                    <Label htmlFor="pb-note">নোট (ইচ্ছা হলে)</Label>
                    <Input id="pb-note" placeholder="যেমন: কোন কোন পার্টস, ট্রাক নম্বর" value={f.note} onChange={(e) => setBuy({ ...f, note: e.target.value })} />
                  </div>
                </>
              )}
            </div>
          )}
          <DialogFooter>
            <Button className="h-11 w-full text-base" onClick={() => saveBuy.mutate()} disabled={saveBuy.isPending || !f || (!formItem && f.item_id !== OTHER_ITEM)}>
              {saveBuy.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              সংরক্ষণ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== new item dialog ===== */}
      <Dialog open={!!itemDlg} onOpenChange={(o) => !o && setItemDlg(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>নতুন মালামাল যোগ</DialogTitle>
          </DialogHeader>
          {itemDlg && (
            <div className="space-y-3.5">
              <div>
                <Label htmlFor="ni-name">নাম</Label>
                <Input id="ni-name" placeholder="যেমন: গ্রিজ, টায়ার, মোবিল" value={itemDlg.name} onChange={(e) => setItemDlg({ ...itemDlg, name: e.target.value })} />
              </div>
              <div>
                <Label>কোন ঘরে থাকবে</Label>
                <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                  {(
                    [
                      ["raw", "কাঁচামাল"],
                      ["other", "অন্যান্য মালামাল"],
                    ] as const
                  ).map(([k, label]) => (
                    <button
                      key={k}
                      type="button"
                      aria-pressed={itemDlg.group === k}
                      onClick={() => setItemDlg({ ...itemDlg, group: k })}
                      className={`h-11 rounded-xl border text-[14px] font-semibold ${itemDlg.group === k ? "border-primary bg-primary text-primary-foreground" : "bg-card"}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <Label>কীভাবে কেনা হয়</Label>
                <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                  {(
                    [
                      ["unit", "পরিমাণ × দর"],
                      ["total", "শুধু মোট টাকা"],
                    ] as const
                  ).map(([k, label]) => (
                    <button
                      key={k}
                      type="button"
                      aria-pressed={itemDlg.pricing === k}
                      onClick={() => setItemDlg({ ...itemDlg, pricing: k })}
                      className={`h-11 rounded-xl border text-[14px] font-semibold ${itemDlg.pricing === k ? "border-primary bg-primary text-primary-foreground" : "bg-card"}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {itemDlg.pricing === "unit" ? "যেমন কয়লা টন হিসাবে, ডিজেল লিটার হিসাবে।" : "যেমন অনেক রকম পার্টস একসাথে, বা বিল।"}
                </p>
              </div>
              {itemDlg.pricing === "unit" && (
                <div>
                  <Label htmlFor="ni-unit">একক</Label>
                  <Input id="ni-unit" placeholder="যেমন: টন, লিটার, বস্তা, পিস" value={itemDlg.unit} onChange={(e) => setItemDlg({ ...itemDlg, unit: e.target.value })} />
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button className="h-11 w-full text-base" onClick={() => saveItem.mutate()} disabled={saveItem.isPending}>
              {saveItem.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              সেভ করুন
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== payment dialog ===== */}
      <Dialog open={!!payDlg} onOpenChange={(o) => !o && setPayDlg(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>পরিশোধ — {payDlg ? supName(payDlg.supplier_id) : ""}</DialogTitle>
          </DialogHeader>
          {payDlg && (
            <div className="space-y-3">
              <div>
                <Label htmlFor="pp-date">তারিখ</Label>
                <Input id="pp-date" type="date" value={payDlg.date} onChange={(e) => setPayDlg({ ...payDlg, date: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="pp-amt">টাকা (৳)</Label>
                <Input id="pp-amt" type="number" inputMode="decimal" value={payDlg.amount} onChange={(e) => setPayDlg({ ...payDlg, amount: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="pp-note">নোট</Label>
                <Input id="pp-note" value={payDlg.note} onChange={(e) => setPayDlg({ ...payDlg, note: e.target.value })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button className="h-11 w-full" onClick={() => savePay.mutate()} disabled={savePay.isPending}>
              সংরক্ষণ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
