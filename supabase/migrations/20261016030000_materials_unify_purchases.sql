-- =========================================================
-- CDB Bricks — ধাপ ১: কাঁচামাল কেনাকাটা এক খাতায়
-- Supabase > SQL Editor-এ পুরোটা পেস্ট করে Run চাপুন।
-- দুইবার চালালেও কোনো ক্ষতি নেই।
-- =========================================================

-- ১. কাঁচামালের তালিকায় নতুন তথ্য: কীভাবে কেনা হয়, ইটের খরচে ধরা হবে কিনা
ALTER TABLE public.raw_materials
  ADD COLUMN IF NOT EXISTS buy_pattern text NOT NULL DEFAULT 'as_needed',   -- season | refill | as_needed
  ADD COLUMN IF NOT EXISTS stage text NOT NULL DEFAULT 'other',             -- kacha | burn | other
  ADD COLUMN IF NOT EXISTS in_brick_cost boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 100;

-- ২. সব কেনাকাটা এখন একটাই খাতায় (purchases)। কাঁচামাল হলে কোনটা, তা চিহ্নিত থাকবে।
ALTER TABLE public.purchases
  ADD COLUMN IF NOT EXISTS material_id uuid REFERENCES public.raw_materials(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS legacy_rmp_id uuid UNIQUE;
CREATE INDEX IF NOT EXISTS idx_purchases_material ON public.purchases(material_id, purchase_date);

-- ৩. ছয়টা কাঁচামাল (আগে থাকলে শুধু তথ্য ঠিক করা হয়)
INSERT INTO public.raw_materials (name, unit, buy_pattern, stage, in_brick_cost, sort_order) VALUES
  ('মাটি',   'হাজার ঘনফুট', 'season',    'kacha', true,  1),
  ('বালু',   'ঘনফুট',       'as_needed', 'kacha', true,  2),
  ('কয়লা',  'টন',          'refill',    'burn',  true,  3),
  ('তুষ',    'বস্তা',        'season',    'burn',  true,  4),
  ('ডিজেল',  'লিটার',       'refill',    'kacha', true,  5),
  ('লাকড়ি', 'মণ',          'as_needed', 'other', false, 6)
ON CONFLICT (name) DO UPDATE SET
  unit = EXCLUDED.unit,
  buy_pattern = EXCLUDED.buy_pattern,
  stage = EXCLUDED.stage,
  in_brick_cost = EXCLUDED.in_brick_cost,
  sort_order = EXCLUDED.sort_order,
  active = true;

-- ৪. পুরোনো আলাদা খাতার (raw_material_purchases) কেনাকাটা থাকলে নতুন খাতায় আনা
INSERT INTO public.purchases (purchase_date, supplier_id, item_name, quantity, unit, unit_price, total_amount, note, created_by, material_id, legacy_rmp_id)
SELECT r.purchase_date,
       r.supplier_id,
       m.name,
       r.quantity,
       m.unit,
       r.unit_price,
       r.total_amount,
       concat_ws(' · ', NULLIF(r.supplier_name, ''), r.note),
       COALESCE(r.created_by, (SELECT id FROM auth.users ORDER BY created_at LIMIT 1)),
       r.material_id,
       r.id
FROM public.raw_material_purchases r
JOIN public.raw_materials m ON m.id = r.material_id
WHERE NOT EXISTS (SELECT 1 FROM public.purchases p WHERE p.legacy_rmp_id = r.id);

-- ৫. আগে "মালামাল" পাতায় নাম লিখে কেনা কাঁচামালগুলোও চিনিয়ে দেওয়া (যেমন "কয়লা")
UPDATE public.purchases p
SET material_id = m.id
FROM public.raw_materials m
WHERE p.material_id IS NULL
  AND normalize(trim(p.item_name), NFC) = normalize(m.name, NFC);

SELECT 'ধাপ ১ সম্পন্ন' AS ফলাফল,
       (SELECT count(*) FROM public.raw_materials WHERE active) AS কাঁচামাল,
       (SELECT count(*) FROM public.purchases WHERE material_id IS NOT NULL) AS কাঁচামাল_কেনা;
