-- How a challan sold at the day's price is paid. Bookings (contract_id) and last season's
-- advance (opening_balance_id) have their own accounts; every other challan now says:
--   'cash'    money taken with the bricks: cash_received becomes one collection linked to the
--             challan (collections.cash_sale), so hand cash is right without a second entry
--   'advance' taken from this season's advance money, at the day's price less the customer's
--             agreed discount (customer_price_terms)
--   'credit'  the customer owes it
-- Old rows keep pay_mode null (read as credit).

alter table public.sales_entries
  add column if not exists pay_mode text check (pay_mode in ('cash', 'advance', 'credit')),
  add column if not exists cash_received numeric not null default 0 check (cash_received >= 0);

alter table public.collections
  add column if not exists cash_sale boolean not null default false;

create unique index if not exists collections_one_cash_sale
  on public.collections (sales_entry_id) where cash_sale;

-- the money of a cash challan is written, changed and removed together with the challan
create or replace function public.sync_cash_sale_collection()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.pay_mode = 'cash' and new.status <> 'rejected' and coalesce(new.cash_received, 0) > 0
     and new.contract_id is null and new.opening_balance_id is null then
    insert into public.collections
      (customer_id, contract_id, amount, payment_date, method, note, created_by, sales_entry_id, cash_sale)
    values
      (new.customer_id, null, new.cash_received, new.sale_date, 'cash',
       'নগদ বিক্রি — চালান ' || coalesce(new.challan_no, ''), new.created_by, new.id, true)
    on conflict (sales_entry_id) where cash_sale do update
      set customer_id = excluded.customer_id,
          amount = excluded.amount,
          payment_date = excluded.payment_date,
          note = excluded.note
      where collections.customer_id is distinct from excluded.customer_id
         or collections.amount is distinct from excluded.amount
         or collections.payment_date is distinct from excluded.payment_date
         or collections.note is distinct from excluded.note;
  else
    delete from public.collections where sales_entry_id = new.id and cash_sale;
  end if;
  return new;
end
$$;

create trigger trg_cash_sale_collection
  after insert or update on public.sales_entries
  for each row execute function public.sync_cash_sale_collection();

-- a cash challan's money is changed only through the challan (admins can still do anything)
alter policy "Creators delete own collections" on public.collections
  using (created_by = auth.uid() and not cash_sale);
alter policy "Creators update own collections" on public.collections
  using ((auth.uid() = created_by) and private.has_any_role(auth.uid()) and not cash_sale)
  with check ((auth.uid() = created_by) and private.has_any_role(auth.uid()) and not cash_sale);

-- after saving, only an admin may change how a challan is paid or the cash taken
create or replace function public.prevent_creator_field_escalation()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'private'
as $$
begin
  if private.has_role(auth.uid(), 'admin'::public.app_role) then
    return new;
  end if;

  if new.status is distinct from old.status
     or new.approved_by is distinct from old.approved_by
     or new.approved_at is distinct from old.approved_at
     or new.unit_price is distinct from old.unit_price
     or new.total_amount is distinct from old.total_amount
     or new.created_by is distinct from old.created_by
     or new.pay_mode is distinct from old.pay_mode
     or new.cash_received is distinct from old.cash_received
  then
    raise exception 'Not allowed to modify protected fields';
  end if;

  return new;
end;
$$;

-- what a customer pays for bricks taken from this season's advance: the day's price less this
-- much per piece (e.g. ৳1,000 less a 2000-brick truck = ৳0.50). Set by admins only.
create table if not exists public.customer_price_terms (
  customer_id uuid primary key references public.customers(id) on delete cascade,
  discount_per_piece numeric not null default 0 check (discount_per_piece >= 0),
  note text,
  updated_by uuid default auth.uid(),
  updated_at timestamptz not null default now()
);

alter table public.customer_price_terms enable row level security;

create policy "staff read customer_price_terms" on public.customer_price_terms
  for select to authenticated using (private.has_any_role(auth.uid()));
create policy "admin write customer_price_terms" on public.customer_price_terms
  for all to authenticated
  using (private.is_admin(auth.uid()))
  with check (private.is_admin(auth.uid()));

grant select, insert, update, delete on public.customer_price_terms to authenticated;
grant all on public.customer_price_terms to service_role;

create trigger customer_price_terms_updated_at
  before update on public.customer_price_terms
  for each row execute function public.update_updated_at_column();
