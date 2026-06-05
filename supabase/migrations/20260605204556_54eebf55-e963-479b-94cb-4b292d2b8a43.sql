CREATE OR REPLACE FUNCTION public.prevent_creator_field_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
BEGIN
  IF private.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status
     OR NEW.approved_by IS DISTINCT FROM OLD.approved_by
     OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
     OR NEW.unit_price IS DISTINCT FROM OLD.unit_price
     OR NEW.total_amount IS DISTINCT FROM OLD.total_amount
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
  THEN
    RAISE EXCEPTION 'Not allowed to modify protected fields';
  END IF;

  RETURN NEW;
END;
$$;