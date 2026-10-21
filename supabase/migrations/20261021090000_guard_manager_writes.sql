-- Guards in the database, not only on screen (OVERVIEW 8.1 items 7 and 8).
--
-- 1. A non-admin can only create a challan as 'pending'; an admin approves it and sets
--    the price. Before this, a manager could insert an approved challan with any price
--    straight through the API.
-- 2. Owner money (investment, withdrawal, owner salary) and loans can only be written by
--    an admin or a manager who has been given that page (page_permissions). Reading
--    stays open to staff, because hand cash and the cash book add these rows up and a
--    hidden row would silently change the total.
-- Admins are not affected.

create or replace function private.has_page_access(_uid uuid, _page text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select private.is_admin(_uid)
      or exists (select 1 from public.page_permissions where user_id = _uid and page_key = _page)
$$;

revoke all on function private.has_page_access(uuid, text) from public;
grant execute on function private.has_page_access(uuid, text) to authenticated;

-- 1. challans: new ones are pending unless an admin writes them
drop policy if exists "Users can create their own sales entries" on public.sales_entries;
create policy "Users can create their own sales entries" on public.sales_entries
  for insert to authenticated
  with check (
    auth.uid() = created_by
    and private.has_any_role(auth.uid())
    and (status = 'pending'::sale_status or private.is_admin(auth.uid()))
  );

-- 2. owner money: the owners page
drop policy if exists "staff insert owner_transactions" on public.owner_transactions;
create policy "staff insert owner_transactions" on public.owner_transactions
  for insert to authenticated
  with check (created_by = auth.uid() and private.has_page_access(auth.uid(), '/owners'));

-- loans and their payments: the loans page (the owners page also opens it)
drop policy if exists "staff insert loans" on public.loans;
create policy "staff insert loans" on public.loans
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and (private.has_page_access(auth.uid(), '/loans') or private.has_page_access(auth.uid(), '/owners'))
  );

drop policy if exists "staff insert loan_payments" on public.loan_payments;
create policy "staff insert loan_payments" on public.loan_payments
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and (private.has_page_access(auth.uid(), '/loans') or private.has_page_access(auth.uid(), '/owners'))
  );
