-- Vehicle rent (গাড়ি ভাড়া) becomes a contract folder on /purchases (?f=vehicle), like land rent.
-- A vehicle owner is a suppliers row with material_type 'গাড়ি ভাড়া' (hidden from the suppliers page),
-- each job is a purchases row item_name 'গাড়ি ভাড়া' with quantity = trips, unit 'ট্রিপ', unit_price = rate per trip,
-- money given is supplier_payments. No new money table, so hand cash, cash book, P&L and dues already count it.
-- Data only: no schema, RLS or grants change.

-- owners whose only bills are vehicle rent move into the folder
update public.suppliers s
set material_type = 'গাড়ি ভাড়া'
where s.material_type is null
  and exists (select 1 from public.purchases p where p.supplier_id = s.id and p.item_name = 'গাড়ি ভাড়া বা যাতায়াত')
  and not exists (select 1 from public.purchases p where p.supplier_id = s.id and p.item_name <> 'গাড়ি ভাড়া বা যাতায়াত');

-- their bills become trip bills; the trip count is the number at the start of the note ("৪৫ গাড়ি বালু ফালানো")
with b as (
  select p.id, p.total_amount,
         nullif(substring(translate(coalesce(p.note, ''), '০১২৩৪৫৬৭৮৯', '0123456789') from '^\s*(\d+)'), '')::numeric as trips
  from public.purchases p
  join public.suppliers s on s.id = p.supplier_id and s.material_type = 'গাড়ি ভাড়া'
  where p.item_name = 'গাড়ি ভাড়া বা যাতায়াত'
)
update public.purchases p
set item_name = 'গাড়ি ভাড়া',
    material_id = null,
    quantity = coalesce(b.trips, 1),
    unit = case when b.trips > 0 then 'ট্রিপ' else null end,
    unit_price = round(b.total_amount / coalesce(nullif(b.trips, 0), 1), 2)
from b
where p.id = b.id;

-- new vehicle rent is entered in the folder, not as a catalog item
update public.raw_materials set active = false where name = 'গাড়ি ভাড়া বা যাতায়াত';
