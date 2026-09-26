-- =============================================================================
-- pgTAP: size and content-type limits on the question-bank storage buckets
--
-- The client caps sizes and checks file types before uploading, but anyone can
-- call the Storage API directly with their own JWT. Without bucket limits the
-- only ceiling is the project-wide one, and any content type is accepted:
-- worst on question-images, which is PUBLIC, where a script-capable type
-- (image/svg+xml, text/html) would be served from the project's own domain.
--
-- The Storage API enforces file_size_limit and allowed_mime_types on every
-- upload, whatever the caller's role. The expected values mirror what the app
-- legitimately sends (see 20260926000000_question_bucket_limits.sql).
-- =============================================================================
BEGIN;
SELECT plan(7);

-- ── question-pdfs (private): exam files for the question-bank extractor ─────
SELECT is(
  (SELECT public FROM storage.buckets WHERE id = 'question-pdfs'),
  false, 'question-pdfs stays private');

SELECT is(
  (SELECT file_size_limit FROM storage.buckets WHERE id = 'question-pdfs'),
  10485760::bigint,
  'question-pdfs caps uploads at 10 MiB (the client limit in QuestionBankPage)');

SELECT is(
  (SELECT array_agg(m ORDER BY m)
     FROM storage.buckets, unnest(allowed_mime_types) AS m
    WHERE id = 'question-pdfs'),
  ARRAY['application/octet-stream',
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  'question-pdfs accepts only PDF, DOCX and the untyped-File fallback');

-- ── question-images (public read): figures attached to question_bank rows ───
SELECT is(
  (SELECT public FROM storage.buckets WHERE id = 'question-images'),
  true, 'question-images stays public (figures are embedded via <img src>)');

SELECT is(
  (SELECT file_size_limit FROM storage.buckets WHERE id = 'question-images'),
  10485760::bigint,
  'question-images caps uploads at 10 MiB');

SELECT is(
  (SELECT array_agg(m ORDER BY m)
     FROM storage.buckets, unnest(allowed_mime_types) AS m
    WHERE id = 'question-images'),
  ARRAY['image/bmp', 'image/gif', 'image/jpeg', 'image/png', 'image/tiff', 'image/webp'],
  'question-images accepts only the raster formats the app produces');

-- Redundant with the exact list above on purpose: whoever widens that list
-- later must still not reopen a script-capable or catch-all type on a public
-- bucket (Storage treats "image/*" as a wildcard, which includes SVG).
SELECT ok(
  NOT (SELECT allowed_mime_types
              && ARRAY['image/svg+xml', 'image/*', '*/*', 'text/html',
                       'application/xhtml+xml', 'application/octet-stream']
         FROM storage.buckets WHERE id = 'question-images'),
  'question-images never accepts SVG, HTML, octet-stream or a wildcard');

SELECT * FROM finish();
ROLLBACK;
