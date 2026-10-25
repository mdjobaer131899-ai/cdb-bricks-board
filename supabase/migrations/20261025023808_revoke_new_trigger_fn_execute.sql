-- lock_opening_rate and sync_cash_sale_collection are trigger functions only; nobody needs to
-- call them through the API (security advisor 0028/0029). Triggers still fire for every user.
revoke execute on function public.lock_opening_rate() from public, anon, authenticated;
revoke execute on function public.sync_cash_sale_collection() from public, anon, authenticated;
