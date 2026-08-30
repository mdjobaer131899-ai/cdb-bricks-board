-- 1. journal_source: add missing values used by triggers
ALTER TYPE public.journal_source ADD VALUE IF NOT EXISTS 'raw_material';
ALTER TYPE public.journal_source ADD VALUE IF NOT EXISTS 'labor';
ALTER TYPE public.journal_source ADD VALUE IF NOT EXISTS 'vehicle';
ALTER TYPE public.journal_source ADD VALUE IF NOT EXISTS 'sardar';
ALTER TYPE public.journal_source ADD VALUE IF NOT EXISTS 'bank';
ALTER TYPE public.journal_source ADD VALUE IF NOT EXISTS 'transfer';
ALTER TYPE public.journal_source ADD VALUE IF NOT EXISTS 'supplier';
ALTER TYPE public.journal_source ADD VALUE IF NOT EXISTS 'production';

-- 2. Chart of accounts additions
INSERT INTO public.accounts (code, name, name_bn, account_type, is_active) VALUES
  ('1020', 'Mobile Banking', 'মোবাইল ব্যাংকিং (বিকাশ/নগদ)', 'asset', true),
  ('2200', 'Sardar Payable', 'সরদার পাওনা', 'liability', true),
  ('6110', 'Kacha Brick Labor', 'কাঁচা ইট মজুরি', 'expense', true),
  ('6120', 'Firing Labor', 'পোড়ানো মজুরি', 'expense', true),
  ('6130', 'Loading/Unloading', 'লোডিং/আনলোডিং', 'expense', true),
  ('6300', 'Soil (Mati)', 'মাটি', 'expense', true),
  ('6400', 'Coal/Fuel', 'কয়লা/জ্বালানি', 'expense', true),
  ('6500', 'Transport', 'পরিবহন', 'expense', true)
ON CONFLICT (code) DO NOTHING;

-- 3. Cash/bank/mobile account resolver by payment method
CREATE OR REPLACE FUNCTION public.acc_for_method(_method text)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN lower(coalesce(_method,'cash')) IN ('bkash','bikash','nagad','rocket','mobile','বিকাশ','নগদ') THEN public.acc('1020')
    WHEN lower(coalesce(_method,'cash')) IN ('bank','transfer','cheque','check','ব্যাংক','চেক') THEN public.acc('1010')
    ELSE public.acc('1000')
  END;
$$;

-- 4. Collection journal: money in (by method) vs customer receivable. Single AR account,
--    so an over-payment simply shows a negative receivable (= advance). No double counting.
CREATE OR REPLACE FUNCTION public.post_collection_journal()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_entry_id uuid;
BEGIN
  DELETE FROM public.journal_entries WHERE source='collection' AND ref_type='collection' AND ref_id = COALESCE(NEW.id, OLD.id);
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  IF COALESCE(NEW.amount,0)=0 THEN RETURN NEW; END IF;
  INSERT INTO public.journal_entries(entry_date, source, ref_type, ref_id, narration, created_by)
  VALUES (NEW.payment_date,'collection','collection',NEW.id,'কালেকশন',NEW.created_by)
  RETURNING id INTO v_entry_id;
  INSERT INTO public.journal_lines(entry_id,account_id,debit,credit,customer_id,note) VALUES
    (v_entry_id, public.acc_for_method(NEW.method), NEW.amount, 0, NEW.customer_id, COALESCE(NEW.method,'cash')),
    (v_entry_id, public.acc('1100'), 0, NEW.amount, NEW.customer_id, 'AR');
  RETURN NEW;
END $$;

-- 5. Customer advance = collections - approved deliveries (contract booking is a promise, not a debit)
CREATE OR REPLACE FUNCTION public.recompute_customer_advance(_customer_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_credits numeric := 0; v_debits numeric := 0;
BEGIN
  IF _customer_id IS NULL THEN RETURN; END IF;
  SELECT COALESCE(SUM(amount),0) INTO v_credits FROM public.collections WHERE customer_id = _customer_id;
  SELECT COALESCE(SUM(total_amount),0) INTO v_debits FROM public.sales_entries
   WHERE customer_id = _customer_id AND status='approved' AND sale_type <> 'advance';
  UPDATE public.customers SET advance_balance = GREATEST(v_credits - v_debits, 0) WHERE id = _customer_id;
END $$;

-- 6. Contract advance_paid recomputed from collections tied to that contract
CREATE OR REPLACE FUNCTION public.recompute_contract_advance(_contract_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _contract_id IS NULL THEN RETURN; END IF;
  UPDATE public.contracts SET advance_paid = COALESCE((
    SELECT SUM(amount) FROM public.collections WHERE contract_id = _contract_id
  ), 0) WHERE id = _contract_id;
END $$;

CREATE OR REPLACE FUNCTION public.trg_collection_sync()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recompute_customer_advance(OLD.customer_id);
    PERFORM public.recompute_contract_advance(OLD.contract_id);
    PERFORM public.recompute_order_progress(OLD.order_id);
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.customer_id IS DISTINCT FROM NEW.customer_id THEN PERFORM public.recompute_customer_advance(OLD.customer_id); END IF;
    IF OLD.contract_id IS DISTINCT FROM NEW.contract_id THEN PERFORM public.recompute_contract_advance(OLD.contract_id); END IF;
    IF OLD.order_id IS DISTINCT FROM NEW.order_id THEN PERFORM public.recompute_order_progress(OLD.order_id); END IF;
  END IF;
  PERFORM public.recompute_customer_advance(NEW.customer_id);
  PERFORM public.recompute_contract_advance(NEW.contract_id);
  PERFORM public.recompute_order_progress(NEW.order_id);
  RETURN NEW;
END $$;

-- 7. Orders: automatic delivered / remaining / advance / status
ALTER TABLE public.collections ADD COLUMN IF NOT EXISTS order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivered_quantity numeric NOT NULL DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS remaining_quantity numeric NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.recompute_order_progress(_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_delivered numeric := 0; v_adv numeric; v_qty numeric;
BEGIN
  IF _order_id IS NULL THEN RETURN; END IF;
  SELECT COALESCE(SUM(quantity),0) INTO v_delivered FROM public.deliveries WHERE order_id = _order_id;
  SELECT SUM(amount) INTO v_adv FROM public.collections WHERE order_id = _order_id;
  SELECT quantity INTO v_qty FROM public.orders WHERE id = _order_id;
  UPDATE public.orders SET
    delivered_quantity = v_delivered,
    remaining_quantity = GREATEST(COALESCE(v_qty,0) - v_delivered, 0),
    advance = COALESCE(v_adv, advance),
    status = CASE
      WHEN v_delivered <= 0 THEN 'pending'
      WHEN v_delivered >= COALESCE(v_qty,0) THEN 'completed'
      ELSE 'partial' END
  WHERE id = _order_id;
END $$;

CREATE OR REPLACE FUNCTION public.trg_delivery_sync()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP='DELETE' THEN PERFORM public.recompute_order_progress(OLD.order_id); RETURN OLD; END IF;
  IF TG_OP='UPDATE' AND OLD.order_id IS DISTINCT FROM NEW.order_id THEN PERFORM public.recompute_order_progress(OLD.order_id); END IF;
  PERFORM public.recompute_order_progress(NEW.order_id);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS deliveries_sync_order ON public.deliveries;
CREATE TRIGGER deliveries_sync_order AFTER INSERT OR UPDATE OR DELETE ON public.deliveries
FOR EACH ROW EXECUTE FUNCTION public.trg_delivery_sync();

CREATE OR REPLACE FUNCTION public.trg_order_recompute()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.delivered_quantity := COALESCE((SELECT SUM(quantity) FROM public.deliveries WHERE order_id = NEW.id),0);
  NEW.remaining_quantity := GREATEST(COALESCE(NEW.quantity,0) - NEW.delivered_quantity, 0);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS orders_recompute ON public.orders;
CREATE TRIGGER orders_recompute BEFORE INSERT OR UPDATE OF quantity ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.trg_order_recompute();

-- 8. Expense journal: category-aware expense account, cash out
CREATE OR REPLACE FUNCTION public.expense_account_for(_category text)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN _category ILIKE '%মাটি%' OR _category ILIKE '%soil%' THEN public.acc('6300')
    WHEN _category ILIKE '%কয়লা%' OR _category ILIKE '%জ্বালানি%' OR _category ILIKE '%coal%' OR _category ILIKE '%fuel%' THEN public.acc('6400')
    WHEN _category ILIKE '%লোড%' OR _category ILIKE '%আনলোড%' OR _category ILIKE '%loading%' THEN public.acc('6130')
    WHEN _category ILIKE '%পরিবহন%' OR _category ILIKE '%ভাড়া%' OR _category ILIKE '%transport%' THEN public.acc('6500')
    WHEN _category ILIKE '%শ্রমিক%' OR _category ILIKE '%মজুরি%' OR _category ILIKE '%labor%' THEN public.acc('6100')
    WHEN _category ILIKE '%গাড়ি%' OR _category ILIKE '%vehicle%' THEN public.acc('6200')
    ELSE public.acc('6000')
  END;
$$;

CREATE OR REPLACE FUNCTION public.post_expense_journal()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_entry_id uuid;
BEGIN
  DELETE FROM public.journal_entries WHERE source='expense' AND ref_type='expense' AND ref_id = COALESCE(NEW.id, OLD.id);
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  IF COALESCE(NEW.amount,0)=0 THEN RETURN NEW; END IF;
  INSERT INTO public.journal_entries(entry_date, source, ref_type, ref_id, narration, created_by)
  VALUES (NEW.expense_date,'expense','expense',NEW.id,COALESCE(NEW.note,'খরচ'),NEW.created_by)
  RETURNING id INTO v_entry_id;
  INSERT INTO public.journal_lines(entry_id,account_id,debit,credit,note) VALUES
    (v_entry_id, public.expense_account_for(NEW.category), NEW.amount, 0, NEW.category),
    (v_entry_id, public.acc('1000'), 0, NEW.amount, 'Cash');
  RETURN NEW;
END $$;

-- 9. Supplier payments -> reduce payable
CREATE OR REPLACE FUNCTION public.post_supplier_payment_journal()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_entry_id uuid;
BEGIN
  DELETE FROM public.journal_entries WHERE source='supplier' AND ref_type='supplier_payment' AND ref_id = COALESCE(NEW.id, OLD.id);
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  IF COALESCE(NEW.amount,0)=0 THEN RETURN NEW; END IF;
  INSERT INTO public.journal_entries(entry_date, source, ref_type, ref_id, narration, created_by)
  VALUES (NEW.payment_date,'supplier','supplier_payment',NEW.id,'সরবরাহকারী পেমেন্ট',NEW.created_by)
  RETURNING id INTO v_entry_id;
  INSERT INTO public.journal_lines(entry_id,account_id,debit,credit,note) VALUES
    (v_entry_id, public.acc('2000'), NEW.amount, 0, 'AP'),
    (v_entry_id, public.acc('1000'), 0, NEW.amount, 'Cash');
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_supplier_payment_journal ON public.supplier_payments;
CREATE TRIGGER trg_supplier_payment_journal AFTER INSERT OR UPDATE OR DELETE ON public.supplier_payments
FOR EACH ROW EXECUTE FUNCTION public.post_supplier_payment_journal();

-- 10. Bank deposits / withdrawals (cash <-> bank movement)
CREATE OR REPLACE FUNCTION public.post_bank_txn_journal()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_entry_id uuid; v_bank uuid; v_other uuid;
BEGIN
  DELETE FROM public.journal_entries WHERE source='bank' AND ref_type='bank_transaction' AND ref_id = COALESCE(NEW.id, OLD.id);
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  IF COALESCE(NEW.amount,0)=0 THEN RETURN NEW; END IF;
  v_bank := public.acc('1010');
  v_other := public.acc('1000');
  INSERT INTO public.journal_entries(entry_date, source, ref_type, ref_id, narration, created_by)
  VALUES (NEW.txn_date,'bank','bank_transaction',NEW.id,COALESCE(NEW.note, CASE WHEN NEW.direction='in' THEN 'ব্যাংকে জমা' ELSE 'ব্যাংক থেকে উত্তোলন' END),NEW.created_by)
  RETURNING id INTO v_entry_id;
  IF NEW.direction = 'in' THEN
    INSERT INTO public.journal_lines(entry_id,account_id,debit,credit,note) VALUES
      (v_entry_id, v_bank, NEW.amount, 0, 'Bank in'),
      (v_entry_id, v_other, 0, NEW.amount, 'Cash out');
  ELSE
    INSERT INTO public.journal_lines(entry_id,account_id,debit,credit,note) VALUES
      (v_entry_id, v_other, NEW.amount, 0, 'Cash in'),
      (v_entry_id, v_bank, 0, NEW.amount, 'Bank out');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_bank_txn_journal ON public.bank_transactions;
CREATE TRIGGER trg_bank_txn_journal AFTER INSERT OR UPDATE OR DELETE ON public.bank_transactions
FOR EACH ROW EXECUTE FUNCTION public.post_bank_txn_journal();

-- 11. Transfers between cash and bank
CREATE OR REPLACE FUNCTION public.post_transfer_journal()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_entry_id uuid; v_from uuid; v_to uuid;
BEGIN
  DELETE FROM public.journal_entries WHERE source='transfer' AND ref_type='transfer' AND ref_id = COALESCE(NEW.id, OLD.id);
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  IF COALESCE(NEW.amount,0)=0 THEN RETURN NEW; END IF;
  v_from := CASE WHEN NEW.from_type='bank' THEN public.acc('1010') WHEN NEW.from_type='mobile' THEN public.acc('1020') ELSE public.acc('1000') END;
  v_to := CASE WHEN NEW.to_type='bank' THEN public.acc('1010') WHEN NEW.to_type='mobile' THEN public.acc('1020') ELSE public.acc('1000') END;
  IF v_from = v_to THEN RETURN NEW; END IF;
  INSERT INTO public.journal_entries(entry_date, source, ref_type, ref_id, narration, created_by)
  VALUES (NEW.transfer_date,'transfer','transfer',NEW.id,COALESCE(NEW.note,'ট্রান্সফার'),NEW.created_by)
  RETURNING id INTO v_entry_id;
  INSERT INTO public.journal_lines(entry_id,account_id,debit,credit,note) VALUES
    (v_entry_id, v_to, NEW.amount, 0, 'Transfer in'),
    (v_entry_id, v_from, 0, NEW.amount, 'Transfer out');
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_transfer_journal ON public.transfers;
CREATE TRIGGER trg_transfer_journal AFTER INSERT OR UPDATE OR DELETE ON public.transfers
FOR EACH ROW EXECUTE FUNCTION public.post_transfer_journal();

-- 12. Kacha brick work: becomes sardar payable automatically
CREATE OR REPLACE FUNCTION public.post_kacha_brick_journal()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_entry_id uuid;
BEGIN
  DELETE FROM public.journal_entries WHERE source='sardar' AND ref_type='kacha_brick_entry' AND ref_id = COALESCE(NEW.id, OLD.id);
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  IF COALESCE(NEW.amount,0)=0 OR NEW.entry_type = 'damage' THEN RETURN NEW; END IF;
  INSERT INTO public.journal_entries(entry_date, source, ref_type, ref_id, narration, created_by)
  VALUES (NEW.entry_date,'sardar','kacha_brick_entry',NEW.id,'কাঁচা ইট মজুরি',NEW.created_by)
  RETURNING id INTO v_entry_id;
  INSERT INTO public.journal_lines(entry_id,account_id,debit,credit,note) VALUES
    (v_entry_id, public.acc('6110'), NEW.amount, 0, NEW.entry_type),
    (v_entry_id, public.acc('2200'), 0, NEW.amount, 'Sardar payable');
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_kacha_brick_journal ON public.kacha_brick_entries;
CREATE TRIGGER trg_kacha_brick_journal AFTER INSERT OR UPDATE OR DELETE ON public.kacha_brick_entries
FOR EACH ROW EXECUTE FUNCTION public.post_kacha_brick_journal();

-- 13. Backfill: recompute customer / contract / order aggregates and repost journals
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.customers LOOP PERFORM public.recompute_customer_advance(r.id); END LOOP;
  FOR r IN SELECT id FROM public.contracts LOOP PERFORM public.recompute_contract_advance(r.id); PERFORM public.recompute_contract_delivered(r.id); END LOOP;
  FOR r IN SELECT id FROM public.orders LOOP PERFORM public.recompute_order_progress(r.id); END LOOP;
END $$;
