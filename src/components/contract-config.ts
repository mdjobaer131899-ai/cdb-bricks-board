import type { LucideIcon } from "lucide-react";
import { LandPlot, Sparkles, Truck } from "lucide-react";

/**
 * Shared settings for the contract folders (land, sweeper, vehicle) and the veku folder.
 * Kept apart from the folder components so the one expense form (expense-entry.tsx) can
 * use them while the folders use the form, without an import cycle.
 *
 * Contract-style payables on the purchases page:
 *  - জমি ভাড়া: land owners, rent per season
 *  - পরিচ্ছন্ন কর্মী: sweepers on a fixed season contract, paid weekly
 *  - গাড়ি ভাড়া: vehicle owners paid per trip (quantity = trips, unit "ট্রিপ", unit_price = rate);
 *    part may be paid on the spot, the rest stays due. Owners are often also customers.
 * A person is a suppliers row with material_type = cfg.type; what they are owed is a
 * purchases row with item_name = cfg.item; money given is a supplier_payments row.
 * A previous-season due is a bill dated before the season starts, so it is not this
 * season's cost but still adds to what is owed.
 */
export type ContractConfig = {
  key: "land" | "clean" | "vehicle";
  type: string; // suppliers.material_type
  item: string; // purchases.item_name
  title: string;
  subtitle: string;
  person: string; // "জমির মালিক"
  personOf: string; // "জমির মালিকের" (possessive)
  bill: string; // "ভাড়া" / "চুক্তি"
  billLong: string; // "এই মৌসুমের ভাড়া"
  billHelp: string;
  infoLabel: string;
  showArea: boolean;
  payTitle: string;
  emptyText: string;
  icon: LucideIcon;
  chip: string;
  /** bills are trips × rate per trip, with an optional "paid now" */
  trips?: boolean;
};

export const LAND_CONTRACT: ContractConfig = {
  key: "land",
  type: "জমি ভাড়া",
  item: "জমি ভাড়া",
  title: "জমি ভাড়া",
  subtitle: "জমির মালিক কত পাবেন, কত দেওয়া হলো, কত বাকি",
  person: "জমির মালিক",
  personOf: "জমির মালিকের",
  bill: "ভাড়া",
  billLong: "এই মৌসুমের ভাড়া",
  billHelp: "জমির মালিক এই মৌসুমে কত টাকা পাবেন। এটা এই মৌসুমের খরচে ধরা হবে।",
  infoLabel: "জমির বিবরণ (দাগ, মৌজা, কোথায়)",
  showArea: true,
  payTitle: "জমির মালিককে টাকা দিন",
  emptyText: "এখনো কোনো জমির মালিক যোগ করা হয়নি। উপরে \"জমির মালিক\" চেপে নাম, ভাড়া আর পূর্বের বকেয়া (থাকলে) দিন।",
  icon: LandPlot,
  chip: "bg-lime-100 text-lime-800 dark:bg-lime-950/60 dark:text-lime-200",
};

export const CLEANER_CONTRACT: ContractConfig = {
  key: "clean",
  type: "পরিচ্ছন্ন কর্মী",
  item: "পরিচ্ছন্ন কর্মী",
  title: "পরিচ্ছন্ন কর্মী",
  subtitle: "সুইপারের মৌসুমের চুক্তি, প্রতি সপ্তাহের টাকা আর কত বাকি",
  person: "পরিচ্ছন্ন কর্মী",
  personOf: "পরিচ্ছন্ন কর্মীর",
  bill: "চুক্তি",
  billLong: "এই মৌসুমের চুক্তি",
  billHelp: "মৌসুমের শুরুতে মোট কত টাকায় চুক্তি হলো। প্রতি সপ্তাহের টাকা এখান থেকে কমবে।",
  infoLabel: "কাজের বিবরণ (কোন এলাকা, কী কাজ)",
  showArea: false,
  payTitle: "সপ্তাহের টাকা দিন",
  emptyText: "এখনো কোনো পরিচ্ছন্ন কর্মী যোগ করা হয়নি। উপরে \"পরিচ্ছন্ন কর্মী\" চেপে নাম আর মৌসুমের চুক্তির টাকা দিন।",
  icon: Sparkles,
  chip: "bg-cyan-100 text-cyan-800 dark:bg-cyan-950/60 dark:text-cyan-200",
};

export const VEHICLE_CONTRACT: ContractConfig = {
  key: "vehicle",
  type: "গাড়ি ভাড়া",
  item: "গাড়ি ভাড়া",
  title: "গাড়ি ভাড়া",
  subtitle: "কোন গাড়ি কত ট্রিপ দিল, কত ভাড়া, কত দেওয়া হলো, কত বাকি",
  person: "গাড়ির মালিক",
  personOf: "গাড়ির মালিকের",
  bill: "ভাড়া",
  billLong: "এই মৌসুমের ভাড়া",
  billHelp: "কত ট্রিপ, প্রতি ট্রিপ কত টাকা আর কী কাজ। সাথে সাথে কিছু টাকা দিলে নিচে লিখুন, বাকিটা বাকি থাকবে।",
  infoLabel: "গাড়ির বিবরণ (নম্বর, ধরন)",
  showArea: false,
  payTitle: "গাড়ির মালিককে টাকা দিন",
  emptyText: "এখনো কোনো গাড়ির মালিক যোগ করা হয়নি। উপরে \"গাড়ির মালিক\" চেপে নাম দিন, তারপর \"ভাড়া লিখুন\" থেকে ট্রিপ লিখুন।",
  icon: Truck,
  chip: "bg-orange-100 text-orange-800 dark:bg-orange-950/60 dark:text-orange-200",
  trips: true,
};

export const CONTRACTS = [LAND_CONTRACT, CLEANER_CONTRACT, VEHICLE_CONTRACT];
export const contractByKey = (k: string) => CONTRACTS.find((c) => c.key === k);

export const PREV_NOTE = "পূর্বের বকেয়া";
export const TRIP = "ট্রিপ";
export const TRIP_WORK = ["বালু আনা", "মাটি আনা", "বালু ফেলা", "মাটি ফেলা", "কয়লা আনা", "ইট পৌঁছানো"];
export const LAND_UNITS = ["শতাংশ", "বিঘা", "কাঠা", "একর"];
export const dayBefore = (d: string) => new Date(new Date(`${d}T00:00:00Z`).getTime() - 86400000).toISOString().slice(0, 10);

/* ---------- veku (excavators) ---------- */
export const VEKU_TYPE = "ভেকু";
export const VEKU_ITEM = "ভেকু";
export const HOUR = "ঘণ্টা";
export const VEKU_KINDS = ["ডিজেল", "মবিল-গ্রীজ", "যন্ত্রাংশ", "চালকের বেতন", "চালকের খরচ", "অন্যান্য"];
const DRIVER = "চালক: ";
const SEP = " · ";

/** "ডিজেল · চালক: মাসুম · খাতা থেকে" → parts */
export function parseVekuNote(note: string | null) {
  const parts = (note ?? "").split(SEP).map((s) => s.trim()).filter(Boolean);
  let kind = "";
  let driver = "";
  const rest: string[] = [];
  for (const p of parts) {
    if (!kind && VEKU_KINDS.includes(p)) kind = p;
    else if (!driver && p.startsWith(DRIVER)) driver = p.slice(DRIVER.length).trim();
    else rest.push(p);
  }
  return { kind, driver, rest: rest.join(SEP) };
}
export const makeVekuNote = (kind: string, driver: string, rest: string) =>
  [kind, driver.trim() ? `${DRIVER}${driver.trim()}` : "", rest.trim()].filter(Boolean).join(SEP) || null;

/** purchases.item_name values that belong to a contract folder, not to materials */
export const CONTRACT_ITEMS = new Set([...CONTRACTS.map((c) => c.item), VEKU_ITEM]);
/** suppliers.material_type values of contract folders */
export const CONTRACT_TYPES = new Set([...CONTRACTS.map((c) => c.type), VEKU_TYPE]);

/* ---------- cash expenses read back on the purchases page ---------- */
/** Parts bought with no shop name are saved to expenses as "যন্ত্রাংশ / মালামাল — <item>" */
export const PARTS_HEAD = "যন্ত্রাংশ / মালামাল";
export const PARTS_PREFIX = `${PARTS_HEAD} — `;
export const POWER_BILL = "বিদ্যুৎ বিল";
