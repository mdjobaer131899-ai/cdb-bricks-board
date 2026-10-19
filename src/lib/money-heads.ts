import type { LucideIcon } from "lucide-react";
import {
  BadgeDollarSign, Banknote, Crown, HardHat, History, Landmark, LandPlot, Mountain, Receipt, Sparkles, Tractor, Truck,
  Users2, Warehouse, Wrench, Zap,
} from "lucide-react";

/**
 * The one list of money heads (খাত). Every page that names a head reads it from here:
 * the entry forms, the cash book, the reports and the dashboard. One name, one icon,
 * one colour per head, so the same money never shows under two names.
 *
 * Groups:
 *   in        টাকা এসেছে
 *   labour    শ্রমিক ও বেতন      ┐
 *   material  কাঁচামাল           │ costs (লাভ-ক্ষতিতে খরচ)
 *   machine   যন্ত্র ও ভাড়া      │
 *   other     অন্যান্য খরচ        ┘
 *   move      খরচ নয় · টাকার চলাচল (cash goes out, but it is not a running cost)
 */
export type MoneyGroup = "in" | "labour" | "material" | "machine" | "other" | "move";

export type MoneyKey =
  // in
  | "sale" | "openingIn" | "ownerInvest" | "loanIn" | "loanBack"
  // labour
  | "sardar" | "daily" | "staff" | "ownerSalary"
  // material
  | "raw"
  // machine and hire
  | "parts" | "veku" | "vehicle" | "land" | "power"
  // other
  | "clean" | "misc"
  // not a cost
  | "asset" | "ownerWithdraw" | "loanGive" | "loanRepay" | "openingOut";

export type Tone = "green" | "red" | "amber" | "blue" | "stone";

export type MoneyHead = { key: MoneyKey; label: string; group: MoneyGroup; icon: LucideIcon; tone: Tone };

export const MONEY_HEADS: MoneyHead[] = [
  { key: "sale", label: "ইট বিক্রির টাকা", group: "in", icon: Banknote, tone: "green" },
  { key: "openingIn", label: "গত বছরের পাওনা আদায়", group: "in", icon: History, tone: "amber" },
  { key: "ownerInvest", label: "মালিকের বিনিয়োগ", group: "in", icon: Crown, tone: "amber" },
  { key: "loanIn", label: "ঋণ নেওয়া", group: "in", icon: Landmark, tone: "blue" },
  { key: "loanBack", label: "দেওয়া ঋণ ফেরত", group: "in", icon: Landmark, tone: "blue" },

  { key: "sardar", label: "সরদার", group: "labour", icon: Users2, tone: "red" },
  { key: "daily", label: "ডেলি শ্রমিক", group: "labour", icon: HardHat, tone: "red" },
  { key: "staff", label: "মেস্তুরি ও ম্যানেজার", group: "labour", icon: BadgeDollarSign, tone: "red" },
  { key: "ownerSalary", label: "মালিকের বেতন", group: "labour", icon: Crown, tone: "red" },

  { key: "raw", label: "কাঁচামাল", group: "material", icon: Mountain, tone: "stone" },

  { key: "parts", label: "যন্ত্রাংশ / মালামাল", group: "machine", icon: Wrench, tone: "stone" },
  { key: "veku", label: "ভেকু", group: "machine", icon: Tractor, tone: "stone" },
  { key: "vehicle", label: "গাড়ি ভাড়া", group: "machine", icon: Truck, tone: "stone" },
  { key: "land", label: "জমি ভাড়া", group: "machine", icon: LandPlot, tone: "stone" },
  { key: "power", label: "বিদ্যুৎ বিল", group: "machine", icon: Zap, tone: "stone" },

  { key: "clean", label: "পরিচ্ছন্ন কর্মী", group: "other", icon: Sparkles, tone: "stone" },
  { key: "misc", label: "আনুষাঙ্গিক", group: "other", icon: Receipt, tone: "red" },

  { key: "asset", label: "সম্পদ কেনা", group: "move", icon: Warehouse, tone: "blue" },
  { key: "ownerWithdraw", label: "মালিকের উত্তোলন", group: "move", icon: Crown, tone: "amber" },
  { key: "loanGive", label: "ঋণ দেওয়া", group: "move", icon: Landmark, tone: "blue" },
  { key: "loanRepay", label: "নেওয়া ঋণ পরিশোধ", group: "move", icon: Landmark, tone: "blue" },
  { key: "openingOut", label: "পূর্বের দেনা পরিশোধ", group: "move", icon: History, tone: "amber" },
];

export const GROUP_LABEL: Record<MoneyGroup, string> = {
  in: "টাকা এসেছে",
  labour: "শ্রমিক ও বেতন",
  material: "কাঁচামাল",
  machine: "যন্ত্র ও ভাড়া",
  other: "অন্যান্য খরচ",
  move: "খরচ নয় · টাকার চলাচল",
};
export const COST_GROUPS: MoneyGroup[] = ["labour", "material", "machine", "other"];

const BY_KEY = new Map(MONEY_HEADS.map((h) => [h.key, h]));
export const moneyHead = (k: MoneyKey) => BY_KEY.get(k)!;
export const isIncome = (k: MoneyKey) => moneyHead(k).group === "in";
export const isCost = (k: MoneyKey) => COST_GROUPS.includes(moneyHead(k).group);

export const TONE_CLASS: Record<Tone, string> = {
  green: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
  red: "bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300",
  amber: "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300",
  blue: "bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300",
  stone: "bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-200",
};

/* ---------- which head a saved row belongs to ---------- */

/** expenses.category prefixes; anything else (also free text from the AI) is আনুষাঙ্গিক */
export const ASSET_PREFIX = "সম্পদ — ";
export const PARTS_PREFIX = "যন্ত্রাংশ / মালামাল — ";
export const MISC_PREFIX = "আনুষাঙ্গিক — ";
export const POWER_BILL = "বিদ্যুৎ বিল";

const n = (s: string | null | undefined) => (s ?? "").normalize("NFC").trim();

/** expenses row → head and the item written after the head ("চা", "বিয়ারিং") */
export function expenseHead(category: string | null | undefined): { key: MoneyKey; item: string } {
  const c = n(category);
  const after = (p: string) => c.slice(n(p).length).trim();
  if (c.startsWith(n(ASSET_PREFIX))) return { key: "asset", item: after(ASSET_PREFIX) };
  if (c.startsWith(n(PARTS_PREFIX))) return { key: "parts", item: after(PARTS_PREFIX) };
  if (c === n(POWER_BILL) || c.startsWith("কারেন্ট")) return { key: "power", item: "" };
  if (c.startsWith(n(MISC_PREFIX))) return { key: "misc", item: after(MISC_PREFIX) };
  if (c === "আনুষাঙ্গিক") return { key: "misc", item: "" };
  // older or free-text categories: keep the text as the item
  const dash = c.indexOf(" — ");
  return { key: "misc", item: dash > 0 ? c.slice(dash + 3).trim() : c };
}

/** raw-material sellers (suppliers.material_type) */
export const RAW_TYPES = new Set(["মাটি", "বালু", "কয়লা", "তুষ", "ডিজেল", "লাকড়ি"].map((s) => s.normalize("NFC")));

/** suppliers.material_type → head of a payment to that supplier */
export function supplierHead(materialType: string | null | undefined): MoneyKey {
  const t = n(materialType);
  if (t === "ভেকু") return "veku";
  if (t === "গাড়ি ভাড়া") return "vehicle";
  if (t === "জমি ভাড়া") return "land";
  if (t === "পরিচ্ছন্ন কর্মী") return "clean";
  if (RAW_TYPES.has(t)) return "raw";
  return "parts";
}
