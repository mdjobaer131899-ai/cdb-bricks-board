
REVOKE EXECUTE ON FUNCTION public.handle_new_user()                       FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column()              FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_collection_sync()                   FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_sales_entry_sync()                  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_creator_field_escalation()      FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_contract_field_escalation()     FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_payment_field_escalation()      FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_expense_field_escalation()      FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_collection_field_escalation()   FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_contract_no(public.contract_type) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.expire_old_contracts()                  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recompute_contract_delivered(uuid)      FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recompute_customer_advance(uuid)        FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_stock_for_production()             FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_stock_for_sale()                   FROM PUBLIC, anon, authenticated;
