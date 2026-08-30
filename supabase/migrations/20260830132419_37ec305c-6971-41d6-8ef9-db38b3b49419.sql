DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig, p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
      AND p.proname NOT IN ('log_audit', 'generate_contract_no')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon, authenticated', r.sig);
  END LOOP;
  -- generate_contract_no stays callable by signed-in users only
  EXECUTE 'REVOKE EXECUTE ON FUNCTION public.generate_contract_no(public.contract_type) FROM anon';
  EXECUTE 'REVOKE EXECUTE ON FUNCTION public.log_audit(text, text, uuid, jsonb, jsonb) FROM anon';
END $$;
