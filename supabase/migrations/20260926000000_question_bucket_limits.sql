-- =============================================================================
-- Size and content-type limits on the question-bank storage buckets.
--
-- question-pdfs (20260421000001) and question-images (20260522000000) were
-- created with no file_size_limit and no allowed_mime_types, so the only checks
-- lived in the client. Anyone holding a JWT can call the Storage API directly:
-- upload up to the project-wide ceiling, with any content type. On the PUBLIC
-- question-images bucket that includes script-capable types (image/svg+xml,
-- text/html) served from the project's own domain.
--
-- The Storage API enforces both columns on every upload, for every role.
--
-- How the declared type is chosen matters: supabase-js sends a Blob/File body
-- as multipart and IGNORES the `contentType` upload option; the stored type is
-- the Blob's own `type`. So the lists below come from the Blob types each call
-- site really produces, not from the `contentType: "image/png"` they pass.
--
-- question-pdfs  (QuestionBankPage.handleFileSelect)
--   * File from <input type=file>, sent as-is. The client rejects > 10 MiB and
--     anything whose magic bytes are not PDF/DOCX, but its `type` comes from the
--     browser/OS: application/pdf or the DOCX type, and an empty type when the
--     platform has no mapping, which the multipart encoder sends as
--     application/octet-stream. That fallback stays allowed because the call
--     site ignores the upload error: a rejection would silently leave a
--     pdf_uploads row pointing at a missing file. It is safe here: the bucket
--     is private (owner-only read) and browsers never render octet-stream.
--   * 10 MiB = the client cap (10 * 1024 * 1024).
--
-- question-images  (QuestionBankPage save paths, QuestionForm,
-- ManualQuestionEditor, lib/utils/imageUpload -> Adaptar extraction and the
-- ImageNodeView re-crop). Every body is dataUrlToBlob(dataUrl), typed by the
-- data URL:
--   * image/png  : canvas crops (autoCropFromBbox, PdfPreviewModal).
--   * image/jpeg : uncropped PDF page renders (pdf-utils, toDataURL jpeg).
--   * png/jpeg/gif/bmp/tiff : DOCX-embedded figures (mammoth; emf/wmf are
--     dropped client-side).
--   * png/jpeg/webp/gif : manual picks (file input accept list, <= 5 MB).
--   * No SVG, no HTML, no wildcard: the bucket is public.
--   * 10 MiB: manual picks are capped at 5 MB, but DOCX figures are bounded
--     only by the 10 MB document cap and full-page PNG crops of a scale-2
--     render are not capped at all, so 5 MiB could reject legitimate figures.
-- =============================================================================

UPDATE storage.buckets
   SET file_size_limit    = 10485760,
       allowed_mime_types = ARRAY[
         'application/pdf',
         'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
         'application/octet-stream'
       ]
 WHERE id = 'question-pdfs';

UPDATE storage.buckets
   SET file_size_limit    = 10485760,
       allowed_mime_types = ARRAY[
         'image/png',
         'image/jpeg',
         'image/webp',
         'image/gif',
         'image/bmp',
         'image/tiff'
       ]
 WHERE id = 'question-images';

-- Fail loudly instead of silently configuring nothing if a bucket is missing.
DO $check$
BEGIN
  IF (SELECT count(*) FROM storage.buckets
       WHERE id IN ('question-pdfs', 'question-images')
         AND file_size_limit IS NOT NULL
         AND allowed_mime_types IS NOT NULL) <> 2 THEN
    RAISE EXCEPTION 'question-pdfs / question-images buckets not found or not configured';
  END IF;
END
$check$;
