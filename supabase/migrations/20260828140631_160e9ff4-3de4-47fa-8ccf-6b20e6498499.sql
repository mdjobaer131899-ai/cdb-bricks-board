ALTER TABLE public.worker_payments ALTER COLUMN created_by SET NOT NULL;

DROP POLICY IF EXISTS wp_admin_update ON public.worker_payments;
CREATE POLICY wp_admin_update ON public.worker_payments
  FOR UPDATE TO authenticated
  USING (private.is_admin(auth.uid()))
  WITH CHECK (private.is_admin(auth.uid()));