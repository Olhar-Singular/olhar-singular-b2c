-- =============================================================================
-- Storage bucket landing (public read; writes only by the service role)
-- Holds the landing page videos so the git repo and the Vercel bundle stay
-- light. No INSERT/UPDATE/DELETE policy on purpose: uploads happen out of band
-- (supabase storage cp with the project's service credentials), never from the
-- browser.
-- Applied to production on 2026-10-26 through the Supabase MCP (same version).
-- =============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES (
    'landing',
    'landing',
    true,
    31457280,
    ARRAY['video/mp4', 'image/webp', 'image/jpeg', 'image/png']
  )
  ON CONFLICT (id) DO UPDATE
    SET public = EXCLUDED.public,
        file_size_limit = EXCLUDED.file_size_limit,
        allowed_mime_types = EXCLUDED.allowed_mime_types;

DO $policy$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'public_read_landing'
  ) THEN
    CREATE POLICY "public_read_landing"
      ON storage.objects FOR SELECT
      TO public
      USING (bucket_id = 'landing');
  END IF;
END
$policy$;
