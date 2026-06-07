import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const NewContractSchema = z.object({
  customer_id: z.string().uuid(),
  contract_type: z.enum(["yearly_fixed", "short_term", "cash"]),
  start_date: z.string().min(1),
  expiry_date: z.string().nullable().optional(),
  fixed_rate: z.number().nullable().optional(),
  booked_quantity: z.number().min(0).default(0),
  booked_value: z.number().min(0).default(0),
  advance_paid: z.number().min(0).default(0),
  priority: z.number().int().min(1).max(999).default(100),
  notes: z.string().nullable().optional(),
});

export const createContract = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => NewContractSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Generate contract_no using SECURITY DEFINER fn via admin
    const { data: noRes, error: noErr } = await supabaseAdmin.rpc("generate_contract_no", {
      _type: data.contract_type,
    });
    if (noErr) throw new Error(noErr.message);
    const contract_no = noRes as unknown as string;

    const insertRow = {
      contract_no,
      customer_id: data.customer_id,
      contract_type: data.contract_type,
      start_date: data.start_date,
      expiry_date: data.expiry_date ?? null,
      fixed_rate: data.fixed_rate ?? null,
      booked_quantity: data.booked_quantity,
      booked_value: data.booked_value,
      advance_paid: data.advance_paid,
      priority: data.priority,
      notes: data.notes ?? null,
      created_by: userId,
    };
    const { data: row, error } = await supabase.from("contracts").insert(insertRow).select("id, contract_no").single();
    if (error) throw new Error(error.message);

    // Optional initial advance payment record
    if (data.advance_paid > 0) {
      await supabase.from("contract_payments").insert({
        contract_id: row.id,
        amount: data.advance_paid,
        payment_date: data.start_date,
        method: "initial",
        note: "প্রাথমিক অ্যাডভান্স",
        created_by: userId,
      });
    }

    await supabase.rpc("log_audit", {
      _action: "contract.create",
      _entity_type: "contract",
      _entity_id: row.id,
      _old_value: null,
      _new_value: insertRow as unknown as Record<string, unknown>,
    });

    return row;
  });
