/* ============================================================================
 * AI lookup tools: the model only says WHAT is asked (which tool, dates, person,
 * head, grouping); the numbers are always computed here from the same sources the
 * pages use (fetchCashHistory = cash book, the AI snapshot = customer/sardar/worker
 * pages, buildDues = /dues, fetchProfitLoss = লাভ-ক্ষতি). So an answer can never
 * be a guess, and it always matches what the page shows.
 * ==========================================================================*/
import type { KilnSnapshot } from "@/services/gemini";
import { fetchCashHistory, type CashHistoryRow } from "@/lib/cash-queries";
import { fetchProfitLoss } from "@/lib/pl-queries";
import { GROUP_LABEL, MONEY_HEADS, COST_GROUPS, moneyHead, type MoneyKey } from "@/lib/money-heads";
import { buildDues } from "@/lib/dues";
import { getSeasonRange } from "@/lib/season-db";

export type LookupArgs = {
  from?: string;
  to?: string;
  dir?: "in" | "out" | "both";
  heads?: string[];
  person?: string;
  customer?: string;
  sardar?: string;
  worker?: string;
  brick?: string;
  status?: "approved" | "pending" | "all";
  step?: "production" | "load" | "unload" | "all";
  side?: "receive" | "pay" | "both";
  group?: string;
};

export type ToolCtx = {
  s: KilnSnapshot;
  /** does this name match what the user said (spelling, titles and case endings forgiven) */
  match: (name: string, query: string) => boolean;
};

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const bn = (n: number, digits = 2) => num(n).toLocaleString("bn-BD", { maximumFractionDigits: digits });
const tk = (n: number) => `৳${bn(Math.round(num(n)))}`;
const isDate = (d: unknown): d is string => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d);

function bnDate(iso: string): string {
  if (!isDate(iso)) return iso;
  return new Date(`${iso}T12:00:00+06:00`).toLocaleDateString("bn-BD", { day: "numeric", month: "long", timeZone: "Asia/Dhaka" });
}
function bnMonth(iso: string): string {
  return new Date(`${iso.slice(0, 7)}-15T12:00:00+06:00`).toLocaleDateString("bn-BD", { month: "long", year: "numeric", timeZone: "Asia/Dhaka" });
}

/** the dates asked for, kept inside the selected season; none given = the whole season so far */
function range(a: LookupArgs, s: KilnSnapshot, fallback: "season" | "today" = "season") {
  const season = getSeasonRange();
  let from = isDate(a.from) ? a.from : fallback === "today" ? s.today : season?.from ?? "";
  let to = isDate(a.to) ? a.to : s.today;
  if (from && to && from > to) [from, to] = [to, from];
  const whole = !isDate(a.from) && !isDate(a.to) && fallback === "season";
  const label = whole
    ? "এই মৌসুমে"
    : from === to
      ? from === s.today ? "আজ" : from === s.yesterday ? "গতকাল" : bnDate(from)
      : from === s.monthStart && to === s.today ? "এই মাসে"
      : `${bnDate(from)} থেকে ${bnDate(to)}`;
  return { from: from || undefined, to, label, whole };
}

/** "আজ" → "আজকের", "১২ নভেম্বর" → "১২ নভেম্বরের" */
const ofLabel = (label: string) => (label === "আজ" ? "আজকের" : `${label}ের`);

const inRange = (d: unknown, r: { from?: string; to: string }) => {
  const x = String(d ?? "");
  return (!r.from || x >= r.from) && x <= r.to;
};

/** a ranked list of totals, the biggest first, with how many entries made each */
function ranked(groups: Map<string, { amount: number; n: number; extra?: string }>, unit: (v: number) => string = tk, max = 25): string[] {
  const list = [...groups.entries()].sort((a, b) => b[1].amount - a[1].amount);
  const lines = list.slice(0, max).map(([k, v], i) => `${bn(i + 1)}. ${k}: ${unit(v.amount)}${v.n > 1 ? ` (${bn(v.n)} বার)` : ""}${v.extra ? ` · ${v.extra}` : ""}`);
  if (list.length > max) lines.push(`...আরও ${bn(list.length - max)} জন/খাত`);
  return lines;
}

function addTo(m: Map<string, { amount: number; n: number }>, key: string, amount: number) {
  const cur = m.get(key) ?? { amount: 0, n: 0 };
  cur.amount += amount;
  cur.n += 1;
  m.set(key, cur);
}

/** the person on a cash-book line: "রহিম (নগদ চালান)" → "রহিম" */
const partyOf = (r: CashHistoryRow) => r.detail.replace(/\s*\([^)]*\)\s*$/, "").trim() || r.head;

const HEAD_KEYS = new Set<string>(MONEY_HEADS.map((h) => h.key));

// ---------------------------------------------------------------- money in / out
async function moneyTool(a: LookupArgs, ctx: ToolCtx): Promise<string> {
  const r = range(a, ctx.s);
  const rows = await fetchCashHistory({ from: r.from, to: r.to });
  const dir = a.dir === "in" || a.dir === "out" ? a.dir : "both";
  const heads = (a.heads ?? []).filter((h) => HEAD_KEYS.has(h)) as MoneyKey[];
  const person = String(a.person ?? a.customer ?? a.sardar ?? a.worker ?? "").trim();
  let list = rows.filter((x) => dir === "both" || x.dir === dir);
  if (heads.length) list = list.filter((x) => heads.includes(x.key));
  if (person) list = list.filter((x) => ctx.match(partyOf(x), person) || ctx.match(x.detail, person));

  const what = heads.length ? heads.map((h) => moneyHead(h).label).join(", ") : "";
  const who = person ? `${person}${dir === "in" ? " থেকে" : dir === "out" ? "-কে" : "-এর"} ` : "";
  if (!list.length) {
    return `${r.label} ${who}${what ? `${what} খাতে ` : ""}${dir === "in" ? "কোনো টাকা আসার" : dir === "out" ? "কোনো টাকা দেওয়ার" : "কোনো লেনদেনের"} এন্ট্রি ক্যাশ বইয়ে নেই।`;
  }

  const group = a.group ?? (person ? "lines" : heads.length ? "person" : "head");
  const section = (d: "in" | "out", rowsOfDir: CashHistoryRow[]) => {
    if (!rowsOfDir.length) return [];
    const total = rowsOfDir.reduce((t, x) => t + x.amount, 0);
    const title = `${d === "in" ? "📥" : "📤"} ${r.label} ${who}${what ? `${what} — ` : ""}${d === "in" ? "টাকা এসেছে" : "টাকা গেছে"}: মোট ${tk(total)} (${bn(rowsOfDir.length)}টি এন্ট্রি)`;
    if (group === "lines") {
      const sorted = [...rowsOfDir].sort((x, y) => y.date.localeCompare(x.date));
      const lines = sorted.slice(0, 30).map((x) => `• ${bnDate(x.date)}: ${x.detail} — ${x.head}, ${tk(x.amount)}${x.note ? ` (${x.note})` : ""}`);
      if (sorted.length > 30) lines.push(`...আরও ${bn(sorted.length - 30)}টি, ক্যাশ বইয়ে দেখুন`);
      return [title, ...lines];
    }
    const m = new Map<string, { amount: number; n: number }>();
    for (const x of rowsOfDir) {
      const key = group === "person" ? partyOf(x)
        : group === "day" ? bnDate(x.date)
        : group === "month" ? bnMonth(x.date)
        : x.head;
      addTo(m, key, x.amount);
    }
    if (group === "day" || group === "month") {
      // dates read best in order, not by size
      const ordered = [...m.entries()];
      return [title, ...ordered.map(([k, v]) => `• ${k}: ${tk(v.amount)}${v.n > 1 ? ` (${bn(v.n)} বার)` : ""}`)];
    }
    return [title, ...ranked(m)];
  };

  const out: string[] = [];
  if (dir !== "out") out.push(...section("in", list.filter((x) => x.dir === "in")));
  if (dir === "both") out.push("");
  if (dir !== "in") out.push(...section("out", list.filter((x) => x.dir === "out")));
  if (dir === "both") {
    const net = list.reduce((t, x) => t + (x.dir === "in" ? x.amount : -x.amount), 0);
    out.push("", `🧾 ${r.label} আসা − যাওয়া: ${net < 0 ? "−" : ""}${tk(Math.abs(net))}`);
  }
  out.push("", "(হিসাব ক্যাশ বই থেকে)");
  return out.filter((l, i, arr) => !(l === "" && arr[i - 1] === "")).join("\n").trim();
}

// ---------------------------------------------------------------- sales / challans
function salesTool(a: LookupArgs, ctx: ToolCtx): string {
  const { s } = ctx;
  const r = range(a, s);
  const status = a.status ?? "approved";
  const brickName = (id: string) => s.brickTypes.find((b) => b.id === id)?.name ?? "ইট";
  const custName = (id: string) => s.customers.find((c) => c.id === id)?.name ?? "অজানা গ্রাহক";
  let rows = s.sales.filter((x) => inRange(x.sale_date, r) && (status === "all" || x.status === status));
  if (a.customer) rows = rows.filter((x) => ctx.match(custName(x.customer_id), String(a.customer)));
  if (a.brick) rows = rows.filter((x) => ctx.match(brickName(x.brick_type_id), String(a.brick)));
  const pending = s.sales.filter((x) => inRange(x.sale_date, r) && x.status === "pending");
  const who = a.customer ? `${a.customer}-এর ` : "";
  if (!rows.length) {
    const p = status === "approved" && pending.length ? ` (অনুমোদনের অপেক্ষায় ${bn(pending.length)}টি চালান আছে)` : "";
    return `${r.label} ${who}${status === "pending" ? "অনুমোদনের অপেক্ষায় কোনো চালান নেই" : "কোনো চালান নেই"}${p}।`;
  }
  const qty = rows.reduce((t, x) => t + num(x.quantity), 0);
  const amount = rows.reduce((t, x) => t + num(x.total_amount), 0);
  const title = `🧱 ${r.label} ${who}${status === "pending" ? "অনুমোদনের অপেক্ষায়" : status === "all" ? "সব" : "অনুমোদিত"} চালান: ${bn(rows.length)}টি, ${bn(qty)} পিস, মোট ${tk(amount)}`;
  const group = a.group ?? (a.customer ? "lines" : "customer");
  const lines: string[] = [title];
  if (group === "lines") {
    const sorted = [...rows].sort((x, y) => String(y.sale_date).localeCompare(String(x.sale_date)));
    lines.push(...sorted.slice(0, 30).map((x) => `• ${bnDate(x.sale_date)}${x.challan_no ? ` #${x.challan_no}` : ""}: ${custName(x.customer_id)}, ${brickName(x.brick_type_id)} ${bn(num(x.quantity))} পিস, ${tk(num(x.total_amount))}${x.status === "pending" ? " (অপেক্ষায়)" : ""}`));
    if (sorted.length > 30) lines.push(`...আরও ${bn(sorted.length - 30)}টি`);
  } else {
    const m = new Map<string, { amount: number; n: number; extra?: string }>();
    const qtyBy = new Map<string, number>();
    for (const x of rows) {
      const key = group === "brick" ? brickName(x.brick_type_id)
        : group === "day" ? bnDate(String(x.sale_date))
        : group === "month" ? bnMonth(String(x.sale_date))
        : custName(x.customer_id);
      addTo(m, key, num(x.total_amount));
      qtyBy.set(key, (qtyBy.get(key) ?? 0) + num(x.quantity));
    }
    for (const [k, v] of m) v.extra = `${bn(qtyBy.get(k) ?? 0)} পিস`;
    lines.push(...(group === "day" || group === "month"
      ? [...m.entries()].map(([k, v]) => `• ${k}: ${tk(v.amount)} · ${v.extra}${v.n > 1 ? ` (${bn(v.n)}টি চালান)` : ""}`)
      : ranked(m)));
  }
  if (status === "approved" && pending.length) lines.push(`\nঅনুমোদনের অপেক্ষায় আরও ${bn(pending.length)}টি চালান, সেগুলো এই হিসাবে ধরা হয়নি।`);
  return lines.join("\n");
}

// ---------------------------------------------------------------- production (kacha / load / unload)
const STEP_LABEL: Record<string, string> = { production: "কাঁচা ইট তৈরি", load: "লোড", unload: "আনলোড (পাকা বের)" };

function productionTool(a: LookupArgs, ctx: ToolCtx): string {
  const { s } = ctx;
  const r = range(a, s);
  const step = a.step && a.step !== "all" ? a.step : null;
  const sardarName = (id: string) => s.sardars.find((x) => x.id === id)?.name ?? "সরদার ছাড়া";
  let rows = s.kacha.filter((x) => inRange(x.entry_date, r) && (step ? x.entry_type === step : x.entry_type in STEP_LABEL));
  if (a.sardar) rows = rows.filter((x) => ctx.match(sardarName(x.sardar_id), String(a.sardar)));
  const what = step ? STEP_LABEL[step] : "উৎপাদনের ধাপ";
  if (!rows.length) return `${r.label} ${a.sardar ? `${a.sardar}-এর ` : ""}${what}: কোনো এন্ট্রি নেই।`;
  const lines: string[] = [];
  const steps = step ? [step] : Object.keys(STEP_LABEL);
  const group = a.group ?? "sardar";
  for (const st of steps) {
    const list = rows.filter((x) => x.entry_type === st);
    if (!list.length) continue;
    const qty = list.reduce((t, x) => t + num(x.quantity), 0);
    const wage = list.reduce((t, x) => t + num(x.amount), 0);
    lines.push(`🟫 ${r.label} ${STEP_LABEL[st]}: ${bn(qty)} পিস${wage ? `, মজুরি ${tk(wage)}` : ""} (${bn(list.length)}টি এন্ট্রি)`);
    const m = new Map<string, { amount: number; n: number }>();
    for (const x of list) {
      const key = group === "day" ? bnDate(String(x.entry_date)) : group === "month" ? bnMonth(String(x.entry_date)) : sardarName(x.sardar_id);
      addTo(m, key, num(x.quantity));
    }
    lines.push(...(group === "day" || group === "month"
      ? [...m.entries()].map(([k, v]) => `• ${k}: ${bn(v.amount)} পিস`)
      : ranked(m, (v) => `${bn(v)} পিস`)));
    lines.push("");
  }
  return lines.join("\n").trim();
}

// ---------------------------------------------------------------- attendance (daily workers)
function attendanceTool(a: LookupArgs, ctx: ToolCtx): string {
  const { s } = ctx;
  const r = range(a, s, "today");
  const from = r.from ?? s.today;
  let pool = s.workers.filter((w) => w.isDaily);
  if (a.worker) pool = pool.filter((w) => ctx.match(w.name, String(a.worker)));
  if (!pool.length) return a.worker ? `${a.worker} নামে কোনো ডেলি শ্রমিক খাতায় নেই।` : "খাতায় কোনো ডেলি শ্রমিক নেই।";
  const onDay = (w: (typeof pool)[number], d: string) => w.active && (!w.join || w.join <= d) && (!w.leave || w.leave >= d);
  const mark = (id: string, d: string) => s.attendance.find((x) => x.worker_id === id && x.date === d);

  if (from === r.to) {
    const d = r.to;
    const on = pool.filter((w) => onDay(w, d));
    if (!on.length) return `${r.label} কোনো ডেলি শ্রমিক কাজে ছিল না।`;
    const absent = on.filter((w) => mark(w.id, d)?.present === false);
    const half = on.filter((w) => mark(w.id, d)?.is_half_day === true && mark(w.id, d)?.present !== false);
    const present = on.filter((w) => !absent.includes(w) && !half.includes(w));
    const checked = s.checkins.some((c) => c.kind === "attendance" && c.date === d);
    const lines = [`🧑‍🏭 ${ofLabel(r.label)} হাজিরা (${bnDate(d)}) — ডেলি শ্রমিক ${bn(on.length)} জন`];
    lines.push(`✅ উপস্থিত ${bn(present.length)} জন${present.length ? `: ${present.map((w) => w.name).join(", ")}` : ""}`);
    if (half.length) lines.push(`🌓 হাফ ${bn(half.length)} জন: ${half.map((w) => w.name).join(", ")}`);
    lines.push(absent.length ? `❌ অনুপস্থিত ${bn(absent.length)} জন: ${absent.map((w) => w.name).join(", ")}` : "❌ অনুপস্থিত কেউ নেই");
    if (!checked) lines.push("\n(এই দিনের হাজিরা এখনো নিশ্চিত করা হয়নি। কে কে আসেনি বললে আমি উঠিয়ে দেব।)");
    return lines.join("\n");
  }

  // a range: days worked per worker, with the days away
  const days: string[] = [];
  for (let t = new Date(`${from}T00:00:00Z`); t <= new Date(`${r.to}T00:00:00Z`); t = new Date(t.getTime() + 86400000)) days.push(t.toISOString().slice(0, 10));
  const lines = [`🧑‍🏭 ${r.label} ডেলি শ্রমিকের হাজিরা (${bn(days.length)} দিনের হিসাব):`];
  for (const w of pool) {
    let worked = 0;
    const away: string[] = [];
    const halves: string[] = [];
    for (const d of days) {
      if (!onDay(w, d)) continue;
      const m = mark(w.id, d);
      if (m?.present === false) away.push(bnDate(d));
      else if (m?.is_half_day) { worked += 0.5; halves.push(bnDate(d)); }
      else worked += 1;
    }
    lines.push(`• ${w.name}: ${bn(worked)} দিন কাজ${away.length ? `, অনুপস্থিত ${bn(away.length)} দিন (${away.slice(0, 6).join(", ")}${away.length > 6 ? "..." : ""})` : ""}${halves.length ? `, হাফ ${bn(halves.length)} দিন` : ""}`);
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------- dues (/dues)
function duesTool(a: LookupArgs, ctx: ToolCtx): string {
  const { receive, pay } = buildDues(ctx.s);
  const side = a.side ?? "both";
  const block = (title: string, lines: typeof receive) => {
    if (!lines.length) return [`${title}: কিছু নেই`];
    const total = lines.reduce((t, l) => t + l.total, 0);
    const out = [`${title}: মোট ${tk(total)}`];
    for (const l of lines) {
      out.push(`▸ ${l.label}: ${tk(l.total)}`);
      out.push(...l.people.slice(0, 10).map((p) => `   • ${p.name}: ${tk(p.amount)}${p.sub ? ` (${p.sub})` : ""}`));
      if (l.people.length > 10) out.push(`   ...আরও ${bn(l.people.length - 10)} জন`);
    }
    return out;
  };
  const out: string[] = [];
  if (side !== "pay") out.push(...block("🟢 আমরা পাবো", receive));
  if (side === "both") out.push("");
  if (side !== "receive") out.push(...block("🔴 আমাদের দিতে হবে", pay));
  out.push("", "(একই হিসাব পাওনা-দেনা পাতায়)");
  return out.join("\n");
}

// ---------------------------------------------------------------- profit (লাভ-ক্ষতি)
async function profitTool(a: LookupArgs, ctx: ToolCtx): Promise<string> {
  const r = range(a, ctx.s);
  const pl = await fetchProfitLoss({ from: r.from, to: r.to });
  const lines = [
    `📊 ${r.label} লাভ-ক্ষতি`,
    `• ইট বিক্রি (অনুমোদিত চালান): ${tk(pl.sales)}`,
    `• মোট খরচ (কাজ ও বিল যা হয়েছে): ${tk(pl.totalCost)}`,
  ];
  for (const g of COST_GROUPS) if (num(pl.byGroup[g])) lines.push(`   ▸ ${GROUP_LABEL[g]}: ${tk(num(pl.byGroup[g]))}`);
  const topHeads = Object.entries(pl.byHead).filter(([, v]) => num(v) > 0).sort((x, y) => num(y[1]) - num(x[1])).slice(0, 6);
  if (topHeads.length) lines.push("সবচেয়ে বড় খরচ:", ...topHeads.map(([k, v]) => `   • ${moneyHead(k as MoneyKey).label}: ${tk(num(v))}`));
  lines.push(pl.profit >= 0 ? `👉 লাভ: ${tk(pl.profit)}` : `👉 ক্ষতি: ${tk(-pl.profit)}`);
  if (pl.assets) lines.push(`(সম্পদ কেনা ${tk(pl.assets)} খরচে ধরা হয়নি)`);
  lines.push("", "(একই হিসাব লাভ-ক্ষতি পাতায়)");
  return lines.join("\n");
}

/** runs a tool the model picked; null = not a tool this file handles */
export async function runLookupTool(tool: string, args: LookupArgs, ctx: ToolCtx): Promise<string | null> {
  const a = args ?? {};
  switch (tool) {
    case "money": return moneyTool(a, ctx);
    case "sales": return salesTool(a, ctx);
    case "production": return productionTool(a, ctx);
    case "attendance": return attendanceTool(a, ctx);
    case "dues": return duesTool(a, ctx);
    case "profit": return profitTool(a, ctx);
    default: return null;
  }
}

/** money heads as the model sees them: key = label */
export const HEAD_LIST_FOR_PROMPT = MONEY_HEADS.map((h) => `${h.key}=${h.label}`).join(", ");
