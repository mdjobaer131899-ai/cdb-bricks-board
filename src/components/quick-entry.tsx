import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useBackToClose } from "@/lib/back-close";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDownLeft, ArrowDownToLine, ArrowLeft, ArrowUpFromLine, ArrowUpRight, FilePlus2, Layers, Lock, Search, Sparkles,
  type LucideIcon,
} from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { EXPENSE_HEADS, ExpenseEntryDialog, type HeadKey } from "@/components/expense-entry";
import { INCOME_HEADS, IncomeEntryDialog, type IncomeKey } from "@/components/income-entry";
import { HeadTiles } from "@/components/money-form-parts";
import { DayCloseDialog } from "@/components/day-close";
import { OPEN_AI_CHAT_EVENT } from "@/components/ai-assistant-fab";
import { supabase } from "@/integrations/supabase/client";
import { TONE_CLASS, isIncome, moneyHead, moneyHeadAllowed, supplierHead, type MoneyKey } from "@/lib/money-heads";
import { usePageAccess } from "@/lib/page-permissions";
import { pushRecent, readRecent } from "@/lib/recent-picks";

/**
 * The phone's "+": one place to start any daily entry from any page.
 *
 *   start → টাকা পেলাম · টাকা দিলাম · নতুন চালান · উৎপাদন · দিন বন্ধ · মুখে বলুন (AI)
 *   টাকা দিলাম / পেলাম → one box "কাকে?" that finds any person (sardar, worker, shop, veku,
 *   customer) or head by name, recent picks first, then opens the same money form as the
 *   cash book on that head with that person already picked.
 *
 * Open it with openQuickEntry(step); the sheet is mounted once in the _authenticated layout.
 */
export const OPEN_QUICK_ENTRY_EVENT = "open-quick-entry";
type Step = "start" | "out" | "in" | "make";
export function openQuickEntry(step: Step = "start") {
  window.dispatchEvent(new CustomEvent(OPEN_QUICK_ENTRY_EVENT, { detail: { step } }));
}

type WorkLink = { to: string; label: string; icon: LucideIcon };
const MAKE_LINKS: WorkLink[] = [
  { to: "/production-steps/kacha", label: "কাঁচা ইট", icon: Layers },
  { to: "/production-steps/load", label: "ভাটায় ঢোকানো", icon: ArrowDownToLine },
  { to: "/production-steps/unload", label: "বের করা", icon: ArrowUpFromLine },
];

/** one row in the "কাকে?" list: a person (partyId) or a head on its own */
type Pick = { key: string; label: string; sub: string; head: MoneyKey; partyId: string | null };

const nfc = (s: string) => s.normalize("NFC").trim().toLowerCase();
const TILE = "flex min-h-[96px] flex-col items-center justify-center gap-2 rounded-2xl border bg-card px-2 py-3 text-center transition active:scale-95";

export function QuickEntrySheet() {
  const qc = useQueryClient();
  const { can } = usePageAccess();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("start");
  const [query, setQuery] = useState("");
  const [income, setIncome] = useState<{ head: IncomeKey; partyId: string | null } | null>(null);
  const [expense, setExpense] = useState<{ head: HeadKey; partyId: string | null } | null>(null);
  const [dayClose, setDayClose] = useState(false);
  // back from "টাকা দিলাম"/"টাকা পেলাম" returns to the six tiles; the sheet itself closes on the next back
  useBackToClose(open && step !== "start", () => { setStep("start"); setQuery(""); });

  useEffect(() => {
    const onOpen = (e: Event) => {
      const s = (e as CustomEvent<{ step?: Step }>).detail?.step;
      setStep(s ?? "start");
      setQuery("");
      setOpen(true);
    };
    window.addEventListener(OPEN_QUICK_ENTRY_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_QUICK_ENTRY_EVENT, onOpen);
  }, []);

  /* ---------- who may write what (the same rule as the cash book) ---------- */
  const allowed = (k: MoneyKey) =>
    can("/cash-book") && moneyHeadAllowed(k, can);
  const expenseHeads = EXPENSE_HEADS.filter((h) => allowed(h.key)).map((h) => h.key);
  const incomeHeads = INCOME_HEADS.filter(allowed);
  const makeLinks = MAKE_LINKS.filter((w) => can(w.to));
  const canChallan = can("/entries/new");
  const canClose = can("/cash-book");

  /* ---------- names to pick from ---------- */
  const outQ = useQuery({
    queryKey: ["quick-entry-out-names"],
    enabled: open && step === "out",
    queryFn: async () => {
      const [s, w, p] = await Promise.all([
        supabase.from("sardars").select("id, name").eq("is_active", true).order("name"),
        supabase.from("workers").select("id, name, role").eq("active", true).order("name"),
        supabase.from("suppliers").select("id, name, material_type").order("name"),
      ]);
      for (const r of [s, w, p]) if (r.error) throw r.error;
      const rows: Pick[] = [];
      for (const x of s.data ?? []) rows.push({ key: `sardar|${x.id}`, label: x.name, sub: "সরদার", head: "sardar", partyId: x.id });
      for (const x of w.data ?? []) {
        const head: MoneyKey = x.role === "daily" ? "daily" : "staff";
        rows.push({ key: `${head}|${x.id}`, label: x.name, sub: moneyHead(head).label, head, partyId: x.id });
      }
      for (const x of p.data ?? []) {
        const head = supplierHead(x.material_type);
        rows.push({ key: `${head}|${x.id}`, label: x.name, sub: [moneyHead(head).label, x.material_type].filter(Boolean).join(" · "), head, partyId: x.id });
      }
      return rows;
    },
  });
  const inQ = useQuery({
    queryKey: ["quick-entry-in-names"],
    enabled: open && step === "in",
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("id, name, phone").order("name");
      if (error) throw error;
      return (data ?? []).map((x): Pick => ({ key: `sale|${x.id}`, label: x.name, sub: x.phone ? `গ্রাহক · ${x.phone}` : "গ্রাহক", head: "sale", partyId: x.id }));
    },
  });

  const dir = step === "in" ? "in" : "out";
  const headPicks: Pick[] = (dir === "in" ? incomeHeads : expenseHeads).map((k) => ({
    key: `head|${k}`, label: moneyHead(k).label, sub: "খাত", head: k, partyId: null,
  }));
  const people = (dir === "in" ? inQ.data : outQ.data) ?? [];
  const all = useMemo(
    () => [...people.filter((p) => allowed(p.head)), ...headPicks],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [people, dir, expenseHeads.length, incomeHeads.length],
  );
  const recent = useMemo(() => {
    if (step !== "in" && step !== "out") return [] as Pick[];
    return readRecent(`quick-${dir}`).map((k) => all.find((p) => p.key === k)).filter((p): p is Pick => !!p).slice(0, 6);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, step, open]);
  const q = nfc(query);
  const matches = q ? all.filter((p) => nfc(p.label).includes(q) || nfc(p.sub).includes(q)).slice(0, 40) : [];

  const choose = (p: Pick) => {
    pushRecent(`quick-${dir}`, p.key);
    setOpen(false);
    if (isIncome(p.head)) setIncome({ head: p.head as IncomeKey, partyId: p.partyId });
    else setExpense({ head: p.head as HeadKey, partyId: p.partyId });
  };

  // a saved entry can change hand cash, dues, stock and reports on every page
  const done = () => { void qc.invalidateQueries(); };

  const PickRow = ({ p }: { p: Pick }) => {
    const def = moneyHead(p.head);
    return (
      <button type="button" onClick={() => choose(p)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left active:bg-muted">
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${TONE_CLASS[def.tone]}`}><def.icon className="h-4 w-4" aria-hidden="true" /></span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-semibold">{p.label}</span>
          <span className="block truncate text-xs text-muted-foreground">{p.sub}</span>
        </span>
      </button>
    );
  };

  const loading = dir === "in" ? inQ.isLoading : outQ.isLoading;
  const title = step === "out" ? "টাকা দিলাম" : step === "in" ? "টাকা পেলাম" : step === "make" ? "উৎপাদন" : "নতুন এন্ট্রি";

  return (
    <>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto rounded-t-3xl pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
          <SheetHeader className="text-left">
            <SheetTitle className="flex items-center gap-2">
              {step !== "start" && (
                <button type="button" onClick={() => { setStep("start"); setQuery(""); }} aria-label="পেছনে" className="-ml-1 rounded-lg p-1">
                  <ArrowLeft className="h-5 w-5" />
                </button>
              )}
              {title}
            </SheetTitle>
            <SheetDescription>
              {step === "out" ? "কাকে দিলেন? নাম লিখুন বা খাত বেছে নিন"
                : step === "in" ? "কার কাছ থেকে পেলেন? নাম লিখুন বা খাত বেছে নিন"
                : step === "make" ? "কোন কাজ লিখবেন"
                : "কী লিখবেন বেছে নিন"}
            </SheetDescription>
          </SheetHeader>

          {step === "start" && (
            <div className="mt-4 grid grid-cols-2 gap-2.5">
              {incomeHeads.length > 0 && (
                <button type="button" className={TILE} onClick={() => setStep("in")}>
                  <span className={`grid h-11 w-11 place-items-center rounded-xl ${TONE_CLASS.green}`}><ArrowDownLeft className="h-6 w-6" aria-hidden="true" /></span>
                  <span className="text-[15px] font-bold">টাকা পেলাম</span>
                </button>
              )}
              {expenseHeads.length > 0 && (
                <button type="button" className={TILE} onClick={() => setStep("out")}>
                  <span className={`grid h-11 w-11 place-items-center rounded-xl ${TONE_CLASS.red}`}><ArrowUpRight className="h-6 w-6" aria-hidden="true" /></span>
                  <span className="text-[15px] font-bold">টাকা দিলাম</span>
                </button>
              )}
              {canChallan && (
                <Link to={"/entries/new" as never} onClick={() => setOpen(false)} className={TILE}>
                  <span className="grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-primary"><FilePlus2 className="h-6 w-6" aria-hidden="true" /></span>
                  <span className="text-[15px] font-bold">নতুন চালান</span>
                </Link>
              )}
              {makeLinks.length > 0 && (
                <button type="button" className={TILE} onClick={() => setStep("make")}>
                  <span className={`grid h-11 w-11 place-items-center rounded-xl ${TONE_CLASS.stone}`}><Layers className="h-6 w-6" aria-hidden="true" /></span>
                  <span className="text-[15px] font-bold">উৎপাদন</span>
                </button>
              )}
              {canClose && (
                <button type="button" className={TILE} onClick={() => { setOpen(false); setDayClose(true); }}>
                  <span className={`grid h-11 w-11 place-items-center rounded-xl ${TONE_CLASS.amber}`}><Lock className="h-6 w-6" aria-hidden="true" /></span>
                  <span className="text-[15px] font-bold">দিন বন্ধ</span>
                </button>
              )}
              <button type="button" className={TILE} onClick={() => { setOpen(false); window.dispatchEvent(new CustomEvent(OPEN_AI_CHAT_EVENT)); }}>
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-ink text-orange-400"><Sparkles className="h-6 w-6" aria-hidden="true" /></span>
                <span className="text-[15px] font-bold">মুখে বলুন (AI)</span>
              </button>
            </div>
          )}

          {step === "make" && (
            <div className="mt-4 grid grid-cols-3 gap-2">
              {makeLinks.map((w) => (
                <Link key={w.to} to={w.to as never} onClick={() => setOpen(false)} className={TILE}>
                  <span className={`grid h-10 w-10 place-items-center rounded-xl ${TONE_CLASS.stone}`}><w.icon className="h-5 w-5" aria-hidden="true" /></span>
                  <span className="text-[13px] font-bold leading-tight">{w.label}</span>
                </Link>
              ))}
            </div>
          )}

          {(step === "out" || step === "in") && (
            <div className="mt-4 space-y-4">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input
                  autoFocus
                  className="h-12 pl-9 text-base"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={step === "out" ? "নাম লিখুন: সরদার, শ্রমিক, দোকান, ভেকু…" : "গ্রাহকের নাম লিখুন…"}
                />
              </div>

              {q ? (
                matches.length > 0 ? (
                  <ul className="divide-y overflow-hidden rounded-2xl border">
                    {matches.map((p) => <li key={p.key}><PickRow p={p} /></li>)}
                  </ul>
                ) : (
                  <p className="rounded-2xl bg-muted px-3 py-4 text-center text-sm text-muted-foreground">
                    {loading ? "নাম আসছে…" : "এই নামে কেউ নেই। নিচের খাত থেকে বেছে নিন, নতুন নাম ফর্মেই লেখা যাবে।"}
                  </p>
                )
              ) : (
                recent.length > 0 && (
                  <div>
                    <div className="mb-2 text-xs font-bold text-muted-foreground">সম্প্রতি</div>
                    <ul className="divide-y overflow-hidden rounded-2xl border">
                      {recent.map((p) => <li key={p.key}><PickRow p={p} /></li>)}
                    </ul>
                  </div>
                )
              )}

              <div>
                <div className="mb-2 text-xs font-bold text-muted-foreground">অথবা খাত বেছে নিন</div>
                <HeadTiles
                  keys={headPicks.map((h) => h.head)}
                  onPick={(k) => choose({ key: `head|${k}`, label: moneyHead(k).label, sub: "খাত", head: k, partyId: null })}
                />
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <DayCloseDialog open={dayClose} onOpenChange={setDayClose} />
      <IncomeEntryDialog
        open={income !== null}
        onOpenChange={(o) => { if (!o) setIncome(null); }}
        head={income?.head ?? null}
        partyId={income?.partyId ?? null}
        onDone={done}
        onSwitchHead={(k) => { setIncome(null); setExpense({ head: k as HeadKey, partyId: null }); }}
      />
      <ExpenseEntryDialog
        open={expense !== null}
        onOpenChange={(o) => { if (!o) setExpense(null); }}
        head={expense?.head ?? null}
        partyId={expense?.partyId ?? null}
        heads={expenseHeads}
        onDone={done}
      />
    </>
  );
}
