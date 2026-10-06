import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Vercel সার্ভারে SUPABASE_URL না থাকলে অটোমেটিক VITE_ থেকে নিয়ে নেবে
function ensureServerEnv() {
  if (typeof process !== "undefined" && process.env) {
    const metaEnv = (import.meta as any).env || {};
    process.env.SUPABASE_URL =
      process.env.SUPABASE_URL ||
      process.env.VITE_SUPABASE_URL ||
      metaEnv.VITE_SUPABASE_URL;

    process.env.SUPABASE_PUBLISHABLE_KEY =
      process.env.SUPABASE_PUBLISHABLE_KEY ||
      process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
      process.env.VITE_SUPABASE_ANON_KEY ||
      metaEnv.VITE_SUPABASE_PUBLISHABLE_KEY ||
      metaEnv.VITE_SUPABASE_ANON_KEY;

    process.env.SUPABASE_PROJECT_ID =
      process.env.SUPABASE_PROJECT_ID ||
      process.env.VITE_SUPABASE_PROJECT_ID ||
      metaEnv.VITE_SUPABASE_PROJECT_ID;
  }
}
ensureServerEnv();

const UpdateExpenseSchema = z.object({
  id: z.string().uuid(),
  category: z.string().min(1).max(80),
  amount: z.number().positive(),
  expense_date: z.string().min(1),
  note: z.string().max(500).nullable().optional(),
});

const UpdateIncomeSchema = z.object({
  id: z.string().uuid(),
  customer_id: z.string().uuid(),
  amount: z.number().positive(),
  payment_date: z.string().min(1),
  method: z.string().max(60).nullable().optional(),
  note: z.string().max(500).nullable().optional(),
});

const DeleteSchema = z.object({
  id: z.string().uuid(),
  password: z.string().min(1).max(200),
});

export const updateExpenseEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => UpdateExpenseSchema.parse(input))
  .handler(async ({ data, context }) => {
    ensureServerEnv();
    const { supabase } = context;
    const { error } = await supabase
      .from("expenses")
      .update({
        category: data.category,
        amount: data.amount,
        expense_date: data.expense_date,
        note: data.note ?? null,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await supabase.rpc("log_audit", {
      _action: "expense.update",
      _entity_type: "expense",
      _entity_id: data.id,
      _old_value: null,
      _new_value: JSON.parse(JSON.stringify(data)),
    });
    return { success: true };
  });

export const updateIncomeEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => UpdateIncomeSchema.parse(input))
  .handler(async ({ data, context }) => {
    ensureServerEnv();
    const { supabase } = context;
    const { error } = await supabase
      .from("collections")
      .update({
        customer_id: data.customer_id,
        amount: data.amount,
        payment_date: data.payment_date,
        method: data.method ?? null,
        note: data.note ?? null,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await supabase.rpc("log_audit", {
      _action: "collection.update",
      _entity_type: "collection",
      _entity_id: data.id,
      _old_value: null,
      _new_value: JSON.parse(JSON.stringify(data)),
    });
    return { success: true };
  });

export const deleteExpenseWithPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => DeleteSchema.parse(input))
  .handler(async ({ data, context }) => {
    ensureServerEnv();
    const { verifyCurrentAdminPassword } = await import("./cash-book.server");
    const ok = await verifyCurrentAdminPassword(context.userId, data.password);
    if (!ok) throw new Error("অননুমোদিত অথবা এডমিন পাসওয়ার্ড সঠিক নয়");
    const { supabase } = context;
    const { error } = await supabase.from("expenses").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await supabase.rpc("log_audit", {
      _action: "expense.delete",
      _entity_type: "expense",
      _entity_id: data.id,
      _old_value: null,
      _new_value: null,
    });
    return { success: true };
  });

export const deleteIncomeWithPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => DeleteSchema.parse(input))
  .handler(async ({ data, context }) => {
    ensureServerEnv();
    const { verifyCurrentAdminPassword } = await import("./cash-book.server");
    const ok = await verifyCurrentAdminPassword(context.userId, data.password);
    if (!ok) throw new Error("অননুমোদিত অথবা এডমিন পাসওয়ার্ড সঠিক নয়");
    const { supabase } = context;
    const { error } = await supabase.from("collections").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await supabase.rpc("log_audit", {
      _action: "collection.delete",
      _entity_type: "collection",
      _entity_id: data.id,
      _old_value: null,
      _new_value: null,
    });
    return { success: true };
  });

const ROW_TABLES: Array<[string, string, string]> = [
  ["op", "opening_payments", "payment_date"],
  ["lp", "loan_payments", "payment_date"],
  ["e", "expenses", "expense_date"],
  ["s", "sardar_payments", "payment_date"],
  ["w", "worker_payments", "payment_date"],
  ["p", "supplier_payments", "payment_date"],
  ["o", "owner_transactions", "txn_date"],
  ["l", "loans", "loan_date"],
];
function resolveKey(key: string) {
  for (const [p, table, dateCol] of ROW_TABLES) {
    if (key.startsWith(p)) {
      const id = key.slice(p.length);
      if (z.string().uuid().safeParse(id).success) return { table, dateCol, id };
    }
  }
  throw new Error("অজানা এন্ট্রি");
}

export const updateCashRow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    key: z.string().min(2).max(60),
    amount: z.number().positive(),
    date: z.string().min(1),
    note: z.string().max(500).nullable().optional(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    ensureServerEnv();
    const { table, dateCol, id } = resolveKey(data.key);
    const patch: Record<string, unknown> = { amount: data.amount, [dateCol]: data.date };
    if (data.note) patch.note = data.note;
    const { error } = await (context.supabase as any).from(table).update(patch).eq("id", id);
    if (error) throw new Error(error.message);
    return { success: true };
  });

export const deleteCashRow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ key: z.string().min(2).max(60), password: z.string().min(1).max(200) }).parse(input))
  .handler(async ({ data, context }) => {
    ensureServerEnv();
    const { verifyCurrentAdminPassword } = await import("./cash-book.server");
    const ok = await verifyCurrentAdminPassword(context.userId, data.password);
    if (!ok) throw new Error("অননুমোদিত অথবা এডমিন পাসওয়ার্ড সঠিক নয়");
    const { table, id } = resolveKey(data.key);
    const { error } = await (context.supabase as any).from(table).delete().eq("id", id);
    if (error) throw new Error(error.message);
    return { success: true };
  });