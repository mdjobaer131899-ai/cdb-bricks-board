import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react";
import { ArrowLeft, Banknote, History, LandPlot, Loader2, Pencil, Phone, Plus, Printer, Sparkles, Trash2, Truck } from "lucide-react";
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
 * Contract-style payables kept as folders on the purchases page:
 *  - জমি ভাড়া: land owners, rent per season
 *  - পরিচ্ছন্ন কর্মী: sweepers on a fixed season contract, paid weekly
 *  - গাড়ি ভাড়া: vehicle owners paid per trip (quantity = trips, unit "ট্রিপ", unit_price = rate);
 *    part may be paid on the spot, the rest stays due. Owners are often also customers.
 * A person is a suppliers row with material_type = cfg.type; what they are owed is a
 * purchases row with item_name = cfg.item; money given is a supplier_payments row.
 * So hand cash, the cash book, profit/loss and dues all count it with no extra table.
 * A previous-season due is a bill dated before the season starts, so it is not this
 * season's cost but still adds to what is owed.
 */
export type ContractConfig = {
  key: "land" | "clean" | "vehicle";
  type: string; // suppliers.material_type
  item: string; // purchases.item_name
  title: string;
  subtitle: string;
  person: string; // "জমির মালিক"
  personOf: string; // "জমির মালিকের" (possessive)
  bill: string; // "ভাড়া" / "চুক্তি"
  billLong: string; // "এই মৌসুমের ভাড়া"
  billHelp: string;
  infoLabel: string;
  showArea: boolean;
  payTitle: string;
  emptyText: string;
  icon: LucideIcon;
  chip: string;
  /** bills are trips × rate per trip, with an optional "paid now" */
  trips?: boolean;
};

export const LAND_CONTRACT: ContractConfig = {
  key: "land",
  type: "জমি ভাড়া",
  item: "জমি ভাড়া",
  title: "জমি ভাড়া",
  subtitle: "জমির মালিক কত পাবেন, কত দেওয়া হলো, কত বাকি",
  person: "জমির মালিক",
  personOf: "জমির মালিকের",
  bill: "ভাড়া",
  billLong: "এই মৌসুমের ভাড়া",
  billHelp: "জমির মালিক এই মৌসুমে কত টাকা পাবেন। এটা এই মৌসুমের খরচে ধরা হবে।",
  infoLabel: "জমির বিবরণ (দাগ, মৌজা, কোথায়)",
  showArea: true,
  payTitle: "জমির মালিককে টাকা দিন",
  emptyText: "এখনো কোনো জমির মালিক যোগ করা হয়নি। উপরে \"জমির মালিক\" চেপে নাম, ভাড়া আর পূর্বের বকেয়া (থাকলে) দিন।",
  icon: LandPlot,
  chip: "bg-lime-100 text-lime-800 dark:bg-lime-950/60 dark:text-lime-200",
};

export const CLEANER_CONTRACT: ContractConfig = {
  key: "clean",
  type: "পরিচ্ছন্ন কর্মী",
  item: "পরিচ্ছন্ন কর্মী",
  title: "পরিচ্ছন্ন কর্মী",
  subtitle: "সুইপারের মৌসুমের চুক্তি, প্রতি সপ্তাহের টাকা আর কত বাকি",
  person: "পরিচ্ছন্ন কর্মী",
  personOf: "পরিচ্ছন্ন কর্মীর",
  bill: "চুক্তি",
  billLong: "এই মৌসুমের চুক্তি",
  billHelp: "মৌসুমের শুরুতে মোট কত টাকায় চুক্তি হলো। প্রতি সপ্তাহের টাকা এখান থেকে কমবে।",
  infoLabel: "কাজের বিবরণ (কোন এলাকা, কী কাজ)",
  showArea: false,
  payTitle: "সপ্তাহের টাকা দিন",
  emptyText: "এখনো কোনো পরিচ্ছন্ন কর্মী যোগ করা হয়নি। উপরে \"পরিচ্ছন্ন কর্মী\" চেপে নাম আর মৌসুমের চুক্তির টাকা দিন।",
  icon: Sparkles,
  chip: "bg-cyan-100 text-cyan-800 dark:bg-cyan-950/60 dark:text-cyan-200",
};

export const VEHICLE_CONTRACT: ContractConfig = {
  key: "vehicle",
  type: "গাড়ি ভাড়া",
  item: "গাড়ি ভাড়া",
  title: "গাড়ি ভাড়া",
  subtitle: "কোন গাড়ি কত ট্রিপ দিল, কত ভাড়া, কত দেওয়া হলো, কত বাকি",
  person: "গাড়ির মালিক",
  personOf: "গাড়ির মালিকের",
  bill: "ভাড়া",
  billLong: "এই মৌসুমের ভাড়া",
  billHelp: "কত ট্রিপ, প্রতি ট্রিপ কত টাকা আর কী কাজ। সাথে সাথে কিছু টাকা দিলে নিচে লিখুন, বাকিটা বাকি থাকবে।",
  infoLabel: "গাড়ির বিবরণ (নম্বর, ধরন)",
  showArea: false,
  payTitle: "গাড়ির মালিককে টাকা দিন",
  emptyText: "এখনো কোনো গাড়ির মালিক যোগ করা হয়নি। উপরে \"গাড়ির মালিক\" চেপে নাম দিন, তারপর \"ভাড়া লিখুন\" থেকে ট্রিপ লিখুন।",
  icon: Truck,
  chip: "bg-orange-100 text-orange-800 dark:bg-orange-950/60 dark:text-orange-200",
  trips: true,
};

export const CONTRACTS = [LAND_CONTRACT, CLEANER_CONTRACT, VEHICLE_CONTRACT];
/** purchases.item_name values that belong to a contract folder, not to materials */
export const CONTRACT_ITEMS = new Set(CONTRACTS.map((c) => c.item));
/** suppliers.material_type values of contract folders */
export const CONTRACT_TYPES = new Set(CONTRACTS.map((c) => c.type));

const PREV_NOTE = "পূর্বের বকেয়া";
const TRIP = "ট্রিপ";
const TRIP_WORK = ["বালু আনা", "মাটি আনা", "বালু ফেলা", "মাটি ফেলা", "কয়লা আনা", "ইট পৌঁছানো"];
const LAND_UNITS = ["শতাংশ", "বিঘা", "কাঠা", "একর"];
const METHODS: Array<[string, string]> = [["cash", "নগদ"], ["bkash", "বিকাশ"], ["nagad", "নগদ (মোবাইল)"], ["bank", "ব্যাংক"]];

const tk = (n: number) => `৳${bn(Math.round(n))}`;
const dayBefore = (d: string) => new Date(new Date(`${d}T00:00:00Z`).getTime() - 86400000).toISOString().slice(0, 10);

type Owner = { id: string; name: string; phone: string | null; address: string | null; note: string | null };
type Bill = { id: string; supplier_id: string | null; purchase_date: string; quantity: number; unit: string | null; unit_price: number; total_amount: number; note: string | null };
type Pay = { id: string; supplier_id: string; payment_date: string; amount: number; method: string | null; note: string | null };

type OwnerForm = { id?: string; name: string; phone: string; land: string; note: string; prevDue: string; rent: string };
type BillForm = { id?: string; owner_id: string; kind: "rent" | "prev"; date: string; area: string; unit: string; amount: string; note: string; trips: string; rate: string; paid: string };
type PayForm = { id?: string; owner_id: string; date: string; amount: string; method: string; note: string };

export function ContractFolder({ cfg, onBack }: { cfg: ContractConfig; onBack: () => void }) {
  const Icon = cfg.icon;
  const qc = useQueryClient();
  const { data: me } = useCurrentUser();
  const isAdmin = me?.role === "admin";
  const today = todayBD();
  const season = getSeasonRange();
  const seasonStart = season?.from ?? null;
  const prevDate = seasonStart ? dayBefore(seasonStart) : today;

  const ownersQ = useQuery({
    queryKey: ["contract-people", cfg.key],
    queryFn: async () => {
      const { data, error } = await supabase.from("suppliers").select("id, name, phone, address, note").eq("material_type", cfg.type).order("name");
      if (error) throw error;
      return (data ?? []) as Owner[];
    },
  });
  const ownerIds = (ownersQ.data ?? []).map((o) => o.id);
  // vehicle owners are often customers too: suggest their names so the spelling matches
  const customersQ = useQuery({
    queryKey: ["contract-customer-names"],
    enabled: !!cfg.trips,
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("name").order("name");
      if (error) throw error;
      return (data ?? []).map((c) => c.name as string);
    },
  });
  // all-time: a due does not reset with the season
  const billsQ = useQuery({
    queryKey: ["contract-bills", cfg.key],
    queryFn: () => fetchAllRows<Bill>(() => supabase.from("purchases")
      .select("id, supplier_id, purchase_date, quantity, unit, unit_price, total_amount, note").eq("item_name", cfg.item).order("id")),
  });
  const paysQ = useQuery({
    queryKey: ["contract-payments", cfg.key, ownerIds.join(",")],
    enabled: ownerIds.length > 0,
    queryFn: () => fetchAllRows<Pay>(() => supabase.from("supplier_payments")
      .select("id, supplier_id, payment_date, amount, method, note").in("supplier_id", ownerIds).order("id")),
  });

  const owners = ownersQ.data ?? [];
  const bills = billsQ.data ?? [];
  const pays = paysQ.data ?? [];
  // the last 7 days, today included
  const weekStart = new Date(new Date(`${today}T00:00:00Z`).getTime() - 6 * 86400000).toISOString().slice(0, 10);
  const isPrev = (b: Bill) => (seasonStart ? b.purchase_date < seasonStart : (b.note ?? "").startsWith(PREV_NOTE));

  const stats = useMemo(() => {
    const m = new Map<string, { prev: number; rent: number; paid: number; due: number; area: string; lastDate: string; lastAmount: number; week: number; trips: number; rate: number; rateDate: string }>();
    for (const o of owners) m.set(o.id, { prev: 0, rent: 0, paid: 0, due: 0, area: "", lastDate: "", lastAmount: 0, week: 0, trips: 0, rate: 0, rateDate: "" });
    for (const b of bills) {
      const s = b.supplier_id ? m.get(b.supplier_id) : undefined;
      if (!s) continue;
      if (isPrev(b)) s.prev += Number(b.total_amount || 0);
      else {
        s.rent += Number(b.total_amount || 0);
        if (b.unit === TRIP) s.trips += Number(b.quantity || 0);
        else if (b.unit && Number(b.quantity) > 0) s.area = `${bn(Number(b.quantity))} ${b.unit}`;
      }
      // the owner's latest rate per trip pre-fills the next bill
      if (b.unit === TRIP && Number(b.unit_price) > 0 && b.purchase_date >= s.rateDate) { s.rate = Number(b.unit_price); s.rateDate = b.purchase_date; }
    }
    for (const p of pays) {
      const s = m.get(p.supplier_id);
      if (!s) continue;
      s.paid += Number(p.amount || 0);
      if (!s.lastDate || p.payment_date > s.lastDate) { s.lastDate = p.payment_date; s.lastAmount = Number(p.amount || 0); }
      if (p.payment_date >= weekStart) s.week += Number(p.amount || 0);
    }
    for (const s of m.values()) s.due = s.prev + s.rent - s.paid;
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owners, bills, pays, seasonStart]);

  const total = [...stats.values()].reduce((a, s) => ({ prev: a.prev + s.prev, rent: a.rent + s.rent, paid: a.paid + s.paid, due: a.due + s.due, trips: a.trips + s.trips }), { prev: 0, rent: 0, paid: 0, due: 0, trips: 0 });
  const lastTripRate = [...bills].filter((b) => b.unit === TRIP && Number(b.unit_price) > 0).sort((a, b) => (a.purchase_date < b.purchase_date ? 1 : -1))[0]?.unit_price ?? 0;
  const loading = ownersQ.isLoading || billsQ.isLoading || (ownerIds.length > 0 && paysQ.isLoading);

  const [ownerForm, setOwnerForm] = useState<OwnerForm | null>(null);
  const [billForm, setBillForm] = useState<BillForm | null>(null);
  const [payForm, setPayForm] = useState<PayForm | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const detail = owners.find((o) => o.id === detailId) ?? null;

  const invalidate = () => {
    for (const key of [["contract-people"], ["contract-bills"], ["contract-payments"], ["suppliers"], ["purchases"], ["supplier-payments"], ["cash"], ["cash-book"], ["profit-loss"]]) {
      qc.invalidateQueries({ queryKey: key });
    }
  };
  const uid = () => { if (!me?.user.id) throw new Error("আবার লগইন করুন"); return me.user.id; };

  const insertBill = async (ownerId: string, kind: "rent" | "prev", date: string, amount: number, area: number, unit: string, note: string) => {
    const qty = area > 0 ? area : 1;
    const { error } = await supabase.from("purchases").insert({
      supplier_id: ownerId, item_name: cfg.item, material_id: null, purchase_date: date,
      quantity: qty, unit: area > 0 ? unit : null, unit_price: Math.round((amount / qty) * 100) / 100, total_amount: amount,
      note: kind === "prev" ? [PREV_NOTE, note].filter(Boolean).join(" — ") : note || null, created_by: uid(),
    });
    if (error) throw error;
  };

  const saveOwner = useMutation({
    mutationFn: async () => {
      const f = ownerForm!;
      if (!f.name.trim()) throw new Error(`${cfg.personOf} নাম দিন`);
      const payload = { name: f.name.trim(), phone: f.phone.trim() || null, address: f.land.trim() || null, note: f.note.trim() || null, material_type: cfg.type };
      if (f.id) {
        const { error } = await supabase.from("suppliers").update(payload).eq("id", f.id);
        if (error) throw error;
        return;
      }
      const same = owners.find((o) => o.name.trim() === payload.name);
      if (same) throw new Error(`"${payload.name}" নামে একজন ${cfg.person} আগেই আছেন`);
      const { data, error } = await supabase.from("suppliers").insert(payload).select("id").single();
      if (error) throw error;
      const prev = Number(f.prevDue || 0), rent = Number(f.rent || 0);
      if (prev > 0) await insertBill(data.id, "prev", prevDate, prev, 0, "", "");
      if (rent > 0) await insertBill(data.id, "rent", seasonStart && cfg.key === "clean" ? seasonStart : today, rent, 0, "", cfg.billLong);
    },
    onSuccess: () => { toast.success("সংরক্ষিত"); setOwnerForm(null); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveBill = useMutation({
    mutationFn: async () => {
      const f = billForm!;
      const tripBill = !!cfg.trips && f.kind === "rent";
      const trips = Number(f.trips || 0), rate = Number(f.rate || 0);
      if (tripBill && !(trips > 0)) throw new Error("কত ট্রিপ, লিখুন");
      if (tripBill && !(rate > 0)) throw new Error("প্রতি ট্রিপের ভাড়া লিখুন");
      const amount = tripBill ? Math.round(trips * rate * 100) / 100 : Number(f.amount);
      const paidNow = tripBill && !f.id ? Number(f.paid || 0) : 0;
      if (!f.owner_id) throw new Error(`${cfg.person} বেছে নিন`);
      if (!(amount > 0)) throw new Error("টাকার পরিমাণ দিন");
      if (!f.date) throw new Error("তারিখ দিন");
      if (paidNow < 0) throw new Error("দেওয়া টাকা ঠিক করে লিখুন");
      if (f.kind === "prev" && seasonStart && f.date >= seasonStart) throw new Error("পূর্বের বকেয়ার তারিখ এই মৌসুম শুরুর আগে হতে হবে");
      const area = tripBill ? trips : Number(f.area || 0);
      const unit = tripBill ? TRIP : f.unit;
      if (f.id) {
        const qty = area > 0 ? area : 1;
        const { error } = await supabase.from("purchases").update({
          supplier_id: f.owner_id, purchase_date: f.date, quantity: qty, unit: area > 0 ? unit : null,
          unit_price: Math.round((amount / qty) * 100) / 100, total_amount: amount,
          note: f.kind === "prev" ? [PREV_NOTE, f.note.replace(new RegExp(`^${PREV_NOTE}( — )?`), "")].filter(Boolean).join(" — ") : f.note || null,
        }).eq("id", f.id);
        if (error) throw error;
        return;
      }
      await insertBill(f.owner_id, f.kind, f.date, amount, area, unit, f.note);
      // money handed over with the bill: a normal payment on the same day
      if (paidNow > 0) {
        const { error } = await supabase.from("supplier_payments").insert({
          supplier_id: f.owner_id, amount: paidNow, payment_date: f.date, method: "cash", note: `${cfg.item} পরিশোধ`, created_by: uid(),
        });
        if (error) throw new Error(`ভাড়া লেখা হয়েছে, কিন্তু দেওয়া টাকা সেভ হয়নি। "টাকা দিন" থেকে আবার দিন। (${error.message})`);
      }
    },
    onSuccess: () => { toast.success("সংরক্ষিত"); setBillForm(null); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const savePay = useMutation({
    mutationFn: async () => {
      const f = payForm!;
      const amount = Number(f.amount);
      if (!f.owner_id) throw new Error(`${cfg.person} বেছে নিন`);
      if (!(amount > 0)) throw new Error("টাকার পরিমাণ দিন");
      if (!f.date) throw new Error("তারিখ দিন");
      const payload = { supplier_id: f.owner_id, amount, payment_date: f.date, method: f.method, note: f.note || `${cfg.item} পরিশোধ` };
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
    onError: (e: Error) => toast.error(e.message.includes("foreign key") ? `এই ${cfg.personOf} হিসাব আছে, আগে সেগুলো মুছুন` : e.message),
  });

  const rateFor = (owner_id: string) => String((owner_id && stats.get(owner_id)?.rate) || lastTripRate || "");
  const newBill = (owner_id = "", kind: BillForm["kind"] = "rent"): BillForm =>
    ({ owner_id, kind, date: kind === "prev" ? prevDate : cfg.key === "clean" && seasonStart ? seasonStart : today, area: "", unit: LAND_UNITS[0], amount: "", note: "", trips: "", rate: cfg.trips ? rateFor(owner_id) : "", paid: "" });
  // a weekly payer usually gives the same amount, so start from the last one
  const newPay = (owner_id = ""): PayForm => {
    const last = owner_id && cfg.key === "clean" ? stats.get(owner_id)?.lastAmount : 0;
    return { owner_id, date: today, amount: last ? String(last) : "", method: "cash", note: "" };
  };

  const print = () => printTable({
    title: `${cfg.title} — হিসাব`,
    subtitle: season ? `${bnDate(season.from)} – ${bnDate(season.to)}` : undefined,
    headers: cfg.trips
      ? [cfg.person, "গাড়ি", "পূর্বের বকেয়া", TRIP, cfg.billLong, "পরিশোধ", "বাকি"]
      : [cfg.person, cfg.showArea ? "জমি" : "বিবরণ", "পূর্বের বকেয়া", cfg.billLong, "পরিশোধ", "বাকি"],
    rightCols: cfg.trips ? [2, 3, 4, 5, 6] : [2, 3, 4, 5],
    rows: owners.map((o) => {
      const s = stats.get(o.id)!;
      return cfg.trips
        ? [o.name, o.address || "", tk(s.prev), bn(s.trips), tk(s.rent), tk(s.paid), tk(s.due)]
        : [o.name, s.area || o.address || "", tk(s.prev), tk(s.rent), tk(s.paid), tk(s.due)];
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
          <h1 className="font-display truncate text-[24px] font-extrabold leading-tight">{cfg.title}</h1>
          <p className="text-sm font-semibold text-muted-foreground">{cfg.subtitle}</p>
        </div>
        <Button variant="outline" size="icon" className="h-11 w-11 shrink-0 rounded-xl" onClick={print} aria-label="প্রিন্ট">
          <Printer className="h-5 w-5" />
        </Button>
      </div>

      <section className="bg-brick-pattern relative overflow-hidden rounded-[20px] bg-ink p-[18px] text-ink-foreground">
        <div className="text-xs font-bold tracking-[0.12em] text-stone-300">মোট বাকি · {cfg.person}দের পাওনা</div>
        {loading ? <Skeleton className="mt-3 h-10 w-40 bg-white/10" /> : (
          <div className={`mt-2 font-display num text-[40px] font-extrabold leading-none ${total.due < 0 ? "text-sky-300" : ""}`}>
            {total.due < 0 ? "অগ্রিম " : ""}{tk(Math.abs(total.due))}
          </div>
        )}
        <div className="mt-3.5 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl border border-white/10 bg-white/[0.07] px-2 py-2">
            <div className="text-[11px] font-semibold text-stone-300">{cfg.trips ? "এই মৌসুমে ট্রিপ" : "পূর্বের বকেয়া"}</div>
            <div className="num text-sm font-bold">{cfg.trips ? bn(total.trips) : tk(total.prev)}</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.07] px-2 py-2">
            <div className="text-[11px] font-semibold text-stone-300">{cfg.billLong}</div>
            <div className="num text-sm font-bold">{tk(total.rent)}</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.07] px-2 py-2">
            <div className="text-[11px] font-semibold text-emerald-200">পরিশোধ</div>
            <div className="num text-sm font-bold text-emerald-300">{tk(total.paid)}</div>
          </div>
        </div>
        {cfg.trips && total.prev > 0 && (
          <div className="num mt-2 text-xs text-stone-300">পূর্বের বকেয়া {tk(total.prev)} বাকির মধ্যে ধরা আছে</div>
        )}
      </section>

      <div className="grid grid-cols-2 gap-2">
        <Button className="h-12 gap-2 rounded-2xl text-base font-bold" disabled={owners.length === 0} onClick={() => setPayForm(newPay())}>
          <Banknote className="h-5 w-5" /> টাকা দিন
        </Button>
        <Button variant="outline" className="h-12 gap-2 rounded-2xl text-base font-bold" onClick={() => setOwnerForm({ name: "", phone: "", land: "", note: "", prevDue: "", rent: "" })}>
          <Plus className="h-5 w-5" /> {cfg.person}
        </Button>
      </div>

      <section className="space-y-2">
        {loading ? (
          <><Skeleton className="h-28 rounded-2xl" /><Skeleton className="h-28 rounded-2xl" /></>
        ) : owners.length === 0 ? (
          <div className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            {cfg.emptyText}
          </div>
        ) : owners.map((o) => {
          const s = stats.get(o.id)!;
          return (
            <div key={o.id} className="rounded-2xl border bg-card">
              <button type="button" onClick={() => setDetailId(o.id)} className="flex w-full items-start gap-3 p-3.5 text-left">
                <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${cfg.chip}`}>
                  <Icon className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block break-words text-base font-bold leading-snug">{o.name}</span>
                  <span className="block text-xs text-muted-foreground">{[s.area, o.address].filter(Boolean).join(" · ") || "বিবরণ নেই"}</span>
                  <span className="num mt-1 block text-xs text-muted-foreground">
                    {s.prev > 0 && <>পূর্বের {tk(s.prev)} · </>}{cfg.trips && <>{bn(s.trips)} {TRIP} · </>}{cfg.bill} {tk(s.rent)} · দেওয়া {tk(s.paid)}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-[11px] font-semibold text-muted-foreground">{s.due < 0 ? "অগ্রিম" : "বাকি"}</span>
                  <span className={`num font-display text-lg font-extrabold ${s.due > 0 ? "text-warning" : s.due < 0 ? "text-info" : "text-success"}`}>{tk(Math.abs(s.due))}</span>
                </span>
              </button>
              {s.prev + s.rent > 0 && (
                <div className="px-3.5 pb-3">
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-success" style={{ width: `${Math.min(100, (s.paid / (s.prev + s.rent)) * 100)}%` }} />
                  </div>
                  <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
                    <span>{bn(Math.round(Math.min(100, (s.paid / (s.prev + s.rent)) * 100)))}% দেওয়া হয়েছে</span>
                    <span>{s.lastDate ? `শেষ টাকা ${bnDate(s.lastDate)}${s.week > 0 ? ` · এই সপ্তাহে ${tk(s.week)}` : ""}` : "এখনো টাকা দেওয়া হয়নি"}</span>
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-1.5 border-t p-2">
                <Button variant="ghost" className="h-10 gap-1 rounded-xl font-semibold" onClick={() => setBillForm(newBill(o.id))}><Plus className="h-4 w-4" /> {cfg.bill} লিখুন</Button>
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
            <DialogTitle>{ownerForm?.id ? `${cfg.person} সম্পাদনা` : `নতুন ${cfg.person}`}</DialogTitle>
            {!ownerForm?.id && <DialogDescription>{cfg.trips ? `নাম, ফোন আর পূর্বের বকেয়া (থাকলে) দিন। ট্রিপ পরে "${cfg.bill} লিখুন" থেকে লিখবেন।` : <>নামের সাথে {cfg.billLong} আর পূর্বের বকেয়া (থাকলে) একসাথে লিখে দিতে পারেন।</>}</DialogDescription>}
          </DialogHeader>
          {ownerForm && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>{cfg.personOf} নাম *</Label>
                <Input className="h-11" list={cfg.trips ? "contract-customer-names" : undefined} value={ownerForm.name} onChange={(e) => setOwnerForm({ ...ownerForm, name: e.target.value })} />
                {cfg.trips && (
                  <>
                    <datalist id="contract-customer-names">{(customersQ.data ?? []).map((n) => <option key={n} value={n} />)}</datalist>
                    <p className="text-xs text-muted-foreground">গ্রাহক হলে তালিকা থেকে নামটা বেছে নিন, তাতে বানান এক থাকবে।</p>
                  </>
                )}
              </div>
              <div className="space-y-1.5"><Label>ফোন</Label><Input className="h-11" inputMode="tel" value={ownerForm.phone} onChange={(e) => setOwnerForm({ ...ownerForm, phone: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>{cfg.infoLabel}</Label><Input className="h-11" value={ownerForm.land} onChange={(e) => setOwnerForm({ ...ownerForm, land: e.target.value })} /></div>
              {!ownerForm.id && (
                <div className="grid grid-cols-2 gap-3 rounded-2xl border p-3">
                  {!cfg.trips && <div className="space-y-1.5"><Label>{cfg.billLong} (৳)</Label><Input className="h-11" type="number" inputMode="decimal" value={ownerForm.rent} onChange={(e) => setOwnerForm({ ...ownerForm, rent: e.target.value })} /></div>}
                  <div className="space-y-1.5"><Label>পূর্বের বকেয়া (৳)</Label><Input className="h-11" type="number" inputMode="decimal" value={ownerForm.prevDue} onChange={(e) => setOwnerForm({ ...ownerForm, prevDue: e.target.value })} /></div>
                  {!cfg.trips && <p className="col-span-2 text-xs text-muted-foreground">খালি রাখলে পরে "{cfg.bill} লিখুন" থেকে দিতে পারবেন।</p>}
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
            <DialogTitle>{billForm?.id ? "সম্পাদনা" : billForm?.kind === "prev" ? "পূর্বের বকেয়া" : cfg.trips ? `${cfg.bill} লিখুন` : `${cfg.billLong} লিখুন`}</DialogTitle>
            <DialogDescription>
              {billForm?.kind === "prev" ? "আগের মৌসুমের যে টাকা এখনো দেওয়া বাকি। এটা এই মৌসুমের খরচে ধরা হবে না, শুধু বাকিতে যোগ হবে।" : cfg.billHelp}
            </DialogDescription>
          </DialogHeader>
          {billForm && (
            <div className="space-y-3">
              {!billForm.id && (
                <div className="grid grid-cols-2 gap-1.5">
                  {([["rent", cfg.billLong], ["prev", "পূর্বের বকেয়া"]] as const).map(([k, l]) => (
                    <button key={k} type="button" onClick={() => setBillForm({ ...billForm, kind: k, date: k === "prev" ? prevDate : cfg.key === "clean" && seasonStart ? seasonStart : today })}
                      className={`h-11 rounded-xl text-sm font-bold ${billForm.kind === k ? "bg-primary text-primary-foreground" : "border bg-background"}`}>{l}</button>
                  ))}
                </div>
              )}
              <OwnerSelect label={cfg.person} owners={owners} value={billForm.owner_id}
                onChange={(v) => setBillForm({ ...billForm, owner_id: v, rate: cfg.trips && !billForm.id ? rateFor(v) : billForm.rate })} />
              {cfg.trips && billForm.kind === "rent" ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5"><Label>কত ট্রিপ *</Label><Input className="h-11" type="number" inputMode="numeric" value={billForm.trips} onChange={(e) => setBillForm({ ...billForm, trips: e.target.value })} /></div>
                    <div className="space-y-1.5"><Label>প্রতি ট্রিপ (৳) *</Label><Input className="h-11" type="number" inputMode="decimal" value={billForm.rate} onChange={(e) => setBillForm({ ...billForm, rate: e.target.value })} /></div>
                  </div>
                  <div className="space-y-1.5"><Label>তারিখ</Label><Input className="h-11" type="date" value={billForm.date} onChange={(e) => setBillForm({ ...billForm, date: e.target.value })} /></div>
                  <p className="rounded-xl bg-muted/60 p-2.5 text-sm">
                    মোট ভাড়া <b className="num">{tk(Number(billForm.trips || 0) * Number(billForm.rate || 0))}</b>
                    {Number(billForm.trips) > 0 && Number(billForm.rate) > 0 && <span className="text-muted-foreground"> ({bn(Number(billForm.trips))} {TRIP} × {tk(Number(billForm.rate))})</span>}
                  </p>
                  <div className="space-y-1.5">
                    <Label>কী কাজ</Label>
                    <div className="flex flex-wrap gap-1.5">
                      {TRIP_WORK.map((w) => (
                        <button key={w} type="button" onClick={() => setBillForm({ ...billForm, note: w })}
                          className={`h-9 rounded-full px-3 text-xs font-semibold ${billForm.note === w ? "bg-primary text-primary-foreground" : "border bg-background"}`}>{w}</button>
                      ))}
                    </div>
                  </div>
                  {!billForm.id && (
                    <div className="space-y-1.5 rounded-2xl border p-3">
                      <div className="flex items-center justify-between gap-2">
                        <Label>এখন কত দিলেন (৳)</Label>
                        <button type="button" className="text-xs font-bold text-primary"
                          onClick={() => setBillForm({ ...billForm, paid: String(Math.round(Number(billForm.trips || 0) * Number(billForm.rate || 0) * 100) / 100) })}>পুরোটা</button>
                      </div>
                      <Input className="h-11" type="number" inputMode="decimal" placeholder="না দিলে খালি রাখুন" value={billForm.paid} onChange={(e) => setBillForm({ ...billForm, paid: e.target.value })} />
                      {Number(billForm.paid) > 0 && (
                        <p className="num text-xs text-muted-foreground">
                          এই ভাড়ার বাকি থাকবে {tk(Number(billForm.trips || 0) * Number(billForm.rate || 0) - Number(billForm.paid))} · ক্যাশ বইয়ে "{cfg.item} পরিশোধ" হিসেবে উঠবে
                        </p>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5"><Label>টাকা *</Label><Input className="h-11" type="number" inputMode="decimal" value={billForm.amount} onChange={(e) => setBillForm({ ...billForm, amount: e.target.value })} /></div>
                  <div className="space-y-1.5">
                    <Label>{billForm.kind === "prev" ? "কোন তারিখ পর্যন্ত" : "তারিখ"}</Label>
                    <Input className="h-11" type="date" value={billForm.date} max={billForm.kind === "prev" && seasonStart ? prevDate : undefined} onChange={(e) => setBillForm({ ...billForm, date: e.target.value })} />
                  </div>
                </div>
              )}
              {billForm.kind === "rent" && cfg.showArea && (
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
            <DialogTitle>{payForm?.id ? "পরিশোধ সম্পাদনা" : cfg.payTitle}</DialogTitle>
            <DialogDescription>টাকা বাকি থেকে কমবে, আর ক্যাশ বইয়ে "{cfg.item} পরিশোধ" হিসেবে খরচ উঠবে।</DialogDescription>
          </DialogHeader>
          {payForm && (
            <div className="space-y-3">
              <OwnerSelect label={cfg.person} owners={owners} value={payForm.owner_id} onChange={(v) => setPayForm({ ...payForm, owner_id: v })} />
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
              ...bills.filter((b) => b.supplier_id === detail.id).map((b) => ({ key: `b${b.id}`, date: b.purchase_date, kind: isPrev(b) ? "prev" as const : "rent" as const, label: isPrev(b) ? PREV_NOTE : b.unit === TRIP ? `${cfg.bill} (${bn(Number(b.quantity))} ${TRIP} × ${tk(Number(b.unit_price))})` : `${cfg.bill}${b.unit && Number(b.quantity) > 0 ? ` (${bn(Number(b.quantity))} ${b.unit})` : ""}`, plus: Number(b.total_amount), minus: 0, note: b.note, bill: b, pay: null as Pay | null })),
              ...pays.filter((p) => p.supplier_id === detail.id).map((p) => ({ key: `p${p.id}`, date: p.payment_date, kind: "pay" as const, label: `পরিশোধ${p.method && p.method !== "cash" ? ` (${METHODS.find(([k]) => k === p.method)?.[1] ?? p.method})` : ""}`, plus: 0, minus: Number(p.amount), note: p.note, bill: null as Bill | null, pay: p })),
            ].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.kind === "pay" ? 1 : -1));
            let run = 0;
            const withRun = rows.map((r) => { run += r.plus - r.minus; return { ...r, run }; }).reverse();
            return (
              <div className="space-y-4">
                <SheetHeader className="text-left">
                  <SheetTitle className="break-words">{detail.name}</SheetTitle>
                  <SheetDescription>{[detail.address, s.area].filter(Boolean).join(" · ") || cfg.title}</SheetDescription>
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
                  <Button variant="outline" className="h-11 gap-1 rounded-xl text-sm font-bold" onClick={() => setBillForm(newBill(detail.id))}><Plus className="h-4 w-4" />{cfg.bill}</Button>
                  <Button variant="outline" className="h-11 gap-1 rounded-xl text-sm font-bold" onClick={() => setBillForm(newBill(detail.id, "prev"))}><History className="h-4 w-4" />পূর্বের বকেয়া</Button>
                </div>
                <div className="divide-y rounded-2xl border">
                  {withRun.length === 0 ? <div className="p-4 text-center text-sm text-muted-foreground">এখনো কোনো এন্ট্রি নেই</div> : withRun.map((r) => (
                    <div key={r.key} className="flex items-center gap-2 px-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold">{r.label}</div>
                        <div className="text-xs text-muted-foreground">{bnDate(r.date)}{r.note && r.note !== PREV_NOTE && r.note !== `${cfg.item} পরিশোধ` ? ` · ${r.note.replace(`${PREV_NOTE} — `, "")}` : ""}</div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className={`num text-sm font-bold ${r.minus ? "text-success" : ""}`}>{r.minus ? `−${tk(r.minus)}` : `+${tk(r.plus)}`}</div>
                        <div className="num text-[11px] text-muted-foreground">বাকি {tk(r.run)}</div>
                      </div>
                      {isAdmin && (
                        <div className="flex shrink-0">
                          <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="সম্পাদনা" onClick={() => {
                            if (r.bill) {
                              const trip = r.bill.unit === TRIP;
                              setBillForm({ id: r.bill.id, owner_id: detail.id, kind: r.kind === "prev" ? "prev" : "rent", date: r.bill.purchase_date, area: r.bill.unit && !trip ? String(r.bill.quantity) : "", unit: r.bill.unit && !trip ? r.bill.unit : LAND_UNITS[0], amount: String(r.bill.total_amount), note: (r.bill.note ?? "").replace(new RegExp(`^${PREV_NOTE}( — )?`), ""),
                                trips: trip ? String(r.bill.quantity) : cfg.trips ? "1" : "", rate: trip ? String(r.bill.unit_price) : cfg.trips ? String(r.bill.total_amount) : "", paid: "" });
                            }
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
                    <Button variant="outline" className="h-10 gap-1 rounded-xl border-destructive/40 text-destructive" disabled={withRun.length > 0} onClick={() => confirm(`"${detail.name}" মুছবেন?`) && del.mutate({ table: "suppliers", id: detail.id })}><Trash2 className="h-4 w-4" />মুছুন</Button>
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

function OwnerSelect({ label, owners, value, onChange }: { label: string; owners: Owner[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label>{label} *</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-11"><SelectValue placeholder="বেছে নিন" /></SelectTrigger>
        <SelectContent>{owners.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  );
}
