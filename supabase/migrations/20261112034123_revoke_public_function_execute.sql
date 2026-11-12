-- Security advisor findings (2026-11-12):
-- * next_challan_number could be called without signing in, so anyone could burn challan
--   numbers (audit 2026-10-16, item 14). Signed-in users keep it: the challan form calls it.
-- * trigger functions were exposed as RPC endpoints. A trigger never needs EXECUTE to fire,
--   so nobody calls them directly.

revoke execute on function public.next_challan_number(date, text) from public, anon;
grant execute on function public.next_challan_number(date, text) to authenticated;

revoke execute on function public.assign_sales_entry_challan_no() from public, anon, authenticated;
revoke execute on function public.post_contract_payment_journal() from public, anon, authenticated;
revoke execute on function public.post_opening_payment_journal() from public, anon, authenticated;
revoke execute on function public.sync_delivery_to_sales() from public, anon, authenticated;
