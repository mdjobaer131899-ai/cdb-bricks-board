-- When a loan must be paid back (or a loan given is due back). Optional; the loans page,
-- the dues page and the admin dashboard flag loans whose date is near or past.
-- RLS stays as it is: staff add loans, admins edit them.
alter table public.loans
  add column if not exists due_date date;
