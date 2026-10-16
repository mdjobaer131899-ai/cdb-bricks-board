-- Weather alerts as phone notifications (Web Push) for admins.
-- The Edge Function weather-alerts checks the forecast every 30 minutes (pg_cron + pg_net),
-- sends new signals to the saved subscriptions and logs them so a signal is not repeated.

create extension if not exists pg_net;
create extension if not exists pg_cron;

-- Browser push subscriptions; only admins may save one, each user sees only their own
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_ok_at timestamptz
);
alter table public.push_subscriptions enable row level security;
create policy push_sub_select_own on public.push_subscriptions for select to authenticated using (user_id = auth.uid());
create policy push_sub_insert_admin on public.push_subscriptions for insert to authenticated
  with check (user_id = auth.uid() and private.is_admin(auth.uid()));
create policy push_sub_update_own on public.push_subscriptions for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and private.is_admin(auth.uid()));
create policy push_sub_delete_own on public.push_subscriptions for delete to authenticated using (user_id = auth.uid());
grant select, insert, update, delete on public.push_subscriptions to authenticated;
grant all on public.push_subscriptions to service_role;

-- What was sent, to avoid repeating the same signal
create table if not exists public.weather_alert_log (
  id uuid primary key default gen_random_uuid(),
  signal_key text not null,
  level text not null,
  title text not null,
  sent_at timestamptz not null default now()
);
create index if not exists weather_alert_log_key_idx on public.weather_alert_log (signal_key, sent_at desc);
alter table public.weather_alert_log enable row level security;
create policy weather_alert_log_admin_select on public.weather_alert_log for select to authenticated using (private.is_admin(auth.uid()));
grant select on public.weather_alert_log to authenticated;
grant all on public.weather_alert_log to service_role;

-- Server-only secrets (VAPID keys made by the function itself, cron secret). No policies: only service_role reads it.
create table if not exists public.app_secrets (
  key text primary key,
  value text not null,
  created_at timestamptz not null default now()
);
alter table public.app_secrets enable row level security;
revoke all on public.app_secrets from anon, authenticated;
grant all on public.app_secrets to service_role;

insert into public.app_secrets (key, value)
values ('weather_cron_secret', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
on conflict (key) do nothing;

-- Every 30 minutes: ask the function to check the forecast
select cron.unschedule('weather-alerts') where exists (select 1 from cron.job where jobname = 'weather-alerts');
select cron.schedule(
  'weather-alerts',
  '*/30 * * * *',
  $$
  select net.http_post(
    url := 'https://drmvmjinvofjidaobekt.supabase.co/functions/v1/weather-alerts',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-cron-secret', (select value from public.app_secrets where key = 'weather_cron_secret')
    ),
    body := '{"action":"check"}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);
