import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ChevronRight, Pencil, Printer, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchLedger, type LedgerFolder, type LedgerLine, type LedgerPerson } from "@/lib/ledger";
import { COST_GROUPS, GROUP_LABEL, TONE_CLASS, moneyHead, type MoneyGroup, type MoneyKey } from "@/lib/money-heads";
import { bn, bnDate } from "@/lib/format";
import { printTable } from "@/lib/print-table";
import { useSeason } from "@/lib/season-context";

/**
 * খরচের খাতা: every money-out head is a folder → the names inside → one name's lines.
 * Everywhere the same sum: আগের বাকি + কাজ/বিল − দিলাম = এখন বাকি. Read only; a line
 * opens the page where it is changed (the cash book for money and bills).
 */
type Search = { h?: string; p?: string };

export const Route = createFileRoute("/_authenticated/ledger")({
  head: () => ({
    meta: [
      { title: "খরচের খাতা — CDB Bricks" },
      { name: "description", content: "সব খরচ খাত অনুযায়ী আলাদা ফোল্ডারে: আগের বাকি, কাজ বা বিল, কত দিলাম, এখন কত বাকি।" },
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
const BN_MONTH = ["জানুয়ারি", "ফেব্রুয়ারি", "মার্চ", "এপ্রিল", "মে", "জুন", "জুলাই", "আগস্ট", "সেপ্টেম্বর", "অক্টোবর", "নভেম্বর", "ডিসেম্বর"];
const monthTitle = (d: string) => `${BN_MONTH[Number(d.slice(5, 7)) - 1] ?? ""} ${bn(Number(d.slice(0, 4)))}`;

/** the word and colour of a balance: owed (amber), paid ahead (blue), settled (green) */
function due(f: LedgerFolder, n: number) {
  if (Math.abs(n) < 0.5) return { word: "সমান", tone: "text-success" };
  return n > 0 ? { word: f.words.due, tone: "text-warning" } : { word: f.words.ahead, tone: "text-info" };
}

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

  if (q.isError) return <div className="mx-auto max-w-2xl rounded-2xl border bg-card p-4 text-sm text-destructive">খাতা আনা যায়নি। ইন্টারনেট দেখে পাতাটা আবার খুলুন।</div>;
  if (!q.data) {
    return (
      <div className="mx-auto max-w-2xl space-y-3">
        <Skeleton className="h-28 rounded-[20px]" /><Skeleton className="h-12 rounded-2xl" /><Skeleton className="h-64 rounded-[20px]" />
      </div>
    );
  }
  if (folder && who) return <PersonView f={folder} who={who} onBack={back} />;
  if (folder) return <FolderView f={folder} onBack={back} onOpen={(id) => go({ h: folder.key, p: id })} />;
  return <Home folders={folders} seasonName={season?.name ?? ""} onOpen={(key, id) => go(id ? { h: key, p: id } : { h: key })} />;
}

/* ================= all folders ================= */
function Home({ folders, seasonName, onOpen }: { folders: LedgerFolder[]; seasonName: string; onOpen: (key: MoneyKey, id?: string) => void }) {
  const [term, setTerm] = useState("");
  const used = folders.filter((f) => f.people.length > 0);
  const cost = used.filter((f) => COST_GROUPS.includes(f.group)).reduce((a, f) => a + f.bill, 0);
  // what we owe or paid ahead (a loan we gave is owed to us, so it stays out)
  const people = used.filter((f) => !f.cashOnly && f.key !== "loanGive").flatMap((f) => f.people);
  const owe = people.filter((x) => x.due > 0.5).reduce((a, x) => a + x.due, 0);
  const ahead = people.filter((x) => x.due < -0.5).reduce((a, x) => a - x.due, 0);

  const found = useMemo(() => {
    const t = term.trim().normalize("NFC").toLowerCase();
    if (!t) return [];
    return used.flatMap((f) => f.people.filter((x) => x.name.normalize("NFC").toLowerCase().includes(t)).map((x) => ({ f, x }))).slice(0, 40);
  }, [term, used]);

  return (
    <div className="mx-auto max-w-2xl space-y-4 pb-28 md:pb-6">
      <div>
        <h1 className="font-display text-[26px] font-extrabold leading-tight">খরচের খাতা</h1>
        <p className="text-sm text-muted-foreground">খাত বেছে নিন, তারপর নাম{seasonName ? ` · ${seasonName}` : ""}</p>
      </div>

      <section className="bg-brick-pattern grid grid-cols-2 gap-3 overflow-hidden rounded-[20px] bg-ink p-[18px] text-ink-foreground">
        <div>
          <div className="text-xs font-bold text-stone-300">এই মৌসুমে খরচ</div>
          <div className="mt-1 font-display num text-[28px] font-extrabold leading-none">{tk(cost)}</div>
        </div>
        <div>
          <div className="text-xs font-bold text-stone-300">এখন বাকি দিতে হবে</div>
          <div className="mt-1 font-display num text-[28px] font-extrabold leading-none text-amber-300">{tk(owe)}</div>
        </div>
        {ahead > 0.5 && (
          <p className="col-span-2 text-xs text-stone-300">অগ্রিম বা দাদন দেওয়া আছে <b className="num text-sky-300">{tk(ahead)}</b> (কাজ বা বিল এলে কেটে যাবে)</p>
        )}
      </section>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
        <Input className="h-12 rounded-2xl pl-11 pr-10 text-base" placeholder="নাম খুঁজুন" value={term} onChange={(e) => setTerm(e.target.value)} />
        {term && (
          <button type="button" onClick={() => setTerm("")} aria-label="মুছুন" className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full text-muted-foreground">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {term.trim() ? (
        <Card>
          {found.length === 0 ? <p className="p-4 text-sm text-muted-foreground">এই নামে কিছু নেই</p> : found.map(({ f, x }) => (
            <Row key={`${f.key}-${x.id}`} onClick={() => onOpen(f.key, x.id)} icon={<HeadIcon k={f.key} />} title={x.name} sub={f.label}
              right={<Amount f={f} n={f.cashOnly ? x.bill : x.due} cash={f.cashOnly} />} />
          ))}
        </Card>
      ) : (
        GROUPS.map((g) => {
          const list = used.filter((f) => f.group === g);
          if (!list.length) return null;
          return (
            <section key={g} className="space-y-1.5">
              <h2 className="px-1 text-xs font-bold tracking-wide text-muted-foreground">{GROUP_LABEL[g]}</h2>
              <Card>
                {list.map((f) => (
                  <Row key={f.key} onClick={() => onOpen(f.key)} icon={<HeadIcon k={f.key} />} title={f.label}
                    sub={f.cashOnly ? `${bn(f.people.length)}টি খাতে` : `${bn(f.people.length)} জন · এই মৌসুমে ${f.words.bill} ${tk(f.bill)}`}
                    right={<Amount f={f} n={f.cashOnly ? f.bill : f.due} cash={f.cashOnly} />} />
                ))}
              </Card>
            </section>
          );
        })
      )}
      <Hint />
    </div>
  );
}

/* ================= one folder ================= */
function FolderView({ f, onBack, onOpen }: { f: LedgerFolder; onBack: () => void; onOpen: (id: string) => void }) {
  const print = () => printTable({
    title: `খরচের খাতা — ${f.label}`,
    headers: f.cashOnly ? ["নাম", "খরচ"] : ["নাম", "আগের বাকি", f.words.bill, f.words.paid, "এখন বাকি"],
    rightCols: f.cashOnly ? [1] : [1, 2, 3, 4],
    rows: f.people.map((x) => f.cashOnly ? [x.name, tk(x.bill)] : [x.name, signed(x.prev), tk(x.bill), tk(x.paid), signed(x.due)]),
    totals: f.cashOnly ? [["মোট", tk(f.bill)]] : [["আগের বাকি", signed(f.prev)], [f.words.bill, tk(f.bill)], [f.words.paid, tk(f.paid)], ["এখন বাকি", signed(f.due)]],
  });
  return (
    <div className="mx-auto max-w-2xl space-y-4 pb-28 md:pb-6">
      <Header title={f.label} k={f.key} onBack={onBack} onPrint={print} />
      <Sum f={f} prev={f.prev} bill={f.bill} paid={f.paid} now={f.due} />
      <p className="px-1 text-xs text-muted-foreground">{f.note}</p>
      <Card>
        {f.people.map((x) => (
          <Row key={x.id} onClick={() => onOpen(x.id)} title={x.name}
            sub={f.cashOnly ? `${bn(x.lines.length)}টি খরচ` : [x.sub, `${f.words.bill} ${tk(x.bill)} · ${f.words.paid} ${tk(x.paid)}`].filter(Boolean).join(" · ")}
            right={<Amount f={f} n={f.cashOnly ? x.bill : x.due} cash={f.cashOnly} />} />
        ))}
      </Card>
      <Hint />
    </div>
  );
}

/* ================= one name: this season's lines by month ================= */
function PersonView({ f, who, onBack }: { f: LedgerFolder; who: LedgerPerson; onBack: () => void }) {
  const navigate = useNavigate();
  // running balance from what was owed at the season start
  let run = who.prev;
  const rows = who.lines.map((l) => { run += l.bill - l.paid; return { l, run }; });
  const months = useMemo(() => {
    const m = new Map<string, typeof rows>();
    for (const r of [...rows].reverse()) {
      const k = r.l.date.slice(0, 7);
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(r);
    }
    return [...m.entries()];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [who]);
  const open = (l: LedgerLine) => { if (l.link) navigate({ to: l.link.to as never, search: (l.link.search ?? {}) as never }); };

  const print = () => printTable({
    title: `${who.name} — ${f.label}`,
    subtitle: who.sub,
    headers: f.cashOnly ? ["তারিখ", "বিবরণ", "টাকা"] : ["তারিখ", "বিবরণ", f.words.bill, f.words.paid, "বাকি"],
    rightCols: f.cashOnly ? [2] : [2, 3, 4],
    rows: [
      ...(!f.cashOnly && Math.abs(who.prev) >= 0.5 ? [["", "আগের বাকি", "", "", signed(who.prev)]] : []),
      ...rows.map(({ l, run }) => f.cashOnly
        ? [bnDate(l.date), [l.text, l.sub].filter(Boolean).join(" · "), tk(l.bill)]
        : [bnDate(l.date), [l.text, l.sub].filter(Boolean).join(" · "), l.bill ? tk(l.bill) : "", l.paid ? tk(l.paid) : "", signed(run)]),
    ],
    totals: f.cashOnly ? [["মোট", tk(who.bill)]] : [["আগের বাকি", signed(who.prev)], [f.words.bill, tk(who.bill)], [f.words.paid, tk(who.paid)], ["এখন বাকি", signed(who.due)]],
  });

  return (
    <div className="mx-auto max-w-2xl space-y-4 pb-28 md:pb-6">
      <Header title={who.name} sub={[f.label, who.sub].filter(Boolean).join(" · ")} k={f.key} onBack={onBack} onPrint={print} />
      <Sum f={f} prev={who.prev} bill={who.bill} paid={who.paid} now={who.due} />

      {rows.length === 0 && <p className="rounded-2xl border bg-card p-4 text-sm text-muted-foreground">এই মৌসুমে কোনো লেনদেন নেই, শুধু আগের বাকি।</p>}
      {months.map(([k, list]) => (
        <section key={k} className="space-y-1.5">
          <h2 className="px-1 text-xs font-bold tracking-wide text-muted-foreground">{monthTitle(`${k}-01`)}</h2>
          <Card>
            {list.map(({ l, run }) => {
              const d = due(f, run);
              const body = (
                <>
                  <span className="w-12 shrink-0 text-center">
                    <span className="block font-display text-lg font-extrabold leading-none">{bn(Number(l.date.slice(8, 10)))}</span>
                    <span className="block text-[10px] text-muted-foreground">{BN_MONTH[Number(l.date.slice(5, 7)) - 1]}</span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block break-words font-semibold leading-snug">{l.text}</span>
                    {l.sub && <span className="block break-words text-xs text-muted-foreground">{l.sub}</span>}
                  </span>
                  <span className="shrink-0 text-right">
                    {f.cashOnly ? <b className="num block">{tk(l.bill)}</b> : (
                      <>
                        {l.bill > 0 && <b className="num block">+{tk(l.bill)}</b>}
                        {l.paid > 0 && <b className="num block text-red-700 dark:text-red-300">−{tk(l.paid)}</b>}
                        <span className={`num block text-[11px] ${d.tone}`}>{d.word} {Math.abs(run) >= 0.5 ? tk(run) : ""}</span>
                      </>
                    )}
                  </span>
                  {l.link ? <Pencil className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : <span className="w-3.5 shrink-0" />}
                </>
              );
              return l.link ? (
                <button key={l.id} type="button" onClick={() => open(l)} title={l.linkLabel} className="flex w-full items-center gap-3 px-3 py-3 text-left transition active:bg-muted/60">{body}</button>
              ) : (
                <div key={l.id} className="flex items-center gap-3 px-3 py-3">{body}</div>
              );
            })}
          </Card>
        </section>
      ))}
      {!f.cashOnly && Math.abs(who.prev) >= 0.5 && (
        <div className="flex items-center justify-between rounded-2xl border border-dashed px-4 py-3 text-sm">
          <span className="font-semibold">মৌসুম শুরুর আগের বাকি</span>
          <b className={`num ${due(f, who.prev).tone}`}>{due(f, who.prev).word} {tk(who.prev)}</b>
        </div>
      )}
      <Hint />
    </div>
  );
}

/* ================= pieces ================= */
const signed = (n: number) => `${n < -0.5 ? "−" : ""}${tk(n)}`;

function Card({ children }: { children: ReactNode }) {
  return <section className="divide-y overflow-hidden rounded-[20px] border bg-card">{children}</section>;
}

function Row({ onClick, icon, title, sub, right }: { onClick: () => void; icon?: ReactNode; title: string; sub?: string; right: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-3 px-4 py-3 text-left transition active:bg-muted/60">
      {icon}
      <span className="min-w-0 flex-1">
        <span className="block break-words font-semibold leading-snug">{title}</span>
        {sub && <span className="num block text-xs text-muted-foreground">{sub}</span>}
      </span>
      <span className="shrink-0 text-right">{right}</span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </button>
  );
}

/** the right-hand number of a row: the balance with its word, or the amount spent */
function Amount({ f, n, cash }: { f: LedgerFolder; n: number; cash?: boolean }) {
  if (cash) return <b className="num">{tk(n)}</b>;
  const d = due(f, n);
  return (
    <>
      <span className={`block text-[11px] font-semibold ${d.tone}`}>{d.word}</span>
      {Math.abs(n) >= 0.5 && <b className={`num block ${d.tone}`}>{tk(n)}</b>}
    </>
  );
}

function HeadIcon({ k }: { k: MoneyKey }) {
  const h = moneyHead(k);
  return <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${TONE_CLASS[h.tone]}`}><h.icon className="h-5 w-5" /></span>;
}

function Header({ title, sub, k, onBack, onPrint }: { title: string; sub?: string; k: MoneyKey; onBack: () => void; onPrint: () => void }) {
  return (
    <div className="flex items-center gap-3 pt-1">
      <button type="button" onClick={onBack} aria-label="ফিরে যান" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border bg-card transition active:scale-95">
        <ArrowLeft className="h-5 w-5" />
      </button>
      <HeadIcon k={k} />
      <div className="min-w-0 flex-1">
        <h1 className="font-display break-words text-[22px] font-extrabold leading-tight">{title}</h1>
        {sub && <p className="truncate text-sm text-muted-foreground">{sub}</p>}
      </div>
      <Button variant="outline" size="icon" className="h-11 w-11 shrink-0 rounded-xl" onClick={onPrint} aria-label="প্রিন্ট"><Printer className="h-5 w-5" /></Button>
    </div>
  );
}

/** one sum, the same on every level: আগের বাকি + কাজ/বিল − দিলাম = এখন বাকি */
function Sum({ f, prev, bill, paid, now }: { f: LedgerFolder; prev: number; bill: number; paid: number; now: number }) {
  if (f.cashOnly) {
    return (
      <div className="rounded-[20px] border bg-card p-4">
        <div className="text-xs font-semibold text-muted-foreground">এই মৌসুমে খরচ</div>
        <div className="num font-display text-3xl font-extrabold">{tk(bill)}</div>
      </div>
    );
  }
  const d = due(f, now);
  const p = due(f, prev);
  return (
    <div className="overflow-hidden rounded-[20px] border bg-card">
      <div className="grid grid-cols-3 divide-x text-center">
        <div className="px-2 py-3">
          <div className="text-[11px] font-semibold text-muted-foreground">আগের {Math.abs(prev) >= 0.5 && prev < 0 ? p.word : "বাকি"}</div>
          <div className="num text-base font-bold">{tk(prev)}</div>
        </div>
        <div className="px-2 py-3">
          <div className="text-[11px] font-semibold text-muted-foreground">+ {f.words.bill}</div>
          <div className="num text-base font-bold">{tk(bill)}</div>
        </div>
        <div className="px-2 py-3">
          <div className="text-[11px] font-semibold text-muted-foreground">− {f.words.paid}</div>
          <div className="num text-base font-bold text-red-700 dark:text-red-300">{tk(paid)}</div>
        </div>
      </div>
      <div className="flex items-center justify-between border-t bg-muted/50 px-4 py-3">
        <span className="font-bold">= এখন {d.word}</span>
        <b className={`num font-display text-2xl font-extrabold ${d.tone}`}>{Math.abs(now) >= 0.5 ? tk(now) : "৳০"}</b>
      </div>
    </div>
  );
}

function Hint() {
  return (
    <p className="flex items-center justify-center gap-1.5 px-1 text-center text-xs text-muted-foreground">
      <Pencil className="h-3.5 w-3.5" /> চিহ্নওয়ালা লাইনে চাপলে সংশোধন ও মোছার পাতা খোলে · এখানে শুধু দেখা
    </p>
  );
}

