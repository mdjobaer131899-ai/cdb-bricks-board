import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const NewContractSchema = z.object({
  customer_id: z.string().uuid(),
  contract_date: z.string().min(1),
  total_brick_quantity: z.number().min(1),
  per_brick_rate: z.number().min(0),
  contract_type: z.enum(["yearly_fixed", "cash"]).default("yearly_fixed"),
  advance_paid: z.number().min(0).default(0),
  notes: z.string().max(500).nullable().optional(),
});

export const createContract = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => NewContractSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: noRes, error: noErr } = await supabaseAdmin.rpc("generate_contract_no", {
      _type: data.contract_type,
    });
    if (noErr) throw new Error(noErr.message);
    const contract_no = noRes as unknown as string;

    const insertRow = {
      contract_no,
      customer_id: data.customer_id,
      contract_type: data.contract_type,
      start_date: data.contract_date,
      expiry_date: null,
      fixed_rate: data.per_brick_rate,
      booked_quantity: data.total_brick_quantity,
      booked_value: data.total_brick_quantity * data.per_brick_rate,
      advance_paid: data.advance_paid,
      priority: 100,
      notes: data.notes ?? null,
      created_by: userId,
    };
    const { data: row, error } = await supabase.from("contracts").insert(insertRow).select("id, contract_no").single();
    if (error) throw new Error(error.message);

    // For cash contracts with advance payment, create a contract_payment so cash + AR journal posts.
    if (data.contract_type === "cash" && data.advance_paid > 0) {
      const { error: payErr } = await supabase.from("contract_payments").insert({
        contract_id: row.id,
        amount: data.advance_paid,
        payment_date: data.contract_date,
        method: "cash",
        note: "নগদ চুক্তির অগ্রিম",
        created_by: userId,
      });
      if (payErr) throw new Error(payErr.message);
    }

    await supabase.rpc("log_audit", {
      _action: "contract.create",
      _entity_type: "contract",
      _entity_id: row.id,
      _old_value: null,
      _new_value: JSON.parse(JSON.stringify(insertRow)),
    });

    return row;
  });

export const deleteContract = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.from("contracts").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { success: true };
  });
