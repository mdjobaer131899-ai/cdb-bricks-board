import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeftRight, ArrowRight, Landmark, Loader2, Smartphone, Trash2, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Chips, Section, tk } from "@/components/money-form-parts";
import { supabase } from "@/integrations/supabase/client";
import { PAY_METHODS, type Purse } from "@/lib/cash-queries";
import { bnDate, todayBD } from "@/lib/format";
import { useCurrentUser } from "@/lib/use-current-user";

const PURSES: Purse[] = ["cash", "mobile", "bank"];
const METHOD_LABEL: Record<string, string> = Object.fromEntries(PAY_METHODS);

/** The usual moves, one tap each; any pair can still be picked below. */
const PRESETS: Array<{ key: string; label: string; from: string; to: string }> = [
  { key: "bank>cash", label: "ব্যাংক থেকে তুললাম", from: "bank", to: "cash" },
  { key: "cash>bank", label: "ব্যাংকে জমা দিলাম", from: "cash", to: "bank" },
  { key: "bkash>cash", label: "বিকাশ থেকে তুললাম", from: "bkash", to: "cash" },
  { key: "cash>bkash", label: "বিকাশে পাঠালাম", from: "cash", to: "bkash" },
];

const PURSE_ICON: Record<Purse, typeof Wallet> = { cash: Wallet, mobile: Smartphone, bank: Landmark };
const PURSE_SHORT: Record<Purse, string> = { cash: "ড্রয়ারে", mobile: "বিকাশ/নগদে", bank: "ব্যাংকে" };

/**
 * Hand cash split by where it sits (drawer, bKash/Nagad, bank): three small tiles on a light
 * card (dashboard and cash book), with a button to record money moved between them.
 */
export function PurseTiles({ purses }: { purses?: Record<Purse, number> | null }) {
  const [open, setOpen] = useState(false);
  if (!purses) return null;
  return (
    <div className="mt-4">
      <div className="grid grid-cols-3 gap-2">
        {PURSES.map((p) => {
          const Icon = PURSE_ICON[p];
          const v = purses[p];
          return (
            <div key={p} className="min-w-0 rounded-xl bg-muted/70 px-2.5 py-2">
              <span className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground">
                <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate">{PURSE_SHORT[p]}</span>
              </span>
              <span className={`num mt-0.5 block truncate text-[15px] font-bold ${v < -0.5 ? "text-destructive" : ""}`}>
                {v < -0.5 ? "−" : ""}{tk(Math.abs(v))}
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 flex justify-end">
        <button type="button" onClick={() => setOpen(true)} className="flex items-center gap-1 py-1 text-xs font-bold text-primary">
          <ArrowLeftRight className="h-3.5 w-3.5" aria-hidden="true" /> টাকা সরানো
        </button>
      </div>
      <TransferDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}

type TransferRow = { id: string; transfer_date: string; from_method: string; to_method: string; amount: number; note: string | null };

/** Money moved between the drawer, mobile banking and the bank: the total stays the same. */
export function TransferDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { data: me } = useCurrentUser();
  const isAdmin = me?.role === "admin";
  const [from, setFrom] = useState("bank");
  const [to, setTo] = useState("cash");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayBD());
  const [note, setNote] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setFrom("bank"); setTo("cash"); setAmount(""); setDate(todayBD()); setNote(""); setConfirmId(null);
  }, [open]);

  const listQ = useQuery({
    queryKey: ["cash-transfers"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cash_transfers")
        .select("id, transfer_date, from_method, to_method, amount, note")
        .order("transfer_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return (data ?? []) as TransferRow[];
    },
  });

  // a successful mutation refreshes every query (router.tsx), so the purses update at once
  const save = useMutation({
    mutationFn: async () => {
      const amt = Number(amount);
      if (!(amt > 0)) throw new Error("কত টাকা, লিখুন");
      if (from === to) throw new Error("কোথা থেকে আর কোথায়, দুটো আলাদা বেছে নিন");
      if (!date) throw new Error("তারিখ দিন");
      if (!me?.user.id) throw new Error("আবার লগইন করুন");
      const { error } = await supabase.from("cash_transfers").insert({
        transfer_date: date, from_method: from, to_method: to, amount: amt, note: note.trim() || null, created_by: me.user.id,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("টাকা সরানো লেখা হয়েছে"); onOpenChange(false); },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("cash_transfers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("মুছে ফেলা হয়েছে"); setConfirmId(null); },
    onError: (e: Error) => toast.error(e.message),
  });

  const preset = `${from}>${to}`;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>টাকা সরানো</DialogTitle>
          <DialogDescription>
            ব্যাংক থেকে তোলা, ব্যাংকে জমা বা বিকাশে পাঠানো। মোট হাতে নগদ বদলায় না, শুধু কোথায় আছে তা বদলায়।
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3.5">
          <Chips
            value={preset}
            onChange={(k) => { const p = PRESETS.find((x) => x.key === k); if (p) { setFrom(p.from); setTo(p.to); } }}
            options={PRESETS.map((p) => [p.key, p.label])}
            small
          />

          <Section label="কোথা থেকে">
            <Chips value={from} onChange={setFrom} options={PAY_METHODS} small />
          </Section>
          <Section label="কোথায়">
            <Chips value={to} onChange={setTo} options={PAY_METHODS} small />
          </Section>

          <Section label="কত টাকা *">
            <Input className="h-11" type="number" min="0" step="0.01" inputMode="decimal" value={amount} placeholder="০" onChange={(e) => setAmount(e.target.value)} />
          </Section>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">তারিখ</Label>
              <Input className="h-11" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">নোট</Label>
              <Input className="h-11" value={note} onChange={(e) => setNote(e.target.value)} placeholder="ঐচ্ছিক" />
            </div>
          </div>

          {(listQ.data ?? []).length > 0 && (
            <div className="space-y-1.5">
              <div className="text-xs font-bold text-muted-foreground">শেষ কয়েকটি</div>
              <ul className="divide-y rounded-2xl border">
                {(listQ.data ?? []).map((t) => (
                  <li key={t.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1 font-semibold">
                        {METHOD_LABEL[t.from_method] ?? t.from_method} <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /> {METHOD_LABEL[t.to_method] ?? t.to_method}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">{bnDate(t.transfer_date)}{t.note ? ` · ${t.note}` : ""}</span>
                    </span>
                    <b className="num">{tk(Number(t.amount))}</b>
                    {isAdmin && (
                      confirmId === t.id ? (
                        <Button type="button" size="sm" variant="destructive" className="h-8" disabled={remove.isPending} onClick={() => remove.mutate(t.id)}>
                          মুছুন?
                        </Button>
                      ) : (
                        <Button type="button" size="icon" variant="ghost" className="h-8 w-8" aria-label="মুছুন" onClick={() => setConfirmId(t.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>বাতিল</Button>
          <Button type="button" onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}সংরক্ষণ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
