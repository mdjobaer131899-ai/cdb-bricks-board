-- Costs of bringing soil from a soil seller's site (trolley trips, the veku's diesel and driver)
-- are the soil seller's: the whole amount comes off what the kiln owes that seller, whether the
-- trolley owner or the veku has been paid yet or not; what is still unpaid stays the kiln's due
-- to them.
--
-- purchases.site_supplier_id marks such a bill (on the trolley owner or the veku). The database
-- keeps one mirror row on the soil seller: a bill of minus the same amount (mirror_of = the
-- source bill, deleted with it). Every due (suppliers page, purchases page, /dues, the AI),
-- the expense form's running due and the profit (soil cost minus these costs, plus the trolley
-- and veku bills = the soil price once) then need no other change. Bills are not cash, so hand
-- cash is not touched.

alter table public.purchases
  add column if not exists site_supplier_id uuid references public.suppliers(id) on delete set null,
  add column if not exists mirror_of uuid references public.purchases(id) on delete cascade;

comment on column public.purchases.site_supplier_id is 'soil seller whose soil price this cost comes off (trolley trips, veku diesel/driver at the site)';
comment on column public.purchases.mirror_of is 'this row is the automatic minus bill on the soil seller for that source bill; do not edit by hand';

create unique index if not exists purchases_mirror_of_key on public.purchases(mirror_of) where mirror_of is not null;
create index if not exists purchases_site_supplier_idx on public.purchases(site_supplier_id) where site_supplier_id is not null;

alter table public.purchases
  add constraint purchases_site_not_on_mirror check (mirror_of is null or site_supplier_id is null),
  add constraint purchases_site_not_self check (site_supplier_id is null or site_supplier_id is distinct from supplier_id);

-- keep the mirror row of one source bill in step with it
create or replace function private.sync_site_mirror()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_payee text;
  v_item text;
  v_mat uuid;
  v_label text;
  v_bn text := '০১২৩৪৫৬৭৮৯';
begin
  if new.mirror_of is not null then
    return new;
  end if;

  perform set_config('cdb.site_mirror', 'on', true);

  if new.site_supplier_id is null or coalesce(new.total_amount, 0) = 0 then
    delete from public.purchases where mirror_of = new.id;
    perform set_config('cdb.site_mirror', 'off', true);
    return new;
  end if;

  select name into v_payee from public.suppliers where id = new.supplier_id;
  -- the soil seller's own material (মাটি), so the minus counts in the same place as the soil
  select s.material_type, rm.id into v_item, v_mat
    from public.suppliers s
    left join public.raw_materials rm on rm.name = s.material_type
   where s.id = new.site_supplier_id;
  v_item := coalesce(nullif(v_item, ''), 'মাটি');

  v_label := case
    when new.unit = 'ট্রিপ' then
      'ট্রলি ভাড়া বাদ — ' || coalesce(v_payee, '') || ' · '
        || translate(trim_scale(new.quantity)::text, '0123456789', v_bn) || ' ট্রিপ'
    when new.item_name = 'ভেকু' then 'ভেকুর খরচ বাদ — ' || coalesce(v_payee, '')
    else new.item_name || ' বাদ — ' || coalesce(v_payee, '')
  end || coalesce(' · ' || nullif(trim(new.note), ''), '');

  update public.purchases
     set supplier_id = new.site_supplier_id,
         item_name = v_item,
         material_id = v_mat,
         purchase_date = new.purchase_date,
         quantity = 0,
         unit = null,
         unit_price = 0,
         total_amount = -new.total_amount,
         note = v_label
   where mirror_of = new.id;
  if not found then
    insert into public.purchases (supplier_id, item_name, material_id, purchase_date, quantity, unit, unit_price, total_amount, note, created_by, mirror_of)
    values (new.site_supplier_id, v_item, v_mat, new.purchase_date, 0, null, 0, -new.total_amount, v_label, new.created_by, new.id);
  end if;

  perform set_config('cdb.site_mirror', 'off', true);
  return new;
end;
$$;

-- a mirror row changes only with its source bill
create or replace function private.guard_site_mirror()
returns trigger
language plpgsql
set search_path = public, private
as $$
begin
  if old.mirror_of is null or current_setting('cdb.site_mirror', true) = 'on' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  -- the source bill is gone (cascade) or its soil seller was deleted
  if tg_op = 'DELETE' and not exists (select 1 from public.purchases where id = old.mirror_of) then
    return old;
  end if;
  if tg_op = 'UPDATE' and new.supplier_id is null then
    return new;
  end if;
  raise exception 'এই লাইন ট্রলি বা ভেকুর বিল থেকে নিজে আসে। ওই বিলটা বদলান বা মুছুন।';
end;
$$;

drop trigger if exists trg_site_mirror on public.purchases;
create trigger trg_site_mirror
  after insert or update on public.purchases
  for each row execute function private.sync_site_mirror();

drop trigger if exists trg_site_mirror_guard on public.purchases;
create trigger trg_site_mirror_guard
  before update or delete on public.purchases
  for each row execute function private.guard_site_mirror();

revoke all on function private.sync_site_mirror() from public, anon, authenticated;
revoke all on function private.guard_site_mirror() from public, anon, authenticated;
