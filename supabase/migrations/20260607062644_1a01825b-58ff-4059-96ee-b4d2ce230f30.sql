
CREATE TABLE public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_date date NOT NULL DEFAULT CURRENT_DATE,
  category text NOT NULL,
  amount numeric(14,2) NOT NULL CHECK (amount >= 0),
  note text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_expenses_date ON public.expenses(expense_date);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.expenses TO authenticated;
GRANT ALL ON public.expenses TO service_role;

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Role users read expenses" ON public.expenses FOR SELECT TO authenticated
  USING (private.has_any_role(auth.uid()));
CREATE POLICY "Role users insert expenses" ON public.expenses FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by AND private.has_any_role(auth.uid()));
CREATE POLICY "Creators update own expenses" ON public.expenses FOR UPDATE TO authenticated
  USING (auth.uid() = created_by AND private.has_any_role(auth.uid()))
  WITH CHECK (auth.uid() = created_by AND private.has_any_role(auth.uid()));
CREATE POLICY "Admin modify expenses" ON public.expenses FOR UPDATE TO authenticated
  USING (private.is_admin(auth.uid()));
CREATE POLICY "Admin delete expenses" ON public.expenses FOR DELETE TO authenticated
  USING (private.is_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.prevent_expense_field_escalation()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'private'
AS $$
BEGIN
  IF private.is_admin(auth.uid()) THEN RETURN NEW; END IF;
  IF NEW.amount IS DISTINCT FROM OLD.amount
     OR NEW.expense_date IS DISTINCT FROM OLD.expense_date
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
  THEN
    RAISE EXCEPTION 'Not allowed to modify protected expense fields';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER expenses_prevent_field_escalation BEFORE UPDATE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.prevent_expense_field_escalation();

CREATE TRIGGER expenses_set_updated_at BEFORE UPDATE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
