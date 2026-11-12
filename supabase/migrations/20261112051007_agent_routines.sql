-- The assistant's daily routines. At a set time the app asks for the day's routine work
-- (today's attendance at 3 pm, kacha bricks, closing the day, a loan falling due) with a phone
-- notification, until it is done. agent_routines holds each routine's time and on/off switch;
-- agent_checkins records the days a routine was done when the data alone cannot tell
-- (a day where every daily worker came leaves no attendance row).

create table if not exists public.agent_routines (
  kind text primary key check (kind in ('attendance', 'kacha', 'day_close', 'loans')),
  enabled boolean not null default true,
  at_time time not null,
  updated_by uuid,
  updated_at timestamptz not null default now()
);

insert into public.agent_routines (kind, at_time) values
  ('attendance', '15:00'),
  ('kacha', '18:00'),
  ('day_close', '20:00'),
  ('loans', '09:00')
on conflict (kind) do nothing;

alter table public.agent_routines enable row level security;

create policy "role can read routines" on public.agent_routines
  for select to authenticated using (private.has_any_role(auth.uid()));
create policy "admin can change routines" on public.agent_routines
  for update to authenticated using (private.is_admin(auth.uid())) with check (private.is_admin(auth.uid()));

revoke all on public.agent_routines from anon;
grant select, update on public.agent_routines to authenticated;
grant all on public.agent_routines to service_role;

create table if not exists public.agent_checkins (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('attendance', 'kacha', 'day_close', 'loans')),
  check_date date not null,
  done_by uuid not null default auth.uid(),
  done_at timestamptz not null default now(),
  note text,
  unique (kind, check_date)
);

alter table public.agent_checkins enable row level security;

create policy "role can read checkins" on public.agent_checkins
  for select to authenticated using (private.has_any_role(auth.uid()));
create policy "role can check a day" on public.agent_checkins
  for insert to authenticated with check (done_by = auth.uid() and private.has_any_role(auth.uid()));
create policy "admin can undo a checkin" on public.agent_checkins
  for delete to authenticated using (private.is_admin(auth.uid()));

revoke all on public.agent_checkins from anon;
grant select, insert, delete on public.agent_checkins to authenticated;
grant all on public.agent_checkins to service_role;

-- Every 30 minutes (at :05 and :35, away from the weather run): the function sends what is due
select cron.unschedule('kiln-routines') where exists (select 1 from cron.job where jobname = 'kiln-routines');
select cron.schedule(
  'kiln-routines',
  '5,35 * * * *',
  $$
  select net.http_post(
    url := 'https://drmvmjinvofjidaobekt.supabase.co/functions/v1/kiln-routines',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-cron-secret', (select value from public.app_secrets where key = 'weather_cron_secret')
    ),
    body := '{"action":"check"}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);
