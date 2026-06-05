
CREATE POLICY "Staff can insert customers" ON public.customers
  FOR INSERT TO authenticated
  WITH CHECK (private.has_any_role(auth.uid()));

CREATE POLICY "Staff can update customers" ON public.customers
  FOR UPDATE TO authenticated
  USING (private.has_any_role(auth.uid()))
  WITH CHECK (private.has_any_role(auth.uid()));

CREATE POLICY "Staff can delete customers" ON public.customers
  FOR DELETE TO authenticated
  USING (private.has_any_role(auth.uid()));
