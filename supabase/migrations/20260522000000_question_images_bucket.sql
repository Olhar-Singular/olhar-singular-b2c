-- =============================================================================
-- Storage bucket question-images (public read, owner write)
-- Stores AI-cropped figure images attached to question_bank rows.
-- =============================================================================

INSERT INTO storage.buckets (id, name, public)
  VALUES ('question-images', 'question-images', true)
  ON CONFLICT (id) DO NOTHING;

-- Authenticated users can upload images into their own folder
CREATE POLICY "upload_own_question_images"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'question-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Anyone can read (bucket is public, needed for <img src="...">)
CREATE POLICY "public_read_question_images"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'question-images');

-- Owner can delete their own images
CREATE POLICY "delete_own_question_images"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'question-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
