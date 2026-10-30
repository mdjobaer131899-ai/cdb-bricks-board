import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BalanceStrip, Chips, HeadTiles, Section, tk } from "@/components/money-form-parts";
import { supabase } from "@/integrations/supabase/client";
import { fetchCustomerBalance } from "@/lib/customer-account";
import { bn, todayBD } from "@/lib/format";
import { createCollection } from "@/lib/collections.functions";
import { MONEY_HEADS, TONE_CLASS, moneyHead, type MoneyKey } from "@/lib/money-heads";
import { useCurrentUser } from "@/lib/use-current-user";

/**
 * The one form for money coming in, laid out like the expense form (expense-entry.tsx):
 *   1. কার কাছ থেকে (with what they owe), 2. কত টাকা পেলেন (+ how, for customers),
 *   3. the strip আগে বাকি − পেলাম = পরে বাকি, 4. তারিখ, নোট.
 * sale → collections (createCollection); openingIn → opening_payments of a customer_receivable;
 * ownerInvest → owner_transactions 'invest'; loanIn → loans 'taken'; loanBack → loan_payments
 * of a loan given. The same tables the pages and fetchCashSummary read.
 */
export type IncomeKey = Extract<MoneyKey, "sale" | "openingIn" | "ownerInvest" | "loanIn" | "loanBack">;
export const INCOME_HEADS = MONEY_HEADS.filter((h) => h.group === "in").map((h) => h.key as IncomeKey);

const METHODS: Array<[string, string]> = [["cash", "নগদ"], ["bkash", "বিকাশ"], ["nagad", "নগদ (মোবাইল)"], ["bank", "ব্যাংক"]];
const num = (s: string) => Number(s || 0) || 0;
const nfc = (s: string) => s.normalize("NFC").trim();

/** dueDate: when a loan taken must be paid back (loans.due_date), optional */
type Form = { personId: string; party: string; amount: string; method: string; date: string; note: string; dueDate: string };
const blank = (today: string): Form => ({ personId: "", party: "", amount: "", method: "cash", date: today, note: "", dueDate: "" });

export function IncomeEntryDialog({ open, onOpenChange, head: headProp, partyId, lockHead, onDone, onSwitchHead }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  head?: IncomeKey | null;
  /** customer, owner or loan id to preselect */
  partyId?: string | null;
  lockHead?: boolean;
  onDone?: () => void;
  /** open a money-out head instead (e.g. someone who picked "loan given back" to repay a loan taken) */
  onSwitchHead?: (k: MoneyKey) => void;
}) {
  const qc = useQueryClient();
  const { data: me } = useCurrentUser();
  const today = todayBD();
  const [head, setHead] = useState<IncomeKey | null>(null);
  const [f, setF] = useState<Form>(() => blank(today));
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<Form>) => setF((s) => ({ ...s, ...p }));

  useEffect(() => {
    if (!open) return;
    setHead(headProp ?? null);
    setF({ ...blank(today), personId: partyId ?? "" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /* ---------- data ---------- */
  const customersQ = useQuery({
    queryKey: ["income-form-customers"],
    enabled: open && head === "sale",
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("id, name, phone").order("name");
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; name: string; phone: string | null }>;
    },
  });
  const customers = customersQ.data ?? [];
  // a preselected customer is shown by name
  useEffect(() => {
    if (head === "sale" && f.personId && !f.party && customers.length) {
      const c = customers.find((x) => x.id === f.personId);
      if (c) set({ party: c.name });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customers.length, head]);
  const customer = head === "sale" ? customers.find((c) => nfc(c.name) === nfc(f.party)) : undefined;

  // the customer's account, the same rule as the collections page, dashboard and AI
  // (all approved challans that are not from a booking or last season's advance − all non-contract collections)
  const custBalQ = useQuery({
    queryKey: ["income-form-customer", customer?.id],
    enabled: open && !!customer,
    queryFn: () => fetchCustomerBalance(customer!.id),
  });

  const openingsQ = useQuery({
    queryKey: ["income-form-openings"],
    enabled: open && head === "openingIn",
    queryFn: async () => {
      const { data, error } = await supabase.from("opening_balance_summary")
        .select("id, display_name, party_name, remaining_amount").eq("kind", "customer_receivable").order("display_name");
      if (error) throw error;
      return (data ?? []).map((r: any) => ({ id: r.id as string, name: (r.display_name || r.party_name || "—") as string, remaining: Number(r.remaining_amount || 0) }))
        .filter((r) => r.remaining > 0.5);
    },
  });
  const opening = (openingsQ.data ?? []).find((o) => o.id === f.personId);

  const ownersQ = useQuery({
    queryKey: ["income-form-owners"],
    enabled: open && head === "ownerInvest",
    queryFn: async () => {
      const [o, t] = await Promise.all([
        supabase.from("owners").select("id, name").order("name"),
        supabase.from("owner_transactions").select("owner_id, txn_type, amount"),
      ]);
      if (o.error) throw o.error;
      if (t.error) throw t.error;
      const net = (id: string) => (t.data ?? []).filter((x: any) => x.owner_id === id)
        .reduce((a, x: any) => a + (x.txn_type === "invest" ? 1 : x.txn_type === "withdraw" ? -1 : 0) * Number(x.amount || 0), 0);
      return (o.data ?? []).map((x: any) => ({ id: x.id as string, name: x.name as string, net: net(x.id) }));
    },
  });
  const owner = (ownersQ.data ?? []).find((o) => o.id === f.personId);

  const loansQ = useQuery({
    queryKey: ["income-form-loans"],
    enabled: open && (head === "loanIn" || head === "loanBack"),
    queryFn: async () => {
      const [l, p] = await Promise.all([
        supabase.from("loans").select("id, party_name, direction, amount, loan_date").order("loan_date"),
        supabase.from("loan_payments").select("loan_id, amount"),
      ]);
      if (l.error) throw l.error;
      if (p.error) throw p.error;
      const paidOf = (id: string) => (p.data ?? []).filter((x: any) => x.loan_id === id).reduce((a, x: any) => a + Number(x.amount || 0), 0);
      return (l.data ?? []).map((x: any) => ({ id: x.id as string, name: x.party_name as string, direction: x.direction as string, remaining: Number(x.amount || 0) - paidOf(x.id) }));
    },
  });
  const givenLoans = (loansQ.data ?? []).filter((l) => l.direction === "given" && l.remaining > 0.5);
  // loans the kiln took and still owes: paying them back is money out, not this head
  const takenLeft = (loansQ.data ?? []).filter((l) => l.direction === "taken" && l.remaining > 0.5);
  const loan = givenLoans.find((l) => l.id === f.personId);

  /* ---------- numbers and labels ---------- */
  const amount = num(f.amount);
  const prev: number | null =
    head === "sale" ? (customer ? custBalQ.data ?? null : null)
    : head === "openingIn" ? (opening ? opening.remaining : null)
    : head === "loanBack" ? (loan ? loan.remaining : null)
    : null;
  const partyLabel = head === "sale" ? "কোন গ্রাহক" : head === "openingIn" ? "কার কাছ থেকে (গত বছরের পাওনা)" : head === "ownerInvest" ? "কোন মালিক" : head === "loanIn" ? "কার কাছ থেকে ঋণ" : "কে ঋণ ফেরত দিল";
  const help: Partial<Record<IncomeKey, string>> = {
    ownerInvest: "মালিক ভাটায় টাকা দিলেন। হাতে নগদ বাড়বে, এটা বিক্রি নয়।",
    loanIn: "কারো কাছ থেকে ধার নিলেন। শোধ করলে \"টাকা গেছে → নেওয়া ঋণ শোধ দিলাম\" থেকে লিখবেন।",
    loanBack: "কাউকে ধার দিয়েছিলেন, সে টাকা ফেরত দিল। আপনি কারো ঋণ শোধ করলে এটা নয়।",
    openingIn: "গত মৌসুমের বাকি আদায়। এই মৌসুমের বিক্রিতে ধরা হবে না।",
  };
  const pickList = useMemo(() => (
    head === "openingIn" ? (openingsQ.data ?? []).map((o) => ({ id: o.id, name: `${o.name} · বাকি ${tk(o.remaining)}` }))
    : head === "ownerInvest" ? (ownersQ.data ?? []).map((o) => ({ id: o.id, name: o.name }))
    : head === "loanBack" ? givenLoans.map((l) => ({ id: l.id, name: `${l.name} · বাকি ${tk(l.remaining)}` }))
    : []
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [head, openingsQ.data, ownersQ.data, loansQ.data]);

  /* ---------- save ---------- */
  const createCol = useServerFn(createCollection);
  const uid = () => { if (!me?.user.id) throw new Error("আবার লগইন করুন"); return me.user.id; };

  const save = async () => {
    if (!head) return;
    setBusy(true);
    try {
      if (!(amount > 0)) throw new Error("কত টাকা পেলেন, লিখুন");
      if (!f.date) throw new Error("তারিখ দিন");
      const note = f.note.trim() || null;
      if (head === "sale") {
        if (!customer) throw new Error(f.party.trim() ? `"${f.party.trim()}" নামে কোনো গ্রাহক নেই। তালিকা থেকে নাম বেছে নিন।` : "কোন গ্রাহক, বেছে নিন");
        await createCol({ data: { customer_id: customer.id, contract_id: null, amount, payment_date: f.date, method: f.method, note } });
      } else if (head === "openingIn") {
        if (!opening) throw new Error("কার কাছ থেকে, বেছে নিন");
        if (amount > opening.remaining + 0.001) throw new Error(`গত বছরের বাকি আছে মাত্র ৳ ${bn(opening.remaining)}`);
        const methodLabel = METHODS.find(([k]) => k === f.method)?.[1] ?? "নগদ";
        const { error } = await supabase.from("opening_payments").insert({ opening_balance_id: opening.id, amount, payment_date: f.date, method: methodLabel, note, created_by: uid() });
        if (error) throw error;
      } else if (head === "ownerInvest") {
        if (!owner) throw new Error("কোন মালিক, বেছে নিন");
        const { error } = await supabase.from("owner_transactions").insert({ owner_id: owner.id, txn_type: "invest", amount, txn_date: f.date, note, created_by: uid() });
        if (error) throw error;
      } else if (head === "loanIn") {
        if (!f.party.trim()) throw new Error("কার কাছ থেকে ঋণ, নাম লিখুন");
        const { error } = await supabase.from("loans").insert({ party_name: f.party.trim(), direction: "taken", amount, loan_date: f.date, due_date: f.dueDate || null, note, created_by: uid() });
        if (error) throw error;
      } else {
        if (!loan) throw new Error("কে ফেরত দিল, বেছে নিন");
        if (amount > loan.remaining + 0.5) throw new Error(`এই ঋণের বাকি আছে মাত্র ৳ ${bn(loan.remaining)}`);
        const { error } = await supabase.from("loan_payments").insert({ loan_id: loan.id, amount, payment_date: f.date, note, created_by: uid() });
        if (error) throw error;
      }
      qc.invalidateQueries();
      toast.success("সংরক্ষিত — ক্যাশ বই ও হিসাবে উঠেছে");
      onOpenChange(false);
      onDone?.();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  /* ---------- view ---------- */
  const def = head ? moneyHead(head) : null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>টাকা এসেছে</DialogTitle>
          <DialogDescription>{head ? "সব আয় একই নিয়মে: কার কাছ থেকে, কত টাকা, কত বাকি রইল।" : "কোথা থেকে টাকা এল, বেছে নিন"}</DialogDescription>
        </DialogHeader>

        {!head || !def ? (
          <HeadTiles keys={INCOME_HEADS} onPick={(k) => { setHead(k as IncomeKey); setF(blank(today)); }} />
        ) : (
          <div className="space-y-3.5">
            <div className="flex items-center gap-3 rounded-2xl border bg-muted/30 p-2.5">
              <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${TONE_CLASS[def.tone]}`}><def.icon className="h-5 w-5" /></span>
              <span className="min-w-0 flex-1 text-base font-bold">{def.label}</span>
              {!lockHead && (
                <button type="button" onClick={() => setHead(null)} className="flex items-center gap-1 text-xs font-bold text-primary">
                  <ArrowLeft className="h-3.5 w-3.5" /> খাত বদলান
                </button>
              )}
            </div>

            {help[head] && <p className="rounded-xl bg-muted/60 px-3 py-2 text-xs text-muted-foreground">{help[head]}</p>}

            {head === "loanBack" && takenLeft.length > 0 && (
              <div className="space-y-2 rounded-2xl border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950/30">
                <p className="font-bold text-amber-900 dark:text-amber-200">নেওয়া ঋণ শোধ দিচ্ছেন?</p>
                <p className="num text-xs text-amber-900 dark:text-amber-200">
                  {takenLeft.map((l) => `${l.name} ${tk(l.remaining)}`).join(" · ")} — এগুলো আপনি নিয়েছেন। শোধ দিলে টাকা যায়, তাই সেটা "টাকা গেছে → নেওয়া ঋণ শোধ দিলাম"।
                </p>
                {onSwitchHead ? (
                  <Button type="button" size="sm" className="w-full gap-1" onClick={() => onSwitchHead("loanRepay")}>
                    নেওয়া ঋণ শোধ দিলাম <ArrowRight className="h-4 w-4" />
                  </Button>
                ) : (
                  <Button type="button" size="sm" className="w-full gap-1" asChild>
                    <Link to="/loans" onClick={() => onOpenChange(false)}>ঋণের পাতায় গিয়ে "শোধ দিলাম" চাপুন <ArrowRight className="h-4 w-4" /></Link>
                  </Button>
                )}
              </div>
            )}

            {/* 1. who */}
            <Section label={`${partyLabel} *`}>
              {head === "sale" ? (
                <>
                  <Input className="h-11" list="income-form-customers" value={f.party} placeholder="নাম লিখুন বা বেছে নিন" onChange={(e) => set({ party: e.target.value })} />
                  <datalist id="income-form-customers">{customers.map((c) => <option key={c.id} value={c.name}>{c.phone ?? ""}</option>)}</datalist>
                  {f.party.trim() && !customer && customersQ.isSuccess && (
                    <p className="text-xs font-semibold text-destructive">এই নামে কোনো গ্রাহক নেই। তালিকা থেকে বেছে নিন, নতুন হলে আগে গ্রাহক পাতায় যোগ করুন।</p>
                  )}
                </>
              ) : head === "loanIn" ? (
                <>
                  <Input className="h-11" list="income-form-loan-names" value={f.party} placeholder="নাম লিখুন" onChange={(e) => set({ party: e.target.value })} />
                  <datalist id="income-form-loan-names">{[...new Set((loansQ.data ?? []).map((l) => l.name))].map((n) => <option key={n} value={n} />)}</datalist>
                </>
              ) : (
                <>
                  <Select value={f.personId} onValueChange={(v) => set({ personId: v })}>
                    <SelectTrigger className="h-11"><SelectValue placeholder="নাম বেছে নিন" /></SelectTrigger>
                    <SelectContent>{pickList.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                  </Select>
                  {pickList.length === 0 && !(openingsQ.isLoading || ownersQ.isLoading || loansQ.isLoading) && (
                    <p className="text-xs text-muted-foreground">
                      {head === "openingIn" ? "কারো কাছে গত বছরের টাকা পাওনা নেই।" : head === "loanBack" ? "ফেরত পাওয়ার মতো কোনো দেওয়া ঋণ নেই।" : "কোনো মালিক যোগ করা হয়নি।"}
                    </p>
                  )}
                </>
              )}
              {prev !== null && (
                <p className={`num text-xs font-semibold ${prev > 0 ? "text-warning" : prev < 0 ? "text-info" : "text-success"}`}>
                  এখন পর্যন্ত: {prev > 0 ? `বাকি ${tk(prev)}` : prev < 0 ? `অগ্রিম জমা ${tk(-prev)}` : "কোনো বাকি নেই"}
                </p>
              )}
              {head === "ownerInvest" && owner && <p className="num text-xs font-semibold text-muted-foreground">এখন নিট বিনিয়োগ {tk(owner.net)}</p>}
            </Section>

            {/* 2. amount */}
            <Section label="কত টাকা পেলেন *">
              <Input className="h-11" type="number" min="0" step="0.01" inputMode="decimal" value={f.amount} placeholder="০" onChange={(e) => set({ amount: e.target.value })} />
              {(head === "sale" || head === "openingIn") && (
                <>
                  <div className="text-xs font-bold text-muted-foreground">কীভাবে পেলেন</div>
                  <Chips value={f.method} onChange={(v) => set({ method: v })} options={METHODS} small />
                </>
              )}
            </Section>

            {/* 3. the account */}
            {prev !== null && amount > 0 && <BalanceStrip prev={prev} paid={amount} incoming />}

            {/* 4. date, note */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">তারিখ</Label>
                <Input className="h-11" type="date" value={f.date} onChange={(e) => set({ date: e.target.value })} />
              </div>
              {head === "loanIn" ? (
                <div className="space-y-1">
                  <Label className="text-xs">শোধের শেষ তারিখ (ঐচ্ছিক)</Label>
                  <Input className="h-11" type="date" value={f.dueDate} min={f.date} onChange={(e) => set({ dueDate: e.target.value })} />
                </div>
              ) : <div />}
            </div>
            <div className="space-y-1">
              <Label className="text-xs">নোট</Label>
              <Input className="h-11" value={f.note} onChange={(e) => set({ note: e.target.value })} placeholder="ঐচ্ছিক" />
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
