import { supabase } from "@/integrations/supabase/client";

/**
 * সিজন-ভিত্তিক ডেটা স্কোপিং।
 *
 * `sdb.from("table").select(...)` করলে নির্বাচিত মৌসুমের তারিখ-সীমার বাইরের
 * রেকর্ড স্বয়ংক্রিয়ভাবে বাদ পড়ে। insert/update/delete অপরিবর্তিত থাকে।
 * নির্দিষ্ট id দিয়ে (`.eq("id", ...)`) কোনো রেকর্ড খোঁজা হলে ফিল্টার প্রয়োগ হয় না,
 * যাতে সম্পাদনা/প্রিন্ট পেইজ ভাঙে না।
 */

const DATE_COLUMN: Record<string, string> = {
  sales_entries: "sale_date",
  collections: "payment_date",
  contract_payments: "payment_date",
  contracts: "start_date",
  expenses: "expense_date",
  production_entries: "production_date",
  kacha_brick_entries: "entry_date",
  ledger_head_entries: "entry_date",
  raw_material_purchases: "purchase_date",
  supplier_payments: "payment_date",
  vehicle_expenses: "expense_date",
  worker_payments: "payment_date",
  worker_attendance: "date",
  bank_transactions: "txn_date",
  transfers: "transfer_date",
  orders: "order_date",
  deliveries: "delivery_date",
  journal_entries: "entry_date",
  stock_ledger: "ref_date",
  sardar_work_entries: "entry_date",
  sardar_payments: "payment_date",
  raw_material_usage: "usage_date",
};

let range: { from: string; to: string } | null = null;

/** SeasonProvider থেকে সেট হয় */
export function setSeasonRange(next: { from: string; to: string } | null) {
  range = next;
}

export function getSeasonRange() {
  return range;
}

function wrap(builder: any, column: string): any {
  let skip = false;
  const proxy: any = new Proxy(builder, {
    get(target, prop, receiver) {
      if (prop === "then") {
        if (!skip && range) {
          target.gte(column, range.from).lte(column, range.to);
        }
        const then = target.then.bind(target);
        return (...args: any[]) => then(...args);
      }
      const value = Reflect.get(target, prop, receiver);
      if (typeof value === "function") {
        return (...args: any[]) => {
          if (prop === "eq" && args[0] === "id") skip = true;
          const out = value.apply(target, args);
          return out === target ? proxy : out;
        };
      }
      return value;
    },
  });
  return proxy;
}

function fromImpl(table: string) {
  const real = (supabase as any).from(table);
  const column = DATE_COLUMN[table];
  if (!column) return real;
  return new Proxy(real, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (prop === "select" && typeof value === "function") {
        return (...args: any[]) => wrap(value.apply(target, args), column);
      }
      if (typeof value === "function") return value.bind(target);
      return value;
    },
  });
}

export const sdb = {
  from: fromImpl as unknown as (typeof supabase)["from"],
};
