-- create_booking: contracts.truck_quantity is a generated column (booked_quantity / 2000),
-- so it must not be written. Trucks live in contract_items.

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

  insert into public.contracts (contract_no, customer_id, contract_type, start_date, fixed_rate, booked_quantity, booked_value, notes, created_by, approved_by)
  values (v_no, _customer_id, 'yearly_fixed', _date, null, v_qty, round(v_value, 2), nullif(trim(_note), ''), auth.uid(), auth.uid())
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
