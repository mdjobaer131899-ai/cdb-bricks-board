-- =========================================================
-- Purchase item catalog: raw materials + other goods in one list
-- (engine parts, electricity bill, ...). Each item says whether it is
-- bought by quantity × rate or as a lump total. Staff may add new items.
-- Safe to run more than once.
-- =========================================================

ALTER TABLE public.raw_materials
  ADD COLUMN IF NOT EXISTS item_group text NOT NULL DEFAULT 'raw',   -- raw | other
  ADD COLUMN IF NOT EXISTS pricing text NOT NULL DEFAULT 'unit';     -- unit | total

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'raw_materials_item_group_check') THEN
    ALTER TABLE public.raw_materials ADD CONSTRAINT raw_materials_item_group_check CHECK (item_group IN ('raw', 'other'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'raw_materials_pricing_check') THEN
    ALTER TABLE public.raw_materials ADD CONSTRAINT raw_materials_pricing_check CHECK (pricing IN ('unit', 'total'));
  END IF;
END $$;

-- Common non-raw items (kept if they already exist)
INSERT INTO public.raw_materials (name, unit, item_group, pricing, buy_pattern, stage, in_brick_cost, sort_order) VALUES
  ('ইঞ্জিন মালামাল', 'মোট', 'other', 'total', 'as_needed', 'other', true, 50),
  ('কারেন্ট বিল',    'মোট', 'other', 'total', 'as_needed', 'other', true, 51),
  ('অন্যান্য মালামাল', 'মোট', 'other', 'total', 'as_needed', 'other', true, 99)
ON CONFLICT (name) DO NOTHING;

-- Tag earlier purchases typed with one of these names
UPDATE public.purchases p
SET material_id = m.id
FROM public.raw_materials m
WHERE p.material_id IS NULL
  AND normalize(trim(p.item_name), NFC) = normalize(m.name, NFC);

-- Managers can add new item names (edit/delete stays admin-only via rm_admin_write)
DROP POLICY IF EXISTS "rm_staff_insert" ON public.raw_materials;
CREATE POLICY "rm_staff_insert" ON public.raw_materials
  FOR INSERT TO authenticated
  WITH CHECK (private.has_any_role(auth.uid()));

SELECT 'মালামালের তালিকা তৈরি' AS ফলাফল,
       (SELECT count(*) FROM public.raw_materials WHERE active AND item_group = 'raw') AS কাঁচামাল,
       (SELECT count(*) FROM public.raw_materials WHERE active AND item_group = 'other') AS অন্যান্য;
