ALTER TABLE public.workers
  ADD COLUMN IF NOT EXISTS monthly_salary numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS join_date date;