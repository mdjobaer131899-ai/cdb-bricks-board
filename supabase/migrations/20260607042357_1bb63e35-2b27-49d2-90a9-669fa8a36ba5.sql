
DROP POLICY IF EXISTS "Authenticated read contracts" ON public.contracts;
DROP POLICY IF EXISTS "Authenticated create contracts" ON public.contracts;
CREATE POLICY "Role users read contracts" ON public.contracts
  FOR SELECT TO authenticated USING (private.has_any_role(auth.uid()));
CREATE POLICY "Role users create contracts" ON public.contracts
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by AND private.has_any_role(auth.uid()));

DROP POLICY IF EXISTS "Authenticated read payments" ON public.contract_payments;
DROP POLICY IF EXISTS "Authenticated insert payments" ON public.contract_payments;
CREATE POLICY "Role users read payments" ON public.contract_payments
  FOR SELECT TO authenticated USING (private.has_any_role(auth.uid()));
CREATE POLICY "Role users insert payments" ON public.contract_payments
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by AND private.has_any_role(auth.uid()));

DROP POLICY IF EXISTS "Authenticated insert own audit" ON public.audit_logs;
CREATE POLICY "Role users insert own audit" ON public.audit_logs
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND private.has_any_role(auth.uid()));
