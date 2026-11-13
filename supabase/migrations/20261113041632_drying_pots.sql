-- Drying beds (পট). Freshly moulded bricks are laid on the ground in beds of about 1,100-1,500;
-- every mill has its own beds numbered 1, 2, 3 … and each bed is counted while it dries.
--   drying_pots: a mill's beds (mill_id, pot_no), admin sets them up
--   pot_counts:  one bed's count on a day (with an optional photo in the pot-photos bucket)
--   pot_days:    the mill-day production line the database keeps from those counts
-- The database itself keeps one kacha_brick_entries 'production' line per mill per day equal to
-- the sum of that day's bed counts (sardar = the mill's sardar, rate = production_rates on the
-- day), so a manager who may only insert kacha entries still gets the total right, and the
-- sardar's wage, stock, the P&L and the AI read it like any other production line.

create table if not exists public.drying_pots (
  id uuid primary key default gen_random_uuid(),
  mill_id uuid not null references public.mills(id) on delete cascade,
  pot_no integer not null check (pot_no between 1 and 500),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (mill_id, pot_no)
);

create table if not exists public.pot_counts (
  id uuid primary key default gen_random_uuid(),
  pot_id uuid not null references public.drying_pots(id) on delete cascade,
  count_date date not null,
  quantity integer not null check (quantity > 0 and quantity <= 20000),
  photo_path text,
  note text,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (pot_id, count_date)
);
create index if not exists pot_counts_date_idx on public.pot_counts (count_date);

create table if not exists public.pot_days (
  mill_id uuid not null references public.mills(id) on delete cascade,
  count_date date not null,
  kacha_entry_id uuid not null references public.kacha_brick_entries(id) on delete cascade,
  primary key (mill_id, count_date)
);

-- ------------------------------------------------------------------ the mill-day line
create or replace function private.sync_pot_day(p_mill uuid, p_date date, p_user uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total integer;
  v_entry uuid;
  v_rate numeric;
  v_sardar uuid;
begin
  if p_mill is null or p_date is null then
    return null;
  end if;
  select coalesce(sum(pc.quantity), 0) into v_total
    from public.pot_counts pc
    join public.drying_pots dp on dp.id = pc.pot_id
   where dp.mill_id = p_mill and pc.count_date = p_date;

  select pd.kacha_entry_id into v_entry
    from public.pot_days pd
   where pd.mill_id = p_mill and pd.count_date = p_date;

  if v_total = 0 then
    if v_entry is not null then
      delete from public.kacha_brick_entries where id = v_entry;
    end if;
    delete from public.pot_days where mill_id = p_mill and count_date = p_date;
    return null;
  end if;

  if v_entry is null then
    select m.sardar_id into v_sardar from public.mills m where m.id = p_mill;
    select pr.rate into v_rate
      from public.production_rates pr
     where pr.kind = 'production' and pr.effective_from <= p_date
     order by pr.effective_from desc
     limit 1;
    v_rate := coalesce(v_rate, 0);
    insert into public.kacha_brick_entries (entry_date, entry_type, mill_id, sardar_id, quantity, rate, amount, note, created_by)
    values (p_date, 'production', p_mill, v_sardar, v_total, v_rate, round(v_total / 1000.0 * v_rate), 'পটের হিসাব থেকে', p_user)
    returning id into v_entry;
    insert into public.pot_days (mill_id, count_date, kacha_entry_id)
    values (p_mill, p_date, v_entry)
    on conflict (mill_id, count_date) do update set kacha_entry_id = excluded.kacha_entry_id;
  else
    -- the line keeps its own rate and sardar (an admin may have changed them)
    update public.kacha_brick_entries
       set quantity = v_total, amount = round(v_total / 1000.0 * rate)
     where id = v_entry;
  end if;
  return v_entry;
end
$$;

create or replace function private.pot_counts_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mill uuid;
  v_old_mill uuid;
begin
  if tg_op in ('INSERT', 'UPDATE') then
    select dp.mill_id into v_mill from public.drying_pots dp where dp.id = new.pot_id;
    perform private.sync_pot_day(v_mill, new.count_date, coalesce(auth.uid(), new.created_by));
  end if;
  if tg_op in ('UPDATE', 'DELETE') then
    select dp.mill_id into v_old_mill from public.drying_pots dp where dp.id = old.pot_id;
    if tg_op = 'DELETE' or v_old_mill is distinct from v_mill or old.count_date <> new.count_date then
      perform private.sync_pot_day(v_old_mill, old.count_date, coalesce(auth.uid(), old.created_by));
    end if;
  end if;
  return null;
end
$$;

drop trigger if exists trg_pot_counts_sync on public.pot_counts;
create trigger trg_pot_counts_sync
  after insert or update or delete on public.pot_counts
  for each row execute function private.pot_counts_sync();

drop trigger if exists trg_pot_counts_updated on public.pot_counts;
create trigger trg_pot_counts_updated
  before update on public.pot_counts
  for each row execute function public.update_updated_at_column();

drop trigger if exists zz_audit_row_change on public.pot_counts;
create trigger zz_audit_row_change
  after update or delete on public.pot_counts
  for each row execute function private.audit_row_change();

-- the app can ask for a mill-day line again (e.g. after an admin deleted it)
create or replace function public.sync_pot_day(_mill uuid, _date date)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  if not private.has_any_role(auth.uid()) then
    raise exception 'অনুমতি নেই';
  end if;
  return private.sync_pot_day(_mill, _date, auth.uid());
end
$$;

revoke all on function private.sync_pot_day(uuid, date, uuid) from public, anon, authenticated;
revoke all on function private.pot_counts_sync() from public, anon, authenticated;
revoke all on function public.sync_pot_day(uuid, date) from public, anon;
grant execute on function public.sync_pot_day(uuid, date) to authenticated;

-- ------------------------------------------------------------------ RLS
alter table public.drying_pots enable row level security;
alter table public.pot_counts enable row level security;
alter table public.pot_days enable row level security;

create policy "pots read" on public.drying_pots
  for select to authenticated using (private.has_any_role(auth.uid()));
create policy "pots admin write" on public.drying_pots
  for all to authenticated using (private.is_admin(auth.uid())) with check (private.is_admin(auth.uid()));

create policy "pot counts read" on public.pot_counts
  for select to authenticated using (private.has_any_role(auth.uid()));
create policy "pot counts add" on public.pot_counts
  for insert to authenticated
  with check (private.has_any_role(auth.uid()) and created_by = auth.uid());
-- the counter may fix their own count for 12 hours; an admin any time
create policy "pot counts change" on public.pot_counts
  for update to authenticated
  using (private.is_admin(auth.uid()) or (created_by = auth.uid() and created_at > now() - interval '12 hours'))
  with check (private.is_admin(auth.uid()) or created_by = auth.uid());
create policy "pot counts remove" on public.pot_counts
  for delete to authenticated
  using (private.is_admin(auth.uid()) or (created_by = auth.uid() and created_at > now() - interval '12 hours'));

create policy "pot days read" on public.pot_days
  for select to authenticated using (private.has_any_role(auth.uid()));

revoke all on public.drying_pots, public.pot_counts, public.pot_days from anon;
grant select, insert, update, delete on public.drying_pots, public.pot_counts to authenticated;
grant select on public.pot_days to authenticated;
grant all on public.drying_pots, public.pot_counts, public.pot_days to service_role;

-- ------------------------------------------------------------------ photos (for checking, and later for teaching a model)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pot-photos', 'pot-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "pot photos read" on storage.objects
  for select to authenticated using (bucket_id = 'pot-photos' and private.has_any_role(auth.uid()));
create policy "pot photos add" on storage.objects
  for insert to authenticated with check (bucket_id = 'pot-photos' and private.has_any_role(auth.uid()));
create policy "pot photos remove" on storage.objects
  for delete to authenticated using (bucket_id = 'pot-photos' and private.is_admin(auth.uid()));
