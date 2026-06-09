
-- Creator binding on inserts
DROP POLICY IF EXISTS "rmp_insert" ON public.raw_material_purchases;
CREATE POLICY "rmp_insert" ON public.raw_material_purchases
  FOR INSERT TO authenticated
  WITH CHECK (private.has_any_role(auth.uid()) AND auth.uid() = created_by);

DROP POLICY IF EXISTS "ve_insert" ON public.vehicle_expenses;
CREATE POLICY "ve_insert" ON public.vehicle_expenses
  FOR INSERT TO authenticated
  WITH CHECK (private.has_any_role(auth.uid()) AND auth.uid() = created_by);

DROP POLICY IF EXISTS "wp_insert" ON public.worker_payments;
CREATE POLICY "wp_insert" ON public.worker_payments
  FOR INSERT TO authenticated
  WITH CHECK (private.has_any_role(auth.uid()) AND auth.uid() = created_by);

-- Suppliers and supplier_payments: role check on insert
DROP POLICY IF EXISTS "auth insert suppliers" ON public.suppliers;
CREATE POLICY "auth insert suppliers" ON public.suppliers
  FOR INSERT TO authenticated
  WITH CHECK (private.has_any_role(auth.uid()));

DROP POLICY IF EXISTS "auth insert supplier_payments" ON public.supplier_payments;
CREATE POLICY "auth insert supplier_payments" ON public.supplier_payments
  FOR INSERT TO authenticated
  WITH CHECK (private.has_any_role(auth.uid()));

-- Worker attendance: scope writes to creator (admin override)
DROP POLICY IF EXISTS "wa_write" ON public.worker_attendance;
CREATE POLICY "wa_insert" ON public.worker_attendance
  FOR INSERT TO authenticated
  WITH CHECK (private.has_any_role(auth.uid()) AND auth.uid() = created_by);
CREATE POLICY "wa_update" ON public.worker_attendance
  FOR UPDATE TO authenticated
  USING (private.is_admin(auth.uid()) OR auth.uid() = created_by)
  WITH CHECK (private.is_admin(auth.uid()) OR auth.uid() = created_by);
CREATE POLICY "wa_delete" ON public.worker_attendance
  FOR DELETE TO authenticated
  USING (private.is_admin(auth.uid()) OR auth.uid() = created_by);

-- Revoke EXECUTE on SECURITY DEFINER functions from anon (these are trigger or helper functions, not API)
REVOKE EXECUTE ON FUNCTION public.block_closed_month_collections() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.block_closed_month_expenses() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.block_closed_month_sales() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_month_closed(date) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.post_raw_material_journal() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.post_vehicle_expense_journal() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.post_worker_payment_journal() FROM anon, PUBLIC;
