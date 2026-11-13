-- A mill-day line made from bed counts while no production rate was set has rate 0; once a
-- rate exists for that day, the next count picks it up. A line with a rate keeps its own.
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

  select pr.rate into v_rate
    from public.production_rates pr
   where pr.kind = 'production' and pr.effective_from <= p_date
   order by pr.effective_from desc
   limit 1;
  v_rate := coalesce(v_rate, 0);

  if v_entry is null then
    select m.sardar_id into v_sardar from public.mills m where m.id = p_mill;
    insert into public.kacha_brick_entries (entry_date, entry_type, mill_id, sardar_id, quantity, rate, amount, note, created_by)
    values (p_date, 'production', p_mill, v_sardar, v_total, v_rate, round(v_total / 1000.0 * v_rate), 'পটের হিসাব থেকে', p_user)
    returning id into v_entry;
    insert into public.pot_days (mill_id, count_date, kacha_entry_id)
    values (p_mill, p_date, v_entry)
    on conflict (mill_id, count_date) do update set kacha_entry_id = excluded.kacha_entry_id;
  else
    update public.kacha_brick_entries
       set quantity = v_total,
           rate = case when rate = 0 then v_rate else rate end,
           amount = round(v_total / 1000.0 * (case when rate = 0 then v_rate else rate end))
     where id = v_entry;
  end if;
  return v_entry;
end
$$;

revoke all on function private.sync_pot_day(uuid, date, uuid) from public, anon, authenticated;
