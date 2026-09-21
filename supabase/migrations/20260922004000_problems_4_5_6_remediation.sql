-- Migration: 20260922004000_problems_4_5_6_remediation.sql
-- Description: Complete remediation for Problems #4 (Orders/Deliveries), #5 (Challan race condition), and #6 (Accounting posting)

-- ============================================================================
-- PROBLEM #5: ATOMIC DATABASE-SIDE CHALLAN NUMBER GENERATION
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.challan_counters (
  prefix text PRIMARY KEY,
  last_value integer NOT NULL DEFAULT 0
);

GRANT SELECT, INSERT, UPDATE ON public.challan_counters TO authenticated;
GRANT ALL ON public.challan_counters TO service_role;
ALTER TABLE public.challan_counters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS challan_counters_auth ON public.challan_counters;
CREATE POLICY challan_counters_auth ON public.challan_counters
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.next_challan_number(
  _date date DEFAULT CURRENT_DATE,
  _prefix text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prefix text;
  v_val int;
  v_date text;
  v_seed int;
BEGIN
  IF _prefix IS NOT NULL AND trim(_prefix) <> '' THEN
    v_prefix := trim(_prefix);
  ELSE
    v_date := to_char(COALESCE(_date, CURRENT_DATE), 'YYYYMMDD');
    v_prefix := 'CDB-' || v_date || '-';
  END IF;

  -- Calculate initial seed from any pre-existing sales_entries matching this prefix
  SELECT COALESCE(MAX((substring(challan_no from '[0-9]+$'))::integer), 0)
  INTO v_seed
  FROM public.sales_entries
  WHERE challan_no LIKE v_prefix || '%';

  -- Atomically insert or increment with row-level lock
  INSERT INTO public.challan_counters (prefix, last_value)
  VALUES (v_prefix, GREATEST(COALESCE(v_seed, 0), 0) + 1)
  ON CONFLICT (prefix)
  DO UPDATE SET last_value = GREATEST(public.challan_counters.last_value, COALESCE(v_seed, 0)) + 1
  RETURNING last_value INTO v_val;

  RETURN v_prefix || lpad(v_val::text, 3, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION public.next_challan_number(date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.next_challan_number(date, text) TO service_role;

CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_entries_challan_no ON public.sales_entries(challan_no);

CREATE OR REPLACE FUNCTION public.assign_sales_entry_challan_no()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.challan_no IS NULL OR trim(NEW.challan_no) = '' THEN
    NEW.challan_no := public.next_challan_number(COALESCE(NEW.sale_date, CURRENT_DATE));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_challan_no ON public.sales_entries;
CREATE TRIGGER trg_assign_challan_no
BEFORE INSERT ON public.sales_entries
FOR EACH ROW EXECUTE FUNCTION public.assign_sales_entry_challan_no();

-- ============================================================================
-- PROBLEM #4: ORDERS/DELIVERIES CONNECTED TO SALES/CHALLANS WORKFLOW
-- ============================================================================

ALTER TABLE public.deliveries ADD COLUMN IF NOT EXISTS sales_entry_id uuid REFERENCES public.sales_entries(id) ON DELETE SET NULL;
ALTER TABLE public.sales_entries ADD COLUMN IF NOT EXISTS order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL;
ALTER TABLE public.sales_entries ADD COLUMN IF NOT EXISTS vehicle_id uuid REFERENCES public.vehicles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_deliveries_sales_entry ON public.deliveries(sales_entry_id);
CREATE INDEX IF NOT EXISTS idx_sales_entries_order ON public.sales_entries(order_id);
CREATE INDEX IF NOT EXISTS idx_sales_entries_vehicle ON public.sales_entries(vehicle_id);

CREATE OR REPLACE FUNCTION public.sync_delivery_to_sales()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order record;
  v_brick_type_id uuid;
  v_rate numeric;
  v_sales_id uuid;
  v_challan text;
  v_qty integer;
  v_vehicle_no text;
BEGIN
  -- Handle DELETE: reverse sales entry, which automatically cascades to stock and accounting
  IF TG_OP = 'DELETE' THEN
    IF OLD.sales_entry_id IS NOT NULL THEN
      DELETE FROM public.sales_entries WHERE id = OLD.sales_entry_id;
    END IF;
    RETURN OLD;
  END IF;

  v_qty := round(COALESCE(NEW.quantity, 0))::integer;

  -- Handle INSERT: create linked sales entry with approved status
  IF TG_OP = 'INSERT' THEN
    IF NEW.order_id IS NOT NULL AND v_qty > 0 THEN
      SELECT * INTO v_order FROM public.orders WHERE id = NEW.order_id;
      v_brick_type_id := COALESCE(v_order.brick_type_id, (SELECT id FROM public.brick_types WHERE is_active = true ORDER BY created_at LIMIT 1));
      v_rate := COALESCE(v_order.rate, 0);

      IF v_brick_type_id IS NOT NULL THEN
        v_challan := public.next_challan_number(NEW.delivery_date);
        IF NEW.vehicle_id IS NOT NULL THEN
          SELECT vehicle_no INTO v_vehicle_no FROM public.vehicles WHERE id = NEW.vehicle_id;
        END IF;
        
        INSERT INTO public.sales_entries (
          challan_no,
          customer_id,
          brick_type_id,
          quantity,
          unit_price,
          total_amount,
          sale_type,
          status,
          sale_date,
          vehicle_id,
          vehicle_number,
          driver_name,
          notes,
          created_by,
          order_id
        ) VALUES (
          v_challan,
          COALESCE(NEW.customer_id, v_order.customer_id),
          v_brick_type_id,
          v_qty,
          v_rate,
          v_qty * v_rate,
          'regular',
          'approved',
          NEW.delivery_date,
          NEW.vehicle_id,
          v_vehicle_no,
          NEW.driver_name,
          COALESCE(NEW.note, '') || CASE WHEN v_order.order_no IS NOT NULL THEN ' (অর্ডার নং: ' || v_order.order_no || ')' ELSE '' END,
          COALESCE(NEW.created_by, auth.uid(), v_order.created_by),
          NEW.order_id
        ) RETURNING id INTO v_sales_id;

        NEW.sales_entry_id := v_sales_id;
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  -- Handle UPDATE: update linked sales entry
  IF TG_OP = 'UPDATE' THEN
    IF NEW.vehicle_id IS NOT NULL THEN
      SELECT vehicle_no INTO v_vehicle_no FROM public.vehicles WHERE id = NEW.vehicle_id;
    ELSE
      v_vehicle_no := NULL;
    END IF;

    IF NEW.sales_entry_id IS NOT NULL THEN
      SELECT * INTO v_order FROM public.orders WHERE id = NEW.order_id;
      v_rate := COALESCE(v_order.rate, 0);
      
      IF v_qty > 0 THEN
        UPDATE public.sales_entries SET
          quantity = v_qty,
          unit_price = v_rate,
          total_amount = v_qty * v_rate,
          sale_date = NEW.delivery_date,
          vehicle_id = NEW.vehicle_id,
          vehicle_number = v_vehicle_no,
          driver_name = NEW.driver_name,
          customer_id = COALESCE(NEW.customer_id, v_order.customer_id),
          notes = COALESCE(NEW.note, '') || CASE WHEN v_order.order_no IS NOT NULL THEN ' (অর্ডার নং: ' || v_order.order_no || ')' ELSE '' END
        WHERE id = NEW.sales_entry_id;
      END IF;
    ELSIF NEW.order_id IS NOT NULL AND v_qty > 0 THEN
      SELECT * INTO v_order FROM public.orders WHERE id = NEW.order_id;
      v_brick_type_id := COALESCE(v_order.brick_type_id, (SELECT id FROM public.brick_types WHERE is_active = true ORDER BY created_at LIMIT 1));
      v_rate := COALESCE(v_order.rate, 0);

      IF v_brick_type_id IS NOT NULL THEN
        v_challan := public.next_challan_number(NEW.delivery_date);
        
        INSERT INTO public.sales_entries (
          challan_no,
          customer_id,
          brick_type_id,
          quantity,
          unit_price,
          total_amount,
          sale_type,
          status,
          sale_date,
          vehicle_id,
          vehicle_number,
          driver_name,
          notes,
          created_by,
          order_id
        ) VALUES (
          v_challan,
          COALESCE(NEW.customer_id, v_order.customer_id),
          v_brick_type_id,
          v_qty,
          v_rate,
          v_qty * v_rate,
          'regular',
          'approved',
          NEW.delivery_date,
          NEW.vehicle_id,
          v_vehicle_no,
          NEW.driver_name,
          COALESCE(NEW.note, '') || CASE WHEN v_order.order_no IS NOT NULL THEN ' (অর্ডার নং: ' || v_order.order_no || ')' ELSE '' END,
          COALESCE(NEW.created_by, auth.uid(), v_order.created_by),
          NEW.order_id
        ) RETURNING id INTO v_sales_id;

        NEW.sales_entry_id := v_sales_id;
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_delivery_to_sales ON public.deliveries;
CREATE TRIGGER trg_sync_delivery_to_sales
BEFORE INSERT OR UPDATE OR DELETE ON public.deliveries
FOR EACH ROW EXECUTE FUNCTION public.sync_delivery_to_sales();

-- ============================================================================
-- PROBLEM #6: COMPLETE & BALANCED DOUBLE-ENTRY ACCOUNTING POSTING
-- ============================================================================

-- 1. Raw Material Purchase Auto-Post
CREATE OR REPLACE FUNCTION public.post_raw_material_journal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry_id uuid;
  v_credit uuid;
BEGIN
  DELETE FROM public.journal_entries
  WHERE source = 'raw_material' AND ref_type = 'raw_material_purchase' AND ref_id = COALESCE(NEW.id, OLD.id);

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  IF COALESCE(NEW.total_amount, 0) = 0 THEN RETURN NEW; END IF;

  v_credit := CASE
    WHEN lower(COALESCE(NEW.payment_method, 'cash')) = 'credit' THEN public.acc('2000')
    ELSE public.acc_for_method(NEW.payment_method)
  END;

  INSERT INTO public.journal_entries(entry_date, source, ref_type, ref_id, narration, created_by)
  VALUES (NEW.purchase_date, 'raw_material', 'raw_material_purchase', NEW.id, 'কাঁচামাল ক্রয়', NEW.created_by)
  RETURNING id INTO v_entry_id;

  INSERT INTO public.journal_lines(entry_id, account_id, debit, credit, note) VALUES
    (v_entry_id, public.acc('1200'), NEW.total_amount, 0, 'Raw Material Inventory'),
    (v_entry_id, v_credit, 0, NEW.total_amount, COALESCE(NEW.payment_method, 'cash'));

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_rmp_journal ON public.raw_material_purchases;
CREATE TRIGGER trg_rmp_journal AFTER INSERT OR UPDATE OR DELETE ON public.raw_material_purchases
FOR EACH ROW EXECUTE FUNCTION public.post_raw_material_journal();

-- 2. Worker Payment Auto-Post
CREATE OR REPLACE FUNCTION public.post_worker_payment_journal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry_id uuid;
  v_credit uuid;
BEGIN
  DELETE FROM public.journal_entries
  WHERE source = 'labor' AND ref_type = 'worker_payment' AND ref_id = COALESCE(NEW.id, OLD.id);

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  IF COALESCE(NEW.amount, 0) = 0 THEN RETURN NEW; END IF;

  v_credit := public.acc('1000');

  INSERT INTO public.journal_entries(entry_date, source, ref_type, ref_id, narration, created_by)
  VALUES (NEW.payment_date, 'labor', 'worker_payment', NEW.id, 'শ্রমিক মজুরি/পেমেন্ট', NEW.created_by)
  RETURNING id INTO v_entry_id;

  INSERT INTO public.journal_lines(entry_id, account_id, debit, credit, note) VALUES
    (v_entry_id, public.acc('6100'), NEW.amount, 0, COALESCE(NEW.payment_type, 'wage')),
    (v_entry_id, v_credit, 0, NEW.amount, 'Cash/Labor');

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_wp_journal ON public.worker_payments;
CREATE TRIGGER trg_wp_journal AFTER INSERT OR UPDATE OR DELETE ON public.worker_payments
FOR EACH ROW EXECUTE FUNCTION public.post_worker_payment_journal();

-- 3. Vehicle Expense Auto-Post
CREATE OR REPLACE FUNCTION public.post_vehicle_expense_journal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry_id uuid;
BEGIN
  DELETE FROM public.journal_entries
  WHERE source = 'vehicle' AND ref_type = 'vehicle_expense' AND ref_id = COALESCE(NEW.id, OLD.id);

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  IF COALESCE(NEW.amount, 0) = 0 THEN RETURN NEW; END IF;

  INSERT INTO public.journal_entries(entry_date, source, ref_type, ref_id, narration, created_by)
  VALUES (NEW.expense_date, 'vehicle', 'vehicle_expense', NEW.id, 'গাড়ি খরচ', NEW.created_by)
  RETURNING id INTO v_entry_id;

  INSERT INTO public.journal_lines(entry_id, account_id, debit, credit, note) VALUES
    (v_entry_id, public.acc('6200'), NEW.amount, 0, COALESCE(NEW.category, 'গাড়ি খরচ')),
    (v_entry_id, public.acc('1000'), 0, NEW.amount, 'Cash');

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ve_journal ON public.vehicle_expenses;
CREATE TRIGGER trg_ve_journal AFTER INSERT OR UPDATE OR DELETE ON public.vehicle_expenses
FOR EACH ROW EXECUTE FUNCTION public.post_vehicle_expense_journal();

-- 4. Supplier Payment Auto-Post
CREATE OR REPLACE FUNCTION public.post_supplier_payment_journal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry_id uuid;
BEGIN
  DELETE FROM public.journal_entries
  WHERE source = 'supplier' AND ref_type = 'supplier_payment' AND ref_id = COALESCE(NEW.id, OLD.id);

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  IF COALESCE(NEW.amount, 0) = 0 THEN RETURN NEW; END IF;

  INSERT INTO public.journal_entries(entry_date, source, ref_type, ref_id, narration, created_by)
  VALUES (NEW.payment_date, 'supplier', 'supplier_payment', NEW.id, 'সরবরাহকারী পেমেন্ট', NEW.created_by)
  RETURNING id INTO v_entry_id;

  INSERT INTO public.journal_lines(entry_id, account_id, debit, credit, note) VALUES
    (v_entry_id, public.acc('2000'), NEW.amount, 0, 'AP (Supplier Payment)'),
    (v_entry_id, public.acc('1000'), 0, NEW.amount, 'Cash');

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_supplier_payment_journal ON public.supplier_payments;
CREATE TRIGGER trg_supplier_payment_journal AFTER INSERT OR UPDATE OR DELETE ON public.supplier_payments
FOR EACH ROW EXECUTE FUNCTION public.post_supplier_payment_journal();

-- 5. Contract Payment Auto-Post
CREATE OR REPLACE FUNCTION public.post_contract_payment_journal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry_id uuid;
  v_contract record;
BEGIN
  DELETE FROM public.journal_entries
  WHERE source = 'collection' AND ref_type = 'contract_payment' AND ref_id = COALESCE(NEW.id, OLD.id);

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  IF COALESCE(NEW.amount, 0) = 0 THEN RETURN NEW; END IF;

  SELECT * INTO v_contract FROM public.contracts WHERE id = NEW.contract_id;

  INSERT INTO public.journal_entries(entry_date, source, ref_type, ref_id, narration, created_by)
  VALUES (NEW.payment_date, 'collection', 'contract_payment', NEW.id, 'চুক্তি অগ্রিম/পেমেন্ট', NEW.created_by)
  RETURNING id INTO v_entry_id;

  INSERT INTO public.journal_lines(entry_id, account_id, debit, credit, customer_id, note) VALUES
    (v_entry_id, public.acc_for_method(NEW.method), NEW.amount, 0, v_contract.customer_id, COALESCE(NEW.method, 'cash')),
    (v_entry_id, public.acc('1100'), 0, NEW.amount, v_contract.customer_id, 'Contract AR');

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_contract_payment_journal ON public.contract_payments;
CREATE TRIGGER trg_contract_payment_journal AFTER INSERT OR UPDATE OR DELETE ON public.contract_payments
FOR EACH ROW EXECUTE FUNCTION public.post_contract_payment_journal();

-- 6. Opening Payment Auto-Post
CREATE OR REPLACE FUNCTION public.post_opening_payment_journal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry_id uuid;
  v_ob record;
  v_debit uuid;
  v_credit uuid;
BEGIN
  DELETE FROM public.journal_entries
  WHERE source = 'opening' AND ref_type = 'opening_payment' AND ref_id = COALESCE(NEW.id, OLD.id);

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  IF COALESCE(NEW.amount, 0) = 0 THEN RETURN NEW; END IF;

  SELECT * INTO v_ob FROM public.opening_balances WHERE id = NEW.opening_balance_id;

  IF v_ob.kind = 'customer_brick_due' THEN
    v_debit := public.acc_for_method(NEW.method);
    v_credit := public.acc('1100');
  ELSIF v_ob.kind = 'sardar_payable' THEN
    v_debit := public.acc('2200');
    v_credit := public.acc_for_method(NEW.method);
  ELSIF v_ob.kind = 'other_payable' THEN
    v_debit := public.acc('2000');
    v_credit := public.acc_for_method(NEW.method);
  ELSE
    v_debit := public.acc_for_method(NEW.method);
    v_credit := public.acc('1100');
  END IF;

  INSERT INTO public.journal_entries(entry_date, source, ref_type, ref_id, narration, created_by)
  VALUES (NEW.payment_date, 'opening', 'opening_payment', NEW.id, 'পূর্বের বকেয়া/অগ্রিম সমন্বয়', NEW.created_by)
  RETURNING id INTO v_entry_id;

  INSERT INTO public.journal_lines(entry_id, account_id, debit, credit, customer_id, note) VALUES
    (v_entry_id, v_debit, NEW.amount, 0, v_ob.customer_id, COALESCE(NEW.note, NEW.method)),
    (v_entry_id, v_credit, 0, NEW.amount, v_ob.customer_id, COALESCE(NEW.note, NEW.method));

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_opening_payment_journal ON public.opening_payments;
CREATE TRIGGER trg_opening_payment_journal AFTER INSERT OR UPDATE OR DELETE ON public.opening_payments
FOR EACH ROW EXECUTE FUNCTION public.post_opening_payment_journal();
