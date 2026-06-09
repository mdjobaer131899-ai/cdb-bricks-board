
CREATE TABLE IF NOT EXISTS public.production_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  production_date date NOT NULL DEFAULT CURRENT_DATE,
  brick_type_id uuid NOT NULL REFERENCES public.brick_types(id) ON DELETE RESTRICT,
  quantity numeric(14,2) NOT NULL CHECK (quantity > 0),
  notes text,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_production_date ON public.production_entries(production_date DESC);
CREATE INDEX IF NOT EXISTS idx_production_brick ON public.production_entries(brick_type_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.production_entries TO authenticated;
GRANT ALL ON public.production_entries TO service_role;
ALTER TABLE public.production_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view production" ON public.production_entries
  FOR SELECT TO authenticated USING (private.has_any_role(auth.uid()));
CREATE POLICY "Staff can insert production" ON public.production_entries
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by AND private.has_any_role(auth.uid()));
CREATE POLICY "Creator can update own production" ON public.production_entries
  FOR UPDATE TO authenticated USING (auth.uid() = created_by AND private.has_any_role(auth.uid()))
  WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Admins manage production" ON public.production_entries
  FOR ALL TO authenticated USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));
CREATE POLICY "Creator can delete own production" ON public.production_entries
  FOR DELETE TO authenticated USING (auth.uid() = created_by AND private.has_any_role(auth.uid()));

CREATE TRIGGER production_entries_updated_at BEFORE UPDATE ON public.production_entries
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Stock ledger (ref_id required for triggered rows)
CREATE TABLE IF NOT EXISTS public.stock_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brick_type_id uuid NOT NULL REFERENCES public.brick_types(id) ON DELETE RESTRICT,
  change numeric(14,2) NOT NULL,
  ref_type text NOT NULL CHECK (ref_type IN ('production','sale','adjustment','return')),
  ref_id uuid NOT NULL,
  ref_date date NOT NULL DEFAULT CURRENT_DATE,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_stock_ledger_ref UNIQUE (ref_type, ref_id)
);
CREATE INDEX IF NOT EXISTS idx_stock_ledger_brick ON public.stock_ledger(brick_type_id);
CREATE INDEX IF NOT EXISTS idx_stock_ledger_date ON public.stock_ledger(ref_date DESC);

GRANT SELECT ON public.stock_ledger TO authenticated;
GRANT ALL ON public.stock_ledger TO service_role;
ALTER TABLE public.stock_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can view stock ledger" ON public.stock_ledger
  FOR SELECT TO authenticated USING (private.has_any_role(auth.uid()));

CREATE OR REPLACE VIEW public.current_stock AS
SELECT bt.id AS brick_type_id, bt.name AS brick_name,
       COALESCE(SUM(sl.change), 0)::numeric(14,2) AS quantity
FROM public.brick_types bt
LEFT JOIN public.stock_ledger sl ON sl.brick_type_id = bt.id
GROUP BY bt.id, bt.name;
GRANT SELECT ON public.current_stock TO authenticated;

CREATE OR REPLACE FUNCTION public.sync_stock_for_production()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.stock_ledger WHERE ref_type='production' AND ref_id = OLD.id;
    RETURN OLD;
  END IF;
  INSERT INTO public.stock_ledger (brick_type_id, change, ref_type, ref_id, ref_date, note)
  VALUES (NEW.brick_type_id, NEW.quantity, 'production', NEW.id, NEW.production_date, NEW.notes)
  ON CONFLICT ON CONSTRAINT uq_stock_ledger_ref DO UPDATE
    SET brick_type_id = EXCLUDED.brick_type_id,
        change = EXCLUDED.change,
        ref_date = EXCLUDED.ref_date,
        note = EXCLUDED.note;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_stock_for_sale()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.stock_ledger WHERE ref_type='sale' AND ref_id = OLD.id;
    RETURN OLD;
  END IF;
  IF NEW.status = 'approved' AND NEW.sale_type <> 'advance' AND NEW.quantity > 0 THEN
    INSERT INTO public.stock_ledger (brick_type_id, change, ref_type, ref_id, ref_date, note)
    VALUES (NEW.brick_type_id, -NEW.quantity, 'sale', NEW.id, NEW.sale_date, 'চালান ' || NEW.challan_no)
    ON CONFLICT ON CONSTRAINT uq_stock_ledger_ref DO UPDATE
      SET brick_type_id = EXCLUDED.brick_type_id,
          change = EXCLUDED.change,
          ref_date = EXCLUDED.ref_date,
          note = EXCLUDED.note;
  ELSE
    DELETE FROM public.stock_ledger WHERE ref_type='sale' AND ref_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS production_stock_sync ON public.production_entries;
CREATE TRIGGER production_stock_sync AFTER INSERT OR UPDATE OR DELETE ON public.production_entries
FOR EACH ROW EXECUTE FUNCTION public.sync_stock_for_production();

DROP TRIGGER IF EXISTS sales_stock_sync ON public.sales_entries;
CREATE TRIGGER sales_stock_sync AFTER INSERT OR UPDATE OR DELETE ON public.sales_entries
FOR EACH ROW EXECUTE FUNCTION public.sync_stock_for_sale();

REVOKE EXECUTE ON FUNCTION public.sync_stock_for_production() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_stock_for_sale() FROM PUBLIC, anon, authenticated;

-- Backfill from existing approved sales
INSERT INTO public.stock_ledger (brick_type_id, change, ref_type, ref_id, ref_date, note)
SELECT brick_type_id, -quantity, 'sale', id, sale_date, 'চালান ' || challan_no
FROM public.sales_entries
WHERE status = 'approved' AND sale_type <> 'advance' AND quantity > 0
ON CONFLICT ON CONSTRAINT uq_stock_ledger_ref DO NOTHING;
