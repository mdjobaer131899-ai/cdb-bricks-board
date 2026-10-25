-- Last season's brick advance (opening_balances kind customer_brick_due) is owed in bricks at
-- the price agreed then: ৳16,000 a truck of 2000 = ৳8 a piece. unit_rate keeps that price per
-- piece, and the summary view turns the money into pieces (total_qty, remaining_qty).
-- A challan against such an advance always takes that price (trigger below), and it settles
-- only the old advance: the customer's current account (customers.advance_balance and the
-- app's other customer balances) no longer counts it, so it is not taken off twice.

alter table public.opening_balances
  add column if not exists unit_rate numeric check (unit_rate is null or unit_rate > 0);

create or replace view public.opening_balance_summary
with (security_invoker = true) as
select ob.id,
    ob.kind,
    ob.customer_id,
    ob.sardar_id,
    ob.worker_id,
    ob.party_name,
    ob.category,
    ob.amount,
    ob.fiscal_year,
    ob.as_of_date,
    ob.note,
    ob.created_at,
    coalesce(c.name, s.name, w.name, ob.party_name) as display_name,
    coalesce(p.paid, 0::numeric) + coalesce(sa.adjusted, 0::numeric) as paid_amount,
    ob.amount - coalesce(p.paid, 0::numeric) - coalesce(sa.adjusted, 0::numeric) as remaining_amount,
    coalesce(p.paid, 0::numeric) as payments_amount,
    coalesce(sa.adjusted, 0::numeric) as sales_adjusted,
    coalesce(sa.adjusted_qty::numeric, 0::numeric) as sales_adjusted_qty,
    ob.unit_rate,
    case when ob.unit_rate > 0 then round(ob.amount / ob.unit_rate) end as total_qty,
    case when ob.unit_rate > 0
      then round((ob.amount - coalesce(p.paid, 0::numeric) - coalesce(sa.adjusted, 0::numeric)) / ob.unit_rate)
    end as remaining_qty
   from public.opening_balances ob
     left join public.customers c on c.id = ob.customer_id
     left join public.sardars s on s.id = ob.sardar_id
     left join public.workers w on w.id = ob.worker_id
     left join ( select opening_payments.opening_balance_id,
            sum(opening_payments.amount) as paid
           from public.opening_payments
          group by opening_payments.opening_balance_id) p on p.opening_balance_id = ob.id
     left join ( select se.opening_balance_id,
            sum(se.total_amount) as adjusted,
            sum(se.quantity) as adjusted_qty
           from public.sales_entries se
          where se.opening_balance_id is not null and se.status <> 'rejected'::sale_status
          group by se.opening_balance_id) sa on sa.opening_balance_id = ob.id;

grant select on public.opening_balance_summary to authenticated;

-- a challan against last season's advance always takes that advance's price per piece
create or replace function public.lock_opening_rate()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_rate numeric;
begin
  if new.opening_balance_id is null then
    return new;
  end if;
  select unit_rate into v_rate from public.opening_balances where id = new.opening_balance_id;
  if coalesce(v_rate, 0) > 0 and coalesce(new.quantity, 0) > 0 then
    new.unit_price := v_rate;
    new.total_amount := round(new.quantity * v_rate, 2);
  end if;
  return new;
end
$$;

-- BEFORE triggers run in name order: this one must come after trg_sales_admin_auto_approve
-- and after sales_entries_prevent_escalation (which compares a manager's edit with the old row)
create trigger trg_zz_lock_opening_rate
  before insert or update on public.sales_entries
  for each row execute function public.lock_opening_rate();

-- the customer's current account: challans against last season's advance are left out
create or replace function public.recompute_customer_advance(_customer_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_credits numeric := 0; v_debits numeric := 0;
begin
  if _customer_id is null then return; end if;
  select coalesce(sum(amount), 0) into v_credits from public.collections where customer_id = _customer_id;
  select coalesce(sum(total_amount), 0) into v_debits from public.sales_entries
   where customer_id = _customer_id and status = 'approved' and sale_type <> 'advance'
     and opening_balance_id is null;
  update public.customers set advance_balance = greatest(v_credits - v_debits, 0) where id = _customer_id;
end
$$;

select public.recompute_customer_advance(id) from public.customers;

-- every customer advance from last season was taken at ৳16,000 a truck of 2000 bricks
update public.opening_balances set unit_rate = 8
 where kind = 'customer_brick_due' and unit_rate is null;
