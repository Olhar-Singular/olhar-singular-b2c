-- =============================================================================
-- question-pdfs: drop the application/octet-stream fallback.
--
-- 20260926000000 kept octet-stream allowed because the upload in
-- QuestionBankPage sent the browser's File as-is (empty `type` becomes
-- octet-stream in multipart) and ignored the Storage error, so a rejection
-- would have left a pdf_uploads row pointing at a missing file. The client now
-- (a) re-types the File with the canonical MIME its magic-byte check proved
-- (DOCUMENT_MIME in src/lib/utils/fileValidation.ts) and (b) aborts without a
-- history row when Storage refuses the upload. Only the two real types remain.
-- =============================================================================

UPDATE storage.buckets
   SET allowed_mime_types = ARRAY[
         'application/pdf',
         'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
       ]
 WHERE id = 'question-pdfs';

-- Fail loudly instead of silently configuring nothing if the bucket is missing.
DO $check$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM storage.buckets
     WHERE id = 'question-pdfs'
       AND NOT ('application/octet-stream' = ANY (allowed_mime_types))
  ) THEN
    RAISE EXCEPTION 'question-pdfs bucket not found or still allows octet-stream';
  END IF;
END
$check$;
