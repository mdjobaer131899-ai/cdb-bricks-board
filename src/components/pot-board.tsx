import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, ChevronRight, ImageIcon, Loader2, RefreshCw, Settings2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { bn, bnDate, todayBD } from "@/lib/format";
import { useCurrentUser } from "@/lib/use-current-user";
import { fetchMills, type Mill } from "@/lib/production";
import {
  deletePotCount, fetchPotCounts, fetchPotDays, fetchPots, photoUrl, resyncPotDay, savePotCount, setMillPots,
  type Pot, type PotCount,
} from "@/lib/pots";

/**
 * পটের হিসাব: each mill's drying beds as numbered tiles for a day. Tap a bed, write its count
 * (and take a photo if wanted), "সেভ, পরের পট" moves on. The database adds the mill's beds into
 * one kacha production line for the day, so the sardar's wage and stock follow by themselves.
 */
export function PotBoard({ productionRows, sardarName }: {
  /** this season's production lines (to warn when a hand-written line exists for the same mill and day) */
  productionRows: any[];
  sardarName: (id: string | null) => string;
}) {
  const qc = useQueryClient();
  const { data: me } = useCurrentUser();
  const isAdmin = me?.role === "admin";
  const [date, setDate] = useState(todayBD());
  const [millId, setMillId] = useState<string | null>(null);
  const [open, setOpen] = useState<Pot | null>(null);
  const [setup, setSetup] = useState(false);

  const millsQ = useQuery({ queryKey: ["mills"], queryFn: fetchMills });
  const potsQ = useQuery({ queryKey: ["drying-pots"], queryFn: fetchPots });
  const countsQ = useQuery({ queryKey: ["pot-counts", date], queryFn: () => fetchPotCounts(date) });
  const daysQ = useQuery({ queryKey: ["pot-days", date], queryFn: () => fetchPotDays(date) });

  const mills = (millsQ.data ?? []) as Mill[];
  const pots = (potsQ.data ?? []).filter((p) => p.active);
  const counts = countsQ.data ?? [];
  const countOf = useMemo(() => new Map(counts.map((c) => [c.pot_id, c])), [counts]);

  useEffect(() => {
    if (!millId && mills.length) setMillId(mills[0].id);
  }, [mills, millId]);

  const millPots = pots.filter((p) => p.mill_id === millId).sort((a, b) => a.pot_no - b.pot_no);
  const millSum = (id: string) => pots.filter((p) => p.mill_id === id).reduce((a, p) => a + (countOf.get(p.id)?.quantity ?? 0), 0);
  const counted = millPots.filter((p) => countOf.has(p.id)).length;
  const total = millId ? millSum(millId) : 0;
  const link = (daysQ.data ?? []).find((d) => d.mill_id === millId);
  // a production line for this mill and day that the beds did not make
  const handLines = productionRows.filter((r) => r.entry_type === "production" && r.mill_id === millId && r.entry_date === date && r.id !== link?.kacha_entry_id);

  const refresh = () => {
    for (const k of [["pot-counts", date], ["pot-days", date], ["kacha-brick-entries"], ["kacha-by-sardar"], ["drying-pots"]]) qc.invalidateQueries({ queryKey: k });
  };

  const nextPot = (after: Pot): Pot | null => {
    const later = millPots.filter((p) => p.pot_no > after.pot_no);
    return later.find((p) => !countOf.has(p.id)) ?? later[0] ?? null;
  };

  const mill = mills.find((m) => m.id === millId);

  return (
    <section className="rounded-[20px] border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-bold">পটের হিসাব</h2>
          <p className="text-xs text-muted-foreground">মাঠে বিছানো ইট পট ধরে গুনে লিখুন। মিলের সব পটের যোগফল নিজে থেকে কাঁচা ইটের খাতায় ওঠে।</p>
        </div>
        <div className="flex items-center gap-2">
          <Input type="date" value={date} max={todayBD()} onChange={(e) => e.target.value && setDate(e.target.value)} className="h-10 w-[9.5rem]" aria-label="তারিখ" />
          {isAdmin && (
            <Button variant="outline" className="h-10 gap-1 rounded-xl px-3" onClick={() => setSetup(true)}>
              <Settings2 className="h-4 w-4" /> পট সাজান
            </Button>
          )}
        </div>
      </div>

      {/* mills */}
      <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
        {millsQ.isLoading ? <Skeleton className="h-14 w-full" /> : mills.map((m) => {
          const on = m.id === millId;
          return (
            <button key={m.id} type="button" onClick={() => setMillId(m.id)}
              className={`shrink-0 rounded-2xl border px-3.5 py-2 text-left transition ${on ? "border-primary bg-primary text-primary-foreground" : "bg-background"}`}>
              <div className="text-sm font-bold">{m.name}</div>
              <div className={`num text-xs ${on ? "text-primary-foreground/85" : "text-muted-foreground"}`}>{bn(millSum(m.id))} ইট</div>
            </button>
          );
        })}
      </div>

      {/* beds */}
      {potsQ.isLoading || countsQ.isLoading ? (
        <div className="mt-3 grid grid-cols-4 gap-2"><Skeleton className="h-16" /><Skeleton className="h-16" /><Skeleton className="h-16" /><Skeleton className="h-16" /></div>
      ) : millPots.length === 0 ? (
        <div className="mt-3 rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          {mill?.name ?? "এই মিলে"} পট সাজানো হয়নি।{isAdmin ? " উপরের \"পট সাজান\" চেপে কয়টা পট আছে লিখুন।" : " অ্যাডমিনকে পট সাজাতে বলুন।"}
        </div>
      ) : (
        <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-6">
          {millPots.map((p) => {
            const c = countOf.get(p.id);
            return (
              <button key={p.id} type="button" onClick={() => setOpen(p)}
                className={`relative rounded-2xl border px-2 py-2.5 text-center transition active:scale-[0.97] ${c ? "border-primary/30 bg-primary/5" : "border-dashed bg-background"}`}>
                <div className="text-[11px] font-semibold text-muted-foreground">পট {bn(p.pot_no)}</div>
                <div className={`num mt-0.5 text-base font-extrabold ${c ? "" : "text-muted-foreground/60"}`}>{c ? bn(c.quantity) : "—"}</div>
                {c?.photo_path && <ImageIcon className="absolute right-1.5 top-1.5 h-3 w-3 text-primary/70" aria-label="ছবি আছে" />}
              </button>
            );
          })}
        </div>
      )}

      {/* the mill's day */}
      {millPots.length > 0 && (
        <div className="mt-3 space-y-2 rounded-2xl bg-muted/60 p-3 text-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span>{mill?.name} · {bnDate(date)} · <b>{bn(counted)}</b>/{bn(millPots.length)} পট গোনা</span>
            <span className="num text-base font-extrabold">{bn(total)} ইট</span>
          </div>
          {total > 0 && (link ? (
            <div className="text-xs text-emerald-700 dark:text-emerald-400">✓ কাঁচা ইটের খাতায় উঠেছে{mill?.sardar_id ? ` (${sardarName(mill.sardar_id)})` : ""}</div>
          ) : (
            <div className="flex items-center justify-between gap-2 text-xs text-amber-700 dark:text-amber-400">
              <span>খাতায় এই দিনের লাইনটা নেই (হয়তো মুছে ফেলা হয়েছে)।</span>
              <Button size="sm" variant="outline" className="h-8 gap-1 rounded-lg text-xs" onClick={async () => {
                try { await resyncPotDay(millId!, date); refresh(); toast.success("খাতায় তোলা হয়েছে"); } catch (e) { toast.error((e as Error).message); }
              }}><RefreshCw className="h-3.5 w-3.5" /> আবার তুলুন</Button>
            </div>
          ))}
          {handLines.length > 0 && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
              এই দিনে {mill?.name}-এর হাতে লেখা কাঁচা ইটের লাইনও আছে ({bn(handLines.reduce((a, r) => a + Number(r.quantity || 0), 0))} ইট)। পটের হিসাব আলাদা লাইনে যোগ হচ্ছে, দুবার গোনা হয়ে যাচ্ছে কিনা দেখুন; দরকার হলে নিচের তালিকা থেকে হাতে লেখাটা মুছুন।
            </div>
          )}
        </div>
      )}

      {open && mill && (
        <PotDialog
          pot={open}
          mill={mill}
          date={date}
          existing={countOf.get(open.id) ?? null}
          canDelete={(c) => isAdmin || (c.created_by === me?.user.id && Date.now() - new Date(c.created_at).getTime() < 12 * 3600_000)}
          onClose={() => setOpen(null)}
          onSaved={(again) => {
            refresh();
            if (again) {
              const n = nextPot(open);
              setOpen(n);
              if (!n) toast.success(`${mill.name}-এর শেষ পট`);
            } else setOpen(null);
          }}
        />
      )}
      {setup && <PotSetupDialog mills={mills} pots={potsQ.data ?? []} onClose={() => setSetup(false)} onDone={() => { qc.invalidateQueries({ queryKey: ["drying-pots"] }); setSetup(false); }} />}
    </section>
  );
}

function PotDialog({ pot, mill, date, existing, canDelete, onClose, onSaved }: {
  pot: Pot;
  mill: Mill;
  date: string;
  existing: PotCount | null;
  canDelete: (c: PotCount) => boolean;
  onClose: () => void;
  onSaved: (again: boolean) => void;
}) {
  const { data: me } = useCurrentUser();
  const [qty, setQty] = useState(existing ? String(existing.quantity) : "");
  const [note, setNote] = useState(existing?.note ?? "");
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const camRef = useRef<HTMLInputElement>(null);
  const qtyRef = useRef<HTMLInputElement>(null);

  // a new bed: start fresh (the dialog stays open on "সেভ, পরের পট")
  useEffect(() => {
    setQty(existing ? String(existing.quantity) : "");
    setNote(existing?.note ?? "");
    setPhoto(null);
    setPreview(null);
    if (existing?.photo_path) void photoUrl(existing.photo_path).then(setPreview);
    window.setTimeout(() => qtyRef.current?.focus(), 120);
  }, [pot.id, existing?.id]);

  const save = async (again: boolean) => {
    if (!me?.user.id) { toast.error("আবার লগইন করুন"); return; }
    setBusy(true);
    try {
      await savePotCount({
        potId: pot.id, millId: mill.id, potNo: pot.pot_no, date, quantity: Number(qty), note,
        photo, keepPhoto: existing?.photo_path ?? null,
      }, me.user.id);
      toast.success(`পট ${bn(pot.pot_no)}: ${bn(Number(qty))} ইট`);
      onSaved(again);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{mill.name} · পট {bn(pot.pot_no)}</DialogTitle>
          <DialogDescription>{bnDate(date)} — এই পটে কত ইট গুনলেন</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Input ref={qtyRef} type="number" inputMode="numeric" min="1" placeholder="যেমন ১১৫০" value={qty}
            onChange={(e) => setQty(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && Number(qty) > 0) { e.preventDefault(); void save(true); } }}
            className="h-14 text-center font-display text-3xl font-extrabold" />
          <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              setPhoto(f);
              setPreview(URL.createObjectURL(f));
            }} />
          {preview ? (
            <div className="relative overflow-hidden rounded-xl border">
              <img src={preview} alt={`পট ${pot.pot_no}`} className="max-h-48 w-full object-cover" />
              <button type="button" onClick={() => camRef.current?.click()} className="absolute bottom-2 right-2 rounded-lg bg-black/60 px-2 py-1 text-xs font-semibold text-white">আবার তুলুন</button>
            </div>
          ) : (
            <Button type="button" variant="outline" className="h-11 w-full gap-2 rounded-xl" onClick={() => camRef.current?.click()}>
              <Camera className="h-4 w-4" /> পটের ছবি তুলুন (ইচ্ছা হলে)
            </Button>
          )}
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="নোট (ইচ্ছা হলে)" className="h-10" />
          <p className="text-[11px] text-muted-foreground">ছবিগুলো রাখা থাকে; পরে ক্যামেরা দিয়ে নিজে গোনার ব্যবস্থা শেখাতে এগুলোই লাগবে।</p>
        </div>
        <DialogFooter className="flex-row gap-2 sm:justify-between">
          {existing && canDelete(existing) ? (
            <Button variant="ghost" className="h-11 gap-1 text-destructive" disabled={busy} onClick={async () => {
              setBusy(true);
              try { await deletePotCount(existing.id); toast.success("মুছে ফেলা হয়েছে"); onSaved(false); } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
            }}><Trash2 className="h-4 w-4" /> মুছুন</Button>
          ) : <span />}
          <div className="flex gap-2">
            <Button variant="outline" className="h-11 rounded-xl" disabled={busy || !(Number(qty) > 0)} onClick={() => void save(false)}>সেভ</Button>
            <Button className="h-11 gap-1 rounded-xl font-bold" disabled={busy || !(Number(qty) > 0)} onClick={() => void save(true)}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} সেভ, পরের পট <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PotSetupDialog({ mills, pots, onClose, onDone }: { mills: Mill[]; pots: Pot[]; onClose: () => void; onDone: () => void }) {
  const [n, setN] = useState<Record<string, string>>(() =>
    Object.fromEntries(mills.map((m) => [m.id, String(pots.filter((p) => p.mill_id === m.id && p.active).length || "")])));
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>পট সাজান</DialogTitle>
          <DialogDescription>প্রতিটা মিলে কয়টা পট আছে লিখুন। পট ১ থেকে সেই নম্বর পর্যন্ত তৈরি হবে; সংখ্যা কমালে বাড়তি পট শুধু লুকানো হয়, আগের গোনা থাকে।</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {mills.map((m) => (
            <label key={m.id} className="flex items-center justify-between gap-3 rounded-xl border p-2.5">
              <span className="font-semibold">{m.name}</span>
              <Input type="number" inputMode="numeric" min="0" max="500" className="h-10 w-24 text-center" value={n[m.id] ?? ""}
                onChange={(e) => setN((s) => ({ ...s, [m.id]: e.target.value }))} placeholder="০" />
            </label>
          ))}
        </div>
        <DialogFooter>
          <Button className="h-11 w-full rounded-xl font-bold" disabled={busy} onClick={async () => {
            setBusy(true);
            try {
              for (const m of mills) await setMillPots(m.id, Number(n[m.id] || 0), pots);
              toast.success("পট সাজানো হয়েছে");
              onDone();
            } catch (e) {
              toast.error((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}>{busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}সেভ</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
