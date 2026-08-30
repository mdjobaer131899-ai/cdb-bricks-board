import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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
    const { verifyAdminPassword } = await import("./cash-book.server");
    const ok = await verifyAdminPassword(data.password);
    if (!ok) throw new Error("এডমিন পাসওয়ার্ড সঠিক নয়");
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
    const { verifyAdminPassword } = await import("./cash-book.server");
    const ok = await verifyAdminPassword(data.password);
    if (!ok) throw new Error("এডমিন পাসওয়ার্ড সঠিক নয়");
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
