-- ভেকু folder (/purchases?f=veku, src/components/veku-folder.tsx). Data only.
-- A veku is a suppliers row (material_type 'ভেকু'); hours worked are purchases (item_name 'ভেকু',
-- unit 'ঘণ্টা', quantity = hours, unit_price = rate); money handed over is supplier_payments with a
-- note "<kind> · চালক: <name> · …".

-- the driver-named account becomes ভেকু ১, and ভেকু ২ is added
update public.suppliers set name = 'ভেকু ১', note = 'আগে "মাসুম (ভেকু ড্রাইভার)" নামে ছিল'
where id = '36df2a34-60d8-4d4c-b2be-97be6633a2bf' and material_type = 'ভেকু';

insert into public.suppliers (name, material_type)
select 'ভেকু ২', 'ভেকু'
where not exists (select 1 from public.suppliers where material_type = 'ভেকু' and name = 'ভেকু ২');

-- the money given (৳৪৪,৫০০ from the khata) was also written as a bill of the same amount; the bill
-- now comes from hours, so those bills are emptied (hours to be added later) and hidden by the folder
update public.purchases
set total_amount = 0, quantity = 0, unit_price = 0, unit = 'ঘণ্টা', note = 'খালি — আগে টাকার সমান বিল ছিল'
where supplier_id = '36df2a34-60d8-4d4c-b2be-97be6633a2bf' and item_name = 'ভেকু';

-- payment notes: kind · driver · source
update public.supplier_payments p
set note = case
  when p.note like 'মাসুম ভেকু খরচ%' then 'চালকের খরচ · চালক: মাসুম · খাতা থেকে, পৃষ্ঠা ৫'
  when p.note like 'মাসুম ভেকু বেতন%' then 'চালকের বেতন · চালক: মাসুম · খাতা থেকে, পৃষ্ঠা ৯'
  when p.note like 'ভেকু মবিল ও গ্রীজ%' then 'মবিল-গ্রীজ · খাতা থেকে, পৃষ্ঠা ৯'
  when p.note like 'মাসুম ভেকু গ্রীজ গান%' then 'মবিল-গ্রীজ · চালক: মাসুম · গ্রীজ গান · খাতা থেকে, পৃষ্ঠা ৯'
  when p.note like 'ভেকুর গ্রীজ গান%' then 'মবিল-গ্রীজ · গ্রীজ গান · খাতা থেকে, পৃষ্ঠা ১১'
  when p.note like 'ভেকুর পাইপ%' then 'যন্ত্রাংশ · পাইপ · খাতা থেকে, পৃষ্ঠা ১১'
  when p.note like 'মাসুম ভেকু ডিজেল%' then 'ডিজেল · চালক: মাসুম · খাতা থেকে, পৃষ্ঠা ১১'
  else p.note end
where p.supplier_id = '36df2a34-60d8-4d4c-b2be-97be6633a2bf';

-- Follow-up (run separately): the emptying above also caught a bill entered on 2026-10-19 (9 hours);
-- its hours were put back (quantity = 9) and its rate is set from the owner's answer.
