
DROP POLICY "Authenticated insert audit" ON public.audit_logs;
CREATE POLICY "Authenticated insert own audit" ON public.audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (user_id IS NULL OR user_id = auth.uid());
