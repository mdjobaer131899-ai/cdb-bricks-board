
-- 1) Switch reporting views to security_invoker so RLS applies as the caller
ALTER VIEW public.account_balances    SET (security_invoker = on);
ALTER VIEW public.trial_balance       SET (security_invoker = on);
ALTER VIEW public.profit_loss_summary SET (security_invoker = on);

-- 2) Revoke EXECUTE from anon/public on SECURITY DEFINER functions that
--    should never be called directly by clients (trigger functions + internal helpers).
REVOKE EXECUTE ON FUNCTION public.post_sale_journal()        FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.post_expense_journal()     FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.post_collection_journal()  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.contract_autocalc()        FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sales_admin_auto_approve() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.acc(text)                  FROM PUBLIC, anon, authenticated;
