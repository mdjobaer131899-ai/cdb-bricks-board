import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Loader2, Tractor } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NameCombo } from "@/components/ui/name-combo";
import { Label } from "@/components/ui/label";
import { Chips, Field, Section, tk } from "@/components/money-form-parts";
import { supabase } from "@/integrations/supabase/client";
import { createExpense } from "@/lib/expenses.functions";
import { PAY_METHODS } from "@/lib/cash-queries";
import { bn, todayBD } from "@/lib/format";
import { useCurrentUser } from "@/lib/use-current-user";
import {
  HOUR, VEKU_AUTO_TK, VEKU_DIESEL_CREDIT, VEKU_DIESEL_OLD, VEKU_ITEM, VEKU_KHORAKI, VEKU_KHORAKI_TK, VEKU_RATE, VEKU_SEP,
  makeVekuNote, parseVekuNote,
} from "@/components/contract-config";

/**
 * One day of a veku, written like one row of the paper sheet (দৈনিক খাতা):
 * hours worked, diesel (litres, price, paid to the pump), money to the driver, the diesel
 * auto fare (A) and the driver's food money (H).
 *  - hours → purchases (item ভেকু, unit ঘণ্টা, rate per hour): what the kiln owes the veku
 *  - diesel paid, driver money, auto fare → supplier_payments to the veku (they come off its
 *    account); the diesel litres and price are kept in the note ("৪০ লিটার · দাম ৳৫,৬০০")
 *  - diesel taken on credit (nothing paid yet) is noted on the hours row; the pump is paid
 *    later with diesel and no litres (VEKU_DIESEL_OLD)
 *  - khoraki → expenses (VEKU_KHORAKI): the kiln's own cost, not the veku's
 * Every row is money that left the kiln's cash (or the chosen purse) that day, so hand cash,
 * the cash book and the veku account all agree.
 */

export type VekuLite = { id: string; name: string };
export type VekuHistory = { supplier_id: string | null; date: string; note: string | null; unit?: string | null; unit_price?: number };

type F = {
  vekuId: string; date: string; driver: string; driverTouched: boolean;
  hours: string; mins: string; rate: string; rateTouched: boolean;
  litres: string; price: string; paid: string; paidTouched: boolean;
  driverPay: string;
  auto: boolean; autoTouched: boolean; autoTk: string;
  khoraki: boolean; khorakiTk: string;
  note: string; method: string;
};

const num = (s: string) => Number(s || 0) || 0;
const round2 = (n: number) => Math.round(n * 100) / 100;
const blank = (vekuId: string, date: string): F => ({
  vekuId, date, driver: "", driverTouched: false, hours: "", mins: "0", rate: "", rateTouched: false,
  litres: "", price: "", paid: "", paidTouched: false, driverPay: "",
  auto: false, autoTouched: false, autoTk: String(VEKU_AUTO_TK), khoraki: false, khorakiTk: String(VEKU_KHORAKI_TK),
  note: "", method: "cash",
});

export function VekuDayDialog({ open, onOpenChange, vekus, history, defaultVeku, onDone }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  vekus: VekuLite[];
  /** earlier hours and payments, newest first is not needed: used for the last rate and driver */
  history: VekuHistory[];
  defaultVeku?: string | null;
  onDone?: () => void;
}) {
  const qc = useQueryClient();
  const { data: me } = useCurrentUser();
  const createExp = useServerFn(createExpense);
  const today = todayBD();
  const [f, setF] = useState<F>(() => blank(defaultVeku ?? vekus[0]?.id ?? "", today));
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<F>) => setF((o) => ({ ...o, ...p }));

  useEffect(() => {
    if (open) setF(blank(defaultVeku && vekus.some((v) => v.id === defaultVeku) ? defaultVeku : vekus[0]?.id ?? "", todayBD()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // last rate and driver of the chosen veku
  const last = useMemo(() => {
    const mine = history.filter((h) => h.supplier_id === f.vekuId).sort((a, b) => (a.date < b.date ? 1 : -1));
    const rate = mine.find((h) => h.unit === HOUR && Number(h.unit_price) > 0)?.unit_price ?? VEKU_RATE;
    const drivers: string[] = [];
    for (const h of mine) { const d = parseVekuNote(h.note).driver; if (d && !drivers.includes(d)) drivers.push(d); }
    return { rate: Number(rate), drivers };
  }, [history, f.vekuId]);

  const lastDriver = last.drivers[0] ?? "";
  useEffect(() => {
    if (!open) return;
    setF((o) => ({
      ...o,
      ...(o.rateTouched ? {} : { rate: String(last.rate) }),
      ...(o.driverTouched ? {} : { driver: lastDriver }),
    }));
  }, [open, f.vekuId, last.rate, lastDriver]);

  const veku = vekus.find((v) => v.id === f.vekuId) ?? null;
  const hours = num(f.hours) + num(f.mins) / 60;
  const rate = num(f.rate);
  const rent = round2(hours * rate);
  const litres = num(f.litres);
  const price = num(f.price);
  const paid = num(f.paid);
  const driverPay = num(f.driverPay);
  const auto = f.auto ? num(f.autoTk) : 0;
  const khoraki = f.khoraki ? num(f.khorakiTk) : 0;
  const offVeku = paid + driverPay + auto;
  const cashOut = offVeku + khoraki;
  const pumpDue = price - paid;

  const setPrice = (v: string) => set({
    price: v,
    ...(f.paidTouched ? {} : { paid: v }),
    ...(f.autoTouched ? {} : { auto: num(v) > 0 }),
  });

  const save = async () => {
    setBusy(true);
    try {
      const uid = me?.user.id;
      if (!uid) throw new Error("আবার লগইন করুন");
      if (!veku) throw new Error("কোন ভেকু, বেছে নিন");
      if (!f.date) throw new Error("তারিখ দিন");
      if (hours > 0 && !(rate > 0)) throw new Error("ঘণ্টায় কত টাকা, লিখুন");
      if (litres > 0 && !(price > 0)) throw new Error("ডিজেলের দাম লিখুন");
      if (price > 0 && !(paid > 0) && !(hours > 0)) throw new Error("ডিজেল বাকিতে নিলে সেদিনের ঘণ্টাও লিখুন। পাম্পে টাকা দিলে তখন \"পাম্পে দিলেন\" লিখবেন।");
      if (!(hours > 0) && !(paid > 0) && !(driverPay > 0) && !(auto > 0) && !(khoraki > 0)) throw new Error("ঘণ্টা বা কোনো টাকা লিখুন");
      if (f.auto && !(auto > 0)) throw new Error("অটো ভাড়া কত, লিখুন");
      if (f.khoraki && !(khoraki > 0)) throw new Error("খোরাকি কত, লিখুন");

      const note = f.note.trim();
      let noteUsed = false;
      const takeNote = () => { if (noteUsed || !note) return ""; noteUsed = true; return note; };
      const dieselText = [litres > 0 ? `${bn(litres)} লিটার` : "", price > 0 ? `দাম ${tk(price)}` : ""].filter(Boolean).join(VEKU_SEP);
      const saved: string[] = [];

      // 1. hours (and diesel taken on credit that day)
      if (hours > 0) {
        const credit = price > 0 && !(paid > 0) ? `${VEKU_DIESEL_CREDIT}: ${dieselText}` : "";
        const { error } = await supabase.from("purchases").insert({
          supplier_id: veku.id, purchase_date: f.date, item_name: VEKU_ITEM, material_id: null,
          quantity: round2(hours), unit: HOUR, unit_price: rate, total_amount: rent,
          note: makeVekuNote("", f.driver, [takeNote(), credit].filter(Boolean).join(VEKU_SEP)), created_by: uid,
        } as never);
        if (error) throw error;
        saved.push("ঘণ্টা");
      }

      // 2. money off the veku account, in one insert
      const pays: Array<Record<string, unknown>> = [];
      const pay = (kind: string, amount: number, rest: string) => pays.push({
        supplier_id: veku.id, amount: round2(amount), payment_date: f.date, method: f.method, created_by: uid,
        note: makeVekuNote(kind, f.driver, [rest, takeNote()].filter(Boolean).join(VEKU_SEP)),
      });
      if (paid > 0) pay("ডিজেল", paid, price > 0 ? dieselText : VEKU_DIESEL_OLD);
      if (driverPay > 0) pay("চালকের বেতন", driverPay, "");
      if (auto > 0) pay("অটো ভাড়া", auto, "ডিজেল আনা");
      if (pays.length) {
        const { error } = await supabase.from("supplier_payments").insert(pays as never);
        if (error) throw new Error(saved.length ? `ঘণ্টা সেভ হয়েছে, কিন্তু টাকাগুলো হয়নি। শুধু টাকাগুলো আবার লিখুন। (${error.message})` : error.message);
        saved.push("টাকা");
      }

      // 3. khoraki: the kiln's own cost
      if (khoraki > 0) {
        try {
          await createExp({ data: {
            category: VEKU_KHORAKI, amount: khoraki, expense_date: f.date, method: f.method as "cash",
            note: [veku.name, f.driver.trim() ? `চালক: ${f.driver.trim()}` : "", takeNote()].filter(Boolean).join(VEKU_SEP),
          } });
        } catch (e) {
          throw new Error(saved.length ? `বাকিগুলো সেভ হয়েছে, কিন্তু খোরাকি হয়নি। শুধু খোরাকি আবার লিখুন। (${(e as Error).message})` : (e as Error).message);
        }
      }

      qc.invalidateQueries();
      toast.success(`${veku.name}: ${f.date === today ? "আজকের" : "দিনের"} হিসাব সেভ হয়েছে`);
      onOpenChange(false);
      onDone?.();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>ভেকুর দিনের হিসাব</DialogTitle>
          <DialogDescription>খাতার এক লাইনের মতো: ঘণ্টা, ডিজেল, চালক, অটো (A), খোরাকি (H)।</DialogDescription>
        </DialogHeader>

        <div className="space-y-3.5">
          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2">
              <Chips value={f.vekuId} onChange={(v) => set({ vekuId: v, rateTouched: false, driverTouched: false })} options={vekus.map((v) => [v.id, v.name])} icon={Tractor} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">তারিখ</Label>
              <Input className="h-11" type="date" value={f.date} max={today} onChange={(e) => set({ date: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">চালক</Label>
              <NameCombo value={f.driver} onChange={(v) => set({ driver: v, driverTouched: true })} options={last.drivers} />
            </div>
          </div>

          <Section label="কাজ">
            <div className="grid grid-cols-2 gap-2">
              <Field label="কত ঘণ্টা" value={f.hours} onChange={(v) => set({ hours: v })} step="1" />
              <Field label="ঘণ্টায় (৳)" value={f.rate} onChange={(v) => set({ rate: v, rateTouched: true })} />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-muted-foreground">মিনিট</span>
              <Chips value={f.mins} onChange={(v) => set({ mins: v })} options={[["0", "০"], ["15", "১৫"], ["30", "৩০"], ["45", "৪৫"]]} small />
            </div>
            {hours > 0 && rate > 0 && <p className="num text-sm">ভেকুর ভাড়া <b>{tk(rent)}</b></p>}
          </Section>

          <Section label="ডিজেল">
            <div className="grid grid-cols-3 gap-2">
              <Field label="লিটার" value={f.litres} onChange={(v) => set({ litres: v })} />
              <Field label="দাম (৳)" value={f.price} onChange={setPrice} />
              <Field label="পাম্পে দিলেন" value={f.paid} onChange={(v) => set({ paid: v, paidTouched: true })} />
            </div>
            {price > 0 && pumpDue > 0.5 && <p className="num text-xs font-semibold text-warning">পাম্পে বাকি থাকবে {tk(pumpDue)}</p>}
            {price > 0 && pumpDue < -0.5 && <p className="num text-xs font-semibold text-muted-foreground">আগের বাকিসহ দিচ্ছেন ({tk(-pumpDue)} বেশি)</p>}
            {!(price > 0) && paid > 0 && <p className="text-xs text-muted-foreground">আজ ডিজেল নেননি, শুধু পাম্পের আগের বাকি দিচ্ছেন।</p>}
          </Section>

          <Section label="চালককে দিলেন">
            <Input className="num h-11" type="number" min="0" inputMode="decimal" value={f.driverPay} placeholder="না দিলে খালি রাখুন"
              onChange={(e) => set({ driverPay: e.target.value })} />
          </Section>

          <div className="grid grid-cols-2 gap-2">
            <Mark on={f.auto} letter="A" label="অটো ভাড়া" amount={f.autoTk} help="ডিজেল আনার ভাড়া, ভেকুর হিসাব থেকে কাটবে"
              onToggle={() => set({ auto: !f.auto, autoTouched: true })} onAmount={(v) => set({ autoTk: v })} />
            <Mark on={f.khoraki} letter="H" label="খোরাকি" amount={f.khorakiTk} help="চালকের খাবার, ভাটার খরচ"
              onToggle={() => set({ khoraki: !f.khoraki })} onAmount={(v) => set({ khorakiTk: v })} />
          </div>

          <div className="space-y-1">
            <div className="text-xs font-bold text-muted-foreground">কীভাবে দিলেন</div>
            <Chips value={f.method} onChange={(v) => set({ method: v })} options={PAY_METHODS} small />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">নোট</Label>
            <Input className="h-11" value={f.note} onChange={(e) => set({ note: e.target.value })} placeholder="যেমন: মাটি কাটা, অগ্রিম" />
          </div>

          {(rent > 0 || cashOut > 0) && (
            <div className="num space-y-1 rounded-2xl bg-muted/50 p-3 text-sm">
              {rent > 0 && <div className="flex justify-between"><span>ভেকুর ভাড়া (পাবে)</span><b>+{tk(rent)}</b></div>}
              {offVeku > 0 && <div className="flex justify-between"><span>ভেকুর হিসাব থেকে কাটবে</span><b className="text-success">−{tk(offVeku)}</b></div>}
              {khoraki > 0 && <div className="flex justify-between text-muted-foreground"><span>খোরাকি (ভাটার খরচ)</span><span>{tk(khoraki)}</span></div>}
              {cashOut > 0 && <div className="flex justify-between border-t pt-1"><span>{f.method === "cash" ? "ক্যাশ থেকে যাবে" : "মোট দেওয়া"}</span><b>{tk(cashOut)}</b></div>}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>বাতিল</Button>
          <Button type="button" onClick={() => void save()} disabled={busy}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}সংরক্ষণ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** A paper mark (A, H): a tick that shows the amount when on. */
function Mark({ on, letter, label, amount, onToggle, onAmount, help }: {
  on: boolean; letter: string; label: string; amount: string; onToggle: () => void; onAmount: (v: string) => void; help: string;
}) {
  return (
    <div className={`rounded-2xl border p-2.5 ${on ? "border-primary bg-primary/5" : ""}`}>
      <button type="button" aria-pressed={on} onClick={onToggle} className="flex w-full items-center gap-2 text-left">
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl font-display text-lg font-extrabold ${on ? "bg-primary text-primary-foreground" : "border bg-background text-muted-foreground"}`}>
          {on ? <Check className="h-5 w-5" /> : letter}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold">{label}</span>
          <span className="block text-[11px] leading-tight text-muted-foreground">{help}</span>
        </span>
      </button>
      {on && (
        <Input className="num mt-2 h-10" type="number" min="0" inputMode="decimal" value={amount} onChange={(e) => onAmount(e.target.value)} aria-label={`${label} টাকা`} />
      )}
    </div>
  );
}
