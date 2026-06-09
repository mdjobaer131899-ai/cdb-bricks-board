
REVOKE EXECUTE ON FUNCTION public.block_closed_month_collections() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.block_closed_month_expenses() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.block_closed_month_sales() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.is_month_closed(date) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.post_raw_material_journal() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.post_vehicle_expense_journal() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.post_worker_payment_journal() FROM authenticated;
