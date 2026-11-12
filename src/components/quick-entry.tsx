import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowDownToLine, ArrowUpFromLine, FilePlus2, Layers, type LucideIcon } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { EXPENSE_HEADS, ExpenseEntryDialog, type HeadKey } from "@/components/expense-entry";
import { INCOME_HEADS, IncomeEntryDialog, type IncomeKey } from "@/components/income-entry";
import { HeadTiles } from "@/components/money-form-parts";
import { isIncome, moneyHeadAllowed, type MoneyKey } from "@/lib/money-heads";
import { usePageAccess } from "@/lib/page-permissions";

/** Fired by the phone bottom bar's "+" button; the sheet itself is mounted once in the layout. */
export const OPEN_QUICK_ENTRY_EVENT = "open-quick-entry";

type WorkLink = { to: string; label: string; icon: LucideIcon; tone: string };

const STONE = "bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-200";

/** Entries that live on their own pages (challan form, production steps). */
const WORK_LINKS: WorkLink[] = [
  { to: "/entries/new", label: "নতুন চালান", icon: FilePlus2, tone: "bg-primary/10 text-primary" },
  { to: "/production-steps/kacha", label: "কাঁচা ইট", icon: Layers, tone: STONE },
  { to: "/production-steps/load", label: "ভাটায় ঢোকানো", icon: ArrowDownToLine, tone: STONE },
  { to: "/production-steps/unload", label: "বের করা", icon: ArrowUpFromLine, tone: STONE },
];

/**
 * One place to start any daily entry from any page: a challan, a production step, or money
 * in / out. Money heads open the same IncomeEntryDialog / ExpenseEntryDialog as the cash book,
 * so an entry looks and saves the same wherever it is written.
 */
export function QuickEntrySheet() {
  const qc = useQueryClient();
  const { can } = usePageAccess();
  const [open, setOpen] = useState(false);
  const [incomeHead, setIncomeHead] = useState<IncomeKey | null>(null);
  const [expenseHead, setExpenseHead] = useState<HeadKey | null>(null);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(OPEN_QUICK_ENTRY_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_QUICK_ENTRY_EVENT, onOpen);
  }, []);

  const work = WORK_LINKS.filter((w) => can(w.to));
  // money entries belong to the cash book; brick-sale money also to the collections page
  const allowed = (k: MoneyKey) =>
    (can("/cash-book") || (k === "sale" && can("/collections"))) && moneyHeadAllowed(k, can);
  const expenseHeads = EXPENSE_HEADS.filter((h) => allowed(h.key)).map((h) => h.key);
  const incomeHeads = INCOME_HEADS.filter(allowed);
  const moneyKeys: MoneyKey[] = [...incomeHeads, ...expenseHeads];

  // a saved entry can change hand cash, dues, stock and reports on every page
  const done = () => { void qc.invalidateQueries(); };

  return (
    <>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="max-h-[88vh] overflow-y-auto rounded-t-3xl pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
          <SheetHeader className="text-left">
            <SheetTitle>নতুন এন্ট্রি</SheetTitle>
            <SheetDescription>কী লিখবেন বেছে নিন</SheetDescription>
          </SheetHeader>

          <div className="mt-4 space-y-4">
            {work.length > 0 && (
              <div>
                <div className="text-xs font-bold tracking-wide text-muted-foreground">চালান ও উৎপাদন</div>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {work.map((w) => (
                    <Link
                      key={w.to}
                      to={w.to as never}
                      onClick={() => setOpen(false)}
                      className="flex min-h-[86px] flex-col items-center justify-center gap-1.5 rounded-2xl border bg-card px-1 py-2.5 text-center transition active:scale-95"
                    >
                      <span className={`grid h-10 w-10 place-items-center rounded-xl ${w.tone}`}>
                        <w.icon className="h-5 w-5" aria-hidden="true" />
                      </span>
                      <span className="text-[13px] font-bold leading-tight">{w.label}</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {moneyKeys.length > 0 && (
              <HeadTiles
                keys={moneyKeys}
                onPick={(k) => {
                  setOpen(false);
                  if (isIncome(k)) setIncomeHead(k as IncomeKey);
                  else setExpenseHead(k as HeadKey);
                }}
              />
            )}

            {work.length === 0 && moneyKeys.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                আপনার জন্য কোনো এন্ট্রির পাতা খোলা নেই। অনুমতির জন্য মালিকের সাথে কথা বলুন।
              </p>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <IncomeEntryDialog
        open={incomeHead !== null}
        onOpenChange={(o) => { if (!o) setIncomeHead(null); }}
        head={incomeHead}
        onDone={done}
        onSwitchHead={(k) => { setIncomeHead(null); setExpenseHead(k as HeadKey); }}
      />
      <ExpenseEntryDialog
        open={expenseHead !== null}
        onOpenChange={(o) => { if (!o) setExpenseHead(null); }}
        head={expenseHead}
        heads={expenseHeads}
        onDone={done}
      />
    </>
  );
}
