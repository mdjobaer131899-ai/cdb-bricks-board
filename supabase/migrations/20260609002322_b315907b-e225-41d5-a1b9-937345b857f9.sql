
-- 1. Add new columns
ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS delivered_quantity numeric(14,2) NOT NULL DEFAULT 0;

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS advance_balance numeric(14,2) NOT NULL DEFAULT 0;

-- 2. Function: recompute delivered_quantity for a contract
CREATE OR REPLACE FUNCTION public.recompute_contract_delivered(_contract_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _contract_id IS NULL THEN RETURN; END IF;
  UPDATE public.contracts
  SET delivered_quantity = COALESCE((
    SELECT SUM(quantity)::numeric
    FROM public.sales_entries
    WHERE contract_id = _contract_id
      AND status = 'approved'
      AND sale_type <> 'advance'
  ), 0)
  WHERE id = _contract_id;
END;
$$;

-- 3. Function: recompute advance_balance for a customer
-- Advance pool = (collections without contract_id) - (approved cash/regular sales without contract_id and not sale_type='advance')
CREATE OR REPLACE FUNCTION public.recompute_customer_advance(_customer_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_credits numeric := 0;
  v_debits  numeric := 0;
BEGIN
  IF _customer_id IS NULL THEN RETURN; END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_credits
  FROM public.collections
  WHERE customer_id = _customer_id AND contract_id IS NULL;

  SELECT COALESCE(SUM(total_amount), 0) INTO v_debits
  FROM public.sales_entries
  WHERE customer_id = _customer_id
    AND contract_id IS NULL
    AND status = 'approved'
    AND sale_type <> 'advance';

  UPDATE public.customers
  SET advance_balance = GREATEST(v_credits - v_debits, 0)
  WHERE id = _customer_id;
END;
$$;

-- 4. Trigger function for sales_entries → contracts + customer advance
CREATE OR REPLACE FUNCTION public.trg_sales_entry_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recompute_contract_delivered(OLD.contract_id);
    PERFORM public.recompute_customer_advance(OLD.customer_id);
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.contract_id IS DISTINCT FROM NEW.contract_id THEN
    PERFORM public.recompute_contract_delivered(OLD.contract_id);
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.customer_id IS DISTINCT FROM NEW.customer_id THEN
    PERFORM public.recompute_customer_advance(OLD.customer_id);
  END IF;

  PERFORM public.recompute_contract_delivered(NEW.contract_id);
  PERFORM public.recompute_customer_advance(NEW.customer_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sales_entries_sync_aggregates ON public.sales_entries;
CREATE TRIGGER sales_entries_sync_aggregates
AFTER INSERT OR UPDATE OR DELETE ON public.sales_entries
FOR EACH ROW EXECUTE FUNCTION public.trg_sales_entry_sync();

-- 5. Trigger function for collections → customer advance
CREATE OR REPLACE FUNCTION public.trg_collection_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recompute_customer_advance(OLD.customer_id);
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.customer_id IS DISTINCT FROM NEW.customer_id THEN
    PERFORM public.recompute_customer_advance(OLD.customer_id);
  END IF;
  PERFORM public.recompute_customer_advance(NEW.customer_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS collections_sync_advance ON public.collections;
CREATE TRIGGER collections_sync_advance
AFTER INSERT OR UPDATE OR DELETE ON public.collections
FOR EACH ROW EXECUTE FUNCTION public.trg_collection_sync();

-- 6. Lock down functions
REVOKE EXECUTE ON FUNCTION public.recompute_contract_delivered(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recompute_customer_advance(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_sales_entry_sync() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_collection_sync() FROM PUBLIC, anon, authenticated;

-- 7. Backfill existing data
UPDATE public.contracts c
SET delivered_quantity = COALESCE(s.qty, 0)
FROM (
  SELECT contract_id, SUM(quantity)::numeric AS qty
  FROM public.sales_entries
  WHERE contract_id IS NOT NULL AND status = 'approved' AND sale_type <> 'advance'
  GROUP BY contract_id
) s
WHERE c.id = s.contract_id;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.customers LOOP
    PERFORM public.recompute_customer_advance(r.id);
  END LOOP;
END $$;
