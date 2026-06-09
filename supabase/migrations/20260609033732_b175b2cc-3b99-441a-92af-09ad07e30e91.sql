
CREATE TABLE public.raw_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  unit text NOT NULL DEFAULT 'টন',
  low_stock_threshold numeric NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.raw_materials TO authenticated;
GRANT ALL ON public.raw_materials TO service_role;
ALTER TABLE public.raw_materials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rm_select" ON public.raw_materials FOR SELECT TO authenticated USING (private.has_any_role(auth.uid()));
CREATE POLICY "rm_admin_write" ON public.raw_materials FOR ALL TO authenticated USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));
CREATE TRIGGER trg_rm_updated BEFORE UPDATE ON public.raw_materials FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.raw_material_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id uuid NOT NULL REFERENCES public.raw_materials(id) ON DELETE RESTRICT,
  supplier_name text,
  quantity numeric NOT NULL CHECK (quantity > 0),
  unit_price numeric NOT NULL CHECK (unit_price >= 0),
  total_amount numeric NOT NULL CHECK (total_amount >= 0),
  purchase_date date NOT NULL DEFAULT CURRENT_DATE,
  payment_method text NOT NULL DEFAULT 'cash',
  note text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.raw_material_purchases TO authenticated;
GRANT ALL ON public.raw_material_purchases TO service_role;
ALTER TABLE public.raw_material_purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rmp_select" ON public.raw_material_purchases FOR SELECT TO authenticated USING (private.has_any_role(auth.uid()));
CREATE POLICY "rmp_insert" ON public.raw_material_purchases FOR INSERT TO authenticated WITH CHECK (private.has_any_role(auth.uid()));
CREATE POLICY "rmp_admin_update" ON public.raw_material_purchases FOR UPDATE TO authenticated USING (private.is_admin(auth.uid()));
CREATE POLICY "rmp_admin_delete" ON public.raw_material_purchases FOR DELETE TO authenticated USING (private.is_admin(auth.uid()));
CREATE TRIGGER trg_rmp_updated BEFORE UPDATE ON public.raw_material_purchases FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.production_entries
  ADD COLUMN IF NOT EXISTS coal_used numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS mati_used numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS labor_cost numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS other_cost numeric DEFAULT 0;

CREATE TABLE public.workers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text,
  role text NOT NULL DEFAULT 'অন্যান্য',
  daily_wage numeric NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workers TO authenticated;
GRANT ALL ON public.workers TO service_role;
ALTER TABLE public.workers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "w_select" ON public.workers FOR SELECT TO authenticated USING (private.has_any_role(auth.uid()));
CREATE POLICY "w_admin_write" ON public.workers FOR ALL TO authenticated USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));
CREATE TRIGGER trg_w_updated BEFORE UPDATE ON public.workers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.worker_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id uuid NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE,
  date date NOT NULL DEFAULT CURRENT_DATE,
  present boolean NOT NULL DEFAULT true,
  overtime_hours numeric NOT NULL DEFAULT 0,
  advance_paid numeric NOT NULL DEFAULT 0,
  note text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(worker_id, date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.worker_attendance TO authenticated;
GRANT ALL ON public.worker_attendance TO service_role;
ALTER TABLE public.worker_attendance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wa_select" ON public.worker_attendance FOR SELECT TO authenticated USING (private.has_any_role(auth.uid()));
CREATE POLICY "wa_write" ON public.worker_attendance FOR ALL TO authenticated USING (private.has_any_role(auth.uid())) WITH CHECK (private.has_any_role(auth.uid()));

CREATE TABLE public.worker_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id uuid NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE,
  amount numeric NOT NULL CHECK (amount > 0),
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  payment_type text NOT NULL DEFAULT 'wage',
  note text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.worker_payments TO authenticated;
GRANT ALL ON public.worker_payments TO service_role;
ALTER TABLE public.worker_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wp_select" ON public.worker_payments FOR SELECT TO authenticated USING (private.has_any_role(auth.uid()));
CREATE POLICY "wp_insert" ON public.worker_payments FOR INSERT TO authenticated WITH CHECK (private.has_any_role(auth.uid()));
CREATE POLICY "wp_admin_update" ON public.worker_payments FOR UPDATE TO authenticated USING (private.is_admin(auth.uid()));
CREATE POLICY "wp_admin_delete" ON public.worker_payments FOR DELETE TO authenticated USING (private.is_admin(auth.uid()));

CREATE TABLE public.vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_no text NOT NULL UNIQUE,
  type text NOT NULL DEFAULT 'ট্রাক',
  driver_name text,
  driver_phone text,
  capacity numeric,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vehicles TO authenticated;
GRANT ALL ON public.vehicles TO service_role;
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "v_select" ON public.vehicles FOR SELECT TO authenticated USING (private.has_any_role(auth.uid()));
CREATE POLICY "v_admin_write" ON public.vehicles FOR ALL TO authenticated USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));
CREATE TRIGGER trg_v_updated BEFORE UPDATE ON public.vehicles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.vehicle_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  expense_date date NOT NULL DEFAULT CURRENT_DATE,
  category text NOT NULL DEFAULT 'জ্বালানি',
  amount numeric NOT NULL CHECK (amount >= 0),
  note text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vehicle_expenses TO authenticated;
GRANT ALL ON public.vehicle_expenses TO service_role;
ALTER TABLE public.vehicle_expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ve_select" ON public.vehicle_expenses FOR SELECT TO authenticated USING (private.has_any_role(auth.uid()));
CREATE POLICY "ve_insert" ON public.vehicle_expenses FOR INSERT TO authenticated WITH CHECK (private.has_any_role(auth.uid()));
CREATE POLICY "ve_admin_update" ON public.vehicle_expenses FOR UPDATE TO authenticated USING (private.is_admin(auth.uid()));
CREATE POLICY "ve_admin_delete" ON public.vehicle_expenses FOR DELETE TO authenticated USING (private.is_admin(auth.uid()));

CREATE TABLE public.closed_months (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  year int NOT NULL,
  month int NOT NULL CHECK (month BETWEEN 1 AND 12),
  closed_by uuid REFERENCES auth.users(id),
  closed_at timestamptz NOT NULL DEFAULT now(),
  snapshot jsonb,
  UNIQUE(year, month)
);
GRANT SELECT, INSERT, DELETE ON public.closed_months TO authenticated;
GRANT ALL ON public.closed_months TO service_role;
ALTER TABLE public.closed_months ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cm_select" ON public.closed_months FOR SELECT TO authenticated USING (private.has_any_role(auth.uid()));
CREATE POLICY "cm_admin_write" ON public.closed_months FOR ALL TO authenticated USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.is_month_closed(_date date)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS(SELECT 1 FROM public.closed_months WHERE year = EXTRACT(YEAR FROM _date)::int AND month = EXTRACT(MONTH FROM _date)::int);
$$;

CREATE OR REPLACE FUNCTION public.block_closed_month_sales()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF public.is_month_closed(COALESCE(NEW.sale_date, OLD.sale_date)) THEN
    RAISE EXCEPTION 'এই মাস বন্ধ হয়ে গেছে — পরিবর্তন করা যাবে না';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
CREATE TRIGGER trg_block_closed_sales BEFORE UPDATE OR DELETE ON public.sales_entries FOR EACH ROW EXECUTE FUNCTION public.block_closed_month_sales();

CREATE OR REPLACE FUNCTION public.block_closed_month_collections()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF public.is_month_closed(COALESCE(NEW.payment_date, OLD.payment_date)) THEN
    RAISE EXCEPTION 'এই মাস বন্ধ হয়ে গেছে';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
CREATE TRIGGER trg_block_closed_collections BEFORE UPDATE OR DELETE ON public.collections FOR EACH ROW EXECUTE FUNCTION public.block_closed_month_collections();

CREATE OR REPLACE FUNCTION public.block_closed_month_expenses()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF public.is_month_closed(COALESCE(NEW.expense_date, OLD.expense_date)) THEN
    RAISE EXCEPTION 'এই মাস বন্ধ হয়ে গেছে';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
CREATE TRIGGER trg_block_closed_expenses BEFORE UPDATE OR DELETE ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.block_closed_month_expenses();

INSERT INTO public.accounts (code, name, name_bn, account_type) VALUES
  ('1200', 'Raw Material Inventory', 'কাঁচামাল ইনভেন্টরি', 'asset'),
  ('2000', 'Accounts Payable', 'পরিশোধ্য', 'liability'),
  ('6100', 'Labor Expense', 'শ্রমিক খরচ', 'expense'),
  ('6200', 'Vehicle Expense', 'গাড়ি খরচ', 'expense')
ON CONFLICT (code) DO NOTHING;

CREATE OR REPLACE FUNCTION public.post_raw_material_journal()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_entry_id uuid; v_credit uuid;
BEGIN
  DELETE FROM public.journal_entries WHERE source='raw_material' AND ref_id = COALESCE(NEW.id, OLD.id);
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  IF COALESCE(NEW.total_amount,0)=0 THEN RETURN NEW; END IF;
  v_credit := CASE WHEN NEW.payment_method = 'credit' THEN acc('2000') ELSE acc('1000') END;
  INSERT INTO public.journal_entries(entry_date, source, ref_type, ref_id, narration, created_by)
  VALUES (NEW.purchase_date,'raw_material','raw_material_purchase',NEW.id,'কাঁচামাল ক্রয়',NEW.created_by)
  RETURNING id INTO v_entry_id;
  INSERT INTO public.journal_lines(entry_id,account_id,debit,credit,note) VALUES
    (v_entry_id, acc('1200'), NEW.total_amount, 0, 'Raw Material'),
    (v_entry_id, v_credit, 0, NEW.total_amount, NEW.payment_method);
  RETURN NEW;
END $$;
CREATE TRIGGER trg_rmp_journal AFTER INSERT OR UPDATE OR DELETE ON public.raw_material_purchases FOR EACH ROW EXECUTE FUNCTION public.post_raw_material_journal();

CREATE OR REPLACE FUNCTION public.post_worker_payment_journal()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_entry_id uuid;
BEGIN
  DELETE FROM public.journal_entries WHERE source='labor' AND ref_id = COALESCE(NEW.id, OLD.id);
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  IF COALESCE(NEW.amount,0)=0 THEN RETURN NEW; END IF;
  INSERT INTO public.journal_entries(entry_date, source, ref_type, ref_id, narration, created_by)
  VALUES (NEW.payment_date,'labor','worker_payment',NEW.id,'শ্রমিক পেমেন্ট',NEW.created_by)
  RETURNING id INTO v_entry_id;
  INSERT INTO public.journal_lines(entry_id,account_id,debit,credit,note) VALUES
    (v_entry_id, acc('6100'), NEW.amount, 0, NEW.payment_type),
    (v_entry_id, acc('1000'), 0, NEW.amount, 'Cash');
  RETURN NEW;
END $$;
CREATE TRIGGER trg_wp_journal AFTER INSERT OR UPDATE OR DELETE ON public.worker_payments FOR EACH ROW EXECUTE FUNCTION public.post_worker_payment_journal();

CREATE OR REPLACE FUNCTION public.post_vehicle_expense_journal()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_entry_id uuid;
BEGIN
  DELETE FROM public.journal_entries WHERE source='vehicle' AND ref_id = COALESCE(NEW.id, OLD.id);
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  IF COALESCE(NEW.amount,0)=0 THEN RETURN NEW; END IF;
  INSERT INTO public.journal_entries(entry_date, source, ref_type, ref_id, narration, created_by)
  VALUES (NEW.expense_date,'vehicle','vehicle_expense',NEW.id,'গাড়ি খরচ',NEW.created_by)
  RETURNING id INTO v_entry_id;
  INSERT INTO public.journal_lines(entry_id,account_id,debit,credit,note) VALUES
    (v_entry_id, acc('6200'), NEW.amount, 0, NEW.category),
    (v_entry_id, acc('1000'), 0, NEW.amount, 'Cash');
  RETURN NEW;
END $$;
CREATE TRIGGER trg_ve_journal AFTER INSERT OR UPDATE OR DELETE ON public.vehicle_expenses FOR EACH ROW EXECUTE FUNCTION public.post_vehicle_expense_journal();

INSERT INTO public.raw_materials (name, unit) VALUES
  ('মাটি', 'ট্রাক'),
  ('কয়লা', 'টন'),
  ('তুষ', 'বস্তা')
ON CONFLICT (name) DO NOTHING;
