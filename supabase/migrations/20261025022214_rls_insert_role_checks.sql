-- Close two write holes found in the 2026-10-16 audit (OVERVIEW 8.1 (8) and the security part):
-- 1) any signed-in account without a role could add last season's balances and their
--    payments, and both change hand cash;
-- 2) a manager could insert a challan that is already 'approved', at any price, skipping
--    the admin's approval (the escalation trigger only guards UPDATE).
-- Admins keep full access through "Admins can manage sales entries" (policies are OR-ed), so
-- the admin auto-approve trigger still works.

alter policy "auth can insert opening balances" on public.opening_balances
  with check (created_by = auth.uid() and private.has_any_role(auth.uid()));

alter policy "auth can insert opening payments" on public.opening_payments
  with check (created_by = auth.uid() and private.has_any_role(auth.uid()));

alter policy "Users can create their own sales entries" on public.sales_entries
  with check (
    auth.uid() = created_by
    and private.has_any_role(auth.uid())
    and status = 'pending'
    and approved_by is null
    and approved_at is null
  );
