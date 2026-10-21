-- Fixed-price brick booking (অগ্রিম ইট বিক্রি): a customer books a number of trucks
-- (গাড়ি) of one or more brick types at a fixed price per piece and pays in full up
-- front (trucks × usual pieces per truck × rate). Each challan against it is one truck
-- and keeps that price for its actual pieces; the owner decides per challan whether a
-- truck comes from the booking — other trucks are a normal sale at the day's price.
--
-- A booking is a contracts row (contract_type 'yearly_fixed') with its brick types in
-- contract_items; the money is a collections row with contract_id. Advance money
-- without a fixed price (অগ্রিম টাকা) stays a plain collection, as before.

create table if not exists public.contract_items (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts(id) on delete cascade,
  brick_type_id uuid not null references public.brick_types(id) on delete restrict,
  trucks numeric not null check (trucks > 0),
  pieces_per_truck numeric not null check (pieces_per_truck > 0),
  rate numeric not null check (rate >= 0),
  created_at timestamptz not null default now(),
  unique (contract_id, brick_type_id)
);
create index if not exists contract_items_contract_idx on public.contract_items(contract_id);

alter table public.contract_items enable row level security;
create policy "staff read contract_items" on public.contract_items
  for select to authenticated using (private.has_any_role(auth.uid()));
create policy "admin write contract_items" on public.contract_items
  for all to authenticated using (private.is_admin(auth.uid())) with check (private.is_admin(auth.uid()));
grant select, insert, update, delete on public.contract_items to authenticated;

-- one call writes the booking, its brick types and the money taken (admin only)
create or replace function public.create_booking(
  _customer_id uuid, _date date, _items jsonb, _paid numeric, _method text, _note text
) returns uuid
language plpgsql
security invoker
set search_path to 'public'
as $$
declare
  v_id uuid;
  v_no text;
  v_qty numeric := 0;
  v_value numeric := 0;
  v_n int;
  it jsonb;
begin
  if not private.is_admin(auth.uid()) then
    raise exception 'শুধু অ্যাডমিন বুকিং লিখতে পারেন';
  end if;
  if jsonb_typeof(_items) <> 'array' or jsonb_array_length(_items) = 0 then
    raise exception 'অন্তত একটি ইটের ধরন দিন';
  end if;
  for it in select * from jsonb_array_elements(_items) loop
    if coalesce((it->>'trucks')::numeric, 0) <= 0 then raise exception 'কত গাড়ি, দিন'; end if;
    if coalesce((it->>'pieces_per_truck')::numeric, 0) <= 0 then raise exception 'গাড়িতে কত পিস, দিন'; end if;
    if coalesce((it->>'rate')::numeric, -1) < 0 then raise exception 'দাম দিন'; end if;
    v_qty := v_qty + (it->>'trucks')::numeric * (it->>'pieces_per_truck')::numeric;
    v_value := v_value + (it->>'trucks')::numeric * (it->>'pieces_per_truck')::numeric * (it->>'rate')::numeric;
  end loop;

  select count(*) + 1 into v_n from public.contracts where contract_type = 'yearly_fixed';
  loop
    v_no := 'বুকিং-' || lpad(v_n::text, 3, '0');
    exit when not exists (select 1 from public.contracts where contract_no = v_no);
    v_n := v_n + 1;
  end loop;

  insert into public.contracts (contract_no, customer_id, contract_type, start_date, fixed_rate, booked_quantity, booked_value, truck_quantity, notes, created_by, approved_by)
  values (v_no, _customer_id, 'yearly_fixed', _date, null, v_qty, round(v_value, 2),
          (select sum((x->>'trucks')::numeric) from jsonb_array_elements(_items) x), nullif(trim(_note), ''), auth.uid(), auth.uid())
  returning id into v_id;

  insert into public.contract_items (contract_id, brick_type_id, trucks, pieces_per_truck, rate)
  select v_id, (x->>'brick_type_id')::uuid, (x->>'trucks')::numeric, (x->>'pieces_per_truck')::numeric, (x->>'rate')::numeric
  from jsonb_array_elements(_items) x;

  if coalesce(_paid, 0) > 0 then
    insert into public.collections (customer_id, contract_id, amount, payment_date, method, note, created_by)
    values (_customer_id, v_id, _paid, _date, coalesce(nullif(trim(_method), ''), 'নগদ'), 'বুকিং ' || v_no || ' — অগ্রিম', auth.uid());
  end if;
  return v_id;
end
$$;
grant execute on function public.create_booking(uuid, date, jsonb, numeric, text, text) to authenticated;

-- cancel a booking that has no challan yet: its money and brick types go with it (admin only)
create or replace function public.cancel_booking(_id uuid) returns void
language plpgsql
security invoker
set search_path to 'public'
as $$
begin
  if not private.is_admin(auth.uid()) then
    raise exception 'শুধু অ্যাডমিন বুকিং বাতিল করতে পারেন';
  end if;
  if exists (select 1 from public.sales_entries where contract_id = _id and status <> 'rejected') then
    raise exception 'এই বুকিংয়ে চালান আছে — আগে চালানগুলো সরান';
  end if;
  delete from public.collections where contract_id = _id;
  delete from public.contracts where id = _id;
end
$$;
grant execute on function public.cancel_booking(uuid) to authenticated;
