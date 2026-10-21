import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, ChevronRight, Loader2, Plus, Tractor } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BalanceStrip, Chips, Field, HeadTiles, Section, tk } from "@/components/money-form-parts";
import { MONEY_HEADS, TONE_CLASS, moneyHead, type MoneyHead, type MoneyKey } from "@/lib/money-heads";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { getSeasonRange, sdb } from "@/lib/season-db";
import { fetchAllRows } from "@/lib/fetch-all";
import { bn, todayBD } from "@/lib/format";
import { createExpense } from "@/lib/expenses.functions";
import { createSardarPayment } from "@/lib/sardars.functions";
import { dailyEarned, salaryEarned, sardarEarned } from "@/lib/salary-accrual";
import { fetchWorkerOldDues, payWorker, splitWorkerPay } from "@/lib/worker-pay";
import { ASSET_PREFIX } from "@/lib/cash-queries";
import { useCurrentUser } from "@/lib/use-current-user";
import {
  CONTRACT_TYPES, HOUR, LAND_UNITS, PARTS_PREFIX, POWER_BILL, PREV_NOTE, TRIP, TRIP_WORK, VEKU_ITEM,
  VEKU_KINDS, VEKU_TYPE, contractByKey, dayBefore, makeVekuNote, parseVekuNote,
} from "@/components/contract-config";

/**
 * The one form for every kind of money going out. Every head has the same layout:
 *   1. কাকে / কার কাছ থেকে (the person or seller, with their running due)
 *   2. কী (what kind: coal, parts, diesel for the veku, work done by the vehicle …)
 *   3. বিল (what they are owed now: quantity × rate, hours × rate, trips × rate or a total)
 *   4. এখন কত দিলেন (cash handed over now)
 *   5. a strip: আগে বাকি + বিল − দিলেন = পরে বাকি
 *   6. তারিখ, নোট
 * A section is left out when a head has no such thing (a sardar has no bill, the power
 * bill has no person). Rows go to the same tables as before, so hand cash, the cash book,
 * profit/loss and every ledger page count them with no change:
 *   sardar → sardar_payments / opening_payments; daily, staff → last season's due
 *   first (opening_payments), the rest worker_payments (lib/worker-pay.ts);
 *   raw, parts, veku, vehicle, land, clean → purchases (bill) + supplier_payments (paid);
 *   parts with no shop, power bill, misc, asset → expenses.
 * Opened from the cash book, the purchases page and its folders, and the suppliers page.
 */

export type HeadKey = Exclude<MoneyKey, "sale" | "openingIn" | "ownerInvest" | "loanIn" | "loanBack">;
export type HeadDef = MoneyHead & { key: HeadKey };

/** every money-out head, from the one list in money-heads.ts */
export const EXPENSE_HEADS = MONEY_HEADS.filter((h) => h.group !== "in") as HeadDef[];
export const headDef = (k: HeadKey) => moneyHead(k) as HeadDef;
/** heads that live on the purchases page (its folders) */
export const PURCHASE_HEADS: HeadKey[] = ["raw", "parts", "power", "veku", "vehicle", "land", "clean"];
export const TONES = TONE_CLASS;

/** One saved row to change in place (admin). The head decides how it is shown. */
export type ExpenseEdit =
  | { table: "purchases"; id: string; supplier_id: string | null; date: string; item_name: string; material_id?: string | null; quantity: number; unit: string | null; unit_price: number; total: number; note: string | null }
  | { table: "supplier_payments"; id: string; supplier_id: string; date: string; amount: number; note: string | null }
  | { table: "expenses"; id: string; date: string; category: string; amount: number; note: string | null };

type Item = { id: string; name: string; unit: string | null; item_group: string; pricing: string; pay_mode: string; sort_order: number };
type Sup = { id: string; name: string; material_type: string | null };
type PartyBill = { supplier_id: string | null; purchase_date: string; item_name: string; unit: string | null; unit_price: number; total_amount: number; quantity: number };
type PartyPay = { supplier_id: string; payment_date: string; amount: number; note: string | null };

const num = (s: string) => Number(s || 0) || 0;
const nfc = (s: string) => s.normalize("NFC").trim();

const SUPPLIER_HEADS = new Set<HeadKey>(["raw", "parts", "veku", "vehicle", "land", "clean"]);
const CASH_HEADS = new Set<HeadKey>(["power", "misc", "asset"]);
/** heads whose person is picked from a fixed list by id */
const PICK_HEADS = new Set<HeadKey>(["sardar", "daily", "staff", "veku", "ownerSalary", "ownerWithdraw", "openingOut", "loanRepay"]);
/** heads whose bill is usually written with the payment; the others start with the bill folded */
const BILL_OPEN = new Set<HeadKey>(["raw", "parts", "vehicle"]);

type Form = {
  personId: string; // sardar / worker / veku id
  party: string; // typed seller / owner name
  kindId: string; // raw / parts catalog item id
  vekuKind: string;
  work: string; // vehicle work chip
  what: string; // parts items, misc / asset description
  qty: string;
  rate: string;
  total: string;
  billKind: "rent" | "prev";
  area: string;
  areaUnit: string;
  driver: string;
  rateTouched: boolean;
  paid: string;
  paidTouched: boolean;
  date: string;
  note: string;
};

const blank = (today: string): Form => ({
  personId: "", party: "", kindId: "", vekuKind: "", work: "", what: "", qty: "", rate: "", total: "",
  billKind: "rent", area: "", areaUnit: LAND_UNITS[0], driver: "", rateTouched: false, paid: "", paidTouched: false, date: today, note: "",
});

export function ExpenseEntryDialog({
  open, onOpenChange, head: headProp, heads, partyId, focus, startPrev, lockHead, edit, onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** head to open with; without it the dialog first shows the head tiles */
  head?: HeadKey | null;
  /** which head tiles to offer (default all) */
  heads?: HeadKey[];
  /** person / seller to preselect (suppliers, sardars or workers id) */
  partyId?: string | null;
  /** "pay": start with the bill folded (paying a due); "bill": start with the bill open */
  focus?: "bill" | "pay";
  /** contract heads: start on a previous-season due */
  startPrev?: boolean;
  lockHead?: boolean;
  edit?: ExpenseEdit | null;
  onDone?: () => void;
}) {
  const qc = useQueryClient();
  const { data: me } = useCurrentUser();
  const isAdmin = me?.role === "admin";
  const today = todayBD();
  const season = getSeasonRange();
  const seasonStart = season?.from ?? null;
  const prevDate = seasonStart ? dayBefore(seasonStart) : today;

  const [head, setHead] = useState<HeadKey | null>(null);
  const [f, setF] = useState<Form>(() => blank(today));
  const [billOpen, setBillOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [newItem, setNewItem] = useState<{ name: string; unit: string } | null>(null);
  const set = (p: Partial<Form>) => setF((s) => ({ ...s, ...p }));
  // a preselected / edited seller is shown by name once the list is in
  const pendingParty = useRef<string | null>(null);

  const cfg = head ? contractByKey(head) : undefined;
  const isSupplierHead = !!head && SUPPLIER_HEADS.has(head);
  const isCash = !!head && CASH_HEADS.has(head);
  const isEditBill = edit?.table === "purchases";
  const isEditPay = edit?.table === "supplier_payments";

  /* ---------- open / reset ---------- */
  const startHead = (h: HeadKey | null, base: Form) => {
    setHead(h);
    setNewItem(null);
    setBillOpen(!!h && (focus === "bill" || (focus !== "pay" && BILL_OPEN.has(h))));
    const prev = !!startPrev && !!h && !!contractByKey(h);
    setF({ ...base, billKind: prev ? "prev" : "rent", date: prev ? prevDate : h === "clean" && focus === "bill" && seasonStart ? seasonStart : base.date });
  };

  useEffect(() => {
    if (!open) return;
    const base = blank(today);
    pendingParty.current = null;
    if (!edit) {
      if (headProp && partyId && PICK_HEADS.has(headProp)) base.personId = partyId;
      else if (partyId) pendingParty.current = partyId;
      startHead(headProp ?? null, base);
      return;
    }
    // edit: fill from the saved row
    const h = headProp ?? null;
    setHead(h);
    setNewItem(null);
    if (edit.table === "purchases") {
      const veku = parseVekuNote(edit.note);
      const isPrev = !!seasonStart && edit.date < seasonStart;
      const trip = edit.unit === TRIP;
      const hourly = edit.unit === HOUR;
      const unitPriced = edit.quantity > 0 && edit.unit_price > 0;
      setBillOpen(true);
      setF({
        ...base,
        personId: h === "veku" ? edit.supplier_id ?? "" : "",
        party: "",
        kindId: edit.material_id ?? "",
        what: h === "parts" ? edit.item_name : "",
        qty: h === "raw" && unitPriced ? String(edit.quantity) : trip || hourly ? String(edit.quantity) : "",
        rate: h === "raw" && unitPriced ? String(edit.unit_price) : trip || hourly ? String(edit.unit_price) : "",
        total: h === "raw" ? (unitPriced && Math.abs(edit.quantity * edit.unit_price - edit.total) < 0.5 ? "" : String(edit.total)) : trip || hourly ? "" : String(edit.total),
        billKind: isPrev ? "prev" : "rent",
        area: h === "land" && edit.unit && !trip ? String(edit.quantity) : "",
        areaUnit: h === "land" && edit.unit && !trip ? edit.unit : LAND_UNITS[0],
        work: h === "vehicle" && TRIP_WORK.includes((edit.note ?? "").trim()) ? (edit.note ?? "").trim() : "",
        driver: h === "veku" ? veku.driver : "",
        rateTouched: true,
        date: edit.date,
        note: h === "veku" ? veku.rest
          : h === "vehicle" && TRIP_WORK.includes((edit.note ?? "").trim()) ? ""
          : (edit.note ?? "").replace(new RegExp(`^${PREV_NOTE}( — )?`), ""),
      });
      // the seller's name is filled once the list loads (below)
      pendingParty.current = edit.supplier_id;
      return;
    }
    if (edit.table === "supplier_payments") {
      const veku = parseVekuNote(edit.note);
      setBillOpen(false);
      setF({
        ...base,
        personId: h === "veku" ? edit.supplier_id : "",
        vekuKind: h === "veku" ? veku.kind || "অন্যান্য" : "",
        driver: h === "veku" ? veku.driver : "",
        paid: String(edit.amount),
        paidTouched: true,
        date: edit.date,
        note: h === "veku" ? veku.rest : edit.note ?? "",
      });
      pendingParty.current = edit.supplier_id;
      return;
    }
    // expenses row
    const cat = edit.category;
    // "আনুষাঙ্গিক — চা" → "চা"; an older free-text category (also from the AI) is kept as it is
    const what = cat.includes(" — ") ? cat.slice(cat.indexOf(" — ") + 3) : h === "misc" && cat.trim() !== "আনুষাঙ্গিক" ? cat.trim() : "";
    setBillOpen(h === "parts");
    setF({ ...base, what, total: h === "parts" ? String(edit.amount) : "", paid: String(edit.amount), paidTouched: true, date: edit.date, note: edit.note ?? "" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /* ---------- data ---------- */
  const itemsQ = useQuery({
    queryKey: ["expense-form-items"],
    enabled: open && (head === "raw" || head === "parts"),
    queryFn: async () => {
      const { data, error } = await supabase.from("raw_materials")
        .select("id, name, unit, item_group, pricing, pay_mode, sort_order").eq("active", true).order("sort_order").order("name");
      if (error) throw error;
      return (data ?? []) as Item[];
    },
  });
  const supsQ = useQuery({
    queryKey: ["expense-form-suppliers"],
    enabled: open && isSupplierHead,
    queryFn: async () => {
      const { data, error } = await supabase.from("suppliers").select("id, name, material_type").order("name");
      if (error) throw error;
      return (data ?? []) as Sup[];
    },
  });
  const customersQ = useQuery({
    queryKey: ["expense-form-customers"],
    enabled: open && head === "vehicle",
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("name").order("name");
      if (error) throw error;
      return (data ?? []).map((c) => c.name as string);
    },
  });
  const sardarsQ = useQuery({
    queryKey: ["expense-form-sardars"],
    enabled: open && head === "sardar",
    queryFn: async () => {
      const { data, error } = await supabase.from("sardars").select("id, name").eq("is_active", true).order("name");
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; name: string }>;
    },
  });
  const workersQ = useQuery({
    queryKey: ["expense-form-workers"],
    enabled: open && (head === "daily" || head === "staff"),
    queryFn: async () => {
      const { data, error } = await supabase.from("workers").select("id, name, role").eq("active", true).order("name");
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; name: string; role: string }>;
    },
  });

  const items = itemsQ.data ?? [];
  const kindItems = items.filter((i) => i.pay_mode === "credit" && (head === "raw" ? i.item_group === "raw" : i.item_group !== "raw"));
  const kindItem = items.find((i) => i.id === f.kindId);

  // who can be picked for this head
  const sellers = useMemo(() => {
    const all = supsQ.data ?? [];
    if (head === "raw" || head === "parts") return all.filter((s) => !CONTRACT_TYPES.has(s.material_type ?? ""));
    if (head === "veku") return all.filter((s) => s.material_type === VEKU_TYPE);
    if (cfg) return all.filter((s) => s.material_type === cfg.type);
    return [];
  }, [supsQ.data, head, cfg]);

  useEffect(() => {
    const id = pendingParty.current;
    if (!id || head === "veku" || !sellers.length) return;
    const s = sellers.find((x) => x.id === id);
    if (s) { pendingParty.current = null; set({ party: s.name }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sellers, head]);


  const seller = head === "veku"
    ? sellers.find((s) => s.id === f.personId)
    : sellers.find((s) => nfc(s.name) === nfc(f.party));
  // the vekus are one account: the due is over all of them
  const partyIds = head === "veku" ? sellers.map((s) => s.id) : seller ? [seller.id] : [];

  const partyQ = useQuery({
    queryKey: ["expense-form-party", partyIds.join(",")],
    enabled: open && partyIds.length > 0,
    queryFn: async () => {
      const [bills, pays] = await Promise.all([
        fetchAllRows<PartyBill>(() => supabase.from("purchases")
          .select("id, supplier_id, purchase_date, item_name, unit, unit_price, total_amount, quantity").in("supplier_id", partyIds).order("id")),
        fetchAllRows<PartyPay>(() => supabase.from("supplier_payments")
          .select("id, supplier_id, payment_date, amount, note").in("supplier_id", partyIds).order("id")),
      ]);
      const bill = bills.reduce((a, b) => a + Number(b.total_amount || 0), 0);
      const paid = pays.reduce((a, p) => a + Number(p.amount || 0), 0);
      return { bills, pays, due: bill - paid };
    },
  });
  const party = partyIds.length ? partyQ.data : undefined;

  // last rate for the next bill: this seller first, then anyone
  const rateItem = head === "raw" ? kindItem?.name ?? "" : head === "vehicle" ? cfg?.item ?? "" : head === "veku" ? VEKU_ITEM : "";
  const rateQ = useQuery({
    queryKey: ["expense-form-rate", rateItem],
    enabled: open && !!rateItem && !edit,
    queryFn: async () => {
      const { data, error } = await supabase.from("purchases").select("unit_price, purchase_date")
        .eq("item_name", rateItem).gt("unit_price", 0).gt("quantity", 0).order("purchase_date", { ascending: false }).limit(1);
      if (error) throw error;
      return Number(data?.[0]?.unit_price ?? 0);
    },
  });
  const lastRate = useMemo(() => {
    const mine = (party?.bills ?? [])
      .filter((b) => b.item_name === rateItem && Number(b.unit_price) > 0 && Number(b.quantity) > 0 && (head !== "veku" || b.supplier_id === f.personId))
      .sort((a, b) => (a.purchase_date < b.purchase_date ? 1 : -1))[0];
    return Number(mine?.unit_price ?? 0) || rateQ.data || 0;
  }, [party, rateItem, rateQ.data, head, f.personId]);
  // the rate follows the last one until the user types one
  useEffect(() => {
    if (edit || f.rateTouched || !lastRate) return;
    if (head === "raw" || head === "vehicle" || head === "veku") set({ rate: String(lastRate) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastRate, head, f.rateTouched, f.kindId, f.personId]);

  // an edited material row without a catalog id: find the item by its name
  useEffect(() => {
    if (edit?.table !== "purchases" || head !== "raw" || f.kindId || !items.length) return;
    const it = items.find((i) => nfc(i.name) === nfc(edit.item_name));
    if (it) set({ kindId: it.id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length, head]);

  // a sweeper is usually paid the same each week
  const lastPay = useMemo(() => [...(party?.pays ?? [])].sort((a, b) => (a.payment_date < b.payment_date ? 1 : -1))[0], [party]);
  useEffect(() => {
    if (edit || head !== "clean" || f.paidTouched || f.paid || !lastPay) return;
    set({ paid: String(lastPay.amount) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastPay, head]);

  // a seller of one material: preselect it
  useEffect(() => {
    if (edit || head !== "raw" || f.kindId || !seller || !kindItems.length) return;
    const it = kindItems.find((i) => nfc(i.name) === nfc(seller.material_type ?? ""));
    if (it) set({ kindId: it.id, rate: "", rateTouched: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seller?.id, kindItems.length, head]);

  // veku drivers typed before, newest first
  const drivers = useMemo(() => {
    if (head !== "veku") return [] as string[];
    const rows = [...(party?.pays ?? []).map((p) => ({ d: p.payment_date, n: p.note }))].sort((a, b) => (a.d < b.d ? 1 : -1));
    const out: string[] = [];
    for (const r of rows) { const d = parseVekuNote(r.n).driver; if (d && !out.includes(d)) out.push(d); }
    return out;
  }, [party, head]);
  useEffect(() => {
    if (!edit && head === "veku" && !f.driver && drivers[0]) set({ driver: drivers[0] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drivers[0], head]);
  useEffect(() => {
    if (!edit && open && head === "veku" && !f.personId && sellers[0]) set({ personId: sellers[0].id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sellers, head, open]);

  // sardar: this season's work (same rule as the sardar page) and the old due
  const sardarBalQ = useQuery({
    queryKey: ["sardar-balance-one", f.personId],
    enabled: open && head === "sardar" && !!f.personId,
    queryFn: async () => {
      const [sd, kacha, work, pays, rates] = await Promise.all([
        supabase.from("sardars").select("id, kind, monthly_salary, join_date, leave_date").eq("id", f.personId).maybeSingle(),
        fetchAllRows(() => sdb.from("kacha_brick_entries").select("id, sardar_id, entry_type, quantity, amount").eq("sardar_id", f.personId).order("id")),
        fetchAllRows(() => sdb.from("sardar_work_entries").select("id, sardar_id, quantity, amount").eq("sardar_id", f.personId).order("id")),
        fetchAllRows(() => sdb.from("sardar_payments").select("id, amount").eq("sardar_id", f.personId).order("id")),
        (supabase as any).from("pay_rates").select("sardar_id, amount, effective_from").eq("sardar_id", f.personId),
      ]);
      if (sd.error) throw sd.error;
      if (!sd.data) return null;
      const earned = sardarEarned(sd.data as any, kacha as any[], work as any[], (rates?.data ?? []) as any[]).earned;
      const paid = (pays as any[]).reduce((a, p) => a + Number(p.amount || 0), 0);
      return { earned, paid, due: earned - paid };
    },
  });
  // daily worker / staff: earned this season (same rule as their pages) − paid this season
  const workerPaidQ = useQuery({
    queryKey: ["expense-form-worker-paid", f.personId],
    enabled: open && (head === "daily" || head === "staff") && !!f.personId,
    queryFn: async () => {
      const [w, pays, att, rates, old] = await Promise.all([
        supabase.from("workers").select("id, role, daily_wage, monthly_salary, join_date, leave_date").eq("id", f.personId).maybeSingle(),
        fetchAllRows<{ amount: number }>(() => sdb.from("worker_payments").select("id, amount").eq("worker_id", f.personId).order("id")),
        fetchAllRows<{ date: string; present: boolean; is_half_day: boolean }>(() => sdb.from("worker_attendance").select("id, date, present, is_half_day").eq("worker_id", f.personId).order("id")),
        (supabase as any).from("pay_rates").select("worker_id, amount, effective_from").eq("worker_id", f.personId),
        fetchWorkerOldDues(f.personId),
      ]);
      const paid = pays.reduce((a, r) => a + Number(r.amount || 0), 0);
      const oldDue = old.reduce((a, o) => a + o.remaining, 0);
      const wr: any = w.data;
      if (!wr) return { paid, old, oldDue, nowDue: null as number | null, due: null as number | null };
      const r = (rates?.data ?? []) as any[];
      const earned = wr.role === "daily"
        ? dailyEarned({ wage: wr.daily_wage, join: wr.join_date, leave: wr.leave_date, rates: r, marks: att.map((a) => ({ date: a.date, present: a.present !== false, half: !!a.is_half_day })) }).earned
        : salaryEarned({ monthly: wr.monthly_salary, join: wr.join_date, leave: wr.leave_date, rates: r, absences: att.filter((a) => a.present === false || a.is_half_day).map((a) => ({ date: a.date, half: a.is_half_day })) }).earned;
      // what the person is owed in all: last season's due + this season's
      return { paid, old, oldDue, nowDue: earned - paid, due: oldDue + earned - paid };
    },
  });

  // owners: salary owed this season (same rule as the owners page) and net capital
  const ownersQ = useQuery({
    queryKey: ["expense-form-owners"],
    enabled: open && (head === "ownerSalary" || head === "ownerWithdraw"),
    queryFn: async () => {
      const { data, error } = await supabase.from("owners").select("id, name").order("name");
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; name: string }>;
    },
  });
  const ownerQ = useQuery({
    queryKey: ["expense-form-owner", f.personId],
    enabled: open && (head === "ownerSalary" || head === "ownerWithdraw") && !!f.personId,
    queryFn: async () => {
      const [tx, rates] = await Promise.all([
        supabase.from("owner_transactions").select("txn_type, amount, txn_date").eq("owner_id", f.personId),
        (supabase as any).from("pay_rates").select("owner_id, amount, effective_from").eq("owner_id", f.personId).order("effective_from"),
      ]);
      if (tx.error) throw tx.error;
      const rows = (tx.data ?? []) as Array<{ txn_type: string; amount: number; txn_date: string }>;
      const sum = (t: string, ok: (d: string) => boolean = () => true) => rows.filter((r) => r.txn_type === t && ok(r.txn_date)).reduce((a, r) => a + Number(r.amount || 0), 0);
      const inSeason = (d: string) => !season || (d >= season.from && d <= season.to);
      const rateRows = (rates?.data ?? []) as Array<{ amount: number; effective_from: string }>;
      const since = rateRows[0]?.effective_from ?? null;
      const earned = since ? salaryEarned({ monthly: 0, join: since, rates: rateRows as any, today }).earned : 0;
      return { net: sum("invest") - sum("withdraw"), salaryDue: since ? earned - sum("salary", inSeason) : null };
    },
  });
  // old dues from last year (sardars and others), one line per person
  const openingsQ = useQuery({
    queryKey: ["expense-form-openings"],
    enabled: open && (head === "openingOut" || head === "sardar"),
    queryFn: async () => {
      const { data, error } = await supabase.from("opening_balance_summary")
        .select("id, display_name, party_name, kind, sardar_id, remaining_amount")
        .in("kind", ["sardar_payable", "other_payable"]).order("display_name");
      if (error) throw error;
      return (data ?? []).map((r: any) => ({ id: r.id as string, name: (r.display_name || r.party_name || "—") as string, sardar_id: r.sardar_id as string | null, remaining: Number(r.remaining_amount || 0) }))
        .filter((r) => r.remaining > 0.5);
    },
  });
  const opening = head === "openingOut" ? (openingsQ.data ?? []).find((o) => o.id === f.personId) : undefined;
  const sardarOld = head === "sardar" ? (openingsQ.data ?? []).find((o) => o.sardar_id === f.personId) : undefined;
  // loans the kiln took and still owes
  const loansQ = useQuery({
    queryKey: ["expense-form-loans"],
    enabled: open && (head === "loanRepay" || head === "loanGive"),
    queryFn: async () => {
      const [l, p] = await Promise.all([
        supabase.from("loans").select("id, party_name, direction, amount, loan_date").order("loan_date"),
        supabase.from("loan_payments").select("loan_id, amount"),
      ]);
      if (l.error) throw l.error;
      if (p.error) throw p.error;
      const paidOf = (id: string) => (p.data ?? []).filter((x: any) => x.loan_id === id).reduce((a, x: any) => a + Number(x.amount || 0), 0);
      return (l.data ?? []).map((x: any) => ({ id: x.id as string, name: x.party_name as string, direction: x.direction as string, date: x.loan_date as string, remaining: Number(x.amount || 0) - paidOf(x.id) }));
    },
  });
  const takenLoans = (loansQ.data ?? []).filter((l) => l.direction === "taken" && l.remaining > 0.5);
  const loan = head === "loanRepay" ? takenLoans.find((l) => l.id === f.personId) : undefined;

  // the list a person is picked from, for heads that pick by id
  const people: Array<{ id: string; name: string }> =
    head === "sardar" ? sardarsQ.data ?? []
    : head === "daily" || head === "staff" ? (workersQ.data ?? []).filter((w) => (head === "daily" ? w.role === "daily" : w.role !== "daily"))
    : head === "ownerSalary" || head === "ownerWithdraw" ? ownersQ.data ?? []
    : head === "openingOut" ? (openingsQ.data ?? []).map((o) => ({ id: o.id, name: `${o.name} · বাকি ${tk(o.remaining)}` }))
    : head === "loanRepay" ? takenLoans.map((l) => ({ id: l.id, name: `${l.name} · বাকি ${tk(l.remaining)}` }))
    : [];
  const peopleLoading = sardarsQ.isLoading || workersQ.isLoading || ownersQ.isLoading || openingsQ.isLoading || loansQ.isLoading;

  // an owner's salary: start from what is still owed this season
  useEffect(() => {
    if (edit || head !== "ownerSalary" || f.paidTouched || f.paid) return;
    const due = ownerQ.data?.salaryDue ?? 0;
    if (due > 0) set({ paid: String(Math.round(due)) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerQ.data, head]);

  /* ---------- the numbers ---------- */
  const rawAuto = num(f.qty) * num(f.rate);
  const bill = !billOpen || isEditPay ? 0
    : head === "raw" ? (f.total.trim() ? num(f.total) : rawAuto)
    : head === "veku" || (head === "vehicle" && f.billKind === "rent") ? num(f.qty) * num(f.rate)
    : head === "parts" || head === "land" || head === "clean" || head === "vehicle" ? num(f.total)
    : 0;
  const paid = isEditBill ? 0 : num(f.paid);
  const prevDue: number | null =
    edit ? null
    : head === "sardar" ? (f.personId ? sardarBalQ.data?.due ?? null : null)
    : head === "ownerSalary" ? (f.personId ? ownerQ.data?.salaryDue ?? null : null)
    : head === "daily" || head === "staff" ? (f.personId ? workerPaidQ.data?.due ?? null : null)
    : head === "openingOut" ? (opening ? opening.remaining : null)
    : head === "loanRepay" ? (loan ? loan.remaining : null)
    : isSupplierHead && partyIds.length ? party?.due ?? null
    : null;

  /* ---------- labels ---------- */
  const partyLabel =
    head === "sardar" ? "সরদার" : head === "daily" ? "ডেলি শ্রমিক" : head === "staff" ? "মেস্তুরি / ম্যানেজার"
    : head === "ownerSalary" || head === "ownerWithdraw" ? "কোন মালিক"
    : head === "openingOut" ? "কার পূর্বের দেনা"
    : head === "loanRepay" ? "কার ঋণ"
    : head === "loanGive" ? "কাকে ঋণ দিলেন"
    : head === "veku" ? "কোন ভেকু"
    : head === "raw" ? (kindItem?.name === "মাটি" ? "মাটির সাইট" : kindItem?.name === "ডিজেল" ? "পাম্প / সাপ্লায়ার" : "কার কাছ থেকে আনা")
    : head === "parts" ? "দোকান"
    : cfg?.person ?? "";
  const partsNeedShop = head === "parts" && !isEditBill && (bill - paid > 0.001 || (bill <= 0 && paid > 0));
  const billWord = head === "veku" ? "কাজের ঘণ্টা" : head === "vehicle" ? "ট্রিপ ও ভাড়া" : cfg ? cfg.bill : "বিল";

  /* ---------- save ---------- */
  const createExp = useServerFn(createExpense);
  const createSardarPay = useServerFn(createSardarPayment);
  const uid = () => { if (!me?.user.id) throw new Error("আবার লগইন করুন"); return me.user.id; };

  const ensureSeller = async (type: string): Promise<string> => {
    const name = f.party.trim();
    if (seller) return seller.id;
    if (!supsQ.isSuccess) throw new Error("নামের তালিকা এখনো আসেনি, একটু পরে আবার চাপুন");
    const { data, error } = await supabase.from("suppliers").insert({ name, material_type: type }).select("id").single();
    if (error) throw error;
    return data.id as string;
  };

  const save = async () => {
    if (!head) return toast.error("কিসের খরচ, বেছে নিন");
    setBusy(true);
    try {
      const note = f.note.trim();
      if (!f.date) throw new Error("তারিখ দিন");

      /* ----- edit one saved row ----- */
      if (edit) {
        if (edit.table === "expenses") {
          const amount = head === "parts" ? num(f.total) : num(f.paid);
          if (!(amount > 0)) throw new Error("টাকার পরিমাণ দিন");
          if ((head === "parts" || head === "misc" || head === "asset") && !f.what.trim()) throw new Error("কী, তা লিখুন");
          const category = (head === "power" ? POWER_BILL : head === "parts" ? `${PARTS_PREFIX}${f.what.trim()}` : head === "asset" ? `${ASSET_PREFIX}${f.what.trim()}` : `আনুষাঙ্গিক — ${f.what.trim()}`).slice(0, 80);
          const { error } = await supabase.from("expenses").update({ category, amount, expense_date: f.date, note: note || null }).eq("id", edit.id);
          if (error) throw error;
        } else if (edit.table === "supplier_payments") {
          if (!(paid > 0)) throw new Error("টাকার পরিমাণ দিন");
          const sid = head === "veku" ? f.personId : seller?.id;
          if (!sid) throw new Error(`${partyLabel} বেছে নিন`);
          const { error } = await supabase.from("supplier_payments").update({
            supplier_id: sid, amount: paid, payment_date: f.date,
            note: head === "veku" ? makeVekuNote(f.vekuKind, f.driver, note) : note || null,
          }).eq("id", edit.id);
          if (error) throw error;
        } else {
          const sid = head === "veku" ? f.personId : seller?.id;
          if (!sid) throw new Error(`${partyLabel} বেছে নিন`);
          if (!(bill > 0)) throw new Error("বিলের টাকা দিন");
          await writeBill(sid, edit.id);
        }
        done("সংশোধন হয়েছে");
        return;
      }

      /* ----- new entry ----- */
      if (head === "sardar") {
        if (!f.personId) throw new Error("সরদারের নাম বেছে নিন");
        if (!(paid > 0)) throw new Error("কত টাকা দিলেন, লিখুন");
        await createSardarPay({ data: { sardar_id: f.personId, amount: paid, payment_date: f.date, payment_type: "payment", method: "cash", note: note || null } });
      } else if (head === "daily" || head === "staff") {
        if (!f.personId) throw new Error("নাম বেছে নিন");
        if (!(paid > 0)) throw new Error("কত টাকা দিলেন, লিখুন");
        // last season's unpaid wage is settled first, the rest is this season's
        await payWorker({ workerId: f.personId, amount: paid, date: f.date, note: note || null, createdBy: uid() });
      } else if (head === "ownerSalary" || head === "ownerWithdraw") {
        if (!f.personId) throw new Error("কোন মালিক, বেছে নিন");
        if (!(paid > 0)) throw new Error("কত টাকা নিলেন, লিখুন");
        const { error } = await supabase.from("owner_transactions").insert({
          owner_id: f.personId, txn_type: head === "ownerSalary" ? "salary" : "withdraw", amount: paid, txn_date: f.date, note: note || null, created_by: uid(),
        });
        if (error) throw error;
      } else if (head === "openingOut") {
        if (!opening) throw new Error("কার পূর্বের দেনা, বেছে নিন");
        if (!(paid > 0)) throw new Error("কত টাকা দিলেন, লিখুন");
        if (paid > opening.remaining + 0.001) throw new Error(`পূর্বের বাকি আছে মাত্র ৳ ${bn(opening.remaining)}`);
        const { error } = await supabase.from("opening_payments").insert({
          opening_balance_id: opening.id, amount: paid, payment_date: f.date, method: "নগদ", note: note || null, created_by: uid(),
        });
        if (error) throw error;
      } else if (head === "loanRepay") {
        if (!loan) throw new Error("কার ঋণ, বেছে নিন");
        if (!(paid > 0)) throw new Error("কত টাকা দিলেন, লিখুন");
        if (paid > loan.remaining + 0.5) throw new Error(`এই ঋণের বাকি আছে মাত্র ৳ ${bn(loan.remaining)}`);
        const { error } = await supabase.from("loan_payments").insert({ loan_id: loan.id, amount: paid, payment_date: f.date, note: note || null, created_by: uid() });
        if (error) throw error;
      } else if (head === "loanGive") {
        if (!f.party.trim()) throw new Error("কাকে ঋণ দিলেন, নাম লিখুন");
        if (!(paid > 0)) throw new Error("কত টাকা দিলেন, লিখুন");
        const { error } = await supabase.from("loans").insert({ party_name: f.party.trim(), direction: "given", amount: paid, loan_date: f.date, note: note || null, created_by: uid() });
        if (error) throw error;
      } else if (isCash) {
        if (!(paid > 0)) throw new Error("টাকার পরিমাণ দিন");
        if (head !== "power" && !f.what.trim()) throw new Error(head === "asset" ? "কী কেনা হলো, লিখুন" : "খরচের বিবরণ লিখুন");
        const category = (head === "power" ? POWER_BILL : head === "asset" ? `${ASSET_PREFIX}${f.what.trim()}` : `আনুষাঙ্গিক — ${f.what.trim()}`).slice(0, 80);
        await createExp({ data: { category, amount: paid, expense_date: f.date, note: note || null } });
      } else {
        // sellers and contract people: a bill and / or money paid now
        if (!(bill > 0) && !(paid > 0)) throw new Error(billOpen ? "বিল বা দেওয়া টাকা লিখুন" : "কত টাকা দিলেন, লিখুন");
        if (head === "veku" && !f.personId) throw new Error("কোন ভেকু, বেছে নিন");
        if (head === "veku" && paid > 0 && !f.vekuKind) throw new Error("টাকা কিসের জন্য (ডিজেল, মবিল …), বেছে নিন");
        if (head === "raw" && bill > 0 && !kindItem) throw new Error("কোন কাঁচামাল, বেছে নিন");
        if (head === "parts" && bill > 0 && !f.what.trim()) throw new Error("কী কী কিনলেন, লিখুন");
        if (cfg && f.billKind === "prev" && bill > 0 && seasonStart && f.date >= seasonStart) throw new Error("পূর্বের বকেয়ার তারিখ এই মৌসুম শুরুর আগে হতে হবে");

        if (head === "parts" && !f.party.trim()) {
          // no shop name: a plain cash expense, so nothing may stay due
          if (!(bill > 0)) throw new Error("মোট দাম লিখুন");
          if (paid < bill - 0.001) throw new Error("বাকি থাকলে দোকানের নাম লিখুন");
          if (paid > bill + 0.001) throw new Error("দেওয়া টাকা মোট দামের চেয়ে বেশি। আগের বাকি দিলে দোকানের নাম লিখুন।");
          await createExp({ data: { category: `${PARTS_PREFIX}${f.what.trim()}`.slice(0, 80), amount: bill, expense_date: f.date, note: note || null } });
        } else {
          if (head !== "veku" && !f.party.trim()) throw new Error(`${partyLabel}: নাম লিখুন`);
          const sid = head === "veku" ? f.personId
            : await ensureSeller(head === "raw" ? kindItem?.name ?? "কাঁচামাল" : head === "parts" ? kindItem?.name ?? "ইঞ্জিন মালামাল" : cfg!.type);
          if (bill > 0) await writeBill(sid, null);
          if (paid > 0) {
            const what = head === "raw" ? kindItem?.name ?? seller?.material_type ?? "কাঁচামাল" : head === "parts" ? f.what.trim() || "মালামাল" : "";
            const payNote = head === "veku" ? makeVekuNote(f.vekuKind, f.driver, note)
              : cfg ? (note ? `${cfg.item} পরিশোধ — ${note}` : `${cfg.item} পরিশোধ`)
              : `${what} — ${bill > 0 ? "পরিশোধ" : "অগ্রিম/বকেয়া পরিশোধ"}${note ? ` (${note})` : ""}`;
            const { error } = await supabase.from("supplier_payments").insert({
              supplier_id: sid, amount: paid, payment_date: f.date, method: "cash", note: payNote, created_by: uid(),
            });
            if (error) throw new Error(bill > 0 ? `বিল লেখা হয়েছে, কিন্তু দেওয়া টাকা সেভ হয়নি। আবার শুধু টাকাটা দিন। (${error.message})` : error.message);
          }
        }
      }
      done("সংরক্ষিত — ক্যাশ বই ও হিসাবে উঠেছে");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  /** one purchases row for the bill part (insert, or update when id is given) */
  async function writeBill(sid: string, id: string | null) {
    const note = f.note.trim();
    let row: Record<string, unknown>;
    if (head === "raw") {
      const qty = num(f.qty);
      const unitPriced = qty > 0 && num(f.rate) > 0;
      row = {
        item_name: kindItem?.name ?? (edit?.table === "purchases" ? edit.item_name : "কাঁচামাল"),
        material_id: kindItem?.id ?? (edit?.table === "purchases" ? edit.material_id ?? null : null),
        quantity: unitPriced ? qty : qty > 0 ? qty : 1, unit: kindItem?.unit ?? (edit?.table === "purchases" ? edit.unit : null),
        unit_price: unitPriced && !f.total.trim() ? num(f.rate) : Math.round((bill / (qty > 0 ? qty : 1)) * 100) / 100,
        total_amount: bill, note: note || null,
      };
    } else if (head === "parts") {
      row = { item_name: f.what.trim(), material_id: kindItem?.id ?? null, quantity: 1, unit: null, unit_price: bill, total_amount: bill, note: note || null };
    } else if (head === "veku") {
      row = { item_name: VEKU_ITEM, material_id: null, quantity: num(f.qty), unit: HOUR, unit_price: num(f.rate), total_amount: Math.round(bill * 100) / 100, note: makeVekuNote("", f.driver, note) };
    } else {
      const c = cfg!;
      const prev = f.billKind === "prev";
      const trips = c.trips && !prev;
      const area = !prev && c.showArea ? num(f.area) : 0;
      const qty = trips ? num(f.qty) : area > 0 ? area : 1;
      const text = trips ? [f.work, note].filter(Boolean).join(" — ") : note;
      row = {
        item_name: c.item, material_id: null, quantity: qty, unit: trips ? TRIP : area > 0 ? f.areaUnit : null,
        unit_price: trips ? num(f.rate) : Math.round((bill / qty) * 100) / 100, total_amount: Math.round(bill * 100) / 100,
        note: prev ? [PREV_NOTE, text].filter(Boolean).join(" — ") : text || null,
      };
    }
    const payload = { ...row, supplier_id: sid, purchase_date: f.date };
    const { error } = id
      ? await supabase.from("purchases").update(payload as never).eq("id", id)
      : await supabase.from("purchases").insert({ ...payload, created_by: uid() } as never);
    if (error) throw error;
  }

  function done(msg: string) {
    qc.invalidateQueries();
    toast.success(msg);
    onOpenChange(false);
    onDone?.();
  }

  const addCatalogItem = async () => {
    if (!newItem) return;
    const name = newItem.name.trim();
    if (!name) return toast.error("নাম লিখুন");
    if (items.some((i) => nfc(i.name) === nfc(name))) return toast.error("এই নামে আগে থেকেই আছে");
    if (head === "raw" && !newItem.unit.trim()) return toast.error("একক লিখুন (যেমন: টন, বস্তা)");
    const { data, error } = await supabase.from("raw_materials").insert({
      name, unit: head === "raw" ? newItem.unit.trim() : "পিস", item_group: head === "raw" ? "raw" : "other",
      pricing: head === "raw" ? "unit" : "flex", pay_mode: "credit", buy_pattern: "as_needed", stage: "other",
      in_brick_cost: true, sort_order: head === "raw" ? 20 : 60,
    }).select("id").single();
    if (error) return toast.error(error.message);
    await qc.invalidateQueries({ queryKey: ["expense-form-items"] });
    qc.invalidateQueries({ queryKey: ["purchase-items"] });
    set({ kindId: data.id as string, rate: "", rateTouched: false });
    setNewItem(null);
  };

  /* ---------- view ---------- */
  const shownHeads = EXPENSE_HEADS.filter((h) => !heads || heads.includes(h.key));
  const MOVE_HELP: Partial<Record<HeadKey, string>> = {
    ownerWithdraw: "মালিক নিজের বিনিয়োগ থেকে টাকা নিলেন। হাতে নগদ কমবে, কিন্তু এটা খরচ নয়, লাভ-ক্ষতিতে ধরা হবে না।",
    ownerSalary: "মালিকের মাসিক বেতন। এটা ভাটার খরচ, লাভ থেকে কমবে। বিনিয়োগ বদলাবে না।",
    openingOut: "গত মৌসুমের দেনা শোধ। হাতে নগদ কমবে, এই মৌসুমের লাভ-ক্ষতিতে ধরা হবে না।",
    loanGive: "কাউকে ধার দিলেন। ফেরত পেলে \"টাকা এসেছে → দেওয়া ঋণ ফেরত\" থেকে লিখবেন। খরচ নয়।",
    loanRepay: "নেওয়া ঋণ শোধ করলেন। খরচ নয়, লাভ-ক্ষতিতে ধরা হবে না।",
  };
  const def = head ? headDef(head) : null;
  const title = edit ? "এন্ট্রি সংশোধন" : "খরচ লিখুন";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{head ? "সব খরচ একই নিয়মে: কাকে, কী, বিল, কত দিলেন।" : "কিসের খরচ, বেছে নিন"}</DialogDescription>
        </DialogHeader>

        {!head || !def ? (
          <HeadTiles keys={shownHeads.map((h) => h.key)} onPick={(k) => startHead(k as HeadKey, blank(today))} />
        ) : (
          <div className="space-y-3.5">
            {/* head */}
            <div className="flex items-center gap-3 rounded-2xl border bg-muted/30 p-2.5">
              <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${TONES[def.tone]}`}><def.icon className="h-5 w-5" /></span>
              <span className="min-w-0 flex-1 text-base font-bold">{def.label}</span>
              {!lockHead && !edit && (
                <button type="button" onClick={() => setHead(null)} className="flex items-center gap-1 text-xs font-bold text-primary">
                  <ArrowLeft className="h-3.5 w-3.5" /> খাত বদলান
                </button>
              )}
            </div>

            {/* 1. who */}
            {!isCash && edit?.table !== "expenses" && (
              <Section label={`${partyLabel}${head === "parts" ? (partsNeedShop ? " *" : " (ঐচ্ছিক)") : " *"}`}>
                {head !== "veku" && PICK_HEADS.has(head) ? (
                  <>
                    <Select value={f.personId} onValueChange={(v) => set({ personId: v })}>
                      <SelectTrigger className="h-11"><SelectValue placeholder="নাম বেছে নিন" /></SelectTrigger>
                      <SelectContent>{people.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                    </Select>
                    {people.length === 0 && !peopleLoading && (
                      <p className="text-xs text-muted-foreground">
                        {head === "openingOut" ? "কারো পূর্বের দেনা বাকি নেই।" : head === "loanRepay" ? "শোধ করার মতো কোনো নেওয়া ঋণ নেই।" : "কোনো নাম নেই, আগে সংশ্লিষ্ট পাতায় নাম যোগ করুন।"}
                      </p>
                    )}
                  </>
                ) : head === "loanGive" ? (
                  <>
                    <Input className="h-11" list="expense-form-loan-names" value={f.party} placeholder="নাম লিখুন" onChange={(e) => set({ party: e.target.value })} />
                    <datalist id="expense-form-loan-names">{[...new Set((loansQ.data ?? []).map((l) => l.name))].map((n) => <option key={n} value={n} />)}</datalist>
                  </>
                ) : head === "veku" ? (
                  <Chips value={f.personId} onChange={(v) => set({ personId: v, ...(f.rateTouched ? {} : { rate: "" }) })} options={sellers.map((s) => [s.id, s.name])} icon={Tractor} />
                ) : (
                  <>
                    <Input className="h-11" list="expense-form-sellers" value={f.party} placeholder="নাম লিখুন বা বেছে নিন"
                      onChange={(e) => set({ party: e.target.value })} />
                    <datalist id="expense-form-sellers">
                      {sellers.map((s) => <option key={s.id} value={s.name} />)}
                      {head === "vehicle" && (customersQ.data ?? []).filter((n) => !sellers.some((s) => nfc(s.name) === nfc(n))).map((n) => <option key={`c${n}`} value={n} />)}
                    </datalist>
                    {f.party.trim() && !seller && supsQ.isSuccess && (
                      <p className="text-xs text-muted-foreground">নতুন নাম, {cfg ? `${cfg.title} খাতায়` : "সাপ্লায়ার পাতায়"} নিজে থেকে যোগ হবে।</p>
                    )}
                  </>
                )}
                {prevDue !== null && (
                  <p className={`num text-xs font-semibold ${prevDue > 0 ? "text-warning" : prevDue < 0 ? "text-info" : "text-success"}`}>
                    {head === "ownerSalary" ? "এই মৌসুমের বেতন" : "এখন পর্যন্ত"}: {prevDue > 0 ? `বাকি ${tk(prevDue)}` : prevDue < 0 ? `${head === "sardar" ? "দাদন" : "অগ্রিম দেওয়া"} ${tk(-prevDue)}` : "কোনো বাকি নেই"}
                  </p>
                )}
                {head === "ownerWithdraw" && f.personId && ownerQ.data && (
                  <p className="num text-xs font-semibold text-muted-foreground">এখন নিট বিনিয়োগ {tk(ownerQ.data.net)}</p>
                )}
                {head === "sardar" && sardarOld && (
                  <button type="button" onClick={() => startHead("openingOut", { ...blank(today), personId: sardarOld.id })}
                    className="flex w-full items-center justify-between rounded-xl bg-amber-50 px-3 py-2 text-left text-xs font-semibold text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                    <span>গত মৌসুমের বাকি আছে {tk(sardarOld.remaining)}। সেখান থেকে দিচ্ছেন?</span>
                    <span className="flex items-center gap-0.5 font-bold">পূর্বের দেনা <ChevronRight className="h-3.5 w-3.5" /></span>
                  </button>
                )}
                {(head === "daily" || head === "staff") && f.personId && workerPaidQ.data !== undefined && (() => {
                  const wd = workerPaidQ.data;
                  const split = splitWorkerPay(paid, wd.old);
                  return (
                    <>
                      {wd.oldDue > 0.5 && (
                        <div className="num space-y-0.5 rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                          <div>গত বছরের বকেয়া {tk(wd.oldDue)} · এই মৌসুমে {wd.nowDue === null ? "—" : wd.nowDue >= 0 ? `বাকি ${tk(wd.nowDue)}` : `অগ্রিম ${tk(-wd.nowDue)}`}</div>
                          <div className="font-normal">টাকা আগে গত বছরের বকেয়া থেকে কাটবে; সেটা শেষ হলে তারপর এই মৌসুমের পাওনা থেকে।</div>
                          {paid > 0 && <div>এবার: গত বছরের বকেয়ায় {tk(split.toOldTotal)}{split.toNow > 0.5 ? ` · এই মৌসুমে ${tk(split.toNow)}` : ""}</div>}
                        </div>
                      )}
                      <p className="num text-xs text-muted-foreground">এই মৌসুমে আগে দেওয়া হয়েছে {tk(wd.paid)}</p>
                    </>
                  );
                })()}
              </Section>
            )}

            {/* 2. what */}
            {MOVE_HELP[head] && <p className="rounded-xl bg-muted/60 px-3 py-2 text-xs text-muted-foreground">{MOVE_HELP[head]}</p>}
            {(head === "raw" || head === "parts") && (
              <Section label={head === "raw" ? "কোন কাঁচামাল" : "কোন ধরনের মালামাল"}>
                <Chips value={f.kindId} onChange={(v) => set({ kindId: v, rate: "", rateTouched: false })} options={kindItems.map((i) => [i.id, i.name])} />
                {isAdmin && !edit && (newItem ? (
                  <div className="flex gap-1.5">
                    <Input className="h-10" placeholder="নতুন নাম" value={newItem.name} onChange={(e) => setNewItem({ ...newItem, name: e.target.value })} />
                    {head === "raw" && <Input className="h-10 w-24" placeholder="একক" value={newItem.unit} onChange={(e) => setNewItem({ ...newItem, unit: e.target.value })} />}
                    <Button type="button" size="sm" className="h-10" onClick={addCatalogItem}>যোগ</Button>
                  </div>
                ) : (
                  <button type="button" onClick={() => setNewItem({ name: "", unit: "" })} className="flex items-center gap-1 text-xs font-bold text-primary">
                    <Plus className="h-3.5 w-3.5" /> নতুন নাম
                  </button>
                ))}
                {head === "parts" && billOpen && (
                  <Input className="h-11" value={f.what} onChange={(e) => set({ what: e.target.value })} placeholder="কী কী কিনলেন, যেমন: বিয়ারিং, বেল্ট" />
                )}
              </Section>
            )}
            {(head === "misc" || head === "asset") && (
              <Section label={head === "asset" ? "কী কেনা হলো *" : "খরচের নাম *"}>
                <Input className="h-11" value={f.what} onChange={(e) => set({ what: e.target.value })} placeholder={head === "asset" ? "যেমন: ট্রান্সফরমার, ভেকুর অংশ" : "যেমন: চা-নাস্তা, যাতায়াত"} />
                {head === "asset" && <p className="text-xs text-muted-foreground">অনেক বছর কাজে লাগবে এমন জিনিস। হাতে নগদ থেকে কমবে, কিন্তু এই মৌসুমের লাভ-ক্ষতিতে খরচ ধরা হবে না।</p>}
              </Section>
            )}

            {/* 3. bill */}
            {isSupplierHead && !isEditPay && (billOpen ? (
              <Section label={head === "raw" || head === "parts" ? "বিল" : billWord}>
                {cfg && !isEditBill && (
                  <Chips value={f.billKind} onChange={(v) => set({ billKind: v as Form["billKind"], date: v === "prev" ? prevDate : head === "clean" && seasonStart ? seasonStart : today })}
                    options={[["rent", cfg.billLong], ["prev", PREV_NOTE]]} />
                )}
                {head === "raw" ? (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <Field label={`পরিমাণ${kindItem?.unit ? ` (${kindItem.unit})` : ""}`} value={f.qty} onChange={(v) => set({ qty: v, total: "" })} />
                      <Field label={`দর${kindItem?.unit ? ` (প্রতি ${kindItem.unit})` : ""}`} value={f.rate} onChange={(v) => set({ rate: v, rateTouched: true, total: "" })} />
                    </div>
                    <Field label="মোট দাম" value={f.total} onChange={(v) => set({ total: v })}
                      placeholder={rawAuto > 0 ? `পরিমাণ × দর = ${bn(rawAuto)}` : "পরিমাণ × দর, বা সরাসরি মোট"} />
                  </>
                ) : head === "veku" ? (
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="কত ঘণ্টা" value={f.qty} onChange={(v) => set({ qty: v })} step="0.25" />
                    <Field label="ঘণ্টায় (৳)" value={f.rate} onChange={(v) => set({ rate: v, rateTouched: true })} />
                  </div>
                ) : head === "vehicle" && f.billKind === "rent" ? (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <Field label="কত ট্রিপ" value={f.qty} onChange={(v) => set({ qty: v })} />
                      <Field label="প্রতি ট্রিপ (৳)" value={f.rate} onChange={(v) => set({ rate: v, rateTouched: true })} />
                    </div>
                    <Chips value={f.work} onChange={(v) => set({ work: f.work === v ? "" : v })} options={TRIP_WORK.map((w) => [w, w])} small />
                  </>
                ) : (
                  <>
                    <Field label={head === "parts" ? "মোট দাম" : f.billKind === "prev" ? "কত বাকি ছিল (৳)" : `${cfg?.billLong ?? "বিল"} (৳)`} value={f.total}
                      onChange={(v) => set({ total: v, ...(head === "parts" && !f.paidTouched && !isEditBill ? { paid: v } : {}) })} />
                    {head === "land" && f.billKind === "rent" && (
                      <div className="grid grid-cols-2 gap-2">
                        <Field label="জমির পরিমাণ" value={f.area} onChange={(v) => set({ area: v })} placeholder="ঐচ্ছিক" />
                        <div className="space-y-1">
                          <Label className="text-xs">একক</Label>
                          <Select value={f.areaUnit} onValueChange={(v) => set({ areaUnit: v })}>
                            <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                            <SelectContent>{LAND_UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                          </Select>
                        </div>
                      </div>
                    )}
                  </>
                )}
                {bill > 0 && (head === "raw" || head === "veku" || head === "vehicle") && (
                  <p className="num text-sm">মোট বিল <b>{tk(bill)}</b></p>
                )}
                {f.billKind === "prev" && cfg && <p className="text-xs text-muted-foreground">আগের মৌসুমের যে টাকা এখনো বাকি। এই মৌসুমের খরচে ধরা হবে না, শুধু বাকিতে যোগ হবে।</p>}
                {!isEditBill && !BILL_OPEN.has(head) && (
                  <button type="button" onClick={() => { setBillOpen(false); set({ qty: "", rate: "", total: "", area: "", billKind: "rent" }); }} className="text-xs font-bold text-muted-foreground">বিল বাদ দিন</button>
                )}
              </Section>
            ) : (
              <button type="button" onClick={() => setBillOpen(true)}
                className="flex h-11 w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed text-sm font-bold text-primary">
                <Plus className="h-4 w-4" /> {head === "veku" ? "কাজের ঘণ্টা লিখুন" : `${billWord} লিখুন`}
              </button>
            ))}

            {/* 4. paid now */}
            {!isEditBill && !(edit?.table === "expenses" && head === "parts") && (
              <Section label={isCash ? "টাকা *" : head === "ownerSalary" || head === "ownerWithdraw" ? "কত টাকা নিলেন *" : head === "veku" && isEditPay ? "টাকা *" : "এখন কত দিলেন"}
                action={bill > 0 ? <button type="button" className="text-xs font-bold text-primary" onClick={() => set({ paid: String(Math.round(bill * 100) / 100), paidTouched: false })}>পুরোটা</button> : undefined}>
                <Input className="h-11" type="number" min="0" step="0.01" inputMode="decimal" value={f.paid} placeholder={bill > 0 ? "না দিলে খালি রাখুন" : "০"}
                  onChange={(e) => set({ paid: e.target.value, paidTouched: true })} />
                {head === "veku" && (num(f.paid) > 0 || !billOpen) && (
                  <>
                    <div className="text-xs font-bold text-muted-foreground">কিসের টাকা</div>
                    <Chips value={f.vekuKind} onChange={(v) => set({ vekuKind: v })} options={VEKU_KINDS.map((k) => [k, k])} small />
                  </>
                )}
              </Section>
            )}

            {/* 5. the account */}
            {!edit && !isCash && (prevDue !== null || bill > 0) && (bill > 0 || paid > 0) && (
              <BalanceStrip prev={prevDue} bill={bill} paid={paid} advanceWord={head === "sardar" ? "দাদন" : "অগ্রিম"} />
            )}

            {/* 6. date, note */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">{f.billKind === "prev" && billOpen && cfg ? "কোন তারিখ পর্যন্ত" : "তারিখ"}</Label>
                <Input className="h-11" type="date" value={f.date} max={f.billKind === "prev" && billOpen && cfg && seasonStart ? prevDate : undefined} onChange={(e) => set({ date: e.target.value })} />
              </div>
              {head === "veku" ? (
                <div className="space-y-1">
                  <Label className="text-xs">চালক</Label>
                  <Input className="h-11" list="expense-form-drivers" value={f.driver} onChange={(e) => set({ driver: e.target.value })} />
                  <datalist id="expense-form-drivers">{drivers.map((d) => <option key={d} value={d} />)}</datalist>
                </div>
              ) : <div />}
            </div>
            <div className="space-y-1">
              <Label className="text-xs">নোট</Label>
              <Input className="h-11" value={f.note} onChange={(e) => set({ note: e.target.value })}
                placeholder={head === "power" ? "যেমন: কোন মাসের বিল" : head === "veku" ? "যেমন: মাটি কাটা" : "ঐচ্ছিক"} />
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>বাতিল</Button>
          {head && (
            <Button type="button" onClick={save} disabled={busy}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}সংরক্ষণ
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
