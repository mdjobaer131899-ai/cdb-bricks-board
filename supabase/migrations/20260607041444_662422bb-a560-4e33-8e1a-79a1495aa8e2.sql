
REVOKE EXECUTE ON FUNCTION public.generate_contract_no(public.contract_type) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.expire_old_contracts() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION private.is_admin(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.is_admin(uuid) TO authenticated;
