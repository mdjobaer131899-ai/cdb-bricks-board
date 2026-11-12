import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle2, ChevronDown, Loader2, Lock, Printer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Section, tk } from "@/components/money-form-parts";
import { supabase } from "@/integrations/supabase/client";
import { fetchCashHistory, fetchCashSummary } from "@/lib/cash-queries";
import { bn, bnDate, todayBD } from "@/lib/format";
import { printTable } from "@/lib/print-table";
import { useCurrentUser } from "@/lib/use-current-user";

/**
 * দিন বন্ধ: the drawer is counted at the end of a day and checked against the drawer money
 * the app expects (the "cash" purse of fetchCashSummary up to that day). The row keeps both
 * numbers and the reason for any gap; nothing is booked to hide a difference.
 */
export type DayClose = { id: string; close_date: string; expected: number; counted: number; difference: number | null; note: string | null };

const signed = (n: number) => (Math.abs(n) < 0.5 ? "৳০ (মিলেছে)" : `${n > 0 ? "+" : "−"}${tk(Math.abs(n))} ${n > 0 ? "বেশি" : "কম"}`);

function dayBefore(iso: string) {
  const d = new Date(`${iso}T12:00:00+06:00`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** drawer money the app expects at the end of a day */
async function expectedDrawer(date: string) {
  const s = await fetchCashSummary({ to: date });
  return Math.round((s.purses?.cash ?? s.net) * 100) / 100;
}

export function useDayCloses() {
  return useQuery({
    queryKey: ["cash-day-closes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cash_day_closes")
        .select("id, close_date, expected, counted, difference, note")
        .order("close_date", { ascending: false })
        .limit(10);
      if (error) throw error;
      return (data ?? []).map((r) => ({ ...r, expected: Number(r.expected), counted: Number(r.counted), difference: r.difference === null ? null : Number(r.difference) })) as DayClose[];
    },
  });
}

/** One printable page for the day: every line, hand cash before and after, the count and a signature line. */
export async function printDaySheet(date: string, close?: DayClose | null) {
  const [rows, before, after] = await Promise.all([
    fetchCashHistory({ from: date, to: date }),
    fetchCashSummary({ to: dayBefore(date) }),
    fetchCashSummary({ to: date }),
  ]);
  const inn = rows.filter((r) => r.dir === "in").reduce((a, r) => a + r.amount, 0);
  const out = rows.filter((r) => r.dir === "out").reduce((a, r) => a + r.amount, 0);
  const totals: [string, string][] = [
    ["দিনের শুরুতে হাতে নগদ (মোট)", tk(before.net)],
    ["আজ এসেছে", tk(inn)],
    ["আজ গেছে", tk(out)],
    ["দিনের শেষে হাতে নগদ (মোট)", tk(after.net)],
    ["এর মধ্যে ড্রয়ারে থাকার কথা", tk(after.purses?.cash ?? after.net)],
  ];
  if (close) {
    totals.push(["গুনে পাওয়া", tk(close.counted)]);
    totals.push(["গরমিল", signed(close.difference ?? close.counted - close.expected)]);
  }
  totals.push(["স্বাক্ষর", "______________________"]);
  printTable({
    title: "দৈনিক ক্যাশ শিট",
    subtitle: `${bnDate(date)} · সি ডি বি ব্রিকস${close?.note ? ` · ${close.note}` : ""}`,
    headers: ["নাম / বিবরণ", "খাত", "এসেছে", "গেছে"],
    rightCols: [2, 3],
    rows: rows.map((r) => [r.detail || r.note || r.head, r.head, r.dir === "in" ? tk(r.amount) : "", r.dir === "out" ? tk(r.amount) : ""]),
    totals,
  });
}

export function DayCloseDialog({ open, onOpenChange, date: dateProp }: { open: boolean; onOpenChange: (open: boolean) => void; date?: string }) {
  const { data: me } = useCurrentUser();
  const [date, setDate] = useState(todayBD());
  const [counted, setCounted] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!open) return;
    setDate(dateProp ?? todayBD()); setCounted(""); setNote("");
  }, [open, dateProp]);

  const expectedQ = useQuery({
    queryKey: ["day-close-expected", date],
    enabled: open && !!date,
    queryFn: () => expectedDrawer(date),
  });
  const expected = expectedQ.data ?? null;
  const c = Number(counted);
  const hasCount = counted.trim() !== "" && Number.isFinite(c) && c >= 0;
  const diff = hasCount && expected !== null ? c - expected : null;
  const gap = diff !== null && Math.abs(diff) >= 1;

  const save = useMutation({
    mutationFn: async () => {
      if (!date) throw new Error("তারিখ দিন");
      if (date > todayBD()) throw new Error("আগামী দিনের হিসাব বন্ধ করা যায় না");
      if (!hasCount) throw new Error("ড্রয়ারে গুনে কত পেলেন, লিখুন");
      if (expected === null) throw new Error("হিসাব এখনো আসেনি, একটু অপেক্ষা করুন");
      if (gap && !note.trim()) throw new Error("গরমিলের কারণ লিখুন (যেমন: কোন এন্ট্রি বাকি)");
      if (!me?.user.id) throw new Error("আবার লগইন করুন");
      const { error } = await supabase.from("cash_day_closes").insert({
        close_date: date, expected, counted: c, note: note.trim() || null, closed_by: me.user.id,
      });
      if (error) throw new Error(error.code === "23505" ? "এই দিন আগেই বন্ধ করা হয়েছে" : error.message);
    },
    onSuccess: () => { toast.success(gap ? "দিন বন্ধ হলো, গরমিল লেখা রইল" : "দিন বন্ধ হলো, হিসাব মিলেছে"); onOpenChange(false); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>দিন বন্ধ</DialogTitle>
          <DialogDescription>ড্রয়ারের টাকা গুনে লিখুন। অ্যাপের হিসাবের সাথে মিলিয়ে দিনটা বন্ধ হবে।</DialogDescription>
        </DialogHeader>

        <div className="space-y-3.5">
          <div className="space-y-1">
            <Label className="text-xs">কোন দিন</Label>
            <Input className="h-11" type="date" value={date} max={todayBD()} onChange={(e) => setDate(e.target.value)} />
          </div>

          <div className="rounded-2xl bg-muted p-3">
            <div className="text-xs font-semibold text-muted-foreground">ড্রয়ারে থাকার কথা (অ্যাপের হিসাবে)</div>
            {expectedQ.isLoading ? (
              <Loader2 className="mt-1 h-5 w-5 animate-spin text-muted-foreground" />
            ) : (
              <div className="num text-2xl font-bold">{expected === null ? "—" : tk(expected)}</div>
            )}
            <p className="mt-1 text-[11px] text-muted-foreground">বিকাশ/নগদ আর ব্যাংকের টাকা এতে নেই। সেগুলো "টাকা সরানো" দিয়ে মেলান।</p>
          </div>

          <Section label="গুনে কত পেলেন *">
            <Input className="h-11" type="number" min="0" step="1" inputMode="numeric" value={counted} placeholder="০" onChange={(e) => setCounted(e.target.value)} />
            {diff !== null && (
              <p className={`num text-sm font-bold ${gap ? (diff > 0 ? "text-info" : "text-destructive") : "text-success"}`}>
                {gap ? `গরমিল: ${signed(diff)}` : "হিসাব মিলেছে"}
              </p>
            )}
          </Section>

          <div className="space-y-1">
            <Label className="text-xs">{gap ? "গরমিলের কারণ *" : "নোট"}</Label>
            <Input className="h-11" value={note} onChange={(e) => setNote(e.target.value)} placeholder={gap ? "যেমন: চা-নাস্তার খরচ লেখা হয়নি" : "ঐচ্ছিক"} />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>বাতিল</Button>
          <Button type="button" onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}দিন বন্ধ করুন
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Today's close (or a button to do it) and the last few days, for the cash book. */
export function DayCloseCard() {
  const { data: me } = useCurrentUser();
  const isAdmin = me?.role === "admin";
  const closesQ = useDayCloses();
  const [open, setOpen] = useState(false);
  const [openDate, setOpenDate] = useState<string | undefined>(undefined);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [printing, setPrinting] = useState<string | null>(null);
  // the last closed days fold under the one-line card
  const [showList, setShowList] = useState(false);
  const today = todayBD();
  const yesterday = dayBefore(today);
  const rows = closesQ.data ?? [];
  const todayClose = rows.find((r) => r.close_date === today);
  const yesterdayClosed = rows.some((r) => r.close_date === yesterday);

  // a later change to a closed day's entries shows up as a new expected figure
  const changedQ = useQuery({
    queryKey: ["day-close-changed", todayClose?.id, todayClose?.expected],
    enabled: !!todayClose,
    queryFn: () => expectedDrawer(today),
  });
  const changedSince = !!todayClose && changedQ.data !== undefined && Math.abs(changedQ.data - todayClose.expected) >= 1;

  const reopen = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("cash_day_closes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("দিনটা আবার খোলা হলো"); setConfirmId(null); },
    onError: (e: Error) => toast.error(e.message),
  });

  const print = async (date: string, close?: DayClose | null) => {
    setPrinting(date);
    try { await printDaySheet(date, close); } catch (e) { toast.error((e as Error).message); } finally { setPrinting(null); }
  };
  const start = (d?: string) => { setOpenDate(d); setOpen(true); };

  // one line: status, print today's sheet, close today; the last closed days fold under it
  return (
    <section className="rounded-2xl border bg-card px-3 py-2.5">
      <div className="flex items-center gap-2">
        {todayClose
          ? <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" />
          : <Lock className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />}
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold">দিন বন্ধ</div>
          <div className={`num truncate text-[11px] ${todayClose ? "font-semibold text-emerald-700 dark:text-emerald-300" : "text-muted-foreground"}`}>
            {todayClose ? `আজ বন্ধ হয়েছে · গুনে ${tk(todayClose.counted)} · ${signed(todayClose.difference ?? 0)}` : "আজ এখনো বন্ধ হয়নি"}
          </div>
        </div>
        <Button type="button" size="icon" variant="ghost" className="h-9 w-9 shrink-0" aria-label="আজকের শিট প্রিন্ট" disabled={printing === today} onClick={() => void print(today, todayClose)}>
          {printing === today ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
        </Button>
        {!todayClose && (
          <Button type="button" size="sm" className="h-9 shrink-0 rounded-lg px-3 font-bold" onClick={() => start(today)}>বন্ধ করুন</Button>
        )}
        {rows.length > 0 && (
          <Button type="button" size="icon" variant="ghost" className="h-9 w-9 shrink-0" aria-label={showList ? "আগের দিন লুকান" : "আগের বন্ধ দিনগুলো দেখুন"} aria-expanded={showList} onClick={() => setShowList((v) => !v)}>
            <ChevronDown className={`h-4 w-4 transition ${showList ? "rotate-180" : ""}`} />
          </Button>
        )}
      </div>
      {changedSince && (
        <p className="mt-1.5 text-xs font-semibold text-warning">দিন বন্ধের পরে আজকের এন্ট্রি বদলেছে। এখন ড্রয়ারে থাকার কথা {tk(changedQ.data ?? 0)}।</p>
      )}
      {!yesterdayClosed && !closesQ.isLoading && (
        <button type="button" onClick={() => start(yesterday)} className="mt-1 text-xs font-bold text-primary">গতকাল ({bnDate(yesterday)}) বন্ধ হয়নি, এখন করুন</button>
      )}

      {showList && rows.length > 0 && (
        <ul className="mt-2 divide-y rounded-xl border text-sm">
          {rows.slice(0, 5).map((r) => (
            <li key={r.id} className="flex items-center gap-2 px-3 py-2">
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{bnDate(r.close_date)}</span>
                <span className="num block truncate text-xs text-muted-foreground">গুনে {tk(r.counted)} · {signed(r.difference ?? 0)}{r.note ? ` · ${r.note}` : ""}</span>
              </span>
              <Button type="button" size="icon" variant="ghost" className="h-8 w-8" aria-label="শিট প্রিন্ট" disabled={printing === r.close_date} onClick={() => void print(r.close_date, r)}>
                {printing === r.close_date ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
              </Button>
              {isAdmin && (
                confirmId === r.id ? (
                  <Button type="button" size="sm" variant="destructive" className="h-8" disabled={reopen.isPending} onClick={() => reopen.mutate(r.id)}>খুলবেন?</Button>
                ) : (
                  <Button type="button" size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setConfirmId(r.id)}>আবার খুলুন</Button>
                )
              )}
            </li>
          ))}
        </ul>
      )}

      <DayCloseDialog open={open} onOpenChange={setOpen} date={openDate} />
    </section>
  );
}
