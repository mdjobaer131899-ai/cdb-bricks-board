-- One name for the electricity bill: the cash book wrote "বিদ্যুৎ বিল" while the purchases
-- catalog item was "কারেন্ট বিল", so a bill entered from the cash book never showed on the
-- purchases page. Keep "বিদ্যুৎ বিল" (the owner's choice) in both places.
-- Only names change; amounts and dates are untouched, so hand cash and profit/loss stay the same.

update public.raw_materials
set name = 'বিদ্যুৎ বিল'
where name = 'কারেন্ট বিল';

update public.expenses
set category = 'বিদ্যুৎ বিল'
where category = 'কারেন্ট বিল';
