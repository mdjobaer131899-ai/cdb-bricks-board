
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_creator_field_escalation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_payment_field_escalation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_contract_field_escalation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_collection_field_escalation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_expense_field_escalation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
