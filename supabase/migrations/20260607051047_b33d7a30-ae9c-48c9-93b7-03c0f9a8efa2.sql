
-- 1) AUDIT LOG INTEGRITY: remove direct user INSERT, use SECURITY DEFINER fn
DROP POLICY IF EXISTS "Role users insert own audit" ON public.audit_logs;

CREATE OR REPLACE FUNCTION public.log_audit(
  _action text,
  _entity_type text,
  _entity_id uuid,
  _old_value jsonb DEFAULT NULL,
  _new_value jsonb DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_id uuid;
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR NOT private.has_any_role(v_uid) THEN
    RAISE EXCEPTION 'Not authorized to log audit';
  END IF;
  INSERT INTO public.audit_logs(user_id, action, entity_type, entity_id, old_value, new_value)
  VALUES (v_uid, _action, _entity_type, _entity_id, _old_value, _new_value)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.log_audit(text, text, uuid, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_audit(text, text, uuid, jsonb, jsonb) TO authenticated, service_role;

-- 2) contracts: allow creators to UPDATE only their own contracts while 'active',
-- and lock privileged fields via WITH CHECK
CREATE POLICY "Creators update own contracts"
ON public.contracts
FOR UPDATE
TO authenticated
USING (
  auth.uid() = created_by
  AND private.has_any_role(auth.uid())
  AND status = 'active'
  AND approved_by IS NULL
)
WITH CHECK (
  auth.uid() = created_by
  AND private.has_any_role(auth.uid())
  AND status = 'active'
  AND approved_by IS NULL
);

-- Trigger to prevent creators from changing locked fields
CREATE OR REPLACE FUNCTION public.prevent_contract_field_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
BEGIN
  IF private.is_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status
     OR NEW.approved_by IS DISTINCT FROM OLD.approved_by
     OR NEW.fixed_rate IS DISTINCT FROM OLD.fixed_rate
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.contract_no IS DISTINCT FROM OLD.contract_no
     OR NEW.contract_type IS DISTINCT FROM OLD.contract_type
     OR NEW.customer_id IS DISTINCT FROM OLD.customer_id
  THEN
    RAISE EXCEPTION 'Not allowed to modify protected contract fields';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS contracts_prevent_field_escalation ON public.contracts;
CREATE TRIGGER contracts_prevent_field_escalation
BEFORE UPDATE ON public.contracts
FOR EACH ROW EXECUTE FUNCTION public.prevent_contract_field_escalation();

-- 3) contract_payments: allow creator UPDATE on own records, lock contract_id/amount/created_by
CREATE POLICY "Creators update own payments"
ON public.contract_payments
FOR UPDATE
TO authenticated
USING (
  auth.uid() = created_by
  AND private.has_any_role(auth.uid())
)
WITH CHECK (
  auth.uid() = created_by
  AND private.has_any_role(auth.uid())
);

CREATE OR REPLACE FUNCTION public.prevent_payment_field_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
BEGIN
  IF private.is_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;
  IF NEW.contract_id IS DISTINCT FROM OLD.contract_id
     OR NEW.amount IS DISTINCT FROM OLD.amount
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
  THEN
    RAISE EXCEPTION 'Not allowed to modify protected payment fields';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS contract_payments_prevent_field_escalation ON public.contract_payments;
CREATE TRIGGER contract_payments_prevent_field_escalation
BEFORE UPDATE ON public.contract_payments
FOR EACH ROW EXECUTE FUNCTION public.prevent_payment_field_escalation();
