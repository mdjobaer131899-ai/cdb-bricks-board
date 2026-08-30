-- 0. Security: internal accounting helpers must not be callable from the API
REVOKE EXECUTE ON FUNCTION public.acc(text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.acc_for_method(text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.expense_account_for(text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recompute_customer_advance(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recompute_contract_advance(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recompute_contract_delivered(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recompute_order_progress(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_month_closed(date) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.expire_old_contracts() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_contract_no(public.contract_type) FROM anon;

-- 1. Work categories
CREATE TABLE IF NOT EXISTS public.work_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  unit text NOT NULL DEFAULT 'পিস',
  account_code text NOT NULL DEFAULT '6110',
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.work_categories TO authenticated;
GRANT ALL ON public.work_categories TO service_role;
ALTER TABLE public.work_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY wc_select ON public.work_categories FOR SELECT TO authenticated USING (private.has_any_role(auth.uid()));
CREATE POLICY wc_admin_write ON public.work_categories FOR ALL TO authenticated USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));
CREATE TRIGGER trg_wc_updated BEFORE UPDATE ON public.work_categories FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.work_categories (code, name, unit, account_code, sort_order) VALUES
  ('kacha', 'কাঁচা ইট তৈরি', 'পিস', '6110', 1),
  ('firing', 'ইট পোড়ানো', 'পিস', '6120', 2),
  ('loading', 'লোডিং', 'পিস', '6130', 3),
  ('unloading', 'আনলোডিং', 'পিস', '6130', 4),
  ('mati', 'মাটি কাটা', 'ঘনফুট', '6300', 5),
  ('coal', 'কয়লা/জ্বালানি হ্যান্ডলিং', 'কেজি', '6400', 6),
  ('transport', 'পরিবহন', 'ট্রিপ', '6500', 7)
ON CONFLICT (code) DO NOTHING;

-- 2. Sardar rates (effective-dated; old work keeps its own snapshotted rate)
CREATE TABLE IF NOT EXISTS public.sardar_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sardar_id uuid REFERENCES public.sardars(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.work_categories(id) ON DELETE CASCADE,
  rate numeric NOT NULL CHECK (rate >= 0),
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sardar_rates_lookup ON public.sardar_rates (category_id, sardar_id, effective_from DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sardar_rates TO authenticated;
GRANT ALL ON public.sardar_rates TO service_role;
ALTER TABLE public.sardar_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY sr_select ON public.sardar_rates FOR SELECT TO authenticated USING (private.has_any_role(auth.uid()));
CREATE POLICY sr_admin_write ON public.sardar_rates FOR ALL TO authenticated USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));
CREATE TRIGGER trg_sr_updated BEFORE UPDATE ON public.sardar_rates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.current_sardar_rate(_sardar_id uuid, _category_id uuid, _on_date date DEFAULT CURRENT_DATE)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT rate FROM public.sardar_rates
   WHERE category_id = _category_id
     AND (sardar_id = _sardar_id OR sardar_id IS NULL)
     AND effective_from <= _on_date
   ORDER BY (sardar_id IS NULL), effective_from DESC
   LIMIT 1;
$$;
REVOKE EXECUTE ON FUNCTION public.current_sardar_rate(uuid, uuid, date) FROM anon;

-- 3. Sardar work entries -> payable
CREATE TABLE IF NOT EXISTS public.sardar_work_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_date date NOT NULL DEFAULT CURRENT_DATE,
  sardar_id uuid NOT NULL REFERENCES public.sardars(id) ON DELETE RESTRICT,
  category_id uuid NOT NULL REFERENCES public.work_categories(id) ON DELETE RESTRICT,
  quantity numeric NOT NULL CHECK (quantity > 0),
  rate numeric NOT NULL CHECK (rate >= 0),
  amount numeric NOT NULL DEFAULT 0,
  note text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_swe_sardar_date ON public.sardar_work_entries (sardar_id, entry_date);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sardar_work_entries TO authenticated;
GRANT ALL ON public.sardar_work_entries TO service_role;
ALTER TABLE public.sardar_work_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY swe_select ON public.sardar_work_entries FOR SELECT TO authenticated USING (private.has_any_role(auth.uid()));
CREATE POLICY swe_insert ON public.sardar_work_entries FOR INSERT TO authenticated WITH CHECK (private.has_any_role(auth.uid()) AND created_by = auth.uid());
CREATE POLICY swe_update_admin ON public.sardar_work_entries FOR UPDATE TO authenticated USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));
CREATE POLICY swe_delete_admin ON public.sardar_work_entries FOR DELETE TO authenticated USING (private.is_admin(auth.uid()));
CREATE TRIGGER trg_swe_updated BEFORE UPDATE ON public.sardar_work_entries FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- amount always quantity * rate; rate of an existing entry is frozen
CREATE OR REPLACE FUNCTION public.swe_autocalc()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' AND (NEW.rate IS NULL OR NEW.rate = 0) THEN
    NEW.rate := COALESCE(public.current_sardar_rate(NEW.sardar_id, NEW.category_id, NEW.entry_date), 0);
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.rate IS DISTINCT FROM OLD.rate THEN
    RAISE EXCEPTION 'পুরোনো কাজের রেট পরিবর্তন করা যাবে না — নতুন এন্ট্রি করুন';
  END IF;
  NEW.amount := ROUND(COALESCE(NEW.quantity,0) * COALESCE(NEW.rate,0), 2);
  RETURN NEW;
END $$;
CREATE TRIGGER trg_swe_autocalc BEFORE INSERT OR UPDATE ON public.sardar_work_entries
FOR EACH ROW EXECUTE FUNCTION public.swe_autocalc();

CREATE OR REPLACE FUNCTION public.post_sardar_work_journal()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_entry_id uuid; v_acc uuid;
BEGIN
  DELETE FROM public.journal_entries WHERE source='sardar' AND ref_type='sardar_work' AND ref_id = COALESCE(NEW.id, OLD.id);
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  IF COALESCE(NEW.amount,0)=0 THEN RETURN NEW; END IF;
  SELECT public.acc(account_code) INTO v_acc FROM public.work_categories WHERE id = NEW.category_id;
  v_acc := COALESCE(v_acc, public.acc('6100'));
  INSERT INTO public.journal_entries(entry_date, source, ref_type, ref_id, narration, created_by)
  VALUES (NEW.entry_date,'sardar','sardar_work',NEW.id,'সরদার কাজ',NEW.created_by)
  RETURNING id INTO v_entry_id;
  INSERT INTO public.journal_lines(entry_id,account_id,debit,credit,note) VALUES
    (v_entry_id, v_acc, NEW.amount, 0, 'Work'),
    (v_entry_id, public.acc('2200'), 0, NEW.amount, 'Sardar payable');
  RETURN NEW;
END $$;
CREATE TRIGGER trg_swe_journal AFTER INSERT OR UPDATE OR DELETE ON public.sardar_work_entries
FOR EACH ROW EXECUTE FUNCTION public.post_sardar_work_journal();

-- 4. Sardar payments (payment / advance) -> reduce payable
CREATE TABLE IF NOT EXISTS public.sardar_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sardar_id uuid NOT NULL REFERENCES public.sardars(id) ON DELETE RESTRICT,
  amount numeric NOT NULL CHECK (amount > 0),
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  payment_type text NOT NULL DEFAULT 'payment',
  method text,
  note text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sp_sardar_date ON public.sardar_payments (sardar_id, payment_date);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sardar_payments TO authenticated;
GRANT ALL ON public.sardar_payments TO service_role;
ALTER TABLE public.sardar_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY sp_select ON public.sardar_payments FOR SELECT TO authenticated USING (private.has_any_role(auth.uid()));
CREATE POLICY sp_insert ON public.sardar_payments FOR INSERT TO authenticated WITH CHECK (private.has_any_role(auth.uid()) AND created_by = auth.uid());
CREATE POLICY sp_update_admin ON public.sardar_payments FOR UPDATE TO authenticated USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));
CREATE POLICY sp_delete_admin ON public.sardar_payments FOR DELETE TO authenticated USING (private.is_admin(auth.uid()));
CREATE TRIGGER trg_sp_updated BEFORE UPDATE ON public.sardar_payments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.post_sardar_payment_journal()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_entry_id uuid;
BEGIN
  DELETE FROM public.journal_entries WHERE source='sardar' AND ref_type='sardar_payment' AND ref_id = COALESCE(NEW.id, OLD.id);
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  IF COALESCE(NEW.amount,0)=0 THEN RETURN NEW; END IF;
  INSERT INTO public.journal_entries(entry_date, source, ref_type, ref_id, narration, created_by)
  VALUES (NEW.payment_date,'sardar','sardar_payment',NEW.id, CASE WHEN NEW.payment_type='advance' THEN 'সরদার অগ্রিম' ELSE 'সরদার পেমেন্ট' END, NEW.created_by)
  RETURNING id INTO v_entry_id;
  INSERT INTO public.journal_lines(entry_id,account_id,debit,credit,note) VALUES
    (v_entry_id, public.acc('2200'), NEW.amount, 0, NEW.payment_type),
    (v_entry_id, public.acc_for_method(NEW.method), 0, NEW.amount, COALESCE(NEW.method,'cash'));
  RETURN NEW;
END $$;
CREATE TRIGGER trg_sp_journal AFTER INSERT OR UPDATE OR DELETE ON public.sardar_payments
FOR EACH ROW EXECUTE FUNCTION public.post_sardar_payment_journal();

-- 5. Sardar balance summary (work + legacy kacha entries - payments)
CREATE OR REPLACE VIEW public.sardar_balances
WITH (security_invoker = true) AS
SELECT s.id AS sardar_id,
       s.name,
       COALESCE(w.total_quantity, 0) AS total_quantity,
       COALESCE(w.total_due, 0) + COALESCE(k.total_due, 0) AS total_due,
       COALESCE(p.total_paid, 0) AS total_paid,
       COALESCE(p.total_advance, 0) AS total_advance,
       COALESCE(w.total_due, 0) + COALESCE(k.total_due, 0) - COALESCE(p.total_paid, 0) - COALESCE(p.total_advance, 0) AS balance
FROM public.sardars s
LEFT JOIN (
  SELECT sardar_id, SUM(quantity) AS total_quantity, SUM(amount) AS total_due
  FROM public.sardar_work_entries GROUP BY sardar_id
) w ON w.sardar_id = s.id
LEFT JOIN (
  SELECT sardar_id, SUM(amount) AS total_due
  FROM public.kacha_brick_entries WHERE sardar_id IS NOT NULL AND entry_type <> 'damage' GROUP BY sardar_id
) k ON k.sardar_id = s.id
LEFT JOIN (
  SELECT sardar_id,
         SUM(CASE WHEN payment_type = 'advance' THEN 0 ELSE amount END) AS total_paid,
         SUM(CASE WHEN payment_type = 'advance' THEN amount ELSE 0 END) AS total_advance
  FROM public.sardar_payments GROUP BY sardar_id
) p ON p.sardar_id = s.id;
GRANT SELECT ON public.sardar_balances TO authenticated;
GRANT ALL ON public.sardar_balances TO service_role;
