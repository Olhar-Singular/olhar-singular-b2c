-- =============================================================================
-- Question bank and PDF uploads (owner-based, no school_id)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. question_bank
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.question_bank (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  text                text NOT NULL,
  subject             text NOT NULL,
  topic               text,
  difficulty          text DEFAULT 'medio',
  options             jsonb,
  correct_answer      integer,
  resolution          text,
  image_url           text,
  figure_description  text,
  source              text,
  source_file_name    text,
  is_public           boolean DEFAULT false,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

ALTER TABLE public.question_bank ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_questions"
  ON public.question_bank
  FOR ALL
  TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

CREATE TRIGGER update_question_bank_updated_at
  BEFORE UPDATE ON public.question_bank
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

CREATE INDEX IF NOT EXISTS idx_question_bank_created_by ON public.question_bank(created_by);
CREATE INDEX IF NOT EXISTS idx_question_bank_subject     ON public.question_bank(subject);
CREATE INDEX IF NOT EXISTS idx_question_bank_created_at  ON public.question_bank(created_at DESC);


-- ---------------------------------------------------------------------------
-- 2. pdf_uploads
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pdf_uploads (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_name           text NOT NULL,
  file_path           text NOT NULL,
  description         text,
  questions_extracted integer DEFAULT 0,
  credits_spent       integer DEFAULT 0,
  was_free            boolean DEFAULT false,
  uploaded_at         timestamptz DEFAULT now()
);

ALTER TABLE public.pdf_uploads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_pdf_uploads"
  ON public.pdf_uploads
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_pdf_uploads_user_id     ON public.pdf_uploads(user_id);
CREATE INDEX IF NOT EXISTS idx_pdf_uploads_uploaded_at ON public.pdf_uploads(uploaded_at DESC);


-- ---------------------------------------------------------------------------
-- 3. Storage bucket question-pdfs (private)
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
  VALUES ('question-pdfs', 'question-pdfs', false)
  ON CONFLICT (id) DO NOTHING;

CREATE POLICY "upload_own_pdfs"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'question-pdfs'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "read_own_pdfs"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'question-pdfs'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "delete_own_pdfs"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'question-pdfs'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
