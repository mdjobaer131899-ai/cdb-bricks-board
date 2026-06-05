CREATE POLICY "Creators can delete their pending entries"
ON public.sales_entries
FOR DELETE
TO authenticated
USING (auth.uid() = created_by AND status = 'pending'::sale_status);