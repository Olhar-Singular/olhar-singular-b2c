-- =============================================================================
-- pgTAP: storage.objects RLS on the public question-images bucket
--
-- A public bucket serves /object/public/... without consulting RLS, so the
-- <img src> the app renders never needed a SELECT policy. The old catch-all
-- "public_read_question_images" (SELECT TO public) only added one thing: the
-- list endpoint, letting anyone enumerate every object, whose top-level folder
-- is the uploader's user id. The contract proven here: nobody but the owner
-- can list/read an object row, the owner still sees their own folder (which
-- also keeps delete_own_question_images working: DELETE only reaches rows its
-- caller can SELECT), and uploads stay confined to the caller's own folder.
-- =============================================================================
BEGIN;
SELECT plan(8);

-- ── Fixtures (as postgres): one figure in each user's folder ─────────────────
INSERT INTO storage.objects (bucket_id, name) VALUES
  ('question-images', 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1/fig-a.png'),
  ('question-images', 'b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2/fig-b.png');

-- storage.protect_delete refuses direct DELETEs unless this is set; the Storage
-- API sets it. Needed here to exercise the DELETE policies themselves.
SELECT set_config('storage.allow_delete_query', 'true', true);

SELECT is(
  (SELECT count(*)::int FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND cmd IN ('SELECT', 'ALL')
      AND roles && ARRAY['public', 'anon']::name[]
      AND qual LIKE '%question-images%'),
  0, 'no SELECT policy opens question-images objects to anon/public');

-- ── anon: cannot enumerate the bucket ────────────────────────────────────────
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
SET LOCAL role anon;

SELECT is(
  (SELECT count(*)::int FROM storage.objects WHERE bucket_id = 'question-images'),
  0, 'anon cannot list any question-images object');

RESET role;

-- ── B: another authenticated user ────────────────────────────────────────────
SELECT set_config('request.jwt.claims',
  '{"sub":"b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2","role":"authenticated"}', true);
SET LOCAL role authenticated;

SELECT is(
  (SELECT count(*)::int FROM storage.objects
    WHERE bucket_id = 'question-images'
      AND name LIKE 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1/%'),
  0, 'another user cannot list the owner''s folder');

SELECT throws_ok(
  $$ INSERT INTO storage.objects (bucket_id, name)
     VALUES ('question-images', 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1/planted.png') $$,
  '42501', NULL,
  'another user cannot upload into the owner''s folder');

WITH d AS (
  DELETE FROM storage.objects
   WHERE bucket_id = 'question-images'
     AND name = 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1/fig-a.png' RETURNING 1)
SELECT is((SELECT count(*)::int FROM d), 0,
  'another user cannot delete the owner''s figure');

RESET role;

-- ── A: the owner ─────────────────────────────────────────────────────────────
SELECT set_config('request.jwt.claims',
  '{"sub":"a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1","role":"authenticated"}', true);
SET LOCAL role authenticated;

SELECT is(
  (SELECT array_agg(name) FROM storage.objects WHERE bucket_id = 'question-images'),
  ARRAY['a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1/fig-a.png'],
  'the owner lists exactly their own folder');

SELECT lives_ok(
  $$ INSERT INTO storage.objects (bucket_id, name)
     VALUES ('question-images', 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1/new.png') $$,
  'the owner can still upload into their own folder');

WITH d AS (
  DELETE FROM storage.objects
   WHERE bucket_id = 'question-images'
     AND name = 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1/fig-a.png' RETURNING 1)
SELECT is((SELECT count(*)::int FROM d), 1,
  'the owner can still delete their own figure');

RESET role;

SELECT * FROM finish();
ROLLBACK;
