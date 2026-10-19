-- Owner salary (মালিকের বেতন), used when there is more than one owner.
-- The monthly salary and its history live in pay_rates (owner_id, amount, effective_from),
-- like staff salaries; salary taken is an owner_transactions row with txn_type 'salary'.
-- Salary is a business cost (cash book, P&L); it is not a withdrawal from the owner's investment.

alter table public.pay_rates add column if not exists owner_id uuid references public.owners(id) on delete cascade;

-- exactly one of worker / sardar / owner
alter table public.pay_rates drop constraint if exists pay_rates_check;
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.pay_rates'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) like '%worker_id IS NULL%sardar_id IS NULL%'
  loop
    execute format('alter table public.pay_rates drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.pay_rates add constraint pay_rates_one_person check (num_nonnulls(worker_id, sardar_id, owner_id) = 1);

create unique index if not exists pay_rates_owner_from_key on public.pay_rates (owner_id, effective_from) where owner_id is not null;
create index if not exists pay_rates_owner_idx on public.pay_rates (owner_id);

-- txn_type values in use: invest, withdraw, salary
alter table public.owner_transactions drop constraint if exists owner_transactions_type_check;
alter table public.owner_transactions add constraint owner_transactions_type_check check (txn_type in ('invest', 'withdraw', 'salary'));

-- RLS and grants: pay_rates already has pay_rates_select (any role) and pay_rates_admin_write (admin);
-- owner_transactions keeps its policies. Nothing new to grant.
