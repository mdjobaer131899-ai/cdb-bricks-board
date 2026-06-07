import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const NewExpenseSchema = z.object({
  category: z.string().min(1).max(80),
  amount: z.number().positive(),
  expense_date: z.string().min(1),
  note: z.string().max(500).nullable().optional(),
});

export const createExpense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => NewExpenseSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("expenses")
      .insert({
        category: data.category,
        amount: data.amount,
        expense_date: data.expense_date,
        note: data.note ?? null,
        created_by: userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    await supabase.rpc("log_audit", {
      _action: "expense.create",
      _entity_type: "expense",
      _entity_id: row.id,
      _old_value: null,
      _new_value: JSON.parse(JSON.stringify(data)),
    });
    return row;
  });

export const deleteExpense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.from("expenses").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { success: true };
  });
