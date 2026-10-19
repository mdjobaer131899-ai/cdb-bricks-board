import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, ChevronRight, Clock, Mountain, Pencil, Plus, Printer, ShoppingCart, Tractor, Trash2, Wrench } from "lucide-react";
import { CLEANER_CONTRACT, CONTRACT_ITEMS, CONTRACT_TYPES, ContractFolder, LAND_CONTRACT, VEHICLE_CONTRACT } from "@/components/contract-folder";
import { VekuFolder } from "@/components/veku-folder";
import { ExpenseEntryDialog, PURCHASE_HEADS, type ExpenseEdit, type HeadKey } from "@/components/expense-entry";
import { PARTS_PREFIX, POWER_BILL } from "@/components/contract-config";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { sdb } from "@/lib/season-db";
import { bn, bnDate, todayBD } from "@/lib/format";
import { useCurrentUser } from "@/lib/use-current-user";
import { printTable } from "@/lib/print-table";

/* =========================================================
   Purchases & expenses.
   Items come from the raw_materials catalog:
     item_group  raw | other             (which folder)
     pricing     unit | total | flex     (how the amount is entered)
     pay_mode    credit | cash           (credit -> purchases + supplier_payments,
                                          part may stay due; cash -> expenses,
                                          paid in full, no seller, e.g. বিদ্যুৎ বিল)
   Parts bought with no shop name are expenses "যন্ত্রাংশ / মালামাল — <item>" and
   are read back into the other folder too.
   Every entry and edit goes through the one expense form (expense-entry.tsx).
   The main page shows totals and the history folders; supplier dues are paid
   on the suppliers page (cash or bricks).
   ========================================================= */

type Folder = "raw" | "other" | "land" | "clean" | "vehicle" | "veku";

export const Route = createFileRoute("/_authenticated/purchases")({
  head: () => ({
    meta: [
      { title: "মালামাল ক্রয় ও খরচ — CDB Bricks" },
      { name: "description", content: "কাঁচামাল, ইঞ্জিন মালামাল, বিদ্যুৎ বিল, গাড়ি ভাড়া সহ সব কেনাকাটা ও খরচের হিসাব।" },
    ],
  }),
  // Which history folder is open lives in the URL (?f=raw|other) so the phone back button returns here
  validateSearch: (search: Record<string, unknown>): { f?: Folder } =>
    search.f === "raw" || search.f === "other" || search.f === "land" || search.f === "clean" || search.f === "vehicle" || search.f === "veku" ? { f: search.f } : {},
  component: PurchasesPage,
});

type Item = {
  id: string;
  name: string;
  unit: string;
  item_group: string;
  pricing: string;
  pay_mode: string;
  buy_pattern: string;
  in_brick_cost: boolean;
  sort_order: number;
};

/** One history row, from purchases (credit items) or expenses (cash items) */
type Entry = {
  key: string;
  source: "purchase" | "expense";
  id: string;
  date: string;
  item: Item | undefined;
  name: string;
  supplier_id: string | null;
  quantity: number;
  unit: string | null;
  rate: number;
  total: number;
  note: string | null;
  /** expenses rows: the stored category */
  category?: string;
};

const RAW_LOOK: Record<string, { chip: string; initial: string }> = {
  মাটি: { chip: "bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-200", initial: "মা" },
  বালু: { chip: "bg-stone-200 text-stone-800 dark:bg-stone-800 dark:text-stone-200", initial: "বা" },
  কয়লা: { chip: "bg-stone-800 text-stone-50 dark:bg-stone-200 dark:text-stone-900", initial: "ক" },
  তুষ: { chip: "bg-yellow-100 text-yellow-900 dark:bg-yellow-950/60 dark:text-yellow-200", initial: "তু" },
  ডিজেল: { chip: "bg-blue-100 text-blue-900 dark:bg-blue-950/60 dark:text-blue-200", initial: "ডি" },
  লাকড়ি: { chip: "bg-accent text-accent-foreground", initial: "লা" },
};
const look = (name: string) =>
  RAW_LOOK[name.normalize("NFC")] ?? { chip: "bg-muted text-foreground", initial: name.trim().charAt(0) || "?" };

const tk = (n: number) => `৳${bn(Math.round(n))}`;
const daysBetween = (a: string, b: string) =>
  Math.round((new Date(b + "T12:00:00+06:00").getTime() - new Date(a + "T12:00:00+06:00").getTime()) / 86400000);

function PurchasesPage() {
  const { data: me } = useCurrentUser();
  const isAdmin = me?.role === "admin";
  const today = todayBD();
  const { f: folder } = Route.useSearch();
  const navigate = useNavigate();
  const openFolder = (k: Folder) => navigate({ to: "/purchases", search: { f: k } });
  const closeFolder = () => {
    if (typeof window !== "undefined" && window.history.length > 1) window.history.back();
    else navigate({ to: "/purchases", search: {}, replace: true });
  };

  // new entries and edits: the one expense form
  const [entry, setEntry] = useState<{ head?: HeadKey; edit?: ExpenseEdit } | null>(null);
  const [itemFilter, setItemFilter] = useState<string>("all");

  /* ---------- data ---------- */
  const itemsQ = useQuery({
    queryKey: ["purchase-items"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("raw_materials")
        .select("id, name, unit, item_group, pricing, pay_mode, buy_pattern, in_brick_cost, sort_order")
        .eq("active", true)
        .order("sort_order")
        .order("name");
      if (error) throw error;
      return (data ?? []) as Item[];
    },
  });
  const supQ = useQuery({
    queryKey: ["suppliers"],
    queryFn: async () => (await supabase.from("suppliers").select("id,name,phone,material_type").order("name")).data ?? [],
  });
  const purQ = useQuery({
    queryKey: ["purchases"],
    queryFn: async () => {
      const { data, error } = await sdb
        .from("purchases")
        .select("id, purchase_date, supplier_id, material_id, item_name, quantity, unit, unit_price, total_amount, note")
        .order("purchase_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const payQ = useQuery({
    queryKey: ["supplier-payments"],
    queryFn: async () => {
      const { data, error } = await sdb.from("supplier_payments").select("supplier_id, amount");
      // land rent and sweeper contracts have their own folders and totals
      if (error) throw error;
      return data ?? [];
    },
  });

  const items = itemsQ.data ?? [];
  const cashItemNames = items.filter((i) => i.pay_mode === "cash").map((i) => i.name);
  const expQ = useQuery({
    queryKey: ["purchase-cash-expenses", cashItemNames.join("|")],
    enabled: cashItemNames.length > 0,
    queryFn: async () => {
      const { data, error } = await sdb
        .from("expenses")
        .select("id, expense_date, category, amount, note")
        .in("category", cashItemNames)
        .order("expense_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  // parts bought with no shop name (cash, nothing due)
  const partsExpQ = useQuery({
    queryKey: ["purchase-parts-expenses"],
    queryFn: async () => {
      const { data, error } = await sdb
        .from("expenses")
        .select("id, expense_date, category, amount, note")
        .like("category", `${PARTS_PREFIX}%`)
        .order("expense_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const rawItems = items.filter((i) => i.item_group === "raw");
  const otherItems = items.filter((i) => i.item_group !== "raw");
  const supName = (id: string | null) => (supQ.data ?? []).find((s) => s.id === id)?.name ?? "—";
  const itemByName = (n: string) => items.find((i) => i.name.normalize("NFC") === n.trim().normalize("NFC"));

  /* ---------- history ---------- */
  const entries: Entry[] = useMemo(() => {
    const fromPurchases: Entry[] = (purQ.data ?? []).filter((p) => !CONTRACT_ITEMS.has(p.item_name)).map((p) => {
      const it = items.find((i) => i.id === p.material_id) ?? itemByName(p.item_name);
      return {
        key: `p${p.id}`,
        source: "purchase",
        id: p.id,
        date: p.purchase_date,
        item: it,
        name: p.item_name,
        supplier_id: p.supplier_id,
        quantity: Number(p.quantity) || 0,
        unit: p.unit,
        rate: Number(p.unit_price) || 0,
        total: Number(p.total_amount) || 0,
        note: p.note,
      };
    });
    const fromExpenses: Entry[] = [...(expQ.data ?? []), ...(partsExpQ.data ?? [])].map((e) => ({
      key: `e${e.id}`,
      source: "expense",
      id: e.id,
      date: e.expense_date,
      item: itemByName(e.category),
      name: e.category.startsWith(PARTS_PREFIX) ? e.category.slice(PARTS_PREFIX.length) : e.category,
      category: e.category,
      supplier_id: null,
      quantity: 0,
      unit: null,
      rate: 0,
      total: Number(e.amount) || 0,
      note: e.note,
    }));
    return [...fromPurchases, ...fromExpenses].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [purQ.data, expQ.data, partsExpQ.data, items]);

  const inFolder = (e: Entry, f: Folder) => (f === "raw" ? e.item?.item_group === "raw" : e.item?.item_group !== "raw");
  const sumOf = (rows: Entry[]) => rows.reduce((a, e) => a + e.total, 0);
  const rawEntries = entries.filter((e) => inFolder(e, "raw"));
  const otherEntries = entries.filter((e) => inFolder(e, "other"));

  const totals = useMemo(() => {
    const bought = sumOf(entries);
    const cashBills = sumOf(entries.filter((e) => e.source === "expense"));
    const credit = bought - cashBills;
    const landIds = new Set((supQ.data ?? []).filter((x: any) => CONTRACT_TYPES.has(x.material_type)).map((x: any) => x.id));
    const paid = (payQ.data ?? []).filter((p) => !landIds.has(p.supplier_id)).reduce((a, p) => a + Number(p.amount || 0), 0);
    return { bought, paid: paid + cashBills, due: credit - paid };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, payQ.data, supQ.data]);

  // "time to buy again" for items bought when they run out (coal, diesel)
  const reminders = useMemo(() => {
    return rawItems
      .filter((it) => it.buy_pattern === "refill")
      .map((it) => {
        const rows = entries.filter((e) => e.item?.id === it.id).sort((a, b) => (a.date < b.date ? -1 : 1));
        if (rows.length < 2) return null;
        const gaps: number[] = [];
        for (let i = 1; i < rows.length; i++) {
          const g = daysBetween(rows[i - 1].date, rows[i].date);
          if (g > 0) gaps.push(g);
        }
        if (!gaps.length) return null;
        const avg = gaps.reduce((a, g) => a + g, 0) / gaps.length;
        const since = daysBetween(rows[rows.length - 1].date, today);
        return since >= Math.max(1, Math.round(avg) - 1) ? { name: it.name, avg, since } : null;
      })
      .filter(Boolean) as { name: string; avg: number; since: number }[];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawItems, entries, today]);

  /* ---------- edit through the one form ---------- */
  function openEdit(e: Entry) {
    if (e.source === "expense") {
      const head: HeadKey | null = e.category === POWER_BILL ? "power" : e.category?.startsWith(PARTS_PREFIX) ? "parts" : null;
      if (!head) return toast.error("এই এন্ট্রি ক্যাশ বই থেকে সংশোধন করুন");
      setEntry({ head, edit: { table: "expenses", id: e.id, date: e.date, category: e.category ?? e.name, amount: e.total, note: e.note } });
      return;
    }
    setEntry({
      head: e.item?.item_group === "raw" ? "raw" : "parts",
      edit: { table: "purchases", id: e.id, supplier_id: e.supplier_id, date: e.date, item_name: e.name, material_id: e.item?.id ?? null, quantity: e.quantity, unit: e.unit, unit_price: e.rate, total: e.total, note: e.note },
    });
  }

  const delEntry = useMutation({
    mutationFn: async (e: Entry) => {
      const { error } = await supabase.from(e.source === "expense" ? "expenses" : "purchases").delete().eq("id", e.id);
      if (error) throw error;
    },
    onSuccess: () => toast.success("মুছে ফেলা হয়েছে"),
    onError: (e: Error) => toast.error(e.message),
  });

  const lineText = (e: Entry) =>
    e.source === "expense" ? "নগদ, বাকি নেই" : e.quantity > 0 ? `${bn(e.quantity)} ${e.unit ?? ""} × ${tk(e.rate)}` : "মোট দাম";

  const print = (rows: Entry[], title: string) =>
    printTable({
      title,
      headers: ["তারিখ", "কী", "কার কাছ থেকে", "পরিমাণ", "দর", "মোট"],
      rightCols: [3, 4, 5],
      rows: rows.map((e) => [
        bnDate(e.date),
        e.name,
        e.source === "expense" ? "—" : supName(e.supplier_id),
        e.quantity > 0 ? `${bn(e.quantity)} ${e.unit ?? ""}` : "—",
        e.quantity > 0 ? bn(e.rate) : "—",
        `৳ ${bn(e.total)}`,
      ]),
      totals: [["মোট", `৳ ${bn(sumOf(rows))}`]],
    });

  const loading = itemsQ.isLoading || purQ.isLoading;

  const dialogs = (
    <ExpenseEntryDialog
      open={!!entry}
      onOpenChange={(o) => { if (!o) setEntry(null); }}
      head={entry?.head ?? null}
      heads={PURCHASE_HEADS}
      edit={entry?.edit ?? null}
    />
  );

  const EntryRows = ({ rows }: { rows: Entry[] }) => (
    <div className="overflow-hidden rounded-2xl border bg-card">
      {rows.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">এখনো কিছু লেখা হয়নি।</p>
      ) : (
        rows.map((e) => (
          <div key={e.key} className="flex items-center gap-3 border-b px-4 py-2.5 last:border-b-0">
            <span className={`font-display grid h-9 w-9 shrink-0 place-items-center rounded-xl text-sm font-extrabold ${look(e.name).chip}`}>{look(e.name).initial}</span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[15px] font-semibold">{e.name}</div>
              <div className="truncate text-xs text-muted-foreground">
                {bnDate(e.date)}
                {e.source === "purchase" ? ` · ${supName(e.supplier_id)}` : ""} · {lineText(e)}
                {e.note ? ` · ${e.note}` : ""}
              </div>
            </div>
            <div className="num shrink-0 text-[15px] font-bold">{tk(e.total)}</div>
            {isAdmin && (
              <div className="flex shrink-0">
                <Button size="icon" variant="ghost" aria-label="সম্পাদনা" onClick={() => openEdit(e)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" aria-label="মুছুন" onClick={() => confirm("এই এন্ট্রি মুছবেন?") && delEntry.mutate(e)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );

  /* ================= main page ================= */
  if (!folder) {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-5 pb-4">
        <div className="space-y-3 px-0.5 pt-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h1 className="font-display flex items-center gap-2 text-[26px] font-extrabold leading-tight">
              <ShoppingCart className="h-6 w-6 text-primary" aria-hidden="true" /> মালামাল ক্রয় ও খরচ
            </h1>
            <Button asChild variant="secondary" size="sm">
              <Link to="/suppliers">সাপ্লায়ার ও বাকি</Link>
            </Button>
          </div>
          <button
            type="button"
            onClick={() => setEntry({})}
            className="flex h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-primary text-base font-bold text-primary-foreground shadow-sm transition active:scale-[0.99] disabled:opacity-60 md:w-auto md:px-6"
          >
            <Plus className="h-5 w-5" aria-hidden="true" />
            খরচ এন্ট্রি করুন
          </button>
        </div>

        <section className="grid grid-cols-3 gap-2">
          <div className="flex flex-col gap-1 rounded-2xl border bg-card p-3">
            <span className="text-xs font-semibold text-muted-foreground">মোট ক্রয়</span>
            <span className="num text-[15px] font-bold sm:text-lg">{tk(totals.bought)}</span>
          </div>
          <div className="flex flex-col gap-1 rounded-2xl border bg-card p-3">
            <span className="text-xs font-semibold text-muted-foreground">পরিশোধ</span>
            <span className="num text-[15px] font-bold text-success sm:text-lg">{tk(totals.paid)}</span>
          </div>
          <Link to="/suppliers" className="flex flex-col gap-1 rounded-2xl border bg-card p-3 transition hover:bg-muted/50">
            <span className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
              বাকি <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
            <span className={`num text-[15px] font-bold sm:text-lg ${totals.due < 0 ? "text-info" : "text-warning"}`}>{tk(totals.due)}</span>
          </Link>
        </section>

        {reminders.map((r) => (
          <div key={r.name} className="flex items-start gap-2.5 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
            <Clock className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            <span>
              <b>{r.name} কেনার সময় হয়ে এসেছে।</b> সাধারণত প্রতি {bn(Math.round(r.avg))} দিনে কেনা হয়, শেষবার কেনা হয়েছে {bn(r.since)} দিন আগে।
            </span>
          </div>
        ))}

        {loading ? (
          <div className="grid grid-cols-2 gap-2.5">
            <Skeleton className="h-[170px] rounded-2xl" />
            <Skeleton className="h-[170px] rounded-2xl" />
          </div>
        ) : (
          <section className="grid grid-cols-2 gap-2.5">
            {(
              [
                { key: "raw" as const, title: "কাঁচামাল", sub: "মাটি, বালু, কয়লা, তুষ, ডিজেল…", rows: rawEntries, chip: "bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-200", icon: Mountain },
                { key: "other" as const, title: "অন্যান্য মালামাল ও খরচ", sub: "ইঞ্জিন মালামাল, বিদ্যুৎ বিল…", rows: otherEntries, chip: "bg-blue-100 text-blue-900 dark:bg-blue-950/60 dark:text-blue-200", icon: Wrench },
              ]
            ).map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => {
                  setItemFilter("all");
                  openFolder(t.key);
                }}
                className="flex min-h-[170px] flex-col gap-2 rounded-2xl border bg-card p-3.5 text-left transition hover:bg-muted/50 active:scale-[0.99]"
              >
                <span className="flex items-center justify-between">
                  <span className={`grid h-11 w-11 place-items-center rounded-xl ${t.chip}`}>
                    <t.icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <ChevronRight className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                </span>
                <span className="text-base font-bold leading-tight">{t.title}</span>
                <span className="line-clamp-2 text-xs text-muted-foreground">{t.sub}</span>
                <span className="font-display num mt-auto text-xl font-extrabold">{tk(sumOf(t.rows))}</span>
                <span className="text-[11px] font-semibold text-muted-foreground">{bn(t.rows.length)}টি এন্ট্রি · ইতিহাস দেখুন</span>
              </button>
            ))}
            <button
              type="button"
              onClick={() => openFolder("veku")}
              className="col-span-2 flex items-center gap-3 rounded-2xl border bg-card p-3.5 text-left transition hover:bg-muted/50 active:scale-[0.99]"
            >
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-yellow-100 text-yellow-900 dark:bg-yellow-950/60 dark:text-yellow-200">
                <Tractor className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-base font-bold leading-tight">ভেকু</span>
                <span className="block text-xs text-muted-foreground">কত ঘণ্টা কাজ, ডিজেল-মবিল-চালকের টাকা, কত বাকি</span>
              </span>
              <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            </button>
            {[VEHICLE_CONTRACT, LAND_CONTRACT, CLEANER_CONTRACT].map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => openFolder(c.key)}
                className="col-span-2 flex items-center gap-3 rounded-2xl border bg-card p-3.5 text-left transition hover:bg-muted/50 active:scale-[0.99]"
              >
                <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${c.chip}`}>
                  <c.icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-bold leading-tight">{c.title}</span>
                  <span className="block text-xs text-muted-foreground">{c.subtitle}</span>
                </span>
                <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
              </button>
            ))}
          </section>
        )}

        {dialogs}
      </div>
    );
  }

  /* ================= folder: land rent ================= */
  if (folder === "land") return <ContractFolder key="land" cfg={LAND_CONTRACT} onBack={closeFolder} />;
  if (folder === "clean") return <ContractFolder key="clean" cfg={CLEANER_CONTRACT} onBack={closeFolder} />;
  if (folder === "vehicle") return <ContractFolder key="vehicle" cfg={VEHICLE_CONTRACT} onBack={closeFolder} />;
  if (folder === "veku") return <VekuFolder onBack={closeFolder} />;

  /* ================= folder: history only ================= */
  const folderItems = folder === "raw" ? rawItems : otherItems;
  const folderRows = folder === "raw" ? rawEntries : otherEntries;
  const shown = itemFilter === "all" ? folderRows : folderRows.filter((e) => e.item?.id === itemFilter);
  const folderTitle = folder === "raw" ? "কাঁচামাল" : "অন্যান্য মালামাল ও খরচ";

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 pb-4">
      <div className="flex items-center gap-3 pt-1">
        <button
          type="button"
          onClick={closeFolder}
          aria-label="মালামাল ক্রয় ও খরচে ফিরে যান"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border bg-card transition active:scale-95"
        >
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="font-display truncate text-[24px] font-extrabold leading-tight">{folderTitle}</h1>
          <p className="text-sm font-semibold text-muted-foreground">
            ইতিহাস · এই মৌসুমে <span className="num">{tk(sumOf(folderRows))}</span>
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => print(shown, `${folderTitle} — কেনা ও খরচের ইতিহাস`)}>
          <Printer className="mr-1 h-4 w-4" /> প্রিন্ট
        </Button>
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {[{ id: "all", name: "সব", total: sumOf(folderRows) }, ...folderItems.map((it) => ({ id: it.id, name: it.name, total: sumOf(folderRows.filter((e) => e.item?.id === it.id)) }))].map((m) => (
          <button
            key={m.id}
            type="button"
            aria-pressed={itemFilter === m.id}
            onClick={() => setItemFilter(m.id)}
            className={`flex h-10 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold transition ${
              itemFilter === m.id ? "border-primary bg-primary text-primary-foreground" : "bg-card text-foreground"
            }`}
          >
            {m.name}
            {m.total > 0 && <span className={`num text-xs ${itemFilter === m.id ? "text-primary-foreground/80" : "text-muted-foreground"}`}>{tk(m.total)}</span>}
          </button>
        ))}
      </div>

      {loading ? <Skeleton className="h-48 rounded-2xl" /> : <EntryRows rows={shown} />}

      {dialogs}
    </div>
  );
}
