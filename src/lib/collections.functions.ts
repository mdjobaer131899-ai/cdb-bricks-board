import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const NewCollectionSchema = z.object({
  customer_id: z.string().uuid(),
  contract_id: z.string().uuid().nullable().optional(),
  amount: z.number().positive(),
  payment_date: z.string().min(1),
  method: z.string().max(60).nullable().optional(),
  note: z.string().max(500).nullable().optional(),
});

export const createCollection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => NewCollectionSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // একটিই সত্যের উৎস: collections। চুক্তির অগ্রিম/আদায় collections.contract_id
    // দিয়েই হিসাব হয় — contract_payments-এ আলাদা করে লেখা হয় না, নইলে টাকা দুইবার গোনা হতো।
    const { data: row, error } = await supabase
      .from("collections")
      .insert({
        customer_id: data.customer_id,
        contract_id: data.contract_id ?? null,
        amount: data.amount,
        payment_date: data.payment_date,
        method: data.method ?? null,
        note: data.note ?? null,
        created_by: userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    await supabase.rpc("log_audit", {
      _action: "collection.create",
      _entity_type: "collection",
      _entity_id: row.id,
      _old_value: null,
      _new_value: JSON.parse(JSON.stringify(data)),
    });

    return row;
  });

export const deleteCollection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.from("collections").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { success: true };
  });
