
DO $$ BEGIN CREATE TYPE public.account_type AS ENUM ('asset','liability','equity','income','expense');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.journal_source AS ENUM ('sale','collection','expense','manual','opening','adjustment');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  name_bn text,
  account_type public.account_type NOT NULL,
  parent_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.accounts TO authenticated;
GRANT ALL ON public.accounts TO service_role;
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "accounts_read_auth" ON public.accounts;
DROP POLICY IF EXISTS "accounts_admin_write" ON public.accounts;
CREATE POLICY "accounts_read_auth" ON public.accounts FOR SELECT TO authenticated USING (true);
CREATE POLICY "accounts_admin_write" ON public.accounts FOR ALL TO authenticated
  USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));

CREATE TABLE IF NOT EXISTS public.journal_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_no text UNIQUE NOT NULL DEFAULT ('JE-' || to_char(now(),'YYYYMMDD') || '-' || substr(gen_random_uuid()::text,1,8)),
  entry_date date NOT NULL DEFAULT CURRENT_DATE,
  source public.journal_source NOT NULL DEFAULT 'manual',
  ref_type text,
  ref_id uuid,
  narration text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source, ref_type, ref_id)
);
GRANT SELECT ON public.journal_entries TO authenticated;
GRANT ALL ON public.journal_entries TO service_role;
ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "je_read_auth" ON public.journal_entries;
DROP POLICY IF EXISTS "je_admin_write" ON public.journal_entries;
CREATE POLICY "je_read_auth" ON public.journal_entries FOR SELECT TO authenticated USING (true);
CREATE POLICY "je_admin_write" ON public.journal_entries FOR ALL TO authenticated
  USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));

CREATE TABLE IF NOT EXISTS public.journal_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id uuid NOT NULL REFERENCES public.journal_entries(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.accounts(id),
  debit numeric(14,2) NOT NULL DEFAULT 0,
  credit numeric(14,2) NOT NULL DEFAULT 0,
  customer_id uuid REFERENCES public.customers(id),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (debit >= 0 AND credit >= 0),
  CHECK (NOT (debit > 0 AND credit > 0))
);
CREATE INDEX IF NOT EXISTS idx_jl_entry ON public.journal_lines(entry_id);
CREATE INDEX IF NOT EXISTS idx_jl_account ON public.journal_lines(account_id);
GRANT SELECT ON public.journal_lines TO authenticated;
GRANT ALL ON public.journal_lines TO service_role;
ALTER TABLE public.journal_lines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "jl_read_auth" ON public.journal_lines;
DROP POLICY IF EXISTS "jl_admin_write" ON public.journal_lines;
CREATE POLICY "jl_read_auth" ON public.journal_lines FOR SELECT TO authenticated USING (true);
CREATE POLICY "jl_admin_write" ON public.journal_lines FOR ALL TO authenticated
  USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));

DROP TRIGGER IF EXISTS trg_accounts_updated ON public.accounts;
CREATE TRIGGER trg_accounts_updated BEFORE UPDATE ON public.accounts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trg_je_updated ON public.journal_entries;
CREATE TRIGGER trg_je_updated BEFORE UPDATE ON public.journal_entries FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.accounts (code, name, name_bn, account_type) VALUES
  ('1000','Cash','নগদ','asset'),
  ('1010','Bank','ব্যাংক','asset'),
  ('1100','Accounts Receivable','বাকি / ডিউ','asset'),
  ('1200','Inventory','স্টক','asset'),
  ('2100','Advance from Customer','গ্রাহক অগ্রিম','liability'),
  ('4000','Sales Revenue','বিক্রয়','income'),
  ('5000','Cost of Goods Sold','বিক্রিত পণ্যের খরচ','expense'),
  ('6000','General Expense','সাধারণ খরচ','expense')
ON CONFLICT (code) DO NOTHING;

CREATE OR REPLACE FUNCTION public.acc(_code text) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT id FROM public.accounts WHERE code = _code LIMIT 1;
$$;

-- Sales auto-post
CREATE OR REPLACE FUNCTION public.post_sale_journal()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_entry_id uuid;
BEGIN
  DELETE FROM public.journal_entries WHERE source='sale' AND ref_type='sales_entry' AND ref_id = COALESCE(NEW.id, OLD.id);
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  IF NEW.status <> 'approved' OR NEW.sale_type='advance' OR COALESCE(NEW.total_amount,0)=0 THEN RETURN NEW; END IF;
  INSERT INTO public.journal_entries(entry_date, source, ref_type, ref_id, narration, created_by)
  VALUES (NEW.sale_date,'sale','sales_entry',NEW.id,'বিক্রয় চালান '||COALESCE(NEW.challan_no,''),NEW.created_by)
  RETURNING id INTO v_entry_id;
  INSERT INTO public.journal_lines(entry_id,account_id,debit,credit,customer_id,note) VALUES
    (v_entry_id, acc('1100'), NEW.total_amount, 0, NEW.customer_id,'AR'),
    (v_entry_id, acc('4000'), 0, NEW.total_amount, NEW.customer_id,'Sales');
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_post_sale_journal ON public.sales_entries;
CREATE TRIGGER trg_post_sale_journal AFTER INSERT OR UPDATE OR DELETE ON public.sales_entries
FOR EACH ROW EXECUTE FUNCTION public.post_sale_journal();

-- Collection auto-post (uses payment_date, method)
CREATE OR REPLACE FUNCTION public.post_collection_journal()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_entry_id uuid; v_cash uuid; v_credit_acc uuid;
BEGIN
  DELETE FROM public.journal_entries WHERE source='collection' AND ref_type='collection' AND ref_id = COALESCE(NEW.id, OLD.id);
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  IF COALESCE(NEW.amount,0)=0 THEN RETURN NEW; END IF;
  v_cash := CASE WHEN lower(COALESCE(NEW.method,'cash')) IN ('bank','bkash','nagad','transfer','cheque') THEN acc('1010') ELSE acc('1000') END;
  v_credit_acc := CASE WHEN NEW.contract_id IS NOT NULL THEN acc('1100') ELSE acc('2100') END;
  INSERT INTO public.journal_entries(entry_date, source, ref_type, ref_id, narration, created_by)
  VALUES (NEW.payment_date,'collection','collection',NEW.id,'কালেকশন',NEW.created_by)
  RETURNING id INTO v_entry_id;
  INSERT INTO public.journal_lines(entry_id,account_id,debit,credit,customer_id,note) VALUES
    (v_entry_id, v_cash, NEW.amount, 0, NEW.customer_id, NEW.method),
    (v_entry_id, v_credit_acc, 0, NEW.amount, NEW.customer_id, CASE WHEN NEW.contract_id IS NULL THEN 'Advance' ELSE 'AR' END);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_post_collection_journal ON public.collections;
CREATE TRIGGER trg_post_collection_journal AFTER INSERT OR UPDATE OR DELETE ON public.collections
FOR EACH ROW EXECUTE FUNCTION public.post_collection_journal();

-- Expense auto-post (uses note, category)
CREATE OR REPLACE FUNCTION public.post_expense_journal()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_entry_id uuid;
BEGIN
  DELETE FROM public.journal_entries WHERE source='expense' AND ref_type='expense' AND ref_id = COALESCE(NEW.id, OLD.id);
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  IF COALESCE(NEW.amount,0)=0 THEN RETURN NEW; END IF;
  INSERT INTO public.journal_entries(entry_date, source, ref_type, ref_id, narration, created_by)
  VALUES (NEW.expense_date,'expense','expense',NEW.id,COALESCE(NEW.note,'খরচ'),NEW.created_by)
  RETURNING id INTO v_entry_id;
  INSERT INTO public.journal_lines(entry_id,account_id,debit,credit,note) VALUES
    (v_entry_id, acc('6000'), NEW.amount, 0, NEW.category),
    (v_entry_id, acc('1000'), 0, NEW.amount, 'Cash');
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_post_expense_journal ON public.expenses;
CREATE TRIGGER trg_post_expense_journal AFTER INSERT OR UPDATE OR DELETE ON public.expenses
FOR EACH ROW EXECUTE FUNCTION public.post_expense_journal();

-- Backfill
INSERT INTO public.journal_entries(entry_date, source, ref_type, ref_id, narration, created_by)
SELECT s.sale_date,'sale','sales_entry',s.id,'বিক্রয় চালান '||COALESCE(s.challan_no,''),s.created_by
FROM public.sales_entries s
WHERE s.status='approved' AND s.sale_type<>'advance' AND COALESCE(s.total_amount,0)>0
ON CONFLICT (source, ref_type, ref_id) DO NOTHING;

INSERT INTO public.journal_lines(entry_id,account_id,debit,credit,customer_id,note)
SELECT je.id, acc('1100'), s.total_amount, 0, s.customer_id,'AR'
FROM public.journal_entries je JOIN public.sales_entries s ON s.id=je.ref_id
WHERE je.source='sale' AND NOT EXISTS (SELECT 1 FROM public.journal_lines jl WHERE jl.entry_id=je.id);

INSERT INTO public.journal_lines(entry_id,account_id,debit,credit,customer_id,note)
SELECT je.id, acc('4000'), 0, s.total_amount, s.customer_id,'Sales'
FROM public.journal_entries je JOIN public.sales_entries s ON s.id=je.ref_id
WHERE je.source='sale' AND (SELECT COUNT(*) FROM public.journal_lines jl WHERE jl.entry_id=je.id)=1;

INSERT INTO public.journal_entries(entry_date, source, ref_type, ref_id, narration, created_by)
SELECT c.payment_date,'collection','collection',c.id,'কালেকশন',c.created_by
FROM public.collections c WHERE COALESCE(c.amount,0)>0
ON CONFLICT (source, ref_type, ref_id) DO NOTHING;

INSERT INTO public.journal_lines(entry_id,account_id,debit,credit,customer_id,note)
SELECT je.id,
  CASE WHEN lower(COALESCE(c.method,'cash')) IN ('bank','bkash','nagad','transfer','cheque') THEN acc('1010') ELSE acc('1000') END,
  c.amount,0,c.customer_id,c.method
FROM public.journal_entries je JOIN public.collections c ON c.id=je.ref_id
WHERE je.source='collection' AND NOT EXISTS (SELECT 1 FROM public.journal_lines jl WHERE jl.entry_id=je.id);

INSERT INTO public.journal_lines(entry_id,account_id,debit,credit,customer_id,note)
SELECT je.id,
  CASE WHEN c.contract_id IS NOT NULL THEN acc('1100') ELSE acc('2100') END,
  0,c.amount,c.customer_id, CASE WHEN c.contract_id IS NULL THEN 'Advance' ELSE 'AR' END
FROM public.journal_entries je JOIN public.collections c ON c.id=je.ref_id
WHERE je.source='collection' AND (SELECT COUNT(*) FROM public.journal_lines jl WHERE jl.entry_id=je.id)=1;

INSERT INTO public.journal_entries(entry_date, source, ref_type, ref_id, narration, created_by)
SELECT e.expense_date,'expense','expense',e.id,COALESCE(e.note,'খরচ'),e.created_by
FROM public.expenses e WHERE COALESCE(e.amount,0)>0
ON CONFLICT (source, ref_type, ref_id) DO NOTHING;

INSERT INTO public.journal_lines(entry_id,account_id,debit,credit,note)
SELECT je.id, acc('6000'), e.amount, 0, e.category
FROM public.journal_entries je JOIN public.expenses e ON e.id=je.ref_id
WHERE je.source='expense' AND NOT EXISTS (SELECT 1 FROM public.journal_lines jl WHERE jl.entry_id=je.id);

INSERT INTO public.journal_lines(entry_id,account_id,debit,credit,note)
SELECT je.id, acc('1000'), 0, e.amount, 'Cash'
FROM public.journal_entries je JOIN public.expenses e ON e.id=je.ref_id
WHERE je.source='expense' AND (SELECT COUNT(*) FROM public.journal_lines jl WHERE jl.entry_id=je.id)=1;

-- Reporting views
CREATE OR REPLACE VIEW public.account_balances AS
SELECT a.id, a.code, a.name, a.name_bn, a.account_type,
  COALESCE(SUM(jl.debit),0) AS total_debit,
  COALESCE(SUM(jl.credit),0) AS total_credit,
  CASE WHEN a.account_type IN ('asset','expense')
    THEN COALESCE(SUM(jl.debit-jl.credit),0)
    ELSE COALESCE(SUM(jl.credit-jl.debit),0) END AS balance
FROM public.accounts a
LEFT JOIN public.journal_lines jl ON jl.account_id=a.id
GROUP BY a.id;
GRANT SELECT ON public.account_balances TO authenticated;

CREATE OR REPLACE VIEW public.trial_balance AS
SELECT code,name,name_bn,account_type,total_debit,total_credit,balance
FROM public.account_balances WHERE total_debit>0 OR total_credit>0 OR balance<>0
ORDER BY code;
GRANT SELECT ON public.trial_balance TO authenticated;

CREATE OR REPLACE VIEW public.profit_loss_summary AS
SELECT
  COALESCE(SUM(CASE WHEN a.account_type='income' THEN jl.credit-jl.debit END),0) AS total_income,
  COALESCE(SUM(CASE WHEN a.account_type='expense' THEN jl.debit-jl.credit END),0) AS total_expense,
  COALESCE(SUM(CASE WHEN a.account_type='income' THEN jl.credit-jl.debit END),0)
   - COALESCE(SUM(CASE WHEN a.account_type='expense' THEN jl.debit-jl.credit END),0) AS net_profit
FROM public.journal_lines jl JOIN public.accounts a ON a.id=jl.account_id;
GRANT SELECT ON public.profit_loss_summary TO authenticated;
