-- A season whose end_date is on/before its start_date makes every season-scoped
-- query (sdb) return nothing, so the whole app looks empty. Block it at the DB.
alter table public.seasons
  add constraint seasons_end_after_start check (end_date > start_date);
