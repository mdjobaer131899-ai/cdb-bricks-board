import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const CashSaleSchema = z.object({
  customer_id: z.string().uuid(),
  brick_type_id: z.string().uuid(),
  custom_brick_name: z.string().max(120).nullable().optional(),
  challan_no: z.string().min(1).max(60),
  sale_date: z.string().min(1),
  quantity: z.number().int().min(1),
  unit_price: z.number().min(0),
  driver_name: z.string().max(120).nullable().optional(),
  vehicle_number: z.string().max(60).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
  payment_method: z.string().max(60).default("cash"),
  amount_received: z.number().min(0),
});

/**
 * Atomic Cash Sale — creates an approved sales_entry (no contract) +
 * a collection in one call. The DB triggers automatically update the
 * customer advance_balance. If `amount_received` exceeds total, the
 * excess becomes an advance balance for the customer.
 */
export const createCashSale = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => CashSaleSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const total = data.quantity * data.unit_price;

    const { data: sale, error: saleErr } = await supabase
      .from("sales_entries")
      .insert({
        challan_no: data.challan_no,
        customer_id: data.customer_id,
        brick_type_id: data.brick_type_id,
        custom_brick_name: data.custom_brick_name ?? null,
        quantity: data.quantity,
        unit_price: data.unit_price,
        total_amount: total,
        sale_type: "regular",
        status: "approved",
        sale_date: data.sale_date,
        driver_name: data.driver_name ?? null,
        vehicle_number: data.vehicle_number ?? null,
        notes: data.notes ?? "নগদ বিক্রি",
        created_by: userId,
        approved_by: userId,
        approved_at: new Date().toISOString(),
        contract_id: null,
      })
      .select("id, challan_no")
      .single();
    if (saleErr) throw new Error(saleErr.message);

    if (data.amount_received > 0) {
      const { error: colErr } = await supabase.from("collections").insert({
        customer_id: data.customer_id,
        contract_id: null,
        amount: data.amount_received,
        payment_date: data.sale_date,
        method: data.payment_method,
        note: `নগদ বিক্রি — চালান ${data.challan_no}`,
        created_by: userId,
      });
      if (colErr) throw new Error(colErr.message);
    }

    await supabase.rpc("log_audit", {
      _action: "cash_sale.create",
      _entity_type: "sales_entry",
      _entity_id: sale.id,
      _old_value: null,
      _new_value: JSON.parse(JSON.stringify({ ...data, total })),
    });

    return { id: sale.id, challan_no: sale.challan_no, total };
  });
