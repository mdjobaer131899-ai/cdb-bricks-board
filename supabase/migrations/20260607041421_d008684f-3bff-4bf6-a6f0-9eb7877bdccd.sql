
-- Contract types and statuses
CREATE TYPE public.contract_type AS ENUM ('yearly_fixed', 'short_term', 'cash');
CREATE TYPE public.contract_status AS ENUM ('active', 'completed', 'expired', 'suspended');

-- private schema for security-definer helpers (avoid RLS recursion)
CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.is_admin(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _uid AND role = 'admin')
$$;

-- Contracts table
CREATE TABLE public.contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_no text NOT NULL UNIQUE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  contract_type public.contract_type NOT NULL,
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  expiry_date date,
  fixed_rate numeric(12,2),
  booked_quantity numeric(12,2) NOT NULL DEFAULT 0,
  booked_value numeric(14,2) NOT NULL DEFAULT 0,
  advance_paid numeric(14,2) NOT NULL DEFAULT 0,
  priority integer NOT NULL DEFAULT 100,
  status public.contract_status NOT NULL DEFAULT 'active',
  notes text,
  created_by uuid NOT NULL,
  approved_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_contracts_customer ON public.contracts(customer_id);
CREATE INDEX idx_contracts_status ON public.contracts(status);
CREATE INDEX idx_contracts_type ON public.contracts(contract_type);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.contracts TO authenticated;
GRANT ALL ON public.contracts TO service_role;
ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read contracts" ON public.contracts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated create contracts" ON public.contracts FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Admin update contracts" ON public.contracts FOR UPDATE TO authenticated USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));
CREATE POLICY "Admin delete contracts" ON public.contracts FOR DELETE TO authenticated USING (private.is_admin(auth.uid()));

CREATE TRIGGER update_contracts_updated_at BEFORE UPDATE ON public.contracts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Contract payments (advances and additional)
CREATE TABLE public.contract_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  amount numeric(14,2) NOT NULL CHECK (amount >= 0),
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  method text,
  note text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_contract_payments_contract ON public.contract_payments(contract_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.contract_payments TO authenticated;
GRANT ALL ON public.contract_payments TO service_role;
ALTER TABLE public.contract_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read payments" ON public.contract_payments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert payments" ON public.contract_payments FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Admin modify payments" ON public.contract_payments FOR UPDATE TO authenticated USING (private.is_admin(auth.uid()));
CREATE POLICY "Admin delete payments" ON public.contract_payments FOR DELETE TO authenticated USING (private.is_admin(auth.uid()));

-- Audit logs
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  old_value jsonb,
  new_value jsonb,
  ip text,
  device text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_logs_entity ON public.audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_logs_user ON public.audit_logs(user_id);

GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin read audit" ON public.audit_logs FOR SELECT TO authenticated USING (private.is_admin(auth.uid()));
CREATE POLICY "Authenticated insert audit" ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (true);

-- Add contract_id to sales_entries (nullable for backwards compat)
ALTER TABLE public.sales_entries ADD COLUMN contract_id uuid REFERENCES public.contracts(id) ON DELETE SET NULL;
CREATE INDEX idx_sales_entries_contract ON public.sales_entries(contract_id);

-- Contract number generator: YF-2026-0001, ST-2026-0001, CS-2026-0001
CREATE OR REPLACE FUNCTION public.generate_contract_no(_type public.contract_type)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_prefix text;
  v_year text := to_char(now(), 'YYYY');
  v_count int;
BEGIN
  v_prefix := CASE _type
    WHEN 'yearly_fixed' THEN 'YF'
    WHEN 'short_term' THEN 'ST'
    WHEN 'cash' THEN 'CS'
  END;
  SELECT COUNT(*) + 1 INTO v_count FROM public.contracts
    WHERE contract_type = _type AND to_char(created_at, 'YYYY') = v_year;
  RETURN v_prefix || '-' || v_year || '-' || lpad(v_count::text, 4, '0');
END;
$$;

-- Auto-expire trigger (called when read or via cron later)
CREATE OR REPLACE FUNCTION public.expire_old_contracts()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.contracts SET status = 'expired'
  WHERE status = 'active' AND expiry_date IS NOT NULL AND expiry_date < CURRENT_DATE;
$$;
