CREATE TYPE public.opening_kind AS ENUM ('customer_brick_due','sardar_payable','other_payable');

CREATE TABLE public.opening_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind public.opening_kind NOT NULL,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  sardar_id uuid REFERENCES public.sardars(id) ON DELETE SET NULL,
  worker_id uuid REFERENCES public.workers(id) ON DELETE SET NULL,
  party_name text,
  category text,
  amount numeric NOT NULL CHECK (amount >= 0),
  fiscal_year integer NOT NULL DEFAULT (EXTRACT(YEAR FROM now())::int - 1),
  as_of_date date NOT NULL DEFAULT CURRENT_DATE,
  note text,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.opening_balances TO authenticated;
GRANT ALL ON public.opening_balances TO service_role;
ALTER TABLE public.opening_balances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth can read opening balances" ON public.opening_balances FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth can insert opening balances" ON public.opening_balances FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "admins update opening balances" ON public.opening_balances FOR UPDATE TO authenticated USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));
CREATE POLICY "admins delete opening balances" ON public.opening_balances FOR DELETE TO authenticated USING (private.is_admin(auth.uid()));

CREATE TABLE public.opening_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opening_balance_id uuid NOT NULL REFERENCES public.opening_balances(id) ON DELETE CASCADE,
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  amount numeric NOT NULL CHECK (amount > 0),
  method text,
  note text,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.opening_payments TO authenticated;
GRANT ALL ON public.opening_payments TO service_role;
ALTER TABLE public.opening_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth can read opening payments" ON public.opening_payments FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth can insert opening payments" ON public.opening_payments FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "admins update opening payments" ON public.opening_payments FOR UPDATE TO authenticated USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));
CREATE POLICY "admins delete opening payments" ON public.opening_payments FOR DELETE TO authenticated USING (private.is_admin(auth.uid()));

CREATE INDEX idx_opening_payments_balance ON public.opening_payments(opening_balance_id);
CREATE INDEX idx_opening_balances_kind ON public.opening_balances(kind);

CREATE TRIGGER update_opening_balances_updated_at BEFORE UPDATE ON public.opening_balances FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_opening_payments_updated_at BEFORE UPDATE ON public.opening_payments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE VIEW public.opening_balance_summary AS
SELECT ob.id, ob.kind, ob.customer_id, ob.sardar_id, ob.worker_id, ob.party_name, ob.category,
       ob.amount, ob.fiscal_year, ob.as_of_date, ob.note, ob.created_at,
       COALESCE(c.name, s.name, w.name, ob.party_name) AS display_name,
       COALESCE(p.paid, 0) AS paid_amount,
       ob.amount - COALESCE(p.paid, 0) AS remaining_amount
FROM public.opening_balances ob
LEFT JOIN public.customers c ON c.id = ob.customer_id
LEFT JOIN public.sardars s ON s.id = ob.sardar_id
LEFT JOIN public.workers w ON w.id = ob.worker_id
LEFT JOIN (SELECT opening_balance_id, SUM(amount) AS paid FROM public.opening_payments GROUP BY opening_balance_id) p
  ON p.opening_balance_id = ob.id;

ALTER VIEW public.opening_balance_summary SET (security_invoker = on);
GRANT SELECT ON public.opening_balance_summary TO authenticated;