import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownUp, BadgeDollarSign, Banknote, CalendarRange, Check, ChevronRight, Crown, HardHat, History,
  Landmark, LandPlot, ListFilter, Sparkles, Lock, Pencil, Plus, Printer, Receipt, ShoppingCart, Tractor, Trash2, Truck, Users2, Warehouse, Zap,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { sdb } from "@/lib/season-db";
import { bn, bnDate, todayBD } from "@/lib/format";
import { toast } from "sonner";
import { fetchCashHistory, fetchCashSummary, type CashHistoryRow } from "@/lib/cash-queries";
import { AddExpenseDialog, EXPENSE_HEADS } from "@/components/cash-box-panel";
import { usePageAccess } from "@/lib/page-permissions";
import { printTable } from "@/lib/print-table";

export const Route = createFileRoute("/_authenticated/cash-book")({
  head: () => ({
    meta: [
      { title: "ক্যাশ বই — CDB Bricks" },
      { name: "description", content: "মূল ক্যাশের সব নগদ আয় ও ব্যয়: এন্ট্রি, সম্পাদনা, খাতায় তোলার হিসাব।" },
    ],
    links: [{ rel: "canonical", href: "/cash-book" }],
  }),
  component: CashBookPage,
});

const tk = (n: number) => `৳${bn(Math.round(n))}`;

const METHODS: Array<[string, string]> = [
  ["cash", "হাতে নগদ"],
  ["bkash", "বিকাশ"],
  ["nagad", "নগদ (মোবাইল)"],
  ["bank", "ব্যাংক"],
];

const OLD_DUE_HEAD = "পূর্বের দায় পরিশোধ";
/** Rows created by settle_supplier_with_bricks; they must be changed from the challan, not here */
const BRICK_SETTLE_HEADS = new Set(["ইট বিক্রি — বাকির বদলে", "বাকি পরিশোধ — ইট দিয়ে"]);

type Range = { from: string; to: string };
type Preset = "today" | "month" | "last" | "season" | "custom";
type Kind = "all" | "in" | "out" | "old" | "unbooked" | "booked";

/** Key prefix (from fetchCashHistory) → table and date column */
const ROW_TABLES: Array<[string, string, string]> = [
  ["op", "opening_payments", "payment_date"],
  ["lp", "loan_payments", "payment_date"],
  ["c", "collections", "payment_date"],
  ["e", "expenses", "expense_date"],
  ["s", "sardar_payments", "payment_date"],
  ["w", "worker_payments", "payment_date"],
  ["p", "supplier_payments", "payment_date"],
  ["o", "owner_transactions", "txn_date"],
  ["l", "loans", "loan_date"],
];

function resolveRowKey(key: string) {
  for (const [p, table, dateCol] of ROW_TABLES) {
    if (key.startsWith(p)) {
      const id = key.slice(p.length);
      if (id.length >= 30) return { table, dateCol, id };
    }
  }
  throw new Error("অজানা এন্ট্রি");
}

/** Month range in Dhaka time; offset 0 = this month, -1 = last month */
function monthRangeBD(offset: number): Range {
  const [y, m] = todayBD().split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1 + offset, 1));
  const last = new Date(Date.UTC(y, m + offset, 0));
  return { from: first.toISOString().slice(0, 10), to: last.toISOString().slice(0, 10) };
}

function presetRange(p: Preset): Range {
  if (p === "today") { const t = todayBD(); return { from: t, to: t }; }
  if (p === "month") return monthRangeBD(0);
  if (p === "last") return monthRangeBD(-1);
  return { from: "", to: "" };
}

const PRESETS: Array<[Preset, string]> = [
  ["today", "আজ"],
  ["month", "এই মাস"],
  ["last", "গত মাস"],
  ["season", "পুরো সিজন"],
];

const PERIOD_WORD: Record<Preset, string> = {
  today: "আজ", month: "এই মাসে", last: "গত মাসে", season: "এই সিজনে", custom: "এই সময়ে",
};

// Verifies the admin password with the live supabase session (re-sign-in)
async function verifyAdminPasswordClient(password: string): Promise<boolean> {
  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes?.user;
  if (!user || !user.email) throw new Error("অনুগ্রহ করে আবার লগইন করুন");

  const { data: roleData } = await (supabase as any)
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (roleData?.role !== "admin") {
    throw new Error("শুধুমাত্র এডমিন এন্ট্রি মুছতে পারবেন");
  }

  const { error } = await supabase.auth.signInWithPassword({ email: user.email, password });
  return !error;
}

function parseRowNameAndHead(head: string, detail?: string | null) {
  const cleanDetail = detail && detail !== "—" ? detail.trim() : "";
  const cleanHead = (head || "").trim();
  const separatorMatch = cleanHead.match(/^(.+?)\s*[—\-:]\s*(.+)$/);

  if (!cleanDetail && separatorMatch) return { displayName: separatorMatch[2].trim(), displayHead: separatorMatch[1].trim() };
  if (cleanDetail && separatorMatch) return { displayName: cleanDetail, displayHead: separatorMatch[1].trim() };
  if (!cleanDetail) return { displayName: cleanHead, displayHead: "সাধারণ" };
  return { displayName: cleanDetail, displayHead: cleanHead };
}

/** Icon and colour chip for a cash-book head */
function headLook(head: string, dir: "in" | "out") {
  const green = "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300";
  const red = "bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300";
  const amber = "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300";
  const stone = "bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-200";
  const blue = "bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300";
  if (head.startsWith("মালিকের")) return { Icon: Crown, tone: amber };
  if (head.includes("ঋণ")) return { Icon: Landmark, tone: blue };
  if (head === OLD_DUE_HEAD || head === "গত বছরের পাওনা আদায়") return { Icon: History, tone: amber };
  if (dir === "in") return { Icon: Banknote, tone: green };
  if (head === "সরদার পেমেন্ট") return { Icon: Users2, tone: red };
  if (head === "ডেলি শ্রমিক") return { Icon: HardHat, tone: red };
  if (head.startsWith("বেতন")) return { Icon: BadgeDollarSign, tone: red };
  if (head.includes("জমি")) return { Icon: LandPlot, tone: stone };
  if (head.includes("পরিচ্ছন্ন")) return { Icon: Sparkles, tone: stone };
  if (head.includes("গাড়ি")) return { Icon: Truck, tone: stone };
  if (head.includes("ভেকু")) return { Icon: Tractor, tone: stone };
  if (head.startsWith("সম্পদ")) return { Icon: Warehouse, tone: blue };
  if (head.includes("মালামাল") || head.includes("ইট দিয়ে")) return { Icon: ShoppingCart, tone: stone };
  if (head.includes("বিদ্যুৎ") || head.includes("কারেন্ট")) return { Icon: Zap, tone: stone };
  return { Icon: Receipt, tone: red };
}

async function fetchCustomers() {
  const { data, error } = await sdb.from("customers").select("id, name").order("name");
  if (error) throw error;
  return (data ?? []) as Array<{ id: string; name: string }>;
}

function CashBookPage() {
  const qc = useQueryClient();
  const { can } = usePageAccess();

  const [preset, setPreset] = useState<Preset>("month");
  const [range, setRange] = useState<Range>(() => presetRange("month"));
  const [kind, setKind] = useState<Kind>("all");
  const [head, setHead] = useState<string | null>(null);
  const [newestFirst, setNewestFirst] = useState(true);

  const [dateSheet, setDateSheet] = useState(false);
  const [headSheet, setHeadSheet] = useState(false);
  const [entrySheet, setEntrySheet] = useState(false);
  const [incomeOpen, setIncomeOpen] = useState(false);
  const [expenseHead, setExpenseHead] = useState<string | null>(null);
  const [selected, setSelected] = useState<CashHistoryRow | null>(null);
  const [editRow, setEditRow] = useState<CashHistoryRow | null>(null);
  const [deleteRow, setDeleteRow] = useState<CashHistoryRow | null>(null);

  const customers = useQuery({ queryKey: ["customers-min"], queryFn: fetchCustomers });

  const invalidate = () => {
    for (const key of [
      ["cash-book"], ["cash-box"], ["cash-balance-total"], ["cash"], ["dash", "today"], ["dashboard-due"],
      ["dashboard-month"], ["collections-list"], ["cash-ledger"], ["trial-balance"], ["profit-loss"],
    ]) qc.invalidateQueries({ queryKey: key });
  };

  const choosePreset = (p: Preset) => { setPreset(p); setRange(presetRange(p)); };

  const filter = { from: range.from || undefined, to: range.to || undefined };
  // Hand cash is always the whole season; the period cards follow the chosen range
  const seasonSum = useQuery({ queryKey: ["cash-book", "summary", "season"], queryFn: () => fetchCashSummary() });
  const periodSum = useQuery({
    queryKey: ["cash-book", "summary", range.from, range.to],
    queryFn: () => fetchCashSummary(filter),
    enabled: preset !== "season",
  });
  const period = preset === "season" ? seasonSum.data : periodSum.data;
  const history = useQuery({ queryKey: ["cash-book", "history", range.from, range.to], queryFn: () => fetchCashHistory(filter) });

  const marks = useQuery({
    queryKey: ["book-marks"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("book_marks").select("entry_key, page, checked");
      if (error) throw error;
      const m: Record<string, { page: number | null; checked: boolean }> = {};
      for (const r of (data ?? []) as any[]) m[r.entry_key] = { page: r.page, checked: r.checked };
      return m;
    },
  });
  const [lastPage, setLastPage] = useState<number | null>(null);
  useEffect(() => {
    try {
      const v = Number(localStorage.getItem("cdb-last-book-page"));
      if (v > 0) setLastPage(v);
    } catch { /* storage unavailable */ }
  }, []);
  const saveMark = useMutation({
    mutationFn: async (v: { key: string; page: number | null; checked: boolean }) => {
      const { error } = await (supabase as any).from("book_marks").upsert({ entry_key: v.key, page: v.page, checked: v.checked });
      if (error) throw error;
      return v;
    },
    onMutate: (v) => {
      qc.setQueryData(["book-marks"], (old: any) => ({ ...(old ?? {}), [v.key]: { page: v.page, checked: v.checked } }));
      if (v.page) {
        setLastPage(v.page);
        try { localStorage.setItem("cdb-last-book-page", String(v.page)); } catch { /* storage unavailable */ }
      }
    },
    onError: (e: any) => { toast.error(e.message ?? "সেভ হয়নি"); qc.invalidateQueries({ queryKey: ["book-marks"] }); },
  });

  const all = history.data ?? [];
  const heads = useMemo(() => {
    const m = new Map<string, { dir: "in" | "out"; total: number; count: number }>();
    for (const r of all) {
      const c = m.get(r.head) ?? { dir: r.dir, total: 0, count: 0 };
      c.total += r.amount; c.count += 1;
      m.set(r.head, c);
    }
    return [...m.entries()].sort((a, b) => b[1].total - a[1].total);
  }, [all]);

  const rows = useMemo(() => {
    const isBooked = (r: CashHistoryRow) => !!marks.data?.[r.id]?.checked;
    const f = all.filter((r) => {
      if (head && r.head !== head) return false;
      if (kind === "in") return r.dir === "in";
      if (kind === "out") return r.dir === "out";
      if (kind === "old") return r.head === OLD_DUE_HEAD;
      if (kind === "unbooked") return r.dir === "out" && !isBooked(r);
      if (kind === "booked") return r.dir === "out" && isBooked(r);
      return true;
    });
    return newestFirst ? f : [...f].reverse();
  }, [all, head, kind, marks.data, newestFirst]);

  const days = useMemo(() => {
    const m = new Map<string, CashHistoryRow[]>();
    for (const r of rows) {
      const k = r.date?.slice(0, 10) ?? "";
      (m.get(k) ?? m.set(k, []).get(k)!).push(r);
    }
    return [...m.entries()];
  }, [rows]);

  const listIn = rows.filter((r) => r.dir === "in").reduce((a, b) => a + b.amount, 0);
  const listOut = rows.filter((r) => r.dir === "out").reduce((a, b) => a + b.amount, 0);

  const pageTotals = useMemo(() => {
    const m = new Map<number, number>();
    for (const r of all) {
      const mk = marks.data?.[r.id];
      if (r.dir === "out" && mk?.checked && mk.page) m.set(mk.page, (m.get(mk.page) ?? 0) + r.amount);
    }
    return [...m.entries()].sort((a, b) => b[0] - a[0]);
  }, [all, marks.data]);

  const rangeText = range.from || range.to
    ? range.from === range.to ? bnDate(range.from) : `${bnDate(range.from)} – ${bnDate(range.to)}`
    : "পুরো সিজন";

  const print = () => printTable({
    title: "ক্যাশ বই",
    subtitle: `${rangeText}${head ? ` · ${head}` : ""}`,
    headers: ["তারিখ", "নাম / বিবরণ", "খাত", "আয়", "ব্যয়"],
    rightCols: [3, 4],
    rows: rows.map((r) => {
      const { displayName, displayHead } = parseRowNameAndHead(r.head, r.detail);
      return [bnDate(r.date), displayName, displayHead, r.dir === "in" ? tk(r.amount) : "", r.dir === "out" ? tk(r.amount) : ""];
    }),
    totals: [["মোট আয়", tk(listIn)], ["মোট ব্যয়", tk(listOut)], ["নিট", tk(listIn - listOut)]],
  });

  const KIND_CHIPS: Array<[Kind, string]> = [
    ["all", "সব"],
    ["in", "আয়"],
    ["out", "ব্যয়"],
    ["old", "পুরোনো বকেয়া"],
    ["unbooked", "খাতায় তোলা বাকি"],
    ["booked", "খাতায় তোলা শেষ"],
  ];

  const handCash = seasonSum.data?.net ?? 0;

  return (
    <div className="mx-auto max-w-3xl space-y-4 pb-28 md:pb-6">
      {/* Title */}
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[26px] font-extrabold leading-tight">ক্যাশ বই</h1>
          <p className="text-sm text-muted-foreground">মূল ক্যাশের সব নগদ আয়-ব্যয়</p>
        </div>
        <Button variant="outline" size="icon" className="h-10 w-10 shrink-0 rounded-xl" onClick={print} aria-label="প্রিন্ট">
          <Printer className="h-5 w-5" />
        </Button>
      </div>

      {/* Hand cash hero */}
      <section className="bg-brick-pattern relative overflow-hidden rounded-[20px] bg-ink p-[18px] text-ink-foreground">
        <div className="text-xs font-bold tracking-[0.12em] text-stone-300">হাতে নগদ · মূল ক্যাশ</div>
        {seasonSum.isLoading ? (
          <Skeleton className="mt-3 h-10 w-48 bg-white/10" />
        ) : (
          <div className={`mt-2 font-display num text-[40px] font-extrabold leading-[0.95] tracking-tight ${handCash < 0 ? "text-red-300" : ""}`}>
            {handCash < 0 ? "−" : ""}{tk(Math.abs(handCash))}
          </div>
        )}
        <div className="mt-3.5 grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-white/10 bg-white/[0.07] px-3 py-2">
            <div className="text-xs font-semibold text-emerald-200">{PERIOD_WORD[preset]} এসেছে</div>
            <div className="num text-lg font-bold text-emerald-300">+{tk(period?.income ?? 0)}</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.07] px-3 py-2">
            <div className="text-xs font-semibold text-red-200">{PERIOD_WORD[preset]} গেছে</div>
            <div className="num text-lg font-bold text-red-300">−{tk(period?.expense ?? 0)}</div>
          </div>
        </div>
        {handCash < 0 && (
          <p className="mt-2 text-xs font-semibold text-red-200">ক্যাশ ঋণাত্মক দেখাচ্ছে, এন্ট্রিগুলো একবার মিলিয়ে নিন।</p>
        )}
      </section>

      {/* One entry button */}
      <Button className="h-14 w-full gap-2 rounded-2xl text-base font-bold shadow-sm" onClick={() => setEntrySheet(true)}>
        <Plus className="h-5 w-5" /> নতুন এন্ট্রি
      </Button>

      {/* Period chips */}
      <div className="overflow-x-auto [scrollbar-width:none]">
        <div className="flex w-max gap-2">
          {PRESETS.map(([p, label]) => (
            <button
              key={p}
              type="button"
              onClick={() => choosePreset(p)}
              className={`h-10 rounded-full px-4 text-sm font-bold transition active:scale-95 ${
                preset === p ? "bg-ink text-ink-foreground" : "border bg-card text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setDateSheet(true)}
            className={`flex h-10 items-center gap-1.5 rounded-full px-4 text-sm font-bold transition active:scale-95 ${
              preset === "custom" ? "bg-ink text-ink-foreground" : "border bg-card text-foreground"
            }`}
          >
            <CalendarRange className="h-4 w-4" />
            {preset === "custom" ? rangeText : "তারিখ বাছুন"}
          </button>
        </div>
      </div>

      {/* List */}
      <section className="overflow-hidden rounded-[20px] border bg-card">
        <div className="space-y-3 border-b p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-sm font-bold">{head ?? "সব লেনদেন"}</div>
              <div className="text-xs text-muted-foreground">{rangeText} · {bn(rows.length)}টি</div>
            </div>
            <div className="flex shrink-0 gap-1.5">
              <Button variant="outline" size="sm" className="h-9 gap-1 rounded-lg" onClick={() => setNewestFirst((v) => !v)}>
                <ArrowDownUp className="h-4 w-4" />{newestFirst ? "নতুন আগে" : "পুরনো আগে"}
              </Button>
              <Button variant={head ? "default" : "outline"} size="sm" className="h-9 gap-1 rounded-lg" onClick={() => setHeadSheet(true)}>
                <ListFilter className="h-4 w-4" />খাত
              </Button>
            </div>
          </div>
          <div className="overflow-x-auto [scrollbar-width:none]">
            <div className="flex w-max gap-1.5">
              {KIND_CHIPS.map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  className={`h-8 rounded-full px-3 text-xs font-bold transition ${
                    kind === k ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          {kind === "booked" && pageTotals.length > 0 && (
            <div className="flex flex-wrap gap-1.5 text-xs">
              {pageTotals.map(([p, t]) => (
                <span key={p} className="rounded-full border px-2 py-1">পৃষ্ঠা {bn(p)}: <b className="num">{tk(t)}</b></span>
              ))}
            </div>
          )}
          <div className="grid grid-cols-3 gap-1.5 text-center text-xs">
            <div className="rounded-lg bg-emerald-50 py-1.5 dark:bg-emerald-950/40">
              <div className="text-emerald-700 dark:text-emerald-300">আয়</div>
              <b className="num text-sm text-emerald-700 dark:text-emerald-300">{tk(listIn)}</b>
            </div>
            <div className="rounded-lg bg-red-50 py-1.5 dark:bg-red-950/40">
              <div className="text-red-700 dark:text-red-300">ব্যয়</div>
              <b className="num text-sm text-red-700 dark:text-red-300">{tk(listOut)}</b>
            </div>
            <div className="rounded-lg bg-muted py-1.5">
              <div className="text-muted-foreground">নিট</div>
              <b className="num text-sm">{listIn - listOut < 0 ? "−" : ""}{tk(Math.abs(listIn - listOut))}</b>
            </div>
          </div>
        </div>

        {history.isLoading ? (
          <div className="space-y-2 p-3">
            <Skeleton className="h-14" /><Skeleton className="h-14" /><Skeleton className="h-14" />
          </div>
        ) : days.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-muted-foreground">এই সময়ে কোনো লেনদেন নেই</div>
        ) : (
          days.map(([d, dayRows]) => {
            const inc = dayRows.filter((r) => r.dir === "in").reduce((a, b) => a + b.amount, 0);
            const exp = dayRows.filter((r) => r.dir === "out").reduce((a, b) => a + b.amount, 0);
            return (
              <div key={d}>
                <div className="flex items-center justify-between gap-2 bg-muted/70 px-3 py-2 text-xs">
                  <b className="text-sm">{bnDate(d)}</b>
                  <span className="num flex gap-2 font-semibold">
                    {inc > 0 && <span className="text-emerald-700 dark:text-emerald-300">+{tk(inc)}</span>}
                    {exp > 0 && <span className="text-red-700 dark:text-red-300">−{tk(exp)}</span>}
                  </span>
                </div>
                <div className="divide-y">
                  {dayRows.map((r) => {
                    const { displayName, displayHead } = parseRowNameAndHead(r.head, r.detail);
                    const { Icon, tone } = headLook(r.head, r.dir);
                    const mk = marks.data?.[r.id];
                    const booked = r.dir === "out" && !!mk?.checked;
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => setSelected(r)}
                        className="flex w-full items-center gap-3 px-3 py-3 text-left transition active:bg-muted/60"
                      >
                        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${tone}`}>
                          <Icon className="h-5 w-5" aria-hidden="true" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block break-words font-bold leading-snug">{displayName}</span>
                          <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                            <span>{displayHead}</span>
                            {booked && (
                              <span className="inline-flex items-center gap-0.5 rounded-full bg-success/15 px-1.5 font-semibold text-success">
                                <Check className="h-3 w-3" />পৃ. {bn(mk?.page ?? 0)}
                              </span>
                            )}
                          </span>
                        </span>
                        <span className={`num shrink-0 font-display text-base font-extrabold ${
                          r.dir === "in" ? "text-emerald-700 dark:text-emerald-300" : "text-red-700 dark:text-red-300"
                        }`}>
                          {r.dir === "in" ? "+" : "−"}{tk(r.amount)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </section>

      {/* Custom date range */}
      <Sheet open={dateSheet} onOpenChange={setDateSheet}>
        <SheetContent side="bottom" className="rounded-t-3xl pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
          <DateRangeForm
            initial={range}
            onApply={(r) => { setRange(r); setPreset("custom"); setDateSheet(false); }}
          />
        </SheetContent>
      </Sheet>

      {/* Head totals and filter */}
      <Sheet open={headSheet} onOpenChange={setHeadSheet}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-3xl pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
          <SheetHeader className="text-left">
            <SheetTitle>খাতভিত্তিক মোট</SheetTitle>
            <SheetDescription>{rangeText} — খাতে চাপলে শুধু সেটা দেখাবে</SheetDescription>
          </SheetHeader>
          <div className="mt-4 divide-y rounded-2xl border">
            <button
              type="button"
              onClick={() => { setHead(null); setHeadSheet(false); }}
              className={`flex w-full items-center justify-between px-3 py-3 text-left text-sm ${!head ? "bg-muted" : ""}`}
            >
              <b>সব খাত</b>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </button>
            {heads.map(([h, v]) => {
              const { Icon, tone } = headLook(h, v.dir);
              return (
                <button
                  key={h}
                  type="button"
                  onClick={() => { setHead(h); setKind("all"); setHeadSheet(false); }}
                  className={`flex w-full items-center gap-3 px-3 py-3 text-left text-sm ${head === h ? "bg-muted" : ""}`}
                >
                  <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${tone}`}><Icon className="h-4 w-4" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{h}</span>
                    <span className="text-xs text-muted-foreground">{v.dir === "in" ? "আয়" : "ব্যয়"} · {bn(v.count)}টি</span>
                  </span>
                  <b className={`num ${v.dir === "in" ? "text-emerald-700 dark:text-emerald-300" : "text-red-700 dark:text-red-300"}`}>{tk(v.total)}</b>
                </button>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>

      {/* New entry picker */}
      <Sheet open={entrySheet} onOpenChange={setEntrySheet}>
        <SheetContent side="bottom" className="max-h-[88vh] overflow-y-auto rounded-t-3xl pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
          <SheetHeader className="text-left">
            <SheetTitle>নতুন এন্ট্রি</SheetTitle>
            <SheetDescription>কী ধরনের লেনদেন বেছে নিন</SheetDescription>
          </SheetHeader>

          <div className="mt-4 text-xs font-bold tracking-wide text-emerald-700 dark:text-emerald-300">টাকা এসেছে</div>
          <div className="mt-2 grid grid-cols-3 gap-2">
            <EntryTile icon={Banknote} tone="green" label="গ্রাহকের টাকা" onClick={() => { setEntrySheet(false); setIncomeOpen(true); }} />
            {can("/owners") && <EntryTile icon={Crown} tone="amber" label="মালিকের বিনিয়োগ" to="/owners" />}
            {can("/loans") && <EntryTile icon={Landmark} tone="blue" label="ঋণ নেওয়া" to="/loans" />}
            {can("/opening-balances") && <EntryTile icon={History} tone="amber" label="গত বছরের পাওনা" to="/opening-balances" />}
          </div>

          <div className="mt-5 text-xs font-bold tracking-wide text-red-700 dark:text-red-300">টাকা গেছে</div>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {EXPENSE_HEADS.map((h) => {
              const { Icon } = headLook(expenseHeadToHistoryHead(h), "out");
              return (
                <EntryTile
                  key={h}
                  icon={Icon}
                  tone={h === "সম্পদ" ? "blue" : h === "কাঁচামাল" || h === "যন্ত্রাংশ / মালামাল" || h === "বিদ্যুৎ বিল" ? "stone" : "red"}
                  label={h}
                  onClick={() => { setEntrySheet(false); setExpenseHead(h); }}
                />
              );
            })}
            {can("/purchases") && <EntryTile icon={Tractor} tone="stone" label="ভেকু" to="/purchases" search={{ f: "veku" }} />}
            {can("/purchases") && <EntryTile icon={Truck} tone="stone" label="গাড়ি ভাড়া" to="/purchases" search={{ f: "vehicle" }} />}
            {can("/purchases") && <EntryTile icon={LandPlot} tone="stone" label="জমি ভাড়া" to="/purchases" search={{ f: "land" }} />}
            {can("/purchases") && <EntryTile icon={Sparkles} tone="stone" label="পরিচ্ছন্ন কর্মী" to="/purchases" search={{ f: "clean" }} />}
            {can("/opening-balances") && <EntryTile icon={History} tone="amber" label="পূর্বের দেনা" to="/opening-balances" />}
            {can("/owners") && <EntryTile icon={Crown} tone="amber" label="মালিকের উত্তোলন" to="/owners" />}
          </div>
        </SheetContent>
      </Sheet>

      <IncomeDialog open={incomeOpen} onOpenChange={setIncomeOpen} customers={customers.data ?? []} onDone={invalidate} />
      <AddExpenseDialog
        open={expenseHead !== null}
        onOpenChange={(o) => { if (!o) setExpenseHead(null); }}
        initialHead={expenseHead ?? undefined}
        onDone={invalidate}
      />

      {/* Row detail */}
      <Sheet open={!!selected} onOpenChange={(o) => { if (!o) setSelected(null); }}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-3xl pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
          {selected && (
            <RowDetail
              row={selected}
              mark={marks.data?.[selected.id]}
              lastPage={lastPage}
              onSaveMark={(page, checked) => saveMark.mutate({ key: selected.id, page, checked })}
              onEdit={() => { setEditRow(selected); setSelected(null); }}
              onDelete={() => { setDeleteRow(selected); setSelected(null); }}
            />
          )}
        </SheetContent>
      </Sheet>

      {editRow && <RowEditDialog key={editRow.id} row={editRow} onClose={() => setEditRow(null)} onDone={invalidate} />}
      {deleteRow && <RowDeleteDialog key={deleteRow.id} row={deleteRow} onClose={() => setDeleteRow(null)} onDone={invalidate} />}
    </div>
  );
}

/** Expense dialog head → the head fetchCashHistory gives such rows (only used for the icon) */
function expenseHeadToHistoryHead(h: string) {
  if (h === "সরদার") return "সরদার পেমেন্ট";
  if (h === "ডেলি") return "ডেলি শ্রমিক";
  if (h === "মেস্তুরি ও ম্যানেজার") return "বেতন (মেস্তুরি/ম্যানেজার)";
  if (h === "ভেকু" || h === "কাঁচামাল" || h === "যন্ত্রাংশ / মালামাল") return "মালামাল ক্রয় পরিশোধ";
  return h;
}

const TILE_TONES: Record<string, string> = {
  green: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
  red: "bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300",
  amber: "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300",
  blue: "bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300",
  stone: "bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-200",
};

function EntryTile({ icon: Icon, tone, label, onClick, to, search }: {
  icon: React.ComponentType<{ className?: string }>;
  tone: keyof typeof TILE_TONES;
  label: string;
  onClick?: () => void;
  to?: string;
  search?: Record<string, string>;
}) {
  const inner = (
    <>
      <span className={`grid h-10 w-10 place-items-center rounded-xl ${TILE_TONES[tone]}`}>
        <Icon className="h-5 w-5" />
      </span>
      <span className="text-[13px] font-bold leading-tight">{label}</span>
    </>
  );
  const cls = "flex min-h-[92px] flex-col items-center justify-center gap-1.5 rounded-2xl border bg-card px-1 py-2.5 text-center transition active:scale-95";
  if (to) return <Link to={to as never} search={search as never} className={cls}>{inner}</Link>;
  return <button type="button" onClick={onClick} className={cls}>{inner}</button>;
}

function DateRangeForm({ initial, onApply }: { initial: Range; onApply: (r: Range) => void }) {
  const [from, setFrom] = useState(initial.from || todayBD());
  const [to, setTo] = useState(initial.to || todayBD());
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!from || !to) return toast.error("দুটি তারিখই দিন");
        if (to < from) return toast.error("শেষ তারিখ শুরুর আগে হতে পারে না");
        onApply({ from, to });
      }}
    >
      <SheetHeader className="text-left">
        <SheetTitle>তারিখ বাছুন</SheetTitle>
        <SheetDescription>যে সময়ের হিসাব দেখতে চান</SheetDescription>
      </SheetHeader>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1"><Label>শুরু</Label><Input type="date" className="h-12" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div className="space-y-1"><Label>শেষ</Label><Input type="date" className="h-12" value={to} onChange={(e) => setTo(e.target.value)} /></div>
      </div>
      <Button type="submit" className="h-12 w-full rounded-xl text-base font-bold">দেখাও</Button>
    </form>
  );
}

function RowDetail({ row, mark, lastPage, onSaveMark, onEdit, onDelete }: {
  row: CashHistoryRow;
  mark?: { page: number | null; checked: boolean };
  lastPage: number | null;
  onSaveMark: (page: number | null, checked: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { displayName, displayHead } = parseRowNameAndHead(row.head, row.detail);
  const { Icon, tone } = headLook(row.head, row.dir);
  const locked = BRICK_SETTLE_HEADS.has(row.head);
  return (
    <div className="space-y-4">
      <SheetHeader className="text-left">
        <div className="flex items-center gap-3">
          <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${tone}`}><Icon className="h-6 w-6" /></span>
          <div className="min-w-0">
            <SheetTitle className="break-words leading-snug">{displayName}</SheetTitle>
            <SheetDescription>{displayHead} · {bnDate(row.date)}</SheetDescription>
          </div>
        </div>
      </SheetHeader>

      <div className={`rounded-2xl p-4 text-center ${row.dir === "in" ? "bg-emerald-50 dark:bg-emerald-950/40" : "bg-red-50 dark:bg-red-950/40"}`}>
        <div className="text-xs font-semibold text-muted-foreground">{row.dir === "in" ? "টাকা এসেছে" : "টাকা গেছে"}</div>
        <div className={`num font-display text-3xl font-extrabold ${row.dir === "in" ? "text-emerald-700 dark:text-emerald-300" : "text-red-700 dark:text-red-300"}`}>
          {row.dir === "in" ? "+" : "−"}{tk(row.amount)}
        </div>
      </div>

      {row.dir === "out" && (
        <div className="space-y-1.5">
          <Label>কাগজের খাতায় তোলা</Label>
          <BookMarkCell
            key={`${row.id}-${mark?.page ?? ""}`}
            initialPage={mark?.page ?? null}
            checked={!!mark?.checked}
            lastPage={lastPage}
            onSave={onSaveMark}
          />
        </div>
      )}

      {locked ? (
        <p className="rounded-xl bg-muted p-3 text-sm text-muted-foreground">
          এটা ইট দিয়ে সাপ্লায়ারের বাকি শোধের অংশ। বদলাতে বা মুছতে সংশ্লিষ্ট চালান থেকে করুন।
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" className="h-12 gap-2 rounded-xl text-base font-bold" onClick={onEdit}>
            <Pencil className="h-4 w-4" /> সম্পাদনা
          </Button>
          <Button variant="outline" className="h-12 gap-2 rounded-xl border-destructive/40 text-base font-bold text-destructive" onClick={onDelete}>
            <Trash2 className="h-4 w-4" /> মুছুন
          </Button>
        </div>
      )}
    </div>
  );
}

function RowEditDialog({ row, onClose, onDone }: { row: CashHistoryRow; onClose: () => void; onDone: () => void }) {
  const [amount, setAmount] = useState(String(row.amount));
  const [date, setDate] = useState(row.date?.slice(0, 10) ?? "");
  const [note, setNote] = useState("");
  const { displayName, displayHead } = parseRowNameAndHead(row.head, row.detail);

  const mut = useMutation({
    mutationFn: async () => {
      const amt = Number(amount);
      if (!Number.isFinite(amt) || amt <= 0) throw new Error("টাকার পরিমাণ সঠিক নয়");
      if (!date) throw new Error("তারিখ দিন");
      const { table, dateCol, id } = resolveRowKey(row.id);
      const patch: Record<string, unknown> = { amount: amt, [dateCol]: date };
      if (note.trim()) patch.note = note.trim();
      const { error } = await (supabase as any).from(table).update(patch).eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { toast.success("হালনাগাদ হয়েছে"); onClose(); onDone(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>এন্ট্রি সম্পাদনা</DialogTitle>
          <DialogDescription>{displayName} — {displayHead}</DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); mut.mutate(); }} className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1"><Label>টাকা *</Label><Input type="number" inputMode="decimal" min="0" step="0.01" className="h-11" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
            <div className="space-y-1"><Label>তারিখ *</Label><Input type="date" className="h-11" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          </div>
          <div className="space-y-1"><Label>নোট (খালি রাখলে আগেরটাই থাকবে)</Label><Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} /></div>
          <DialogFooter><Button type="submit" className="h-11" disabled={mut.isPending}>হালনাগাদ</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RowDeleteDialog({ row, onClose, onDone }: { row: CashHistoryRow; onClose: () => void; onDone: () => void }) {
  const [password, setPassword] = useState("");
  const { displayName, displayHead } = parseRowNameAndHead(row.head, row.detail);

  const mut = useMutation({
    mutationFn: async () => {
      if (!password) throw new Error("এডমিন পাসওয়ার্ড দিন");
      const ok = await verifyAdminPasswordClient(password);
      if (!ok) throw new Error("এডমিন পাসওয়ার্ড সঠিক নয়");
      const { table, id } = resolveRowKey(row.id);
      const { error } = await (supabase as any).from(table).delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { toast.success("এন্ট্রি মুছে ফেলা হয়েছে"); onClose(); onDone(); },
    onError: (e: Error) => toast.error(e.message || "মুছে ফেলা যায়নি"),
  });

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Lock className="h-4 w-4 text-destructive" />এডমিন পাসওয়ার্ড দিন</DialogTitle>
          <DialogDescription>{displayName} — {displayHead} — {tk(row.amount)}। এন্ট্রি স্থায়ীভাবে মুছে যাবে।</DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); mut.mutate(); }} className="space-y-3">
          <Input type="password" className="h-11" value={password} autoComplete="current-password" onChange={(e) => setPassword(e.target.value)} placeholder="এডমিন পাসওয়ার্ড" />
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={onClose}>বাতিল</Button>
            <Button type="submit" variant="destructive" disabled={mut.isPending}>মুছুন</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function IncomeDialog({ open, onOpenChange, customers, onDone }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  customers: Array<{ id: string; name: string }>;
  onDone: () => void;
}) {
  const [customerId, setCustomerId] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayBD());
  const [method, setMethod] = useState("cash");
  const [note, setNote] = useState("");

  const mut = useMutation({
    mutationFn: async () => {
      const amt = Number(amount);
      if (!customerId) throw new Error("গ্রাহক নির্বাচন করুন");
      if (!Number.isFinite(amt) || amt <= 0) throw new Error("টাকার পরিমাণ সঠিক নয়");
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError) throw new Error(userError.message);
      if (!user) throw new Error("আয় যোগ করার আগে আবার লগইন করুন।");

      const { error } = await sdb.from("collections").insert({
        customer_id: customerId,
        contract_id: null,
        amount: amt,
        payment_date: date,
        method: method || null,
        note: note || null,
        created_by: user.id,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("আয় যোগ হয়েছে");
      onOpenChange(false);
      setCustomerId(""); setAmount(""); setNote("");
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>গ্রাহকের কাছ থেকে টাকা</DialogTitle>
          <DialogDescription>ইট বিক্রি বা অগ্রিম বাবদ নগদ আয়</DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); mut.mutate(); }} className="space-y-3">
          <div className="space-y-1">
            <Label>গ্রাহক *</Label>
            <Select value={customerId} onValueChange={setCustomerId}>
              <SelectTrigger className="h-11"><SelectValue placeholder="গ্রাহক নির্বাচন করুন" /></SelectTrigger>
              <SelectContent>
                {customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label>টাকা *</Label>
              <Input type="number" inputMode="decimal" min="0" step="0.01" className="h-11" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="০" />
            </div>
            <div className="space-y-1">
              <Label>তারিখ *</Label>
              <Input type="date" className="h-11" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>মাধ্যম</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
              <SelectContent>
                {METHODS.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>নোট</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
          </div>
          <DialogFooter>
            <Button type="submit" className="h-11" disabled={mut.isPending}>সংরক্ষণ</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function BookMarkCell({ initialPage, checked, lastPage, onSave }: {
  initialPage: number | null; checked: boolean; lastPage: number | null;
  onSave: (page: number | null, checked: boolean) => void;
}) {
  const [val, setVal] = useState(initialPage ? String(initialPage) : "");
  const shown = val || (!checked && lastPage ? String(lastPage) : "");
  const toggle = () => {
    if (checked) { onSave(val ? Number(val) : null, false); return; }
    const p = Number(shown);
    if (!p) { toast.error("আগে খাতার পৃষ্ঠা নম্বর লিখুন"); return; }
    setVal(String(p));
    onSave(p, true);
  };
  return (
    <div className="flex items-center gap-2">
      <Input
        inputMode="numeric"
        aria-label="খাতার পৃষ্ঠা"
        placeholder="পৃষ্ঠা"
        className="h-12 w-24 text-center text-base"
        value={shown}
        onChange={(e) => setVal(e.target.value.replace(/[^0-9]/g, ""))}
      />
      <Button
        type="button"
        variant={checked ? "default" : "outline"}
        className={`h-12 flex-1 gap-2 rounded-xl font-bold ${checked ? "bg-success text-success-foreground hover:bg-success/90" : ""}`}
        onClick={toggle}
      >
        <Check className="h-5 w-5" />
        {checked ? "খাতায় তোলা হয়েছে" : "খাতায় তুলেছি"}
      </Button>
    </div>
  );
}
