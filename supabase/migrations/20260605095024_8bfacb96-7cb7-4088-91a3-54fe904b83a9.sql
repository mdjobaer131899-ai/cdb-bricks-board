-- Add a column to capture custom brick name when "অন্যান্য" is selected
ALTER TABLE public.sales_entries
  ADD COLUMN IF NOT EXISTS custom_brick_name TEXT;

-- Rename existing brick types to match the new canonical list
UPDATE public.brick_types SET name = '১ নং ইট' WHERE name = '১ নম্বর ইট';
UPDATE public.brick_types SET name = '২ নং ইট' WHERE name = '২ নম্বর ইট';
UPDATE public.brick_types SET name = 'পিকেট'   WHERE name = 'পিকেট ইট';

-- Deactivate types no longer in the canonical list (preserve history)
UPDATE public.brick_types SET is_active = false WHERE name IN ('ঝামা ইট', 'হাফ ইট');

-- Insert the new canonical types if missing
INSERT INTO public.brick_types (name, default_unit_price, is_active)
SELECT v.name, 0, true
FROM (VALUES
  ('১ নং আদলা'),
  ('২ নং আদলা'),
  ('মিক্সার আদলা'),
  ('অন্যান্য')
) AS v(name)
WHERE NOT EXISTS (
  SELECT 1 FROM public.brick_types b WHERE b.name = v.name
);