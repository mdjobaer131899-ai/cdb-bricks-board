CREATE TABLE public.book_marks (
  entry_key text PRIMARY KEY,
  page integer,
  checked boolean NOT NULL DEFAULT false,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.book_marks TO authenticated;
GRANT ALL ON public.book_marks TO service_role;
ALTER TABLE public.book_marks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bm_all" ON public.book_marks FOR ALL TO authenticated USING (private.has_any_role(auth.uid())) WITH CHECK (private.has_any_role(auth.uid()));
CREATE TRIGGER trg_bm_updated BEFORE UPDATE ON public.book_marks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();