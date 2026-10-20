import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownLeft, ArrowUpRight, ChevronRight, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { getKilnSnapshot } from "@/services/gemini";
import { buildDues, type DueLine } from "@/lib/dues";
import { bn } from "@/lib/format";
import { printTable } from "@/lib/print-table";

/**
 * পাওনা-দেনা: one page for who owes the kiln and whom the kiln owes, today.
 * Numbers come from the one snapshot (lib/dues.ts), the same as the dashboard tiles and the AI.
 */
export const Route = createFileRoute("/_authenticated/dues")({
  head: () => ({
    meta: [
      { title: "পাওনা-দেনা — CDB Bricks" },
      { name: "description", content: "কে ভাটার কাছে কত টাকা পাবে আর ভাটা কার কাছে কত পাবে, এক জায়গায়।" },
    ],
  }),
  component: DuesPage,
});

const tk = (n: number) => `৳${bn(Math.round(n))}`;

function DuesPage() {
  const snapQ = useQuery({ queryKey: ["kiln-snapshot"], queryFn: () => getKilnSnapshot(true), refetchInterval: 60_000 });
  const dues = useMemo(() => (snapQ.data ? buildDues(snapQ.data) : null), [snapQ.data]);
  const [open, setOpen] = useState<DueLine | null>(null);

  const rTotal = (dues?.receive ?? []).reduce((a, l) => a + l.total, 0);
  const pTotal = (dues?.pay ?? []).reduce((a, l) => a + l.total, 0);
  const net = rTotal - pTotal;
  // part of what we owe is bricks (advance taken), not cash
  const brickOwed = (dues?.pay ?? []).filter((l) => l.key === "customer-advance" || l.key === "old-brick-due").reduce((a, l) => a + l.total, 0);

  const print = () => printTable({
    title: "পাওনা-দেনা",
    subtitle: "আজ পর্যন্ত",
    headers: ["দিক", "খাত", "নাম", "টাকা"],
    rightCols: [3],
    rows: [
      ...(dues?.receive ?? []).flatMap((l) => l.people.map((p) => ["আমরা পাব", l.label, p.name, tk(p.amount)])),
      ...(dues?.pay ?? []).flatMap((l) => l.people.map((p) => ["আমরা দেব", l.label, p.name, tk(p.amount)])),
    ],
    totals: [["মোট পাব", tk(rTotal)], ["মোট দেব", tk(pTotal)], [`সব মিলিয়ে ${net >= 0 ? "পাব" : "দেব"}`, tk(Math.abs(net))]],
  });

  const Col = ({ title, lines, total, tone }: { title: string; lines: DueLine[]; total: number; tone: "in" | "out" }) => (
    <section className="overflow-hidden rounded-[20px] border bg-card">
      <div className={`flex items-center justify-between gap-2 px-4 pt-3.5 ${tone === "in" ? "text-success" : "text-destructive"}`}>
        <h2 className="flex items-center gap-1.5 text-base font-bold">
          {tone === "in" ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}{title}
        </h2>
        <b className="num font-display text-lg">{tk(total)}</b>
      </div>
      {lines.length === 0 ? (
        <p className="px-4 py-3 text-sm text-muted-foreground">কিছু নেই</p>
      ) : (
        <div className="mt-2 divide-y">
          {lines.map((l) => (
            <button key={l.key} type="button" onClick={() => setOpen(l)} className="flex w-full items-center gap-3 px-4 py-3 text-left transition active:bg-muted/60">
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{l.label}</span>
                <span className="text-xs text-muted-foreground">{bn(l.people.length)} জন</span>
              </span>
              <b className="num shrink-0">{tk(l.total)}</b>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </button>
          ))}
        </div>
      )}
    </section>
  );

  return (
    <div className="mx-auto max-w-3xl space-y-4 pb-28 md:pb-6">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[26px] font-extrabold leading-tight">পাওনা-দেনা</h1>
          <p className="text-sm text-muted-foreground">আজ পর্যন্ত কে কত পাবে, এক জায়গায়</p>
        </div>
        <Button variant="outline" size="icon" className="h-10 w-10 shrink-0 rounded-xl" onClick={print} aria-label="প্রিন্ট" disabled={!dues}>
          <Printer className="h-5 w-5" />
        </Button>
      </div>

      {!dues ? (
        snapQ.isError ? (
          <div className="rounded-2xl border bg-card p-4 text-sm text-destructive">হিসাব আনা যায়নি। ইন্টারনেট দেখে পাতাটা আবার খুলুন।</div>
        ) : (
          <div className="space-y-3"><Skeleton className="h-28 rounded-[20px]" /><Skeleton className="h-48 rounded-[20px]" /><Skeleton className="h-48 rounded-[20px]" /></div>
        )
      ) : (
        <>
          <section className="bg-brick-pattern relative overflow-hidden rounded-[20px] bg-ink p-[18px] text-ink-foreground">
            <div className="text-xs font-bold tracking-[0.12em] text-stone-300">সব মিলিয়ে আমরা {net >= 0 ? "পাব" : "দেব"}</div>
            <div className={`mt-2 font-display num text-[40px] font-extrabold leading-[0.95] tracking-tight ${net >= 0 ? "text-emerald-300" : "text-red-300"}`}>{tk(Math.abs(net))}</div>
            <div className="mt-3.5 grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-white/10 bg-white/[0.07] px-3 py-2">
                <div className="text-xs font-semibold text-emerald-200">আমরা পাব</div>
                <div className="num text-lg font-bold text-emerald-300">{tk(rTotal)}</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.07] px-3 py-2">
                <div className="text-xs font-semibold text-red-200">আমরা দেব</div>
                <div className="num text-lg font-bold text-red-300">{tk(pTotal)}</div>
              </div>
            </div>
            {brickOwed > 0.5 && (
              <div className="num mt-2 text-xs text-stone-300">"আমরা দেব"-র মধ্যে {tk(brickOwed)} টাকা নয়, ইট দিয়ে শোধ হবে (গ্রাহকের অগ্রিম)। টাকায় দেনা {tk(pTotal - brickOwed)}।</div>
            )}
          </section>
          <Col title="আমরা পাব" lines={dues.receive} total={rTotal} tone="in" />
          <Col title="আমরা দেব" lines={dues.pay} total={pTotal} tone="out" />
          <p className="px-1 text-xs text-muted-foreground">
            সরদার ও স্টাফের হিসাব এই মৌসুমের কাজ আর দেওয়া টাকা ধরে; আগের মৌসুমের বাকি আছে "পূর্বের দেনা"-য়। সাপ্লায়ার, ভেকু, গাড়ি, জমি ও ঋণের হিসাব শুরু থেকে এখন পর্যন্ত।
          </p>
        </>
      )}

      <Sheet open={!!open} onOpenChange={(o) => { if (!o) setOpen(null); }}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-3xl pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
          {open && (
            <>
              <SheetHeader className="text-left">
                <SheetTitle>{open.label}</SheetTitle>
                <SheetDescription>{bn(open.people.length)} জন · মোট {tk(open.total)}</SheetDescription>
              </SheetHeader>
              <div className="mt-3 divide-y rounded-2xl border">
                {open.people.map((p, i) => {
                  const inner = (
                    <>
                      <span className="min-w-0 flex-1">
                        <span className="block break-words text-sm font-semibold">{p.name}</span>
                        {p.sub && <span className="text-xs text-muted-foreground">{p.sub}</span>}
                      </span>
                      <b className="num shrink-0 text-sm">{tk(p.amount)}</b>
                    </>
                  );
                  return p.to ? (
                    <Link key={i} to={p.to as never} params={p.params as never} className="flex items-center gap-2 px-3 py-2.5">{inner}<ChevronRight className="h-4 w-4 text-muted-foreground" /></Link>
                  ) : (
                    <div key={i} className="flex items-center gap-2 px-3 py-2.5">{inner}</div>
                  );
                })}
              </div>
              <Link to={open.to as never} search={open.search as never} className="mt-3 flex h-11 items-center justify-center gap-1 rounded-xl bg-muted text-sm font-bold">
                খাতা খুলুন <ChevronRight className="h-4 w-4" />
              </Link>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
