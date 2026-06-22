-- =============================================================================
-- pgTAP: Row Level Security on adaptations
-- Confirms owner-based isolation after the M6 canonical reshape:
--   - RLS is enabled
--   - user A sees only their own adaptations
--   - A cannot select / update / delete B's rows
--   - INSERT WITH CHECK enforces user_id = auth.uid()
--   - service_role bypasses RLS entirely
-- Mirrors the structure of rls_policies.test.sql.
-- =============================================================================
BEGIN;
SELECT plan(11);

-- ── Fixtures (created as superuser, bypassing RLS) ───────────────────────────
INSERT INTO auth.users (id, email) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a@test.com'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'b@test.com');

INSERT INTO public.adaptations (id, user_id, title, original_activity, status) VALUES
  ('11111111-1111-1111-1111-111111111111',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A draft', 'atividade A', 'draft'),
  ('22222222-2222-2222-2222-222222222222',
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'B draft', 'atividade B', 'draft');

-- RLS is enabled on adaptations
SELECT is(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.adaptations'::regclass),
  true, 'RLS is enabled on adaptations');

-- ── Act as authenticated user A ──────────────────────────────────────────────
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}',
  true);
SET LOCAL role authenticated;

SELECT is(
  (SELECT count(*)::int FROM public.adaptations),
  1, 'A sees exactly one adaptation (their own)');
SELECT is(
  (SELECT id FROM public.adaptations),
  '11111111-1111-1111-1111-111111111111'::uuid,
  'A sees only their own adaptation row');

-- A cannot select B's row directly (RLS filters it out → 0 rows).
SELECT is(
  (SELECT count(*)::int FROM public.adaptations
     WHERE id = '22222222-2222-2222-2222-222222222222'),
  0, 'A cannot select another user''s adaptation');

-- A cannot update B's row (RLS filters the target out → 0 rows affected).
WITH u AS (
  UPDATE public.adaptations SET title = 'hacked'
    WHERE id = '22222222-2222-2222-2222-222222222222' RETURNING 1)
SELECT is((SELECT count(*)::int FROM u),
  0, 'A cannot update another user''s adaptation');

-- A cannot delete B's row (RLS filters the target out → 0 rows affected).
WITH d AS (
  DELETE FROM public.adaptations
    WHERE id = '22222222-2222-2222-2222-222222222222' RETURNING 1)
SELECT is((SELECT count(*)::int FROM d),
  0, 'A cannot delete another user''s adaptation');

-- A may update their own row.
WITH u AS (
  UPDATE public.adaptations SET status = 'ready'
    WHERE id = '11111111-1111-1111-1111-111111111111' RETURNING 1)
SELECT is((SELECT count(*)::int FROM u),
  1, 'A can update their own adaptation');

-- INSERT WITH CHECK (auth.uid() = user_id): A may insert its own row...
WITH i AS (
  INSERT INTO public.adaptations (user_id, title, original_activity)
  VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A new', 'nova') RETURNING 1)
SELECT is((SELECT count(*)::int FROM i),
  1, 'A can insert an adaptation for themselves');

-- ...but not a row attributed to another user (RLS WITH CHECK → error 42501).
SELECT throws_ok(
  $$ INSERT INTO public.adaptations (user_id, title, original_activity)
     VALUES ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'spoof', 'x') $$,
  '42501', NULL,
  'A cannot insert an adaptation attributed to another user');

RESET role;

-- ── service_role bypasses RLS entirely ───────────────────────────────────────
-- Scope counts to this test's own users so assertions are robust to any other
-- rows already present in the local database.
SET LOCAL role service_role;
SELECT is(
  (SELECT count(*)::int FROM public.adaptations
     WHERE user_id IN ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
                       'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')),
  3, 'service_role sees all test adaptations (2 fixtures + A''s insert)');
SELECT is(
  (SELECT status FROM public.adaptations
     WHERE id = '11111111-1111-1111-1111-111111111111'),
  'ready', 'A''s own update persisted (status = ready)');
RESET role;

SELECT * FROM finish();
ROLLBACK;
