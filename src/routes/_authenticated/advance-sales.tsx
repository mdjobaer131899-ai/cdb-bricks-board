import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, PackageCheck, Plus, Printer, Trash2, Wallet, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Chips, Section } from "@/components/money-form-parts";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/fetch-all";
import { fetchBookings, isOpen, type Booking } from "@/lib/bookings";
import { fetchActiveBrickTypes, fetchAllCustomers } from "@/lib/sales-queries";
import { bn, bnDate, todayBD } from "@/lib/format";
import { printTable } from "@/lib/print-table";
import { useCurrentUser } from "@/lib/use-current-user";

/**
 * অগ্রিম বিক্রি — two different things, side by side:
 *  - ঠিক দামে বুকিং: bricks booked at a fixed price, paid in full; challans against it
 *    keep that price whatever the market does (lib/bookings.ts).
 *  - অগ্রিম টাকা: money taken first; bricks go later at the day's price. This is the
 *    customer's normal account (collections and challans without a booking).
 */
type Tab = "booking" | "money";

export const Route = createFileRoute("/_authenticated/advance-sales")({
  head: () => ({
    meta: [
      { title: "অগ্রিম বিক্রি — CDB Bricks" },
      { name: "description", content: "ঠিক দামে ইট বুকিং আর অগ্রিম টাকার হিসাব: কে কত দিয়েছে, কত ইট নিয়েছে, কত বাকি।" },
    ],
  }),
  validateSearch: (s: Record<string, unknown>): { t?: Tab } => (s.t === "money" || s.t === "booking" ? { t: s.t } : {}),
  component: AdvancePage,
});

const tk = (n: number) => `৳${bn(Math.round(Math.abs(n)))}`;
const METHODS: Array<[string, string]> = [["cash", "নগদ"], ["bkash", "বিকাশ"], ["nagad", "নগদ (মোবাইল)"], ["bank", "ব্যাংক"]];

function AdvancePage() {
  const { t = "booking" } = Route.useSearch();
  const navigate = useNavigate();
  const { data: me } = useCurrentUser();
  const isAdmin = me?.role === "admin";

  return (
    <div className="mx-auto max-w-2xl space-y-4 pb-28 md:pb-6">
      <div>
        <h1 className="font-display flex items-center gap-2 text-[26px] font-extrabold leading-tight"><PackageCheck className="h-6 w-6 text-primary" /> অগ্রিম বিক্রি</h1>
        <p className="text-sm text-muted-foreground">দুই রকম অগ্রিম, আলাদা হিসাব</p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {([
          ["booking", "ঠিক দামে বুকিং", "দাম আগেই ঠিক। পরে দাম বাড়ুক-কমুক, এই দামেই ইট।"],
          ["money", "অগ্রিম টাকা", "আগে টাকা। ইট নেওয়ার দিনের দামে কাটে।"],
        ] as Array<[Tab, string, string]>).map(([k, title, sub]) => (
          <button key={k} type="button" onClick={() => navigate({ to: "/advance-sales", search: { t: k }, replace: true })}
            className={`rounded-2xl border p-3 text-left transition ${t === k ? "border-primary bg-primary/5 ring-1 ring-primary" : "bg-card"}`}>
            <span className="block font-bold">{title}</span>
            <span className="block text-xs text-muted-foreground">{sub}</span>
          </button>
        ))}
      </div>

      {t === "booking" ? <BookingTab isAdmin={isAdmin} /> : <MoneyTab />}
    </div>
  );
}

/* ================= fixed-price bookings ================= */
function BookingTab({ isAdmin }: { isAdmin: boolean }) {
  const q = useQuery({ queryKey: ["bookings"], queryFn: () => fetchBookings() });
  const [showDone, setShowDone] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [cancel, setCancel] = useState<Booking | null>(null);
  const all = q.data ?? [];
  const open = all.filter(isOpen);
  const list = showDone ? all : open;
  const trucksLeft = open.reduce((a, b) => a + b.items.reduce((s, i) => s + i.remaining, 0), 0);
  const owed = all.filter((b) => b.owed > 0.5).reduce((a, b) => a + b.owed, 0);

  const print = () => printTable({
    title: "ঠিক দামে বুকিং",
    headers: ["বুকিং", "গ্রাহক", "ইট", "বুকিং (গাড়ি)", "প্রতি পিস", "দেওয়া (গাড়ি)", "বাকি (গাড়ি)"],
    rightCols: [3, 4, 5, 6],
    rows: list.flatMap((b) => b.items.map((i) => [b.no, b.customer, i.brick, bn(i.trucks), tk(i.rate), bn(i.delivered), bn(i.remaining)])),
    totals: [["বাকি গাড়ি", bn(trucksLeft)], ["ইট দেওয়া বাকি (টাকায়)", tk(owed)]],
  });

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-2xl border bg-card p-3">
          <div className="text-xs font-semibold text-muted-foreground">ইট দেওয়া বাকি (টাকায়)</div>
          <div className="num font-display text-xl font-extrabold text-info">{tk(owed)}</div>
        </div>
        <div className="rounded-2xl border bg-card p-3">
          <div className="text-xs font-semibold text-muted-foreground">বাকি গাড়ি</div>
          <div className="num font-display text-xl font-extrabold">{bn(trucksLeft)} গাড়ি</div>
        </div>
      </div>

      <div className="flex gap-2">
        {isAdmin && <Button className="h-12 flex-1 gap-2 rounded-2xl text-base font-bold" onClick={() => setNewOpen(true)}><Plus className="h-5 w-5" /> নতুন বুকিং</Button>}
        <Button variant="outline" className="h-12 rounded-2xl" onClick={print} aria-label="প্রিন্ট"><Printer className="h-5 w-5" /></Button>
      </div>

      {q.isLoading ? <Skeleton className="h-40 rounded-[20px]" /> : list.length === 0 ? (
        <p className="rounded-[20px] border bg-card p-4 text-sm text-muted-foreground">{all.length ? "সব বুকিংয়ের ইট দেওয়া শেষ।" : "এখনো কোনো বুকিং নেই।"}</p>
      ) : list.map((b) => {
        const done = !isOpen(b);
        const untouched = b.items.every((i) => i.delivered + i.pending === 0);
        return (
          <section key={b.id} className={`overflow-hidden rounded-[20px] border bg-card ${done ? "opacity-70" : ""}`}>
            <div className="flex items-start justify-between gap-2 px-4 pt-3">
              <div className="min-w-0">
                <Link to="/customers/$id" params={{ id: b.customer_id }} className="block break-words font-bold text-primary">{b.customer}</Link>
                <div className="text-xs text-muted-foreground">{b.no} · {bnDate(b.date)}{b.note ? ` · ${b.note}` : ""}</div>
              </div>
              {done ? <span className="flex shrink-0 items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-xs font-bold text-success"><BadgeCheck className="h-3.5 w-3.5" /> শেষ</span>
                : isAdmin && untouched && (
                  <Button size="sm" variant="ghost" className="shrink-0 text-destructive" onClick={() => setCancel(b)}><Trash2 className="mr-1 h-3.5 w-3.5" /> বাতিল</Button>
                )}
            </div>
            <div className="mt-2 divide-y border-y">
              {b.items.map((i) => (
                <div key={i.brick_type_id} className="px-4 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{i.brick}</span>
                    <span className="num text-sm text-muted-foreground">প্রতি পিস {tk(i.rate)} · গাড়িতে ~{bn(i.perTruck)} পিস</span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
                    <div className="h-2 rounded-full bg-primary" style={{ width: `${Math.min(100, ((i.delivered + i.pending) / (i.trucks || 1)) * 100)}%` }} />
                  </div>
                  <div className="num mt-1 flex justify-between text-xs">
                    <span>বুকিং {bn(i.trucks)} গাড়ি · দেওয়া {bn(i.delivered)} ({bn(i.deliveredPieces)} পিস){i.pending ? ` · অপেক্ষায় ${bn(i.pending)}` : ""}</span>
                    <b className={i.remaining > 0 ? "text-warning" : "text-success"}>বাকি {bn(i.remaining)} গাড়ি</b>
                  </div>
                </div>
              ))}
            </div>
            <div className="num grid grid-cols-3 text-center text-xs">
              <div className="px-2 py-2"><div className="text-muted-foreground">টাকা নেওয়া</div><b className="text-sm">{tk(b.paid)}</b></div>
              <div className="border-x px-2 py-2"><div className="text-muted-foreground">ইট দেওয়া হয়েছে</div><b className="text-sm">{tk(b.deliveredValue)}</b></div>
              <div className="px-2 py-2"><div className="text-muted-foreground">{b.owed >= 0 ? "ইট দেওয়া বাকি" : "গ্রাহকের বাকি"}</div><b className={`text-sm ${b.owed > 0.5 ? "text-info" : b.owed < -0.5 ? "text-warning" : "text-success"}`}>{tk(b.owed)}</b></div>
            </div>
          </section>
        );
      })}

      {all.length > open.length && (
        <button type="button" onClick={() => setShowDone((v) => !v)} className="w-full text-center text-sm font-semibold text-primary">
          {showDone ? "শুধু চলতি বুকিং দেখান" : `শেষ হওয়া বুকিংও দেখান (${bn(all.length - open.length)})`}
        </button>
      )}
      <p className="px-1 text-xs text-muted-foreground">প্রতিটি চালান এক গাড়ি। "নতুন চালান"-এ গ্রাহক আর ইট বাছলে বুকিং দেখাবে; যে গাড়ি বুকিং থেকে দিচ্ছেন সেটায় বুকিং বাছুন, দাম হবে বুকিংয়ের দাম × আসল পিস। বাকি গাড়িগুলো "বুকিং থেকে নয়" বাছলে সেদিনের দামে যায়, তার নগদ টাকা কালেকশনে নিন, না হলে অগ্রিম টাকা থেকে কাটে।</p>

      {newOpen && <NewBookingDialog onClose={() => setNewOpen(false)} />}
      {cancel && <CancelDialog b={cancel} onClose={() => setCancel(null)} />}
    </div>
  );
}

type Line = { brick_type_id: string; trucks: string; perTruck: string; rate: string };

function NewBookingDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const customersQ = useQuery({ queryKey: ["customers-all"], queryFn: fetchAllCustomers });
  const bricksQ = useQuery({ queryKey: ["brick-types-active"], queryFn: fetchActiveBrickTypes });
  const bricks = (bricksQ.data ?? []).filter((b: any) => b.name !== "অন্যান্য");
  const [customerId, setCustomerId] = useState("");
  const [date, setDate] = useState(todayBD());
  const [lines, setLines] = useState<Line[]>([{ brick_type_id: "", trucks: "", perTruck: "", rate: "" }]);
  const [method, setMethod] = useState("cash");
  const [note, setNote] = useState("");

  const lineValue = (l: Line) => (Number(l.trucks) || 0) * (Number(l.perTruck) || 0) * (Number(l.rate) || 0);
  const value = lines.reduce((a, l) => a + lineValue(l), 0);
  const setLine = (i: number, p: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...p } : l)));
  const used = new Set(lines.map((l) => l.brick_type_id));

  const save = useMutation({
    mutationFn: async () => {
      if (!customerId) throw new Error("গ্রাহক বাছুন");
      const items = lines.filter((l) => l.brick_type_id || l.trucks || l.rate);
      if (!items.length) throw new Error("অন্তত একটি ইটের ধরন দিন");
      for (const l of items) {
        if (!l.brick_type_id) throw new Error("ইটের ধরন বাছুন");
        if (!(Number(l.trucks) > 0)) throw new Error("কত গাড়ি, লিখুন");
        if (!(Number(l.perTruck) > 0)) throw new Error("এক গাড়িতে কত পিস, লিখুন");
        if (!(Number(l.rate) > 0)) throw new Error("প্রতি পিসের দাম দিন");
      }
      // the whole booked value is taken today
      const amount = Math.round(value * 100) / 100;
      const { error } = await (supabase.rpc as any)("create_booking", {
        _customer_id: customerId, _date: date,
        _items: items.map((l) => ({ brick_type_id: l.brick_type_id, trucks: Number(l.trucks), pieces_per_truck: Number(l.perTruck), rate: Number(l.rate) })),
        _paid: amount, _method: method, _note: note,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { toast.success("বুকিং লেখা হয়েছে"); qc.invalidateQueries(); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[92vh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>নতুন বুকিং (ঠিক দামে)</DialogTitle>
          <DialogDescription>এই দামেই পরে ইট যাবে। পুরো টাকা আজ নেওয়া হচ্ছে।</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Section label="গ্রাহক">
            <Select value={customerId} onValueChange={setCustomerId}>
              <SelectTrigger className="h-11"><SelectValue placeholder="গ্রাহক বাছুন" /></SelectTrigger>
              <SelectContent>{(customersQ.data ?? []).map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </Section>

          <Section label="কোন ইট, কত গাড়ি, কী দামে" action={
            <button type="button" className="flex items-center gap-1 text-xs font-bold text-primary" onClick={() => setLines((ls) => [...ls, { brick_type_id: "", trucks: "", perTruck: "", rate: "" }])}><Plus className="h-3.5 w-3.5" /> আরেক ধরন</button>
          }>
            {lines.map((l, i) => (
              <div key={i} className="space-y-1.5 rounded-xl bg-muted/50 p-2">
                <div className="flex gap-1.5">
                  <Select value={l.brick_type_id} onValueChange={(v) => {
                    const b = bricks.find((x: any) => x.id === v);
                    setLine(i, { brick_type_id: v, rate: l.rate || (b?.default_unit_price ? String(b.default_unit_price) : "") });
                  }}>
                    <SelectTrigger className="h-10 flex-1"><SelectValue placeholder="ইটের ধরন" /></SelectTrigger>
                    <SelectContent>{bricks.filter((b: any) => b.id === l.brick_type_id || !used.has(b.id)).map((b: any) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
                  </Select>
                  {lines.length > 1 && <Button type="button" size="icon" variant="ghost" className="h-10 w-10" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} aria-label="সরান"><X className="h-4 w-4" /></Button>}
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  <div><Label className="text-xs">কত গাড়ি</Label><Input className="h-10" type="number" inputMode="numeric" min="0" value={l.trucks} onChange={(e) => setLine(i, { trucks: e.target.value })} /></div>
                  <div><Label className="text-xs">গাড়িতে পিস</Label><Input className="h-10" type="number" inputMode="numeric" min="0" value={l.perTruck} onChange={(e) => setLine(i, { perTruck: e.target.value })} /></div>
                  <div><Label className="text-xs">প্রতি পিস ৳</Label><Input className="h-10" type="number" inputMode="decimal" min="0" step="0.01" value={l.rate} onChange={(e) => setLine(i, { rate: e.target.value })} /></div>
                </div>
                {lineValue(l) > 0 && <div className="num text-right text-xs text-muted-foreground">{bn(Number(l.trucks))} গাড়ি × {bn(Number(l.perTruck))} পিস × {tk(Number(l.rate))} = {tk(lineValue(l))}</div>}
              </div>
            ))}
            <div className="num flex items-center justify-between rounded-xl bg-muted px-3 py-2 font-bold"><span>মোট দাম</span><span>{tk(value)}</span></div>
          </Section>

          <Section label="পুরো টাকা নেওয়া হলো">
            <div className="num flex items-center justify-between rounded-xl border px-3 py-2.5"><span className="text-sm">আজ নিলেন</span><b className="font-display text-lg">{tk(value)}</b></div>
            <Chips value={method} onChange={setMethod} options={METHODS} small />
            <p className="text-xs text-muted-foreground">এই টাকা হাতে নগদে যোগ হবে। লাভ-ক্ষতিতে বিক্রি ধরা হবে ইট দেওয়ার দিন।</p>
          </Section>

          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-xs">তারিখ</Label><Input className="h-11" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          </div>
          <div><Label className="text-xs">নোট</Label><Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></div>
        </div>
        <DialogFooter><Button className="h-12 w-full text-base font-bold" onClick={() => save.mutate()} disabled={save.isPending}>বুকিং সেভ</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CancelDialog({ b, onClose }: { b: Booking; onClose: () => void }) {
  const qc = useQueryClient();
  const del = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase.rpc as any)("cancel_booking", { _id: b.id });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { toast.success("বুকিং বাতিল হয়েছে"); qc.invalidateQueries(); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>বুকিং বাতিল?</DialogTitle>
          <DialogDescription>{b.customer} · {b.no}। এর {tk(b.paid)} টাকার এন্ট্রিও মুছে যাবে, হাতে নগদ থেকে কমবে। টাকা ফেরত দিলে বাতিল করুন।</DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>না</Button>
          <Button variant="destructive" onClick={() => del.mutate()} disabled={del.isPending}>বাতিল করুন</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ================= advance money: the normal customer account ================= */
function MoneyTab() {
  const q = useQuery({
    queryKey: ["advance-money"],
    queryFn: async () => {
      // the customer's normal account, all time (a booking has its own account above)
      const [c, col, s] = await Promise.all([
        supabase.from("customers").select("id,name,phone").order("name"),
        fetchAllRows<any>(() => supabase.from("collections").select("id, customer_id, amount").is("contract_id", null).order("id")),
        fetchAllRows<any>(() => supabase.from("sales_entries").select("id, customer_id, quantity, total_amount").eq("status", "approved").is("contract_id", null).is("opening_balance_id", null).order("id")),
      ]);
      if (c.error) throw c.error;
      return (c.data ?? []).map((cu) => {
        const paid = col.filter((x) => x.customer_id === cu.id).reduce((a, b) => a + Number(b.amount || 0), 0);
        const mine = s.filter((x) => x.customer_id === cu.id);
        const qty = mine.reduce((a, b) => a + Number(b.quantity || 0), 0);
        const value = mine.reduce((a, b) => a + Number(b.total_amount || 0), 0);
        return { ...cu, paid, qty, value, balance: paid - value };
      }).filter((r) => r.paid > 0 || r.qty > 0).sort((a, b) => b.balance - a.balance);
    },
  });
  const rows = q.data ?? [];
  const totAdv = rows.filter((r) => r.balance > 0).reduce((a, b) => a + b.balance, 0);
  const totDue = rows.filter((r) => r.balance < 0).reduce((a, b) => a - b.balance, 0);
  const lab = (b: number) => (b > 0.5 ? `অগ্রিম ${tk(b)}` : b < -0.5 ? `বাকি ${tk(b)}` : "সমান");
  const print = () => printTable({
    title: "অগ্রিম টাকা",
    headers: ["নাম", "দিয়েছে", "ইট নিয়েছে (পিস)", "ইটের দাম", "অবস্থা"], rightCols: [1, 2, 3],
    rows: rows.map((r) => [r.name, tk(r.paid), bn(r.qty), tk(r.value), lab(r.balance)]),
    totals: [["মোট অগ্রিম (ইট দেওয়া বাকি)", tk(totAdv)], ["মোট বাকি পাওনা", tk(totDue)]],
  });

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-2xl border bg-card p-3">
          <div className="text-xs font-semibold text-muted-foreground">অগ্রিম জমা (ইট দেওয়া বাকি)</div>
          <div className="num font-display text-xl font-extrabold text-info">{tk(totAdv)}</div>
        </div>
        <div className="rounded-2xl border bg-card p-3">
          <div className="text-xs font-semibold text-muted-foreground">গ্রাহকের কাছে বাকি</div>
          <div className="num font-display text-xl font-extrabold text-warning">{tk(totDue)}</div>
        </div>
      </div>
      <div className="flex gap-2">
        <Button asChild className="h-12 flex-1 gap-2 rounded-2xl text-base font-bold"><Link to="/collections"><Wallet className="h-5 w-5" /> অগ্রিম টাকা নিন</Link></Button>
        <Button variant="outline" className="h-12 rounded-2xl" onClick={print} aria-label="প্রিন্ট"><Printer className="h-5 w-5" /></Button>
      </div>
      {q.isLoading ? <Skeleton className="h-40 rounded-[20px]" /> : (
        <section className="divide-y overflow-hidden rounded-[20px] border bg-card">
          {rows.length === 0 && <p className="p-4 text-sm text-muted-foreground">কোনো তথ্য নেই</p>}
          {rows.map((r) => (
            <Link key={r.id} to="/customers/$id" params={{ id: r.id }} className="flex items-center gap-3 px-4 py-3">
              <span className="min-w-0 flex-1">
                <span className="block break-words font-semibold">{r.name}</span>
                <span className="num text-xs text-muted-foreground">দিয়েছে {tk(r.paid)} · ইট {bn(r.qty)} পিস ({tk(r.value)})</span>
              </span>
              <b className={`num shrink-0 text-sm ${r.balance > 0.5 ? "text-info" : r.balance < -0.5 ? "text-warning" : "text-success"}`}>{lab(r.balance)}</b>
            </Link>
          ))}
        </section>
      )}
      <p className="px-1 text-xs text-muted-foreground">টাকা নিন "কালেকশন" পাতায়, ইট দিন "নতুন চালান"-এ (বুকিং না বেছে)। দাম ধরা হয় চালানের দিনের দামে। গত বছরের জের এখানে নেই, তা "পূর্বের বকেয়া" পাতায়।</p>
    </div>
  );
}
