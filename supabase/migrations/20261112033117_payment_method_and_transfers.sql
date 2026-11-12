-- Hand cash in three purses: the drawer (cash), mobile banking (bKash/Nagad) and the bank.
--
-- 1) Every money table records how the money moved. collections, supplier_payments,
--    sardar_payments and opening_payments already have `method`; the other five get it here.
--    NULL (all old rows) and 'cash' (also the old Bangla 'নগদ') mean cash in the drawer, so
--    nothing changes for rows written before this migration.
-- 2) cash_transfers records money moved between purses (a bank withdrawal into the drawer,
--    a deposit, cash sent to bKash). It never changes the total hand cash, only the split.

alter table public.expenses add column if not exists method text;
alter table public.worker_payments add column if not exists method text;
alter table public.owner_transactions add column if not exists method text;
alter table public.loans add column if not exists method text;
alter table public.loan_payments add column if not exists method text;

create table if not exists public.cash_transfers (
  id uuid primary key default gen_random_uuid(),
  transfer_date date not null,
  from_method text not null check (from_method in ('cash', 'bkash', 'nagad', 'bank')),
  to_method text not null check (to_method in ('cash', 'bkash', 'nagad', 'bank')),
  amount numeric(14, 2) not null check (amount > 0),
  note text,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  constraint cash_transfers_two_purses check (from_method <> to_method)
);

create index if not exists cash_transfers_date_idx on public.cash_transfers (transfer_date);

alter table public.cash_transfers enable row level security;

-- anyone with a role reads and adds (like the other money tables); only an admin changes or deletes
create policy "role can read cash transfers" on public.cash_transfers
  for select to authenticated using (private.has_any_role(auth.uid()));
create policy "role can add cash transfers" on public.cash_transfers
  for insert to authenticated with check (created_by = auth.uid() and private.has_any_role(auth.uid()));
create policy "admin can change cash transfers" on public.cash_transfers
  for update to authenticated using (private.is_admin(auth.uid())) with check (private.is_admin(auth.uid()));
create policy "admin can delete cash transfers" on public.cash_transfers
  for delete to authenticated using (private.is_admin(auth.uid()));

revoke all on public.cash_transfers from anon;
grant select, insert, update, delete on public.cash_transfers to authenticated;
grant all on public.cash_transfers to service_role;
