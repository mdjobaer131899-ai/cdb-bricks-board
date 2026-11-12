-- The assistant's morning summary and reminders.
-- 1. A new routine 'morning' (08:00): a phone notification that opens the assistant on
--    yesterday's money, hand cash and today's work (the app builds the summary).
-- 2. agent_reminders: "কাল সকাল ১০টায় রহিমকে টাকা দিতে মনে করিয়ে দিও". The Edge Function
--    kiln-routines pushes each one to its writer's phone when remind_at has come (sent_at),
--    and the assistant marks it done (done_at) when the user says so.

alter table public.agent_routines drop constraint if exists agent_routines_kind_check;
alter table public.agent_routines add constraint agent_routines_kind_check
  check (kind in ('attendance', 'kacha', 'day_close', 'loans', 'morning'));

alter table public.agent_checkins drop constraint if exists agent_checkins_kind_check;
alter table public.agent_checkins add constraint agent_checkins_kind_check
  check (kind in ('attendance', 'kacha', 'day_close', 'loans', 'morning'));

insert into public.agent_routines (kind, at_time) values ('morning', '08:00')
on conflict (kind) do nothing;

create table if not exists public.agent_reminders (
  id uuid primary key default gen_random_uuid(),
  body text not null check (char_length(btrim(body)) between 1 and 300),
  remind_at timestamptz not null,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  done_at timestamptz
);

create index if not exists agent_reminders_due_idx on public.agent_reminders (remind_at) where sent_at is null;

alter table public.agent_reminders enable row level security;

-- a reminder belongs to the one who set it; an admin sees all of them
create policy "read own reminders" on public.agent_reminders
  for select to authenticated
  using (created_by = auth.uid() or private.is_admin(auth.uid()));
create policy "add own reminders" on public.agent_reminders
  for insert to authenticated
  with check (created_by = auth.uid() and private.has_any_role(auth.uid()));
create policy "change own reminders" on public.agent_reminders
  for update to authenticated
  using (created_by = auth.uid()) with check (created_by = auth.uid());
create policy "delete own reminders" on public.agent_reminders
  for delete to authenticated
  using (created_by = auth.uid() or private.is_admin(auth.uid()));

revoke all on public.agent_reminders from anon;
grant select, insert, update, delete on public.agent_reminders to authenticated;
grant all on public.agent_reminders to service_role;
