
-- 1) Creator DELETE policy on collections (symmetric with other tables)
DROP POLICY IF EXISTS "Creators delete own collections" ON public.collections;
CREATE POLICY "Creators delete own collections"
ON public.collections
FOR DELETE
TO authenticated
USING (created_by = auth.uid());

-- 2) Lock down SECURITY DEFINER functions from public roles.
--    These helpers are only invoked from trusted server code (service_role)
--    or from authenticated server functions that already perform their own checks.

-- generate_contract_no: called only via supabaseAdmin (service_role)
REVOKE ALL ON FUNCTION public.generate_contract_no(public.contract_type) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_contract_no(public.contract_type) TO service_role;

-- expire_old_contracts: admin/cron only
REVOKE ALL ON FUNCTION public.expire_old_contracts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_old_contracts() TO service_role;

-- log_audit: needs to be callable by signed-in users (it self-checks role),
-- but must not be callable by anonymous users.
REVOKE ALL ON FUNCTION public.log_audit(text, text, uuid, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_audit(text, text, uuid, jsonb, jsonb) TO authenticated, service_role;
