
-- 1. Drop duplicate public.has_role (private.has_role is the canonical one used in policies)
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated, service_role;
DROP FUNCTION IF EXISTS public.has_role(uuid, public.app_role);

-- 2. Helper: has_any_role (admin or manager) in private schema
CREATE OR REPLACE FUNCTION private.has_any_role(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id)
$$;

REVOKE ALL ON FUNCTION private.has_any_role(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.has_any_role(uuid) TO authenticated, service_role;

-- 3. Profiles: restrict SELECT to own row OR admin
DROP POLICY IF EXISTS "Authenticated can view profiles" ON public.profiles;
CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT TO authenticated
  USING (auth.uid() = id OR private.has_role(auth.uid(), 'admin'::public.app_role));

-- 4. Customers: restrict SELECT to users with an assigned role (admin or manager)
DROP POLICY IF EXISTS "Authenticated can view customers" ON public.customers;
CREATE POLICY "Staff can view customers"
  ON public.customers FOR SELECT TO authenticated
  USING (private.has_any_role(auth.uid()));
