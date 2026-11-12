import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Banknote, CalendarDays, Clock, Loader2, Pencil, Plus, Printer, Trash2, UtensilsCrossed, Wrench } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/fetch-all";
import { ASSET_PREFIX } from "@/lib/cash-queries";
import { ExpenseEntryDialog, type ExpenseEdit, type HeadKey } from "@/components/expense-entry";
import { VekuDayDialog, type VekuHistory } from "@/components/veku-day";
import {
  HOUR, VEKU_DAY_KINDS, VEKU_ITEM, VEKU_KHORAKI, VEKU_TYPE, khorakiVeku, parseVekuNote as parseNote, vekuCreditPart, vekuDiesel,
} from "@/components/contract-config";
import { bn, bnDate } from "@/lib/format";
import { useCurrentUser } from "@/lib/use-current-user";
import { printTable } from "@/lib/print-table";

/**
 * ভেকু (excavators) owned jointly with partners. The kiln pays the vekus by the hour, and
 * the money it hands over (diesel, driver, auto fare, repairs and parts) counts against that.
 *  - a veku is a suppliers row with material_type VEKU_TYPE ("ভেকু ১", "ভেকু ২", more can be added)
 *  - hours worked are a purchases row: item_name VEKU_ITEM, quantity = hours, unit "ঘণ্টা",
 *    unit_price = rate per hour, note "চালক: X · …"
 *  - money given is a supplier_payments row, note "<kind> · চালক: X · …"
 *  - the driver's khoraki is the kiln's own cost (expenses VEKU_KHORAKI), shown here but not
 *    taken off the veku account
 * The page has the two paper sheets: দৈনিক খাতা (one line a day: hours, diesel, driver, A, H)
 * and মেরামত ও অন্যান্য (repairs, parts, mobil and the rest), plus every line.
 * The vekus are shown as one account (equal owners); a chip narrows it to one veku.
 * The kiln's share of buying them is a fixed asset (expenses "সম্পদ — ভেকু…"), shown on top.
 * Dues are all-time.
 */
// settings live in contract-config.ts so the one expense form can use them too
export { VEKU_ITEM, VEKU_TYPE } from "@/components/contract-config";

const tk = (n: number) => `৳${bn(Math.round(n))}`;
const BN_DIGITS = "০১২৩৪৫৬৭৮৯";
const bnDigits = (s: string) => s.replace(/\d/g, (d) => BN_DIGITS[Number(d)]);
/** "2026-10-24" → "২৪/১০" */
const shortDate = (d: string) => bnDigits(`${d.slice(8, 10)}/${d.slice(5, 7)}`);
/** 8.5 → "৮:৩০", 9 → "৯" (the paper writes hours and minutes) */
const hm = (h: number) => {
  if (!(h > 0)) return "";
  const whole = Math.floor(h + 1e-9);
  const mins = Math.round((h - whole) * 60);
  return mins ? `${bn(whole)}:${bnDigits(String(mins).padStart(2, "0"))}` : bn(whole);
};
/** a figure on the sheet: no ৳, blank for nothing */
const cell = (n: number) => (n > 0.004 ? bn(Math.round(n)) : "");

type Veku = { id: string; name: string; note: string | null };
type Bill = { id: string; supplier_id: string | null; purchase_date: string; quantity: number; unit: string | null; unit_price: number; total_amount: number; note: string | null };
type Pay = { id: string; supplier_id: string; payment_date: string; amount: number; note: string | null };
type Food = { id: string; expense_date: string; amount: number; note: string | null; category: string };

type Line = { key: string; date: string; sid: string | null; bill?: Bill; pay?: Pay; food?: Food };
type Day = {
  key: string; date: string; sid: string | null;
  hours: number; rent: number; litres: number; price: number; paid: number; driver: number; auto: number; khoraki: number;
  lines: Line[];
};

type Entry = { head: HeadKey; partyId?: string; focus?: "bill" | "pay"; edit?: ExpenseEdit };

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
  // the drivers' khoraki: the kiln's own cost, shown on the daily sheet as H
  const foodQ = useQuery({
    queryKey: ["veku-khoraki"],
    queryFn: () => fetchAllRows<Food>(() => supabase.from("expenses")
      .select("id, expense_date, amount, note, category").eq("category", VEKU_KHORAKI).order("id")),
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
  const bills = useMemo(() => (billsQ.data ?? []).filter((b) => b.supplier_id && ids.includes(b.supplier_id) && (Number(b.total_amount) > 0 || Number(b.quantity) > 0)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [billsQ.data, ids.join(",")]);
  const pays = useMemo(() => paysQ.data ?? [], [paysQ.data]);
  const foods = useMemo(() => (foodQ.data ?? []).map((x) => ({ ...x, sid: khorakiVeku(x.note, vekus) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [foodQ.data, vekus.map((v) => v.name).join(",")]);

  const history = useMemo<VekuHistory[]>(() => [
    ...bills.map((b) => ({ supplier_id: b.supplier_id, date: b.purchase_date, note: b.note, unit: b.unit, unit_price: Number(b.unit_price) })),
    ...pays.map((p) => ({ supplier_id: p.supplier_id, date: p.payment_date, note: p.note })),
  ], [bills, pays]);

  const view = useMemo(() => {
    const fb = bills.filter((b) => inFilter(b.supplier_id));
    const fp = pays.filter((p) => inFilter(p.supplier_id));
    const ff = foods.filter((x) => filter === "all" || x.sid === filter);

    const hours = fb.reduce((a, b) => a + (b.unit === HOUR ? Number(b.quantity || 0) : 0), 0);
    const bill = fb.reduce((a, b) => a + Number(b.total_amount || 0), 0);
    const paid = fp.reduce((a, p) => a + Number(p.amount || 0), 0);
    const khoraki = ff.reduce((a, x) => a + Number(x.amount || 0), 0);

    // the daily sheet: one line per veku per day
    const days = new Map<string, Day>();
    const dayOf = (date: string, sid: string | null) => {
      const key = `${date}|${sid ?? ""}`;
      let d = days.get(key);
      if (!d) { d = { key, date, sid, hours: 0, rent: 0, litres: 0, price: 0, paid: 0, driver: 0, auto: 0, khoraki: 0, lines: [] }; days.set(key, d); }
      return d;
    };
    for (const b of fb) {
      const d = dayOf(b.purchase_date, b.supplier_id);
      if (b.unit === HOUR) d.hours += Number(b.quantity || 0);
      d.rent += Number(b.total_amount || 0);
      const credit = vekuCreditPart(parseNote(b.note).rest);
      if (credit) { d.litres += credit.litres; d.price += credit.price ?? 0; }
      d.lines.push({ key: `b${b.id}`, date: b.purchase_date, sid: b.supplier_id, bill: b });
    }
    const repairs: Line[] = [];
    const byKind = new Map<string, number>();
    for (const p of fp) {
      const n = parseNote(p.note);
      const kind = n.kind || "অন্যান্য";
      const amount = Number(p.amount || 0);
      byKind.set(kind, (byKind.get(kind) ?? 0) + amount);
      const line: Line = { key: `p${p.id}`, date: p.payment_date, sid: p.supplier_id, pay: p };
      if (!VEKU_DAY_KINDS.has(kind)) { repairs.push(line); continue; }
      const d = dayOf(p.payment_date, p.supplier_id);
      if (kind === "ডিজেল") {
        const ds = vekuDiesel(n.rest);
        d.litres += ds.litres;
        d.price += ds.old ? 0 : ds.price ?? amount;
        d.paid += amount;
      } else if (kind === "চালকের বেতন") d.driver += amount;
      else d.auto += amount;
      d.lines.push(line);
    }
    for (const x of ff) {
      const d = dayOf(x.expense_date, x.sid);
      d.khoraki += Number(x.amount || 0);
      d.lines.push({ key: `f${x.id}`, date: x.expense_date, sid: x.sid, food: x });
    }
    const daily = [...days.values()].sort((a, b) => (a.date === b.date ? nameOf(a.sid).localeCompare(nameOf(b.sid)) : a.date < b.date ? -1 : 1));
    const sum = (k: keyof Pick<Day, "hours" | "litres" | "price" | "paid" | "driver" | "auto" | "khoraki" | "rent">) => daily.reduce((a, d) => a + d[k], 0);
    const dayTotal = {
      hours: sum("hours"), litres: sum("litres"), price: sum("price"), paid: sum("paid"), driver: sum("driver"),
      auto: sum("auto"), khoraki: sum("khoraki"), rent: sum("rent"),
      autoDays: daily.filter((d) => d.auto > 0).length, foodDays: daily.filter((d) => d.khoraki > 0).length,
    };
    repairs.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    const repairTotal = repairs.reduce((a, l) => a + Number(l.pay!.amount || 0), 0);

    const lines: Line[] = [
      ...fb.map((b) => ({ key: `b${b.id}`, date: b.purchase_date, sid: b.supplier_id, bill: b })),
      ...fp.map((p) => ({ key: `p${p.id}`, date: p.payment_date, sid: p.supplier_id, pay: p })),
    ].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

    return {
      hours, bill, paid, due: bill - paid, khoraki, pumpDue: dayTotal.price - dayTotal.paid,
      byKind: [...byKind].sort((a, b) => b[1] - a[1]), daily, dayTotal, repairs, repairTotal, lines,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bills, pays, foods, filter, vekus]);

  const invalidate = () => {
    for (const key of [["veku-list"], ["veku-bills"], ["veku-payments"], ["veku-khoraki"], ["suppliers"], ["purchases"], ["supplier-payments"], ["cash"], ["cash-book"], ["profit-loss"]]) {
      qc.invalidateQueries({ queryKey: key });
    }
  };

  const [entry, setEntry] = useState<Entry | null>(null);
  const [dayOpen, setDayOpen] = useState(false);
  const [openDay, setOpenDay] = useState<string | null>(null);
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
    mutationFn: async (v: { table: "purchases" | "supplier_payments" | "expenses"; id: string }) => {
      const { error } = await supabase.from(v.table).delete().eq("id", v.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("মুছে ফেলা হয়েছে"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const loading = vekusQ.isLoading || billsQ.isLoading || (ids.length > 0 && paysQ.isLoading);
  const asset = assetQ.data ?? 0;
  const scope = filter === "all" ? "সব ভেকু" : nameOf(filter);
  const many = filter === "all" && vekus.length > 1;

  /* ---------- one line, with edit and delete ---------- */
  const lineText = (l: Line) => {
    if (l.bill) {
      const n = parseNote(l.bill.note);
      return {
        label: l.bill.unit === HOUR ? `কাজ ${hm(Number(l.bill.quantity))} ঘণ্টা × ${tk(Number(l.bill.unit_price))}` : "কাজের বিল",
        sub: [n.driver ? `চালক ${n.driver}` : "", n.rest].filter(Boolean).join(" · "), amount: Number(l.bill.total_amount), sign: "+",
      };
    }
    if (l.pay) {
      const n = parseNote(l.pay.note);
      return { label: n.kind || "টাকা দেওয়া", sub: [n.driver ? `চালক ${n.driver}` : "", n.rest].filter(Boolean).join(" · "), amount: Number(l.pay.amount), sign: "−" };
    }
    return { label: "খোরাকি (ভাটার খরচ)", sub: l.food!.note ?? "", amount: Number(l.food!.amount), sign: "" };
  };
  const editLine = (l: Line) => {
    if (l.bill) setEntry({ head: "veku", edit: { table: "purchases", id: l.bill.id, supplier_id: l.bill.supplier_id, date: l.bill.purchase_date, item_name: VEKU_ITEM, quantity: Number(l.bill.quantity), unit: l.bill.unit, unit_price: Number(l.bill.unit_price), total: Number(l.bill.total_amount), note: l.bill.note } });
    else if (l.pay) setEntry({ head: "veku", edit: { table: "supplier_payments", id: l.pay.id, supplier_id: l.pay.supplier_id, date: l.pay.payment_date, amount: Number(l.pay.amount), note: l.pay.note } });
    else if (l.food) setEntry({ head: "misc", edit: { table: "expenses", id: l.food.id, date: l.food.expense_date, category: l.food.category, amount: Number(l.food.amount), note: l.food.note } });
  };
  const delLine = (l: Line) => {
    if (!confirm("এই এন্ট্রি মুছবেন?")) return;
    if (l.bill) del.mutate({ table: "purchases", id: l.bill.id });
    else if (l.pay) del.mutate({ table: "supplier_payments", id: l.pay.id });
    else if (l.food) del.mutate({ table: "expenses", id: l.food.id });
  };
  const lineRow = (l: Line, showDate = true) => {
    const t = lineText(l);
    const Icon = l.bill ? Clock : l.food ? UtensilsCrossed : Banknote;
    const tone = l.bill ? "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-200"
      : l.food ? "bg-muted text-muted-foreground" : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200";
    return (
      <div key={l.key} className="flex items-center gap-2 px-3.5 py-2.5">
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${tone}`}><Icon className="h-4 w-4" /></span>
        <div className="min-w-0 flex-1">
          <div className="break-words text-sm font-semibold">{t.label}</div>
          <div className="break-words text-xs text-muted-foreground">
            {[showDate ? bnDate(l.date) : "", many ? nameOf(l.sid) : "", t.sub].filter(Boolean).join(" · ")}
          </div>
        </div>
        <b className={`num shrink-0 text-sm ${l.pay ? "text-success" : l.food ? "text-muted-foreground" : ""}`}>{t.sign}{tk(t.amount)}</b>
        {isAdmin && (
          <div className="flex shrink-0">
            <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="সম্পাদনা" onClick={() => editLine(l)}><Pencil className="h-3.5 w-3.5" /></Button>
            <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" aria-label="মুছুন" onClick={() => delLine(l)}><Trash2 className="h-3.5 w-3.5" /></Button>
          </div>
        )}
      </div>
    );
  };

  /* ---------- print the two sheets ---------- */
  const t = view.dayTotal;
  const printDaily = () => printTable({
    title: `ভেকুর দৈনিক খাতা — ${scope}`,
    headers: ["তারিখ", ...(many ? ["ভেকু"] : []), "ঘণ্টা", "ডিজেল (লিটার)", "ডিজেলের দাম", "পরিশোধ", "চালক", "অটো (A)", "খোরাকি (H)"],
    rightCols: many ? [2, 3, 4, 5, 6, 7, 8] : [1, 2, 3, 4, 5, 6, 7],
    rows: view.daily.map((d) => [bnDate(d.date), ...(many ? [nameOf(d.sid)] : []), hm(d.hours), d.litres ? bn(d.litres) : "", cell(d.price), cell(d.paid), cell(d.driver), d.auto ? tk(d.auto) : "", d.khoraki ? tk(d.khoraki) : ""]),
    totals: [
      ["মোট ঘণ্টা", hm(t.hours) || "০"], ["ভেকুর ভাড়া", tk(t.rent)], ["ডিজেল", `${bn(t.litres)} লিটার · দাম ${tk(t.price)} · পরিশোধ ${tk(t.paid)}`],
      ["চালককে দেওয়া", tk(t.driver)], ["অটো ভাড়া (A)", `${bn(t.autoDays)} দিন · ${tk(t.auto)}`], ["খোরাকি (H, ভাটার খরচ)", `${bn(t.foodDays)} দিন · ${tk(t.khoraki)}`],
      ...(view.pumpDue > 0.5 ? [["পাম্পে ডিজেলের বাকি", tk(view.pumpDue)] as [string, string]] : []),
      [view.due < 0 ? "ভাটা বেশি দিয়েছে" : "ভেকু পাবে (সব মিলিয়ে)", tk(Math.abs(view.due))],
    ],
  });
  const printRepairs = () => printTable({
    title: `ভেকু: অন্যান্য ও মেরামত খরচ — ${scope}`,
    headers: ["ক্রমিক", "তারিখ", ...(many ? ["ভেকু"] : []), "খরচের বিবরণ", "টাকা"],
    rightCols: [many ? 4 : 3],
    rows: view.repairs.map((l, i) => { const n = parseNote(l.pay!.note); return [bn(i + 1), bnDate(l.date), ...(many ? [nameOf(l.sid)] : []), [n.kind || "অন্যান্য", n.rest].filter(Boolean).join(" — "), tk(Number(l.pay!.amount))]; }),
    totals: [["মোট", tk(view.repairTotal)]],
  });

  const startRepair = () => setEntry({ head: "veku", partyId: filter !== "all" ? filter : undefined, focus: "pay" });

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
      </div>

      {/* the account, light like the hand-cash card */}
      <section className="relative overflow-hidden rounded-2xl border bg-card p-4 shadow-sm">
        <span className="absolute inset-y-0 left-0 w-1 bg-primary" aria-hidden="true" />
        <div className="text-sm font-bold text-muted-foreground">
          {view.due < 0 ? "ভাটা বেশি দিয়েছে" : "ভেকু পাবে (বাকি)"} · {scope}
        </div>
        {loading ? <Skeleton className="mt-2 h-10 w-40" /> : (
          <div className={`mt-1 font-display num text-[38px] font-extrabold leading-none ${view.due < 0 ? "text-info" : ""}`}>{tk(Math.abs(view.due))}</div>
        )}
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-muted/50 px-2 py-2">
            <div className="text-[11px] font-semibold text-muted-foreground">মোট ঘণ্টা</div>
            <div className="num text-sm font-bold">{hm(view.hours) || "০"}</div>
          </div>
          <div className="rounded-xl bg-muted/50 px-2 py-2">
            <div className="text-[11px] font-semibold text-muted-foreground">ভেকুর ভাড়া</div>
            <div className="num text-sm font-bold">{tk(view.bill)}</div>
          </div>
          <div className="rounded-xl bg-muted/50 px-2 py-2">
            <div className="text-[11px] font-semibold text-muted-foreground">দেওয়া হয়েছে</div>
            <div className="num text-sm font-bold text-success">{tk(view.paid)}</div>
          </div>
        </div>
        <div className="num mt-2.5 space-y-0.5 text-xs text-muted-foreground">
          {view.hours > 0 && <div>গড়ে ঘণ্টায় {tk(view.bill / view.hours)}</div>}
          {view.khoraki > 0 && <div>চালকের খোরাকি {tk(view.khoraki)}: ভাটার খরচ, ভেকুর হিসাবে কাটা হয়নি</div>}
          {view.pumpDue > 0.5 && <div className="font-semibold text-warning">পাম্পে ডিজেলের বাকি {tk(view.pumpDue)}</div>}
          {asset > 0 && filter === "all" && <div>ভেকুতে ভাটার অংশ (সম্পদ): {tk(asset)}</div>}
        </div>
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
        <Button className="h-12 gap-2 rounded-2xl text-base font-bold" disabled={vekus.length === 0} onClick={() => setDayOpen(true)}>
          <CalendarDays className="h-5 w-5" /> দিনের হিসাব
        </Button>
        <Button variant="outline" className="h-12 gap-2 rounded-2xl text-base font-bold" disabled={vekus.length === 0} onClick={startRepair}>
          <Wrench className="h-5 w-5" /> মেরামত / অন্যান্য
        </Button>
      </div>

      <Tabs defaultValue="daily">
        <TabsList className="grid h-11 w-full grid-cols-3">
          <TabsTrigger value="daily" className="h-9 text-[13px]">দৈনিক খাতা</TabsTrigger>
          <TabsTrigger value="repair" className="h-9 text-[13px]">মেরামত ও অন্যান্য</TabsTrigger>
          <TabsTrigger value="all" className="h-9 text-[13px]">সব লেনদেন</TabsTrigger>
        </TabsList>

        {/* the daily sheet, like the paper: one line a day */}
        <TabsContent value="daily" className="mt-3">
          <section className="overflow-hidden rounded-2xl border bg-card">
            <div className="flex items-center justify-between border-b px-3.5 py-2">
              <div className="text-sm font-bold">দৈনিক খাতা · {scope}</div>
              <Button variant="ghost" size="sm" className="h-9 gap-1.5" onClick={printDaily} disabled={!view.daily.length}><Printer className="h-4 w-4" /> প্রিন্ট</Button>
            </div>
            {loading ? (
              <div className="space-y-2 p-3"><Skeleton className="h-10" /><Skeleton className="h-10" /></div>
            ) : view.daily.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">{vekus.length === 0 ? "এখনো কোনো ভেকু যোগ করা হয়নি। উপরে \"নতুন ভেকু\" চাপুন।" : "এখনো কোনো দিনের হিসাব নেই। \"দিনের হিসাব\" চেপে লিখুন।"}</div>
            ) : (
              <div className="num text-[13px]">
                <div className="grid grid-cols-[2.7rem_2.3rem_2rem_1fr_1fr_1fr_2.4rem] items-end gap-x-1 border-b bg-muted/40 px-2.5 py-1.5 text-[10px] font-bold leading-tight text-muted-foreground">
                  <span>তারিখ</span><span className="text-right">ঘণ্টা</span><span className="text-right">লিটার</span>
                  <span className="text-right">ডিজেল ৳</span><span className="text-right">পরিশোধ</span><span className="text-right">চালক</span><span className="text-center">A H</span>
                </div>
                <div className="divide-y">
                  {view.daily.map((d) => {
                    const isOpen = openDay === d.key;
                    const unpaid = d.price - d.paid > 0.5;
                    return (
                      <div key={d.key}>
                        <button type="button" onClick={() => setOpenDay(isOpen ? null : d.key)} aria-expanded={isOpen}
                          className={`grid w-full grid-cols-[2.7rem_2.3rem_2rem_1fr_1fr_1fr_2.4rem] items-center gap-x-1 px-2.5 py-2 text-left ${isOpen ? "bg-muted/40" : ""}`}>
                          <span className="leading-tight">
                            <span className="block font-semibold">{shortDate(d.date)}</span>
                            {many && <span className="block truncate text-[10px] text-muted-foreground">{nameOf(d.sid)}</span>}
                          </span>
                          <span className="text-right font-semibold">{hm(d.hours) || "—"}</span>
                          <span className="text-right">{d.litres ? bn(d.litres) : ""}</span>
                          <span className="text-right">{cell(d.price)}</span>
                          <span className={`text-right ${unpaid ? "font-semibold text-warning" : ""}`}>{cell(d.paid) || (d.price > 0 ? "বাকি" : "")}</span>
                          <span className="text-right">{cell(d.driver)}</span>
                          <span className="flex items-center justify-center gap-1 text-[11px] font-extrabold">
                            <span className={d.auto ? "text-primary" : "text-muted-foreground/30"}>A</span>
                            <span className={d.khoraki ? "text-primary" : "text-muted-foreground/30"}>H</span>
                          </span>
                        </button>
                        {isOpen && (
                          <div className="border-t bg-muted/20">
                            <div className="divide-y">{d.lines.map((l) => lineRow(l, false))}</div>
                            <div className="px-3.5 pb-2.5 pt-1 text-xs text-muted-foreground">{bnDate(d.date)}{many ? ` · ${nameOf(d.sid)}` : ""}</div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="grid grid-cols-[2.7rem_2.3rem_2rem_1fr_1fr_1fr_2.4rem] items-center gap-x-1 border-t-2 bg-muted/40 px-2.5 py-2 font-bold">
                  <span>মোট</span><span className="text-right">{hm(t.hours)}</span><span className="text-right">{t.litres ? bn(t.litres) : ""}</span>
                  <span className="text-right">{cell(t.price)}</span><span className="text-right">{cell(t.paid)}</span><span className="text-right">{cell(t.driver)}</span>
                  <span className="text-center text-[11px]">{bn(t.autoDays)} {bn(t.foodDays)}</span>
                </div>
                <div className="space-y-0.5 px-3.5 py-2.5 text-xs text-muted-foreground">
                  <div>ভেকুর ভাড়া {tk(t.rent)} · অটো ভাড়া (A) {tk(t.auto)} · খোরাকি (H, ভাটার খরচ) {tk(t.khoraki)}</div>
                  {view.pumpDue > 0.5 && <div className="font-semibold text-warning">পাম্পে ডিজেলের বাকি {tk(view.pumpDue)}</div>}
                  <div>একটা দিনে চাপলে সেই দিনের সব এন্ট্রি দেখাবে{isAdmin ? ", সেখান থেকে বদলানো বা মোছা যাবে" : ""}।</div>
                </div>
              </div>
            )}
          </section>
        </TabsContent>

        {/* repairs, parts, mobil and the rest */}
        <TabsContent value="repair" className="mt-3">
          <section className="overflow-hidden rounded-2xl border bg-card">
            <div className="flex items-center justify-between border-b px-3.5 py-2">
              <div className="text-sm font-bold">অন্যান্য ও মেরামত খরচ · {scope}</div>
              <Button variant="ghost" size="sm" className="h-9 gap-1.5" onClick={printRepairs} disabled={!view.repairs.length}><Printer className="h-4 w-4" /> প্রিন্ট</Button>
            </div>
            {loading ? (
              <div className="space-y-2 p-3"><Skeleton className="h-10" /><Skeleton className="h-10" /></div>
            ) : view.repairs.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">এখনো কোনো মেরামত বা অন্যান্য খরচ নেই।</div>
            ) : (
              <>
                <div className="divide-y">{view.repairs.map((l) => lineRow(l))}</div>
                <div className="num flex items-center justify-between border-t-2 bg-muted/40 px-3.5 py-2.5 text-sm font-bold">
                  <span>মোট</span><span>{tk(view.repairTotal)}</span>
                </div>
              </>
            )}
            <button type="button" onClick={startRepair} disabled={vekus.length === 0}
              className="flex h-11 w-full items-center justify-center gap-1.5 border-t text-sm font-bold text-primary">
              <Plus className="h-4 w-4" /> মেরামত / অন্যান্য খরচ লিখুন
            </button>
          </section>
        </TabsContent>

        {/* every line of the account, newest first */}
        <TabsContent value="all" className="mt-3 space-y-3">
          {view.byKind.length > 0 && (
            <section className="rounded-2xl border bg-card p-3.5">
              <div className="text-sm font-bold">কোন খাতে কত দেওয়া হলো</div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {view.byKind.map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between rounded-xl bg-muted/50 px-3 py-2 text-sm">
                    <span>{k}</span><b className="num">{tk(v)}</b>
                  </div>
                ))}
              </div>
            </section>
          )}
          <section className="rounded-2xl border bg-card">
            <div className="flex items-center justify-between border-b px-3.5 py-2">
              <div className="text-sm font-bold">হিসাবের খাতা · {scope}</div>
              {vekus.length > 0 && (
                <Button variant="ghost" size="sm" className="h-9 gap-1.5" onClick={() => setEntry({ head: "veku", partyId: filter !== "all" ? filter : undefined, focus: "bill" })}>
                  <Clock className="h-4 w-4" /> শুধু ঘণ্টা
                </Button>
              )}
            </div>
            {loading ? (
              <div className="space-y-2 p-3"><Skeleton className="h-12" /><Skeleton className="h-12" /></div>
            ) : view.lines.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">এখনো কোনো এন্ট্রি নেই</div>
            ) : (
              <div className="divide-y">{view.lines.map((l) => lineRow(l))}</div>
            )}
          </section>
        </TabsContent>
      </Tabs>

      <VekuDayDialog open={dayOpen} onOpenChange={setDayOpen} vekus={vekus} history={history}
        defaultVeku={filter !== "all" ? filter : null} onDone={invalidate} />

      <ExpenseEntryDialog
        open={!!entry}
        onOpenChange={(o) => { if (!o) setEntry(null); }}
        head={entry?.head ?? "veku"}
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
