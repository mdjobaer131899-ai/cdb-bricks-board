-- Veku lines still to be settled against the paper ledger (ভেকুর খাতা). The kiln keeps the
-- two vekus' accounts on paper sheets; the app counts only what matches them. Anything that
-- does not match waits here, outside every total, until the owner decides:
--   side 'paper': on the paper sheet, not yet in the app → "অ্যাপে তুলুন" writes the real row
--                 (supplier_payments, or expenses for the driver's khoraki), "বাদ দিন" drops it
--   side 'app':   in the app (payment_id), not on the paper sheet → "ঠিক আছে" keeps it,
--                 "মুছুন" deletes or reduces that payment
-- This table holds no money: hand cash, the cash book and profit never read it.

create table if not exists public.veku_pending (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  item_date date not null,
  side text not null check (side in ('paper', 'app')),
  kind text not null,
  label text not null,
  amount numeric(12, 2) not null check (amount > 0),
  note text,
  payment_id uuid references public.supplier_payments(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'done', 'dropped')),
  resolved_at timestamptz,
  resolved_by uuid,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists veku_pending_supplier_idx on public.veku_pending (supplier_id, status);

alter table public.veku_pending enable row level security;

create policy "role can read veku pending" on public.veku_pending
  for select to authenticated using (private.has_any_role(auth.uid()));
create policy "admin can add veku pending" on public.veku_pending
  for insert to authenticated with check (private.is_admin(auth.uid()));
create policy "admin can settle veku pending" on public.veku_pending
  for update to authenticated using (private.is_admin(auth.uid())) with check (private.is_admin(auth.uid()));
create policy "admin can delete veku pending" on public.veku_pending
  for delete to authenticated using (private.is_admin(auth.uid()));

revoke all on public.veku_pending from anon;
grant select, insert, update, delete on public.veku_pending to authenticated;
grant all on public.veku_pending to service_role;
