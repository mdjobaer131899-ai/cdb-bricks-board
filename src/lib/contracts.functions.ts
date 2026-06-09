import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const NewContractSchema = z.object({
  customer_id: z.string().uuid(),
  contract_date: z.string().min(1),
  total_brick_quantity: z.number().min(1),
  per_brick_rate: z.number().min(0),
  notes: z.string().max(500).nullable().optional(),
});

export const createContract = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => NewContractSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: noRes, error: noErr } = await supabaseAdmin.rpc("generate_contract_no", {
      _type: "yearly_fixed",
    });
    if (noErr) throw new Error(noErr.message);
    const contract_no = noRes as unknown as string;

    const insertRow = {
      contract_no,
      customer_id: data.customer_id,
      contract_type: "yearly_fixed" as const,
      start_date: data.contract_date,
      expiry_date: null,
      fixed_rate: data.per_brick_rate,
      booked_quantity: data.total_brick_quantity,
      // booked_value auto-computed by DB trigger (qty × rate)
      booked_value: data.total_brick_quantity * data.per_brick_rate,
      advance_paid: 0,
      priority: 100,
      notes: data.notes ?? null,
      created_by: userId,
    };
    const { data: row, error } = await supabase.from("contracts").insert(insertRow).select("id, contract_no").single();
    if (error) throw new Error(error.message);

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
