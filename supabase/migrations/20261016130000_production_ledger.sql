-- Production ledger: mills, per-thousand rate history, pay-rate history,
-- unload as one sardar entry with grade rows, and the missing brick grades.

-- 1. Brick grades that were missing from brick_types (sales and unload need them)
insert into public.brick_types (name, is_active, default_unit_price)
select v.name, true, 0
from (values ('১ নং ইট'), ('২ নং ইট'), ('পিকেট')) as v(name)
where not exists (select 1 from public.brick_types b where b.name = v.name);

-- 2. Mills (মিল ১-৪) with their current sardar; each kacha entry keeps its own mill and sardar
create table if not exists public.mills (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order integer not null default 0,
  sardar_id uuid references public.sardars(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.mills enable row level security;
create policy mills_select on public.mills for select to authenticated using (private.has_any_role(auth.uid()));
create policy mills_admin_write on public.mills for all to authenticated
  using (private.is_admin(auth.uid())) with check (private.is_admin(auth.uid()));
grant select, insert, update, delete on public.mills to authenticated;
grant all on public.mills to service_role;
create trigger trg_mills_updated before update on public.mills
  for each row execute function public.update_updated_at_column();

insert into public.mills (name, sort_order, sardar_id)
select v.name, v.sort_order,
  (select s.id from public.sardars s where s.name = v.sardar and s.kind = 'mill' order by s.created_at limit 1)
from (values ('মিল ১', 1, 'আজমত'), ('মিল ২', 2, 'ইমাম হোসেন'), ('মিল ৩', 3, 'আজমত'), ('মিল ৪', 4, 'ইমাম হোসেন'))
  as v(name, sort_order, sardar)
on conflict (name) do nothing;

-- 3. kacha_brick_entries: mill, damage reason, and 'unload' as a sardar wage line
alter table public.kacha_brick_entries add column if not exists mill_id uuid references public.mills(id) on delete set null;
alter table public.kacha_brick_entries add column if not exists damage_reason text;
alter table public.kacha_brick_entries drop constraint if exists kacha_brick_entries_entry_type_check;
alter table public.kacha_brick_entries add constraint kacha_brick_entries_entry_type_check
  check (entry_type = any (array['production'::text, 'load'::text, 'unload'::text, 'damage'::text]));
create index if not exists kacha_brick_entries_mill_idx on public.kacha_brick_entries (mill_id);

-- grade rows of one unload belong to its kacha 'unload' entry; deleting it removes them (and their stock)
alter table public.production_entries add column if not exists unload_entry_id uuid
  references public.kacha_brick_entries(id) on delete cascade;
create index if not exists production_entries_unload_idx on public.production_entries (unload_entry_id);

-- 4. Per-thousand rates by step, effective from a date (a new rate never changes old entries)
create table if not exists public.production_rates (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('production', 'load', 'unload')),
  rate numeric not null check (rate >= 0),
  effective_from date not null,
  note text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (kind, effective_from)
);
alter table public.production_rates enable row level security;
create policy production_rates_select on public.production_rates for select to authenticated using (private.has_any_role(auth.uid()));
create policy production_rates_admin_write on public.production_rates for all to authenticated
  using (private.is_admin(auth.uid())) with check (private.is_admin(auth.uid()));
grant select, insert, update, delete on public.production_rates to authenticated;
grant all on public.production_rates to service_role;

-- 5. Wage/salary history: daily wage for daily workers, monthly salary for salaried staff and burn sardars
create table if not exists public.pay_rates (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid references public.workers(id) on delete cascade,
  sardar_id uuid references public.sardars(id) on delete cascade,
  amount numeric not null check (amount >= 0),
  effective_from date not null,
  note text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  check ((worker_id is null) <> (sardar_id is null)),
  unique (worker_id, effective_from),
  unique (sardar_id, effective_from)
);
create index if not exists pay_rates_worker_idx on public.pay_rates (worker_id);
create index if not exists pay_rates_sardar_idx on public.pay_rates (sardar_id);
alter table public.pay_rates enable row level security;
create policy pay_rates_select on public.pay_rates for select to authenticated using (private.has_any_role(auth.uid()));
create policy pay_rates_admin_write on public.pay_rates for all to authenticated
  using (private.is_admin(auth.uid())) with check (private.is_admin(auth.uid()));
grant select, insert, update, delete on public.pay_rates to authenticated;
grant all on public.pay_rates to service_role;

-- seed history from today's values, effective from the join date
insert into public.pay_rates (worker_id, amount, effective_from, note)
select w.id,
  case when w.role = 'daily' then w.daily_wage else w.monthly_salary end,
  coalesce(w.join_date, date '2000-01-01'), 'শুরুর হার'
from public.workers w
where (case when w.role = 'daily' then w.daily_wage else w.monthly_salary end) > 0
on conflict do nothing;

insert into public.pay_rates (sardar_id, amount, effective_from, note)
select s.id, s.monthly_salary, coalesce(s.join_date, date '2000-01-01'), 'শুরুর হার'
from public.sardars s
where s.kind = 'burn' and s.monthly_salary > 0
on conflict do nothing;

-- 6. Save one unload (sardar wage line + grade rows) in a single transaction.
-- Runs as the caller, so RLS still applies (editing needs admin, like other kacha entries).
create or replace function public.save_unload(
  p_id uuid,
  p_date date,
  p_sardar_id uuid,
  p_rate numeric,
  p_note text,
  p_grades jsonb
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
  v_total numeric := 0;
  g jsonb;
begin
  if auth.uid() is null then raise exception 'লগইন প্রয়োজন'; end if;
  select coalesce(sum((x->>'quantity')::numeric), 0) into v_total
  from jsonb_array_elements(coalesce(p_grades, '[]'::jsonb)) x
  where coalesce((x->>'quantity')::numeric, 0) > 0;
  if v_total <= 0 then raise exception 'অন্তত একটি গ্রেডের পরিমাণ দিন'; end if;

  if p_id is not null then
    delete from public.kacha_brick_entries where id = p_id and entry_type = 'unload';
    if not found then raise exception 'এন্ট্রিটি পাওয়া যায়নি বা বদলানোর অনুমতি নেই'; end if;
  end if;

  insert into public.kacha_brick_entries (id, entry_date, entry_type, sardar_id, quantity, rate, amount, note, created_by)
  values (coalesce(p_id, gen_random_uuid()), p_date, 'unload', p_sardar_id, v_total, coalesce(p_rate, 0),
          round(v_total / 1000 * coalesce(p_rate, 0)), nullif(p_note, ''), auth.uid())
  returning id into v_id;

  for g in select * from jsonb_array_elements(p_grades) loop
    if coalesce((g->>'quantity')::numeric, 0) > 0 then
      insert into public.production_entries (production_date, brick_type_id, quantity, notes, labor_cost, created_by, unload_entry_id)
      values (p_date, (g->>'brick_type_id')::uuid, (g->>'quantity')::numeric, nullif(p_note, ''), 0, auth.uid(), v_id);
    end if;
  end loop;
  return v_id;
end $$;

revoke all on function public.save_unload(uuid, date, uuid, numeric, text, jsonb) from public, anon;
grant execute on function public.save_unload(uuid, date, uuid, numeric, text, jsonb) to authenticated;
