-- =========================================================
-- Settle a supplier's due (e.g. vehicle hire) by giving bricks.
--
-- One call does everything in one transaction:
--   1. an approved sales challan to the receiving customer (stock goes down,
--      sale is counted as revenue),
--   2. a matching collection from that customer, method 'ইট দিয়ে সমন্বয়'
--      (customer balance stays 0),
--   3. a supplier payment, method 'bricks' (supplier due goes down).
-- Cash in (2) and cash out (3) are equal, so hand cash does not change,
-- but both the brick sale and the full expense show in the books.
-- Admin only. Safe to run more than once.
-- =========================================================

ALTER TABLE public.supplier_payments
  ADD COLUMN IF NOT EXISTS method text NOT NULL DEFAULT 'cash',
  ADD COLUMN IF NOT EXISTS sales_entry_id uuid REFERENCES public.sales_entries(id) ON DELETE CASCADE;

ALTER TABLE public.collections
  ADD COLUMN IF NOT EXISTS sales_entry_id uuid REFERENCES public.sales_entries(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_supplier_payments_sales_entry ON public.supplier_payments(sales_entry_id);
CREATE INDEX IF NOT EXISTS idx_collections_sales_entry ON public.collections(sales_entry_id);

CREATE OR REPLACE FUNCTION public.settle_supplier_with_bricks(
  _supplier_id uuid,
  _customer_id uuid,
  _brick_type_id uuid,
  _quantity integer,
  _unit_price numeric,
  _date date DEFAULT CURRENT_DATE,
  _note text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_supplier text;
  v_brick text;
  v_stock numeric;
  v_total numeric;
  v_sale uuid;
  v_challan text;
  v_date date := COALESCE(_date, CURRENT_DATE);
BEGIN
  IF v_uid IS NULL OR NOT private.is_admin(v_uid) THEN
    RAISE EXCEPTION 'শুধু অ্যাডমিন ইট দিয়ে বাকি শোধ করতে পারেন';
  END IF;
  IF _quantity IS NULL OR _quantity <= 0 THEN
    RAISE EXCEPTION 'ইটের পরিমাণ দিন';
  END IF;
  IF _unit_price IS NULL OR _unit_price <= 0 THEN
    RAISE EXCEPTION 'ইটের দর দিন';
  END IF;

  SELECT name INTO v_supplier FROM public.suppliers WHERE id = _supplier_id;
  IF v_supplier IS NULL THEN
    RAISE EXCEPTION 'বিক্রেতা পাওয়া যায়নি';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.customers WHERE id = _customer_id) THEN
    RAISE EXCEPTION 'গ্রাহক পাওয়া যায়নি';
  END IF;

  SELECT name INTO v_brick FROM public.brick_types WHERE id = _brick_type_id;
  IF v_brick IS NULL THEN
    RAISE EXCEPTION 'ইটের ধরন পাওয়া যায়নি';
  END IF;
  SELECT quantity INTO v_stock FROM public.current_stock WHERE brick_type_id = _brick_type_id;
  IF COALESCE(v_stock, 0) < _quantity THEN
    RAISE EXCEPTION 'স্টকে যথেষ্ট % নেই (আছে % পিস)', v_brick, COALESCE(v_stock, 0);
  END IF;

  v_total := round(_quantity * _unit_price, 2);

  INSERT INTO public.sales_entries (
    challan_no, customer_id, brick_type_id, quantity, unit_price, total_amount,
    sale_type, status, sale_date, notes, created_by, approved_by, approved_at
  ) VALUES (
    '', _customer_id, _brick_type_id, _quantity, _unit_price, v_total,
    'regular', 'approved', v_date,
    concat_ws(' · ', v_supplier || '-এর বাকির বদলে ইট', NULLIF(trim(COALESCE(_note, '')), '')),
    v_uid, v_uid, now()
  )
  RETURNING id, challan_no INTO v_sale, v_challan;

  INSERT INTO public.collections (customer_id, amount, payment_date, method, note, created_by, sales_entry_id)
  VALUES (_customer_id, v_total, v_date, 'ইট দিয়ে সমন্বয়', 'চালান ' || v_challan || ' — ' || v_supplier || '-এর বাকির বদলে', v_uid, v_sale);

  INSERT INTO public.supplier_payments (supplier_id, amount, payment_date, note, created_by, method, sales_entry_id)
  VALUES (_supplier_id, v_total, v_date, 'ইট দিয়ে শোধ — চালান ' || v_challan || ' (' || v_brick || ' ' || _quantity || ' পিস)', v_uid, 'bricks', v_sale);

  RETURN v_sale;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.settle_supplier_with_bricks(uuid, uuid, uuid, integer, numeric, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.settle_supplier_with_bricks(uuid, uuid, uuid, integer, numeric, date, text) TO authenticated;

SELECT 'ইট দিয়ে বাকি শোধের ব্যবস্থা তৈরি' AS ফলাফল;
