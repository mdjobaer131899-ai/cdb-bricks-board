DO $$
DECLARE r record; staff text := '(private.has_role(auth.uid(), ''admin''::app_role) OR private.has_role(auth.uid(), ''manager''::app_role))';
BEGIN
FOR r IN SELECT tablename, policyname, cmd FROM pg_policies WHERE schemaname='public' AND (qual='true' OR with_check='true') LOOP
  EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, r.tablename);
  IF r.cmd='ALL' THEN
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (%s) WITH CHECK (%s)', r.policyname, r.tablename, staff, staff);
  ELSE
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (%s)', r.policyname, r.tablename, staff);
  END IF;
END LOOP;
END $$;