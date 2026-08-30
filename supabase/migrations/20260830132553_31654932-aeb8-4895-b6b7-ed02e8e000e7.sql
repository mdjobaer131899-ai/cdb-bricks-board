-- 1. Production cost columns
ALTER TABLE public.production_entries
  ADD COLUMN IF NOT EXISTS mati_material_id uuid REFERENCES public.raw_materials(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS coal_material_id uuid REFERENCES public.raw_materials(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS mati_cost numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS coal_cost numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_cost numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cost_per_brick numeric NOT NULL DEFAULT 0;

-- 2. Raw material usage (auto-generated from production entries)
CREATE TABLE IF NOT EXISTS public.raw_material_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  production_entry_id uuid REFERENCES public.production_entries(id) ON DELETE CASCADE,
  material_id uuid NOT NULL REFERENCES public.raw_materials(id) ON DELETE RESTRICT,
  usage_date date NOT NULL DEFAULT CURRENT_DATE,
  quantity numeric NOT NULL,
  unit_cost numeric NOT NULL DEFAULT 0,
  amount numeric NOT NULL DEFAULT 0,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_rmu_entry_material ON public.raw_material_usage (production_entry_id, material_id);
CREATE INDEX IF NOT EXISTS idx_rmu_material_date ON public.raw_material_usage (material_id, usage_date);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.raw_material_usage TO authenticated;
GRANT ALL ON public.raw_material_usage TO service_role;
ALTER TABLE public.raw_material_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY rmu_select ON public.raw_material_usage FOR SELECT TO authenticated USING (private.has_any_role(auth.uid()));
CREATE POLICY rmu_admin_write ON public.raw_material_usage FOR ALL TO authenticated USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));
CREATE TRIGGER trg_rmu_updated BEFORE UPDATE ON public.raw_material_usage FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Weighted average purchase price of a material
CREATE OR REPLACE FUNCTION public.material_avg_cost(_material_id uuid)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN COALESCE(SUM(quantity),0) > 0
              THEN SUM(total_amount) / SUM(quantity)
              ELSE 0 END
  FROM public.raw_material_purchases WHERE material_id = _material_id;
$$;
REVOKE ALL ON FUNCTION public.material_avg_cost(uuid) FROM PUBLIC, anon, authenticated;

-- 4. Production entry: cost + usage automation
CREATE OR REPLACE FUNCTION public.production_autocost()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_mati_unit numeric := 0; v_coal_unit numeric := 0;
BEGIN
  IF NEW.mati_material_id IS NOT NULL AND COALESCE(NEW.mati_used,0) > 0 THEN
    v_mati_unit := COALESCE(public.material_avg_cost(NEW.mati_material_id), 0);
    NEW.mati_cost := ROUND(NEW.mati_used * v_mati_unit, 2);
  ELSE
    NEW.mati_cost := COALESCE(NEW.mati_cost, 0);
  END IF;
  IF NEW.coal_material_id IS NOT NULL AND COALESCE(NEW.coal_used,0) > 0 THEN
    v_coal_unit := COALESCE(public.material_avg_cost(NEW.coal_material_id), 0);
    NEW.coal_cost := ROUND(NEW.coal_used * v_coal_unit, 2);
  ELSE
    NEW.coal_cost := COALESCE(NEW.coal_cost, 0);
  END IF;
  NEW.total_cost := COALESCE(NEW.mati_cost,0) + COALESCE(NEW.coal_cost,0) + COALESCE(NEW.labor_cost,0) + COALESCE(NEW.other_cost,0);
  NEW.cost_per_brick := CASE WHEN COALESCE(NEW.quantity,0) > 0 THEN ROUND(NEW.total_cost / NEW.quantity, 4) ELSE 0 END;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_production_autocost ON public.production_entries;
CREATE TRIGGER trg_production_autocost BEFORE INSERT OR UPDATE ON public.production_entries
FOR EACH ROW EXECUTE FUNCTION public.production_autocost();

CREATE OR REPLACE FUNCTION public.sync_production_material_usage()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.raw_material_usage WHERE production_entry_id = OLD.id;
    RETURN OLD;
  END IF;
  DELETE FROM public.raw_material_usage WHERE production_entry_id = NEW.id;
  IF NEW.mati_material_id IS NOT NULL AND COALESCE(NEW.mati_used,0) > 0 THEN
    INSERT INTO public.raw_material_usage(production_entry_id, material_id, usage_date, quantity, unit_cost, amount, note)
    VALUES (NEW.id, NEW.mati_material_id, NEW.production_date, NEW.mati_used,
            CASE WHEN NEW.mati_used > 0 THEN NEW.mati_cost / NEW.mati_used ELSE 0 END, NEW.mati_cost, 'উৎপাদনে ব্যবহৃত');
  END IF;
  IF NEW.coal_material_id IS NOT NULL AND COALESCE(NEW.coal_used,0) > 0 THEN
    INSERT INTO public.raw_material_usage(production_entry_id, material_id, usage_date, quantity, unit_cost, amount, note)
    VALUES (NEW.id, NEW.coal_material_id, NEW.production_date, NEW.coal_used,
            CASE WHEN NEW.coal_used > 0 THEN NEW.coal_cost / NEW.coal_used ELSE 0 END, NEW.coal_cost, 'উৎপাদনে ব্যবহৃত');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_production_material_usage ON public.production_entries;
CREATE TRIGGER trg_production_material_usage AFTER INSERT OR UPDATE OR DELETE ON public.production_entries
FOR EACH ROW EXECUTE FUNCTION public.sync_production_material_usage();

-- 5. Raw material stock = purchased - used
CREATE OR REPLACE VIEW public.raw_material_stock
WITH (security_invoker = true) AS
SELECT m.id AS material_id, m.name, m.unit, m.low_stock_threshold,
       COALESCE(p.qty, 0) AS purchased_qty,
       COALESCE(p.amount, 0) AS purchased_amount,
       COALESCE(u.qty, 0) AS used_qty,
       COALESCE(p.qty, 0) - COALESCE(u.qty, 0) AS in_stock,
       CASE WHEN COALESCE(p.qty,0) > 0 THEN COALESCE(p.amount,0) / p.qty ELSE 0 END AS avg_unit_cost
FROM public.raw_materials m
LEFT JOIN (SELECT material_id, SUM(quantity) qty, SUM(total_amount) amount FROM public.raw_material_purchases GROUP BY material_id) p ON p.material_id = m.id
LEFT JOIN (SELECT material_id, SUM(quantity) qty FROM public.raw_material_usage GROUP BY material_id) u ON u.material_id = m.id;
GRANT SELECT ON public.raw_material_stock TO authenticated;
GRANT ALL ON public.raw_material_stock TO service_role;

-- 6. Backfill costs on existing production rows
UPDATE public.production_entries SET updated_at = updated_at;
