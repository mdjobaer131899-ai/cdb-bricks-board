DROP POLICY IF EXISTS "Creators can update their pending entries" ON public.sales_entries;
CREATE POLICY "Creators can update their pending entries"
ON public.sales_entries
FOR UPDATE
TO authenticated
USING (auth.uid() = created_by AND status = 'pending'::sale_status)
WITH CHECK (auth.uid() = created_by AND status = 'pending'::sale_status);

DROP POLICY IF EXISTS "Users can create their own sales entries" ON public.sales_entries;
CREATE POLICY "Users can create their own sales entries"
ON public.sales_entries
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = created_by AND private.has_any_role(auth.uid()));