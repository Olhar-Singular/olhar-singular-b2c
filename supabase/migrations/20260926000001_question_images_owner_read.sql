-- =============================================================================
-- question-images: stop anyone from enumerating the bucket.
--
-- 20260522000000 added "public_read_question_images" (SELECT TO public, whole
-- bucket) believing <img src> needed it. It does not: the bucket is public, and
-- the Storage API serves /object/public/... without consulting RLS. What the
-- policy did grant was the list endpoint, to anon and every user, over every
-- object; the top-level folder of each path is the uploader's user id.
--
-- Read paths on this bucket in the app (src/): only getPublicUrl() (a URL built
-- client-side, rendered as <img src> and fetched by the exports). No list(),
-- download() or createSignedUrl(). Uploads are INSERT (no upsert).
--
-- The replacement is owner-scoped rather than nothing, same shape as
-- read_own_pdfs: delete_own_question_images only reaches rows its caller can
-- SELECT (the Storage API deletes with DELETE ... RETURNING), so without an
-- owner SELECT policy the owner could no longer remove their own figures.
-- =============================================================================

DROP POLICY IF EXISTS "public_read_question_images" ON storage.objects;

CREATE POLICY "read_own_question_images"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'question-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
