-- ============ খাত (ledger heads) ============
CREATE TABLE public.ledger_heads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('income','expense')),
  unit text,
  note text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (name, kind)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ledger_heads TO authenticated;
GRANT ALL ON public.ledger_heads TO service_role;
ALTER TABLE public.ledger_heads ENABLE ROW LEVEL SECURITY;
CREATE POLICY lh_select ON public.ledger_heads FOR SELECT TO authenticated USING (private.has_any_role(auth.uid()));
CREATE POLICY lh_admin_write ON public.ledger_heads FOR ALL TO authenticated USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));
CREATE TRIGGER trg_lh_updated BEFORE UPDATE ON public.ledger_heads FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.ledger_head_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  head_id uuid NOT NULL REFERENCES public.ledger_heads(id) ON DELETE RESTRICT,
  entry_date date NOT NULL DEFAULT CURRENT_DATE,
  quantity numeric,
  rate numeric,
  amount numeric NOT NULL DEFAULT 0,
  party_name text,
  note text,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_lhe_head_date ON public.ledger_head_entries (head_id, entry_date);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ledger_head_entries TO authenticated;
GRANT ALL ON public.ledger_head_entries TO service_role;
ALTER TABLE public.ledger_head_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY lhe_select ON public.ledger_head_entries FOR SELECT TO authenticated USING (private.has_any_role(auth.uid()));
CREATE POLICY lhe_insert ON public.ledger_head_entries FOR INSERT TO authenticated WITH CHECK (private.has_any_role(auth.uid()) AND created_by = auth.uid());
CREATE POLICY lhe_update_admin ON public.ledger_head_entries FOR UPDATE TO authenticated USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));
CREATE POLICY lhe_delete_admin ON public.ledger_head_entries FOR DELETE TO authenticated USING (private.is_admin(auth.uid()));
CREATE TRIGGER trg_lhe_updated BEFORE UPDATE ON public.ledger_head_entries FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ সরদার ============
CREATE TABLE public.sardar_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  note text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sardar_groups TO authenticated;
GRANT ALL ON public.sardar_groups TO service_role;
ALTER TABLE public.sardar_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY sg_select ON public.sardar_groups FOR SELECT TO authenticated USING (private.has_any_role(auth.uid()));
CREATE POLICY sg_admin_write ON public.sardar_groups FOR ALL TO authenticated USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));
CREATE TRIGGER trg_sg_updated BEFORE UPDATE ON public.sardar_groups FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.sardars (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text,
  address text,
  group_id uuid REFERENCES public.sardar_groups(id) ON DELETE SET NULL,
  note text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sardars TO authenticated;
GRANT ALL ON public.sardars TO service_role;
ALTER TABLE public.sardars ENABLE ROW LEVEL SECURITY;
CREATE POLICY sd_select ON public.sardars FOR SELECT TO authenticated USING (private.has_any_role(auth.uid()));
CREATE POLICY sd_admin_write ON public.sardars FOR ALL TO authenticated USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));
CREATE TRIGGER trg_sd_updated BEFORE UPDATE ON public.sardars FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ কাঁচা ইট ============
CREATE TABLE public.kacha_brick_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_date date NOT NULL DEFAULT CURRENT_DATE,
  entry_type text NOT NULL DEFAULT 'production' CHECK (entry_type IN ('production','load','damage')),
  sardar_id uuid REFERENCES public.sardars(id) ON DELETE SET NULL,
  quantity numeric NOT NULL DEFAULT 0,
  rate numeric NOT NULL DEFAULT 0,
  amount numeric NOT NULL DEFAULT 0,
  note text,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_kbe_date ON public.kacha_brick_entries (entry_date);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kacha_brick_entries TO authenticated;
GRANT ALL ON public.kacha_brick_entries TO service_role;
ALTER TABLE public.kacha_brick_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY kbe_select ON public.kacha_brick_entries FOR SELECT TO authenticated USING (private.has_any_role(auth.uid()));
CREATE POLICY kbe_insert ON public.kacha_brick_entries FOR INSERT TO authenticated WITH CHECK (private.has_any_role(auth.uid()) AND created_by = auth.uid());
CREATE POLICY kbe_update_admin ON public.kacha_brick_entries FOR UPDATE TO authenticated USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));
CREATE POLICY kbe_delete_admin ON public.kacha_brick_entries FOR DELETE TO authenticated USING (private.is_admin(auth.uid()));
CREATE TRIGGER trg_kbe_updated BEFORE UPDATE ON public.kacha_brick_entries FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ অর্ডার ও ডেলিভারি ============
CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_no text NOT NULL UNIQUE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  brick_type_id uuid REFERENCES public.brick_types(id) ON DELETE SET NULL,
  quantity numeric NOT NULL DEFAULT 0,
  rate numeric NOT NULL DEFAULT 0,
  advance numeric NOT NULL DEFAULT 0,
  order_date date NOT NULL DEFAULT CURRENT_DATE,
  delivery_date date,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','partial','completed','cancelled')),
  note text,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.orders TO authenticated;
GRANT ALL ON public.orders TO service_role;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY ord_select ON public.orders FOR SELECT TO authenticated USING (private.has_any_role(auth.uid()));
CREATE POLICY ord_insert ON public.orders FOR INSERT TO authenticated WITH CHECK (private.has_any_role(auth.uid()) AND created_by = auth.uid());
CREATE POLICY ord_update_admin ON public.orders FOR UPDATE TO authenticated USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));
CREATE POLICY ord_delete_admin ON public.orders FOR DELETE TO authenticated USING (private.is_admin(auth.uid()));
CREATE TRIGGER trg_ord_updated BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  delivery_date date NOT NULL DEFAULT CURRENT_DATE,
  quantity numeric NOT NULL DEFAULT 0,
  vehicle_id uuid REFERENCES public.vehicles(id) ON DELETE SET NULL,
  driver_name text,
  note text,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_del_order ON public.deliveries (order_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.deliveries TO authenticated;
GRANT ALL ON public.deliveries TO service_role;
ALTER TABLE public.deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY del_select ON public.deliveries FOR SELECT TO authenticated USING (private.has_any_role(auth.uid()));
CREATE POLICY del_insert ON public.deliveries FOR INSERT TO authenticated WITH CHECK (private.has_any_role(auth.uid()) AND created_by = auth.uid());
CREATE POLICY del_update_admin ON public.deliveries FOR UPDATE TO authenticated USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));
CREATE POLICY del_delete_admin ON public.deliveries FOR DELETE TO authenticated USING (private.is_admin(auth.uid()));
CREATE TRIGGER trg_del_updated BEFORE UPDATE ON public.deliveries FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ ব্যাংক ও ট্রান্সফার ============
CREATE TABLE public.bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_name text NOT NULL,
  account_name text,
  account_no text,
  branch text,
  opening_balance numeric NOT NULL DEFAULT 0,
  note text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bank_accounts TO authenticated;
GRANT ALL ON public.bank_accounts TO service_role;
ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY ba_select ON public.bank_accounts FOR SELECT TO authenticated USING (private.has_any_role(auth.uid()));
CREATE POLICY ba_admin_write ON public.bank_accounts FOR ALL TO authenticated USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));
CREATE TRIGGER trg_ba_updated BEFORE UPDATE ON public.bank_accounts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.bank_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_account_id uuid NOT NULL REFERENCES public.bank_accounts(id) ON DELETE CASCADE,
  txn_date date NOT NULL DEFAULT CURRENT_DATE,
  direction text NOT NULL CHECK (direction IN ('in','out')),
  amount numeric NOT NULL DEFAULT 0,
  method text,
  note text,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_btx_acct ON public.bank_transactions (bank_account_id, txn_date);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bank_transactions TO authenticated;
GRANT ALL ON public.bank_transactions TO service_role;
ALTER TABLE public.bank_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY btx_select ON public.bank_transactions FOR SELECT TO authenticated USING (private.has_any_role(auth.uid()));
CREATE POLICY btx_insert ON public.bank_transactions FOR INSERT TO authenticated WITH CHECK (private.has_any_role(auth.uid()) AND created_by = auth.uid());
CREATE POLICY btx_update_admin ON public.bank_transactions FOR UPDATE TO authenticated USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));
CREATE POLICY btx_delete_admin ON public.bank_transactions FOR DELETE TO authenticated USING (private.is_admin(auth.uid()));
CREATE TRIGGER trg_btx_updated BEFORE UPDATE ON public.bank_transactions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_date date NOT NULL DEFAULT CURRENT_DATE,
  from_type text NOT NULL CHECK (from_type IN ('cash','bank')),
  from_bank_id uuid REFERENCES public.bank_accounts(id) ON DELETE SET NULL,
  to_type text NOT NULL CHECK (to_type IN ('cash','bank')),
  to_bank_id uuid REFERENCES public.bank_accounts(id) ON DELETE SET NULL,
  amount numeric NOT NULL DEFAULT 0,
  note text,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transfers TO authenticated;
GRANT ALL ON public.transfers TO service_role;
ALTER TABLE public.transfers ENABLE ROW LEVEL SECURITY;
CREATE POLICY tf_select ON public.transfers FOR SELECT TO authenticated USING (private.has_any_role(auth.uid()));
CREATE POLICY tf_insert ON public.transfers FOR INSERT TO authenticated WITH CHECK (private.has_any_role(auth.uid()) AND created_by = auth.uid());
CREATE POLICY tf_update_admin ON public.transfers FOR UPDATE TO authenticated USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));
CREATE POLICY tf_delete_admin ON public.transfers FOR DELETE TO authenticated USING (private.is_admin(auth.uid()));
CREATE TRIGGER trg_tf_updated BEFORE UPDATE ON public.transfers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ স্টাফ ডিপার্টমেন্ট ও পদবি ============
CREATE TABLE public.staff_departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_departments TO authenticated;
GRANT ALL ON public.staff_departments TO service_role;
ALTER TABLE public.staff_departments ENABLE ROW LEVEL SECURITY;
CREATE POLICY sdep_select ON public.staff_departments FOR SELECT TO authenticated USING (private.has_any_role(auth.uid()));
CREATE POLICY sdep_admin_write ON public.staff_departments FOR ALL TO authenticated USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));
CREATE TRIGGER trg_sdep_updated BEFORE UPDATE ON public.staff_departments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.staff_designations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_designations TO authenticated;
GRANT ALL ON public.staff_designations TO service_role;
ALTER TABLE public.staff_designations ENABLE ROW LEVEL SECURITY;
CREATE POLICY sdes_select ON public.staff_designations FOR SELECT TO authenticated USING (private.has_any_role(auth.uid()));
CREATE POLICY sdes_admin_write ON public.staff_designations FOR ALL TO authenticated USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));
CREATE TRIGGER trg_sdes_updated BEFORE UPDATE ON public.staff_designations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.workers
  ADD COLUMN IF NOT EXISTS department_id uuid REFERENCES public.staff_departments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS designation_id uuid REFERENCES public.staff_designations(id) ON DELETE SET NULL;