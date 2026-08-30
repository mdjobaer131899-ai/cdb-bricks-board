import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const WorkSchema = z.object({
  sardar_id: z.string().uuid(),
  category_id: z.string().uuid(),
  entry_date: z.string().min(1),
  quantity: z.number().positive(),
  rate: z.number().nonnegative(),
  note: z.string().max(500).nullable().optional(),
});

export const createSardarWork = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => WorkSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("sardar_work_entries")
      .insert({
        sardar_id: data.sardar_id,
        category_id: data.category_id,
        entry_date: data.entry_date,
        quantity: data.quantity,
        rate: data.rate,
        note: data.note ?? null,
        created_by: userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteSardarWork = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("sardar_work_entries").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { success: true };
  });

const PaymentSchema = z.object({
  sardar_id: z.string().uuid(),
  amount: z.number().positive(),
  payment_date: z.string().min(1),
  payment_type: z.enum(["payment", "advance"]).default("payment"),
  method: z.string().max(60).nullable().optional(),
  note: z.string().max(500).nullable().optional(),
});

export const createSardarPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => PaymentSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("sardar_payments")
      .insert({
        sardar_id: data.sardar_id,
        amount: data.amount,
        payment_date: data.payment_date,
        payment_type: data.payment_type,
        method: data.method ?? null,
        note: data.note ?? null,
        created_by: userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteSardarPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("sardar_payments").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { success: true };
  });

const RateSchema = z.object({
  sardar_id: z.string().uuid(),
  category_id: z.string().uuid(),
  rate: z.number().nonnegative(),
  effective_from: z.string().min(1),
  note: z.string().max(500).nullable().optional(),
});

/** নতুন রেট নতুন তারিখ থেকে প্রযোজ্য — পুরোনো কাজের রেট অপরিবর্তিত থাকে। */
export const setSardarRate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => RateSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("sardar_rates")
      .insert({
        sardar_id: data.sardar_id,
        category_id: data.category_id,
        rate: data.rate,
        effective_from: data.effective_from,
        note: data.note ?? null,
        created_by: userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });
