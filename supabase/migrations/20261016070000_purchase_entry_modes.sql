-- =========================================================
-- Purchase/expense entry modes per item.
--   pricing:  unit  = quantity (fixed unit) × rate
--             total = lump total only
--             flex  = quantity + unit chosen per entry + rate, or total
--   pay_mode: credit = bought from someone, part can stay due (purchases)
--             cash   = paid in full, no seller, no due (e.g. electricity
--                      bill) -> saved to expenses with category = item name
-- Safe to run more than once.
-- =========================================================

ALTER TABLE public.raw_materials
  ADD COLUMN IF NOT EXISTS pay_mode text NOT NULL DEFAULT 'credit';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'raw_materials_pay_mode_check') THEN
    ALTER TABLE public.raw_materials ADD CONSTRAINT raw_materials_pay_mode_check CHECK (pay_mode IN ('credit', 'cash'));
  END IF;
  ALTER TABLE public.raw_materials DROP CONSTRAINT IF EXISTS raw_materials_pricing_check;
  ALTER TABLE public.raw_materials ADD CONSTRAINT raw_materials_pricing_check CHECK (pricing IN ('unit', 'total', 'flex'));
END $$;

-- Electricity bill: paid in full, no seller
UPDATE public.raw_materials SET pay_mode = 'cash', pricing = 'total', unit = 'মোট'
WHERE normalize(name, NFC) = normalize('কারেন্ট বিল', NFC);

-- Other goods: quantity with a unit chosen at entry time
UPDATE public.raw_materials SET pricing = 'flex', unit = 'পিস'
WHERE normalize(name, NFC) = normalize('অন্যান্য মালামাল', NFC);

-- Vehicle hire / transport: total, paid now, rest due to the vehicle owner.
-- If someone already added "গাড়ি ভাড়া" by hand, rename it instead of duplicating.
UPDATE public.raw_materials
SET name = 'গাড়ি ভাড়া বা যাতায়াত', item_group = 'other', pricing = 'total', pay_mode = 'credit', unit = 'মোট', sort_order = 52
WHERE normalize(name, NFC) = normalize('গাড়ি ভাড়া', NFC)
  AND NOT EXISTS (SELECT 1 FROM public.raw_materials WHERE normalize(name, NFC) = normalize('গাড়ি ভাড়া বা যাতায়াত', NFC));

INSERT INTO public.raw_materials (name, unit, item_group, pricing, pay_mode, buy_pattern, stage, in_brick_cost, sort_order)
VALUES ('গাড়ি ভাড়া বা যাতায়াত', 'মোট', 'other', 'total', 'credit', 'as_needed', 'other', true, 52)
ON CONFLICT (name) DO NOTHING;

-- Keep earlier purchases typed as "গাড়ি ভাড়া" pointing at the renamed item
UPDATE public.purchases p
SET material_id = m.id
FROM public.raw_materials m
WHERE p.material_id IS NULL
  AND normalize(m.name, NFC) = normalize('গাড়ি ভাড়া বা যাতায়াত', NFC)
  AND normalize(trim(p.item_name), NFC) IN (normalize('গাড়ি ভাড়া', NFC), normalize('গাড়ি ভাড়া বা যাতায়াত', NFC));

SELECT 'খরচ এন্ট্রির ধরন তৈরি' AS ফলাফল,
       (SELECT string_agg(name || ' (' || pricing || '/' || pay_mode || ')', ', ' ORDER BY sort_order)
          FROM public.raw_materials WHERE active AND item_group = 'other') AS অন্যান্য;
