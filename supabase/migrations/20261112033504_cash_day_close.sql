-- দিন বন্ধ: at the end of a day the drawer is counted and checked against what the app
-- expects (the "cash" purse of hand cash up to that day). One row per day keeps both numbers,
-- the difference and the reason, so a gap is found the same day instead of at month end.
-- Nothing else is written: a difference is never turned into a fake entry.

create table if not exists public.cash_day_closes (
  id uuid primary key default gen_random_uuid(),
  close_date date not null unique,
  expected numeric(14, 2) not null,
  counted numeric(14, 2) not null check (counted >= 0),
  difference numeric(14, 2) generated always as (counted - expected) stored,
  note text,
  closed_by uuid not null default auth.uid(),
  closed_at timestamptz not null default now()
);

alter table public.cash_day_closes enable row level security;

-- anyone with a role reads and closes a day; only an admin changes or reopens one
create policy "role can read day closes" on public.cash_day_closes
  for select to authenticated using (private.has_any_role(auth.uid()));
create policy "role can close a day" on public.cash_day_closes
  for insert to authenticated with check (closed_by = auth.uid() and private.has_any_role(auth.uid()));
create policy "admin can change day closes" on public.cash_day_closes
  for update to authenticated using (private.is_admin(auth.uid())) with check (private.is_admin(auth.uid()));
create policy "admin can reopen a day" on public.cash_day_closes
  for delete to authenticated using (private.is_admin(auth.uid()));

revoke all on public.cash_day_closes from anon;
grant select, insert, update, delete on public.cash_day_closes to authenticated;
grant all on public.cash_day_closes to service_role;
