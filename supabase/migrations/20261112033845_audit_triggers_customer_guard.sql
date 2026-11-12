-- 1) Audit log that actually gets written. log_audit() is not callable by signed-in users
--    (revoked earlier, so the app's calls fail quietly). Instead the database itself records
--    every change and delete of a money row, with who did it and the row before/after.
--    A failure to log never blocks the change itself.
-- 2) customers: a manager may still add and edit customers, but only an admin can delete one,
--    and nobody but the database's own recompute (or an admin) can change advance_balance.

create or replace function private.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  begin
    insert into public.audit_logs (user_id, action, entity_type, entity_id, old_value, new_value)
    values (
      auth.uid(),
      lower(tg_op),
      tg_table_name,
      ((case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end) ->> 'id')::uuid,
      to_jsonb(old),
      case when tg_op = 'UPDATE' then to_jsonb(new) end
    );
  exception when others then
    null; -- logging must never stop a money entry
  end;
  return null;
end;
$$;

revoke all on function private.audit_row_change() from public, anon, authenticated;

do $$
declare
  t text;
begin
  foreach t in array array[
    'collections', 'expenses', 'sales_entries', 'sardar_payments', 'worker_payments',
    'supplier_payments', 'purchases', 'owner_transactions', 'loans', 'loan_payments',
    'opening_balances', 'opening_payments', 'kacha_brick_entries', 'production_entries',
    'cash_transfers', 'cash_day_closes', 'customers'
  ] loop
    execute format('drop trigger if exists zz_audit_row_change on public.%I', t);
    execute format(
      'create trigger zz_audit_row_change after update or delete on public.%I
         for each row execute function private.audit_row_change()', t);
  end loop;
end;
$$;

-- advance_balance is the database's own sum (recompute_customer_advance, SECURITY DEFINER,
-- runs as its owner). A direct API update by a non-admin keeps the old value.
create or replace function private.guard_customer_advance()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if current_user = 'authenticated' and not private.is_admin(auth.uid()) then
    new.advance_balance := old.advance_balance;
  end if;
  return new;
end;
$$;

revoke all on function private.guard_customer_advance() from public, anon, authenticated;

drop trigger if exists guard_customer_advance on public.customers;
create trigger guard_customer_advance before update on public.customers
  for each row execute function private.guard_customer_advance();

-- deleting a customer is for the admin only ("Admins can manage customers" covers it)
drop policy if exists "Staff can delete customers" on public.customers;
