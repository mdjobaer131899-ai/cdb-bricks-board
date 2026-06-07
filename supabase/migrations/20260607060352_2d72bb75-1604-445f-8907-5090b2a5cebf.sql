
CREATE TABLE public.collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  contract_id uuid REFERENCES public.contracts(id) ON DELETE SET NULL,
  amount numeric(14,2) NOT NULL CHECK (amount >= 0),
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  method text,
  note text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_collections_customer ON public.collections(customer_id);
CREATE INDEX idx_collections_contract ON public.collections(contract_id);
CREATE INDEX idx_collections_date ON public.collections(payment_date);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.collections TO authenticated;
GRANT ALL ON public.collections TO service_role;

ALTER TABLE public.collections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Role users read collections" ON public.collections
  FOR SELECT TO authenticated USING (private.has_any_role(auth.uid()));

CREATE POLICY "Role users insert collections" ON public.collections
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by AND private.has_any_role(auth.uid()));

CREATE POLICY "Creators update own collections" ON public.collections
  FOR UPDATE TO authenticated
  USING (auth.uid() = created_by AND private.has_any_role(auth.uid()))
  WITH CHECK (auth.uid() = created_by AND private.has_any_role(auth.uid()));

CREATE POLICY "Admin modify collections" ON public.collections
  FOR UPDATE TO authenticated USING (private.is_admin(auth.uid()));

CREATE POLICY "Admin delete collections" ON public.collections
  FOR DELETE TO authenticated USING (private.is_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.prevent_collection_field_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
BEGIN
  IF private.is_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;
  IF NEW.customer_id IS DISTINCT FROM OLD.customer_id
     OR NEW.contract_id IS DISTINCT FROM OLD.contract_id
     OR NEW.amount IS DISTINCT FROM OLD.amount
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
  THEN
    RAISE EXCEPTION 'Not allowed to modify protected collection fields';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER collections_prevent_field_escalation
  BEFORE UPDATE ON public.collections
  FOR EACH ROW EXECUTE FUNCTION public.prevent_collection_field_escalation();

CREATE TRIGGER collections_set_updated_at
  BEFORE UPDATE ON public.collections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
