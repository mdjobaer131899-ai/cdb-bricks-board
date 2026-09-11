ALTER TABLE public.sales_entries
  ADD COLUMN IF NOT EXISTS opening_balance_id uuid REFERENCES public.opening_balances(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sales_entries_opening_balance ON public.sales_entries(opening_balance_id);

CREATE OR REPLACE VIEW public.opening_balance_summary
WITH (security_invoker = true) AS
SELECT ob.id,
    ob.kind,
    ob.customer_id,
    ob.sardar_id,
    ob.worker_id,
    ob.party_name,
    ob.category,
    ob.amount,
    ob.fiscal_year,
    ob.as_of_date,
    ob.note,
    ob.created_at,
    COALESCE(c.name, s.name, w.name, ob.party_name) AS display_name,
    COALESCE(p.paid, 0::numeric) + COALESCE(sa.adjusted, 0::numeric) AS paid_amount,
    ob.amount - COALESCE(p.paid, 0::numeric) - COALESCE(sa.adjusted, 0::numeric) AS remaining_amount,
    COALESCE(p.paid, 0::numeric) AS payments_amount,
    COALESCE(sa.adjusted, 0::numeric) AS sales_adjusted,
    COALESCE(sa.adjusted_qty, 0::numeric) AS sales_adjusted_qty
   FROM public.opening_balances ob
     LEFT JOIN public.customers c ON c.id = ob.customer_id
     LEFT JOIN public.sardars s ON s.id = ob.sardar_id
     LEFT JOIN public.workers w ON w.id = ob.worker_id
     LEFT JOIN ( SELECT opening_payments.opening_balance_id,
            sum(opening_payments.amount) AS paid
           FROM public.opening_payments
          GROUP BY opening_payments.opening_balance_id) p ON p.opening_balance_id = ob.id
     LEFT JOIN ( SELECT se.opening_balance_id,
            sum(se.total_amount) AS adjusted,
            sum(se.quantity) AS adjusted_qty
           FROM public.sales_entries se
          WHERE se.opening_balance_id IS NOT NULL AND se.status <> 'rejected'::sale_status
          GROUP BY se.opening_balance_id) sa ON sa.opening_balance_id = ob.id;

GRANT SELECT ON public.opening_balance_summary TO authenticated;
GRANT ALL ON public.opening_balance_summary TO service_role;