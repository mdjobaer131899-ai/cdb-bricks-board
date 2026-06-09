
-- 1. Add truck_quantity as a generated column (bricks / 2000)
ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS truck_quantity numeric
    GENERATED ALWAYS AS (booked_quantity / 2000.0) STORED;

-- 2. Trigger: auto-compute booked_value = booked_quantity * fixed_rate
CREATE OR REPLACE FUNCTION public.contract_autocalc()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.fixed_rate IS NOT NULL AND NEW.booked_quantity IS NOT NULL THEN
    NEW.booked_value := NEW.booked_quantity * NEW.fixed_rate;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_contract_autocalc ON public.contracts;
CREATE TRIGGER trg_contract_autocalc
  BEFORE INSERT OR UPDATE ON public.contracts
  FOR EACH ROW EXECUTE FUNCTION public.contract_autocalc();

-- 3. Admin auto-approve sales entries
CREATE OR REPLACE FUNCTION public.sales_admin_auto_approve()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'pending' THEN
    IF private.is_admin(NEW.created_by) THEN
      NEW.status := 'approved';
      NEW.approved_by := NEW.created_by;
      NEW.approved_at := now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sales_admin_auto_approve ON public.sales_entries;
CREATE TRIGGER trg_sales_admin_auto_approve
  BEFORE INSERT ON public.sales_entries
  FOR EACH ROW EXECUTE FUNCTION public.sales_admin_auto_approve();

-- 4. Real-time contract summary view
DROP VIEW IF EXISTS public.contract_summary;
CREATE VIEW public.contract_summary
WITH (security_invoker=on) AS
SELECT
  c.id,
  c.contract_no,
  c.customer_id,
  c.contract_type,
  c.status,
  c.start_date,
  c.fixed_rate,
  c.booked_quantity,
  c.truck_quantity,
  c.booked_value,
  COALESCE(c.delivered_quantity, 0) AS delivered_quantity,
  (COALESCE(c.delivered_quantity,0) / 2000.0) AS delivered_trucks,
  GREATEST(0, c.booked_quantity - COALESCE(c.delivered_quantity,0)) AS remaining_quantity,
  GREATEST(0, (c.booked_quantity - COALESCE(c.delivered_quantity,0)) / 2000.0) AS remaining_trucks,
  COALESCE((
    SELECT SUM(se.total_amount) FROM public.sales_entries se
    WHERE se.contract_id = c.id AND se.status = 'approved' AND se.sale_type <> 'advance'
  ), 0) AS delivered_value,
  COALESCE((
    SELECT SUM(p.amount) FROM public.contract_payments p WHERE p.contract_id = c.id
  ), 0) + COALESCE((
    SELECT SUM(cl.amount) FROM public.collections cl WHERE cl.contract_id = c.id
  ), 0) AS collected_amount,
  GREATEST(0,
    COALESCE((SELECT SUM(se.total_amount) FROM public.sales_entries se WHERE se.contract_id = c.id AND se.status = 'approved' AND se.sale_type <> 'advance'), 0)
    - (
      COALESCE((SELECT SUM(p.amount) FROM public.contract_payments p WHERE p.contract_id = c.id), 0)
      + COALESCE((SELECT SUM(cl.amount) FROM public.collections cl WHERE cl.contract_id = c.id), 0)
    )
  ) AS due_amount
FROM public.contracts c;

GRANT SELECT ON public.contract_summary TO authenticated;
GRANT ALL ON public.contract_summary TO service_role;
