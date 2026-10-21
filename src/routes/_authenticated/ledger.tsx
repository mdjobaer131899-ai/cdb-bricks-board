import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ChevronRight, Eye, FolderOpen, Printer, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchLedger, type LedgerFolder, type LedgerLine, type LedgerPerson } from "@/lib/ledger";
import { COST_GROUPS, GROUP_LABEL, TONE_CLASS, moneyHead, type MoneyGroup, type MoneyKey } from "@/lib/money-heads";
import { bn, bnDate } from "@/lib/format";
import { printTable } from "@/lib/print-table";
import { useSeason } from "@/lib/season-context";

/**
 * খরচের খাতা: every money-out head as a folder, the people or items inside, and each
 * one's dated lines with a running balance. Read only — a line opens the page where it
 * is changed (the cash book for money and bills). Numbers come from lib/ledger.ts.
 */
type Search = { h?: string; p?: string };

export const Route = createFileRoute("/_authenticated/ledger")({
  head: () => ({
    meta: [
      { title: "খরচের খাতা — CDB Bricks" },
      { name: "description", content: "সব খরচ খাত অনুযায়ী আলাদা ফোল্ডারে: কত বিল, কত দিলাম, কত বাকি, তারিখ ধরে।" },
    ],
  }),
  validateSearch: (s: Record<string, unknown>): Search => ({
    ...(typeof s.h === "string" && s.h ? { h: s.h } : {}),
    ...(typeof s.p === "string" && s.p ? { p: s.p } : {}),
  }),
  component: LedgerPage,
});

const tk = (n: number) => `৳${bn(Math.round(Math.abs(n)))}`;
const GROUPS: MoneyGroup[] = [...COST_GROUPS, "move"];

/** "বাকি ৳X" / "অগ্রিম ৳X" / "সমান" for a balance */
function dueText(f: LedgerFolder, due: number) {
  if (Math.abs(due) < 0.5) return "সমান";
  return due > 0 ? `${f.words.due} ${tk(due)}` : `${f.words.ahead} ${tk(due)}`;
}
const dueTone = (due: number) => (Math.abs(due) < 0.5 ? "text-success" : due > 0 ? "text-warning" : "text-info");

function LedgerPage() {
  const { h, p } = Route.useSearch();
  const navigate = useNavigate();
  const { season } = useSeason();
  const q = useQuery({ queryKey: ["ledger", season?.id ?? ""], queryFn: fetchLedger });
  const folders = q.data ?? [];
  const folder = h ? folders.find((f) => f.key === h) : undefined;
  const who = folder && p ? folder.people.find((x) => x.id === p) : undefined;

  const go = (s: Search) => navigate({ to: "/ledger", search: s });
  const back = () => {
    if (typeof window !== "undefined" && window.history.length > 1) window.history.back();
    else go(p ? { h } : {});
  };

  if (q.isError) {
    return <div className="mx-auto max-w-3xl rounded-2xl border bg-card p-4 text-sm text-destructive">খাতা আনা যায়নি। ইন্টারনেট দেখে পাতাটা আবার খুলুন।</div>;
  }
  if (!q.data) {
    return (
      <div className="mx-auto max-w-3xl space-y-3">
        <Skeleton className="h-24 rounded-[20px]" /><Skeleton className="h-40 rounded-[20px]" /><Skeleton className="h-40 rounded-[20px]" />
      </div>
    );
  }
  if (folder && who) return <PersonView f={folder} who={who} onBack={back} />;
  if (folder) return <FolderView f={folder} onBack={back} onOpen={(id) => go({ h: folder.key, p: id })} />;
  return <Home folders={folders} seasonName={season?.name ?? ""} onOpen={(key, id) => go(id ? { h: key, p: id } : { h: key })} />;
}

/* ---------------- all folders ---------------- */
function Home({ folders, seasonName, onOpen }: { folders: LedgerFolder[]; seasonName: string; onOpen: (key: MoneyKey, id?: string) => void }) {
  const [term, setTerm] = useState("");
  const cost = folders.filter((f) => COST_GROUPS.includes(f.group));
  const seasonCost = cost.reduce((a, f) => a + f.seasonBill, 0);
  const seasonPaid = folders.filter((f) => f.key !== "openingOut").reduce((a, f) => a + f.seasonPaid, 0);

  const found = useMemo(() => {
    const t = term.trim().normalize("NFC").toLowerCase();
    if (!t) return [];
    return folders.flatMap((f) => f.people.filter((x) => x.name.normalize("NFC").toLowerCase().includes(t)).map((x) => ({ f, x }))).slice(0, 30);
  }, [term, folders]);

  return (
    <div className="mx-auto max-w-3xl space-y-4 pb-28 md:pb-6">
      <div>
        <h1 className="font-display text-[26px] font-extrabold leading-tight">খরচের খাতা</h1>
        <p className="text-sm text-muted-foreground">প্রতিটি খরচ আলাদা ফোল্ডারে{seasonName ? ` · ${seasonName}` : ""}</p>
      </div>

      <section className="bg-brick-pattern relative overflow-hidden rounded-[20px] bg-ink p-[18px] text-ink-foreground">
        <div className="text-xs font-bold tracking-[0.12em] text-stone-300">এই মৌসুমের খরচ</div>
        <div className="mt-2 font-display num text-[40px] font-extrabold leading-[0.95] tracking-tight">{tk(seasonCost)}</div>
        <div className="mt-3.5 grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-white/10 bg-white/[0.07] px-3 py-2">
            <div className="text-xs font-semibold text-stone-300">এই মৌসুমে দিলাম</div>
            <div className="num text-lg font-bold">{tk(seasonPaid)}</div>
          </div>
          <Link to="/dues" className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.07] px-3 py-2">
            <span>
              <span className="block text-xs font-semibold text-stone-300">কে কত পাবে</span>
              <span className="text-sm font-bold">পাওনা-দেনা</span>
            </span>
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input className="h-12 rounded-2xl pl-9 text-base" placeholder="নাম খুঁজুন (সরদার, দোকান, শ্রমিক…)" value={term} onChange={(e) => setTerm(e.target.value)} />
      </div>

      {term.trim() ? (
        <section className="overflow-hidden rounded-[20px] border bg-card">
          {found.length === 0 ? <p className="p-4 text-sm text-muted-foreground">কিছু পাওয়া যায়নি</p> : (
            <div className="divide-y">
              {found.map(({ f, x }) => (
                <button key={`${f.key}-${x.id}`} type="button" onClick={() => onOpen(f.key, x.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-muted/60">
                  <HeadIcon k={f.key} />
                  <span className="min-w-0 flex-1">
                    <span className="block break-words font-semibold">{x.name}</span>
                    <span className="text-xs text-muted-foreground">{f.label}</span>
                  </span>
                  {!f.cashOnly && <b className={`num shrink-0 text-sm ${dueTone(x.due)}`}>{dueText(f, x.due)}</b>}
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </button>
              ))}
            </div>
          )}
        </section>
      ) : (
        GROUPS.map((g) => {
          const list = folders.filter((f) => f.group === g);
          if (!list.length) return null;
          return (
            <section key={g} className="space-y-2">
              <h2 className="section-label px-1">{GROUP_LABEL[g]}</h2>
              <div className="grid grid-cols-2 gap-2">
                {list.map((f) => {
                  const empty = f.people.length === 0;
                  return (
                    <button key={f.key} type="button" disabled={empty} onClick={() => onOpen(f.key)}
                      className={`flex min-h-[124px] flex-col gap-1.5 rounded-2xl border bg-card p-3 text-left transition active:scale-[0.99] ${empty ? "opacity-50" : "hover:bg-muted/50"}`}>
                      <span className="flex items-center justify-between">
                        <HeadIcon k={f.key} />
                        {!empty && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                      </span>
                      <span className="text-[15px] font-bold leading-tight">{f.label}</span>
                      {empty ? (
                        <span className="mt-auto text-xs text-muted-foreground">এখনো কিছু নেই</span>
                      ) : (
                        <>
                          <span className="num mt-auto text-xs text-muted-foreground">এই মৌসুমে {tk(f.cashOnly ? f.seasonBill : f.key === "openingOut" ? f.seasonPaid : f.seasonBill)}{f.key === "openingOut" ? " দিলাম" : ""}</span>
                          {!f.cashOnly ? (
                            <span className={`num text-sm font-extrabold ${dueTone(f.due)}`}>{dueText(f, f.due)}</span>
                          ) : (
                            <span className="text-xs text-muted-foreground">{bn(f.people.length)}টি নাম</span>
                          )}
                        </>
                      )}
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })
      )}
      <ReadOnlyNote />
    </div>
  );
}

/* ---------------- one folder: the people inside ---------------- */
function FolderView({ f, onBack, onOpen }: { f: LedgerFolder; onBack: () => void; onOpen: (id: string) => void }) {
  const print = () => printTable({
    title: `খরচের খাতা — ${f.label}`,
    headers: f.cashOnly ? ["নাম", "খরচ"] : ["নাম", f.words.bill, f.words.paid, "বাকি"],
    rightCols: f.cashOnly ? [1] : [1, 2, 3],
    rows: f.people.map((x) => f.cashOnly ? [x.name, tk(x.bill)] : [x.name, tk(x.bill), tk(x.paid), `${x.due < 0 ? "−" : ""}${tk(x.due)}`]),
    totals: f.cashOnly ? [["মোট", tk(f.bill)]] : [[f.words.bill, tk(f.bill)], [f.words.paid, tk(f.paid)], [x0(f.due, f), tk(f.due)]],
  });
  return (
    <div className="mx-auto max-w-3xl space-y-4 pb-28 md:pb-6">
      <Header title={f.label} sub={f.note} k={f.key} onBack={onBack} onPrint={print} />
      <Totals f={f} bill={f.bill} paid={f.paid} due={f.due} />
      <section className="overflow-hidden rounded-[20px] border bg-card">
        <div className="divide-y">
          {f.people.map((x) => (
            <button key={x.id} type="button" onClick={() => onOpen(x.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left transition active:bg-muted/60">
              <span className="min-w-0 flex-1">
                <span className="block break-words font-semibold">{x.name}</span>
                <span className="num text-xs text-muted-foreground">
                  {x.sub ? `${x.sub} · ` : ""}
                  {f.cashOnly ? `${bn(x.lines.length)}টি লাইন` : `${f.words.bill} ${tk(x.bill)} · ${f.words.paid} ${tk(x.paid)}`}
                </span>
              </span>
              <b className={`num shrink-0 text-sm ${f.cashOnly ? "" : dueTone(x.due)}`}>{f.cashOnly ? tk(x.bill) : dueText(f, x.due)}</b>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </button>
          ))}
        </div>
      </section>
      <ReadOnlyNote />
    </div>
  );
}
const x0 = (due: number, f: LedgerFolder) => (due >= 0 ? f.words.due : f.words.ahead);

/* ---------------- one person: dated lines with a running balance ---------------- */
function PersonView({ f, who, onBack }: { f: LedgerFolder; who: LedgerPerson; onBack: () => void }) {
  const navigate = useNavigate();
  let run = 0;
  const rows = who.lines.map((l) => { run += l.bill - l.paid; return { l, run }; });
  const shown = [...rows].reverse(); // newest first on screen
  const open = (l: LedgerLine) => { if (l.link) navigate({ to: l.link.to as never, search: (l.link.search ?? {}) as never }); };
  const print = () => printTable({
    title: `${who.name} — ${f.label}`,
    subtitle: who.sub,
    headers: f.cashOnly ? ["তারিখ", "বিবরণ", "টাকা"] : ["তারিখ", "বিবরণ", f.words.bill, f.words.paid, "বাকি"],
    rightCols: f.cashOnly ? [2] : [2, 3, 4],
    rows: rows.map(({ l, run }) => f.cashOnly
      ? [bnDate(l.date), [l.text, l.sub].filter(Boolean).join(" · "), tk(l.bill)]
      : [bnDate(l.date), [l.text, l.sub].filter(Boolean).join(" · "), l.bill ? tk(l.bill) : "", l.paid ? tk(l.paid) : "", `${run < 0 ? "−" : ""}${tk(run)}`]),
    totals: f.cashOnly ? [["মোট", tk(who.bill)]] : [[f.words.bill, tk(who.bill)], [f.words.paid, tk(who.paid)], [x0(who.due, f), tk(who.due)]],
  });
  return (
    <div className="mx-auto max-w-3xl space-y-4 pb-28 md:pb-6">
      <Header title={who.name} sub={`${f.label}${who.sub ? ` · ${who.sub}` : ""}`} k={f.key} onBack={onBack} onPrint={print} />
      <Totals f={f} bill={who.bill} paid={who.paid} due={who.due} />
      <section className="overflow-hidden rounded-[20px] border bg-card">
        <div className="flex items-center justify-between border-b bg-muted/60 px-4 py-2 text-xs font-semibold text-muted-foreground">
          <span>তারিখ ও বিবরণ (নতুন আগে)</span>
          <span>{f.cashOnly ? "টাকা" : "টাকা · তখন বাকি"}</span>
        </div>
        <div className="divide-y">
          {shown.map(({ l, run }) => {
            const inner = (
              <>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs text-muted-foreground">{bnDate(l.date)}</span>
                  <span className="block break-words font-semibold leading-snug">{l.text}</span>
                  {l.sub && <span className="block break-words text-xs text-muted-foreground">{l.sub}</span>}
                </span>
                <span className="shrink-0 text-right">
                  {f.cashOnly ? (
                    <b className="num block text-red-700 dark:text-red-300">{tk(l.bill)}</b>
                  ) : (
                    <>
                      {l.bill > 0 && <b className="num block text-foreground">+{tk(l.bill)}</b>}
                      {l.paid > 0 && <b className="num block text-red-700 dark:text-red-300">−{tk(l.paid)}</b>}
                      <span className={`num block text-[11px] font-semibold ${dueTone(run)}`}>{dueText(f, run)}</span>
                    </>
                  )}
                </span>
                {l.link ? <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" /> : <span className="w-4 shrink-0" />}
              </>
            );
            return l.link ? (
              <button key={l.id} type="button" onClick={() => open(l)} className="flex w-full items-center gap-3 px-4 py-3 text-left transition active:bg-muted/60" title={l.linkLabel}>
                {inner}
              </button>
            ) : (
              <div key={l.id} className="flex items-center gap-3 px-4 py-3">{inner}</div>
            );
          })}
        </div>
      </section>
      <ReadOnlyNote />
    </div>
  );
}

/* ---------------- pieces ---------------- */
function HeadIcon({ k }: { k: MoneyKey }) {
  const h = moneyHead(k);
  return <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${TONE_CLASS[h.tone]}`}><h.icon className="h-5 w-5" /></span>;
}

function Header({ title, sub, k, onBack, onPrint }: { title: string; sub?: string; k: MoneyKey; onBack: () => void; onPrint: () => void }) {
  return (
    <div className="flex items-start gap-3 pt-1">
      <button type="button" onClick={onBack} aria-label="ফিরে যান" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border bg-card transition active:scale-95">
        <ArrowLeft className="h-5 w-5" />
      </button>
      <div className="min-w-0 flex-1">
        <h1 className="font-display flex items-center gap-2 break-words text-[22px] font-extrabold leading-tight"><span className="hidden sm:inline-flex"><HeadIcon k={k} /></span>{title}</h1>
        {sub && <p className="text-sm text-muted-foreground">{sub}</p>}
      </div>
      <Button variant="outline" size="icon" className="h-11 w-11 shrink-0 rounded-xl" onClick={onPrint} aria-label="প্রিন্ট"><Printer className="h-5 w-5" /></Button>
    </div>
  );
}

function Totals({ f, bill, paid, due }: { f: LedgerFolder; bill: number; paid: number; due: number }) {
  if (f.cashOnly) {
    return (
      <div className="rounded-2xl border bg-card p-3">
        <div className="text-xs font-semibold text-muted-foreground">মোট খরচ</div>
        <div className="num font-display text-2xl font-extrabold">{tk(bill)}</div>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-3 gap-2">
      <div className="rounded-2xl border bg-card p-3">
        <div className="text-xs font-semibold text-muted-foreground">{f.words.bill}</div>
        <div className="num text-base font-bold sm:text-lg">{tk(bill)}</div>
      </div>
      <div className="rounded-2xl border bg-card p-3">
        <div className="text-xs font-semibold text-muted-foreground">{f.words.paid}</div>
        <div className="num text-base font-bold text-red-700 dark:text-red-300 sm:text-lg">{tk(paid)}</div>
      </div>
      <div className="rounded-2xl border bg-card p-3">
        <div className="text-xs font-semibold text-muted-foreground">{x0(due, f)}</div>
        <div className={`num text-base font-bold sm:text-lg ${dueTone(due)}`}>{tk(due)}</div>
      </div>
    </div>
  );
}

function ReadOnlyNote() {
  return (
    <p className="flex items-start gap-2 rounded-2xl bg-muted/60 px-3 py-2.5 text-xs text-muted-foreground">
      <Eye className="mt-0.5 h-4 w-4 shrink-0" />
      <span>এই খাতা শুধু দেখার জন্য। কোনো লাইন বদলাতে বা মুছতে তার উপর চাপুন — আয়-ব্যয়ের পাতা (ক্যাশ বই) খুলবে, সেখানে সংশোধন ও মোছা যায়। কাজের লাইন (কাঁচা ইট, হাজিরা, বেতন) খোলে তার নিজের পাতায়। <FolderOpen className="inline h-3 w-3" /></span>
    </p>
  );
}
