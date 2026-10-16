-- Salary stops accruing on the day a monthly-paid worker or a burn sardar leaves.
-- Existing table-level RLS policies and grants cover the new columns.
alter table public.workers add column if not exists leave_date date;
alter table public.sardars add column if not exists leave_date date;

alter table public.workers
  add constraint workers_leave_after_join check (leave_date is null or join_date is null or leave_date >= join_date);
alter table public.sardars
  add constraint sardars_leave_after_join check (leave_date is null or join_date is null or leave_date >= join_date);
