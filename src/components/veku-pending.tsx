import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, ClipboardList, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { createExpense } from "@/lib/expenses.functions";
import { bn, bnDate } from "@/lib/format";
import { useCurrentUser } from "@/lib/use-current-user";
import { VEKU_KHORAKI, VEKU_SEP, makeVekuNote, parseVekuNote } from "@/components/contract-config";

/**
 * Lines that do not match the paper veku ledger yet (table veku_pending). The account counts
 * only what matches; these wait here, outside every total, until the owner settles them:
 *  - খাতায় আছে, অ্যাপে নেই (side paper): "তুলুন" writes the real row (a veku payment, or the
 *    kiln's khoraki expense), "বাদ" drops it
 *  - অ্যাপে আছে, খাতায় নেই (side app, payment_id): already counted; "ঠিক আছে" keeps it,
 *    "মুছুন" deletes that payment, or takes off only the part that is too much
 */

const tk = (n: number) => `৳${bn(Math.round(n))}`;

export type PendingRow = {
  id: string; supplier_id: string; item_date: string; side: "paper" | "app"; kind: string; label: string;
  amount: number; note: string | null; payment_id: string | null;
};
type Veku = { id: string; name: string };
type PayLite = { id: string; supplier_id: string; amount: number; note: string | null; payment_date: string };

export function useVekuPending() {
  return useQuery({
    queryKey: ["veku-pending"],
    queryFn: async () => {
      const { data, error } = await supabase.from("veku_pending")
        .select("id, supplier_id, item_date, side, kind, label, amount, note, payment_id")
        .eq("status", "pending").order("item_date");
      if (error) throw error;
      return (data ?? []).map((r) => ({ ...r, amount: Number(r.amount) })) as PendingRow[];
    },
  });
}

export function VekuPendingCard({ rows, vekus, pays, filter, onDone }: {
  rows: PendingRow[];
  vekus: Veku[];
  pays: PayLite[];
  filter: string;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const { data: me } = useCurrentUser();
  const isAdmin = me?.role === "admin";
  const createExp = useServerFn(createExpense);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [entry, setEntry] = useState<{ row: PendingRow; amount: string; date: string } | null>(null);

  const shown = rows.filter((r) => filter === "all" || r.supplier_id === filter);
  if (!shown.length) return null;
  const paper = shown.filter((r) => r.side === "paper");
  const app = shown.filter((r) => r.side === "app");
  const sum = (l: PendingRow[]) => l.reduce((a, r) => a + r.amount, 0);
  const nameOf = (id: string) => vekus.find((v) => v.id === id)?.name ?? "—";
  const many = filter === "all" && vekus.length > 1;
  const dieselBoth = paper.some((r) => r.kind === "ডিজেল") && app.some((r) => r.kind === "ডিজেল");

  // the driver last written for that veku
  const driverOf = (sid: string) => {
    const mine = pays.filter((p) => p.supplier_id === sid).sort((a, b) => (a.payment_date < b.payment_date ? 1 : -1));
    for (const p of mine) { const d = parseVekuNote(p.note).driver; if (d) return d; }
    return "";
  };

  const settle = async (id: string, status: "done" | "dropped") => {
    const { error } = await supabase.from("veku_pending")
      .update({ status, resolved_at: new Date().toISOString(), resolved_by: me?.user.id ?? null }).eq("id", id);
    if (error) throw error;
  };
  const refresh = () => {
    qc.invalidateQueries();
    onDone();
  };
  const run = async (id: string, fn: () => Promise<void>, ok: string) => {
    setBusy(id);
    try {
      await fn();
      toast.success(ok);
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  /** write the paper line into the app, then close it */
  const enter = async () => {
    if (!entry) return;
    const { row } = entry;
    const amount = Number(entry.amount || 0);
    if (!(amount > 0)) return toast.error("টাকার পরিমাণ দিন");
    if (!entry.date) return toast.error("তারিখ দিন");
    const uid = me?.user.id;
    if (!uid) return toast.error("আবার লগইন করুন");
    const veku = vekus.find((v) => v.id === row.supplier_id);
    const driver = driverOf(row.supplier_id);
    await run(row.id, async () => {
      if (row.kind === "খোরাকি") {
        await createExp({ data: {
          category: VEKU_KHORAKI, amount, expense_date: entry.date, method: "cash",
          note: [veku?.name ?? "ভেকু", driver ? `চালক: ${driver}` : "", row.label].filter(Boolean).join(VEKU_SEP),
        } });
      } else {
        const { error } = await supabase.from("supplier_payments").insert({
          supplier_id: row.supplier_id, amount, payment_date: entry.date, method: "cash", created_by: uid,
          note: makeVekuNote(row.kind, driver, [row.label, "ভেকুর খাতা থেকে"].join(VEKU_SEP)),
        });
        if (error) throw error;
      }
      await settle(row.id, "done");
      setEntry(null);
    }, "অ্যাপে তোলা হয়েছে");
  };

  /** an app line that is not on paper: delete the payment, or take off only the extra part */
  const remove = (row: PendingRow) => {
    const pay = pays.find((p) => p.id === row.payment_id);
    if (!pay) return toast.error("এই টাকার লাইনটা আর নেই");
    const whole = Math.abs(Number(pay.amount) - row.amount) < 0.5;
    const ask = whole
      ? `${bnDate(pay.payment_date)}-এর ${tk(row.amount)} অ্যাপ থেকে মুছবেন? হাতে নগদ ${tk(row.amount)} বাড়বে।`
      : `${bnDate(pay.payment_date)}-এর ${tk(Number(pay.amount))} থেকে ${tk(row.amount)} কমাবেন? হাতে নগদ ${tk(row.amount)} বাড়বে।`;
    if (!confirm(ask)) return;
    void run(row.id, async () => {
      if (whole) {
        // the pending row goes with the payment (on delete cascade)
        const { error } = await supabase.from("supplier_payments").delete().eq("id", pay.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("supplier_payments").update({ amount: Math.round((Number(pay.amount) - row.amount) * 100) / 100 }).eq("id", pay.id);
        if (error) throw error;
        await settle(row.id, "done");
      }
    }, whole ? "মুছে ফেলা হয়েছে" : "কমানো হয়েছে");
  };

  const line = (r: PendingRow, actions: React.ReactNode) => (
    <div key={r.id} className="flex items-start gap-2 px-3.5 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="break-words text-sm font-semibold">{r.label}</div>
        <div className="break-words text-xs text-muted-foreground">
          {[bnDate(r.item_date), many ? nameOf(r.supplier_id) : "", r.kind].filter(Boolean).join(" · ")}
        </div>
        {r.note && <div className="mt-0.5 break-words text-xs text-warning">{r.note}</div>}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <b className="num text-sm">{tk(r.amount)}</b>
        {isAdmin && <div className="flex gap-1">{actions}</div>}
      </div>
    </div>
  );
  const small = "h-8 rounded-lg px-2.5 text-xs font-bold";

  return (
    <section className="overflow-hidden rounded-2xl border border-warning/40 bg-card">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open}
        className="flex w-full items-center gap-3 px-3.5 py-3 text-left">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-warning/15 text-warning"><ClipboardList className="h-5 w-5" /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold">খাতার সাথে মেলানো বাকি · {bn(shown.length)}টা লাইন</span>
          <span className="num block text-xs text-muted-foreground">
            {paper.length > 0 && `খাতায় আছে, অ্যাপে নেই ${tk(sum(paper))}`}
            {paper.length > 0 && app.length > 0 && " · "}
            {app.length > 0 && `অ্যাপে আছে, খাতায় নেই ${tk(sum(app))}`}
          </span>
        </span>
        <ChevronDown className={`h-5 w-5 shrink-0 text-muted-foreground transition ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>

      {open && (
        <div className="border-t">
          {dieselBoth && (
            <p className="bg-warning/10 px-3.5 py-2 text-xs font-semibold text-warning">
              ডিজেল: দুই দিকের ডিজেল একই টাকা হতে পারে। আগে খাতা দেখে মিলিয়ে নিন, তারপর তুলুন বা মুছুন।
            </p>
          )}
          {paper.length > 0 && (
            <>
              <div className="bg-muted/40 px-3.5 py-2">
                <div className="text-sm font-bold">খাতায় আছে, অ্যাপে তোলা হয়নি · {tk(sum(paper))}</div>
                <div className="text-xs text-muted-foreground">এগুলো এখনো কোনো হিসাবে ধরা নেই। খাতা দেখে ঠিক থাকলে "তুলুন" চাপুন।</div>
              </div>
              <div className="divide-y">
                {paper.map((r) => line(r, (
                  <>
                    <Button size="sm" className={small} disabled={busy === r.id} onClick={() => setEntry({ row: r, amount: String(r.amount), date: r.item_date })}>তুলুন</Button>
                    <Button size="sm" variant="outline" className={small} disabled={busy === r.id}
                      onClick={() => { if (confirm(`"${r.label}" বাদ দেবেন? অ্যাপে উঠবে না।`)) void run(r.id, () => settle(r.id, "dropped"), "বাদ দেওয়া হলো"); }}>বাদ</Button>
                  </>
                )))}
              </div>
            </>
          )}
          {app.length > 0 && (
            <>
              <div className="border-t bg-muted/40 px-3.5 py-2">
                <div className="text-sm font-bold">অ্যাপে আছে, খাতায় নেই · {tk(sum(app))}</div>
                <div className="text-xs text-muted-foreground">এগুলো হিসাবে ধরা আছে। টাকাটা সত্যি দেওয়া হলে "ঠিক আছে" চাপুন (খাতায়ও লিখে নিন), ভুল হলে "মুছুন"।</div>
              </div>
              <div className="divide-y">
                {app.map((r) => line(r, (
                  <>
                    <Button size="sm" variant="outline" className={small} disabled={busy === r.id}
                      onClick={() => void run(r.id, () => settle(r.id, "done"), "রেখে দেওয়া হলো")}>ঠিক আছে</Button>
                    <Button size="sm" variant="outline" className={`${small} text-destructive`} disabled={busy === r.id} onClick={() => remove(r)}>মুছুন</Button>
                  </>
                )))}
              </div>
            </>
          )}
          {!isAdmin && <p className="border-t px-3.5 py-2 text-xs text-muted-foreground">শুধু অ্যাডমিন এগুলো তুলতে বা মুছতে পারেন।</p>}
        </div>
      )}

      {/* enter one paper line */}
      <Dialog open={!!entry} onOpenChange={(o) => { if (!o) setEntry(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>অ্যাপে তুলুন</DialogTitle>
            <DialogDescription>
              {entry ? `${nameOf(entry.row.supplier_id)} · ${entry.row.label}${entry.row.kind === "খোরাকি" ? " (ভাটার খরচ)" : ""}` : ""}
            </DialogDescription>
          </DialogHeader>
          {entry && (
            <div className="space-y-3">
              {entry.row.note && <p className="rounded-xl bg-warning/10 px-3 py-2 text-xs text-warning">{entry.row.note}</p>}
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">টাকা (খাতা দেখে ঠিক করুন)</Label>
                  <Input className="num h-11" type="number" min="0" inputMode="decimal" value={entry.amount} onChange={(e) => setEntry({ ...entry, amount: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">তারিখ</Label>
                  <Input className="h-11" type="date" value={entry.date} onChange={(e) => setEntry({ ...entry, date: e.target.value })} />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">ক্যাশ থেকে দেওয়া ধরা হবে; হাতে নগদ এই টাকা কমবে।</p>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEntry(null)}>বাতিল</Button>
            <Button onClick={() => void enter()} disabled={!!busy}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}তুলুন</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
