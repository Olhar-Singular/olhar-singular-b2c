-- =============================================================================
-- pgTAP: Row Level Security on profiles and credit_transactions
-- Confirms owner-based isolation: an authenticated user only ever sees/touches
-- their own rows, the ledger is immutable, and service_role bypasses RLS.
-- =============================================================================
BEGIN;
SELECT plan(12);

-- ── Fixtures (created as superuser, bypassing RLS) ───────────────────────────
INSERT INTO auth.users (id, email) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a@test.com'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'b@test.com');

INSERT INTO public.credit_transactions (user_id, delta, type) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 10, 'signup_bonus'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 10, 'signup_bonus');

-- RLS is enabled on both tables
SELECT is(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.profiles'::regclass),
  true, 'RLS is enabled on profiles');
SELECT is(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.credit_transactions'::regclass),
  true, 'RLS is enabled on credit_transactions');

-- ── Act as authenticated user A ──────────────────────────────────────────────
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}',
  true);
SET LOCAL role authenticated;

SELECT is(
  (SELECT count(*)::int FROM public.profiles),
  1, 'A sees exactly one profile (their own)');
SELECT is(
  (SELECT id FROM public.profiles),
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
  'A sees only their own profile row');
SELECT is(
  (SELECT count(*)::int FROM public.credit_transactions),
  1, 'A sees exactly one ledger row (their own)');

-- A cannot mutate B's profile (RLS filters the target out → 0 rows).
-- The data-modifying CTE must sit at the top level of the statement.
WITH u AS (
  UPDATE public.profiles SET full_name = 'hacked'
    WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' RETURNING 1)
SELECT is((SELECT count(*)::int FROM u),
  0, 'A cannot update another user''s profile');

-- The ledger is immutable: no UPDATE / DELETE policy → 0 rows affected
WITH u AS (
  UPDATE public.credit_transactions SET delta = 9999
    WHERE user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' RETURNING 1)
SELECT is((SELECT count(*)::int FROM u),
  0, 'credit_transactions cannot be updated (immutable ledger)');

WITH d AS (
  DELETE FROM public.credit_transactions
    WHERE user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' RETURNING 1)
SELECT is((SELECT count(*)::int FROM d),
  0, 'credit_transactions cannot be deleted (immutable ledger)');

-- INSERT policy WITH CHECK (auth.uid() = user_id): A may insert its own row...
WITH i AS (
  INSERT INTO public.credit_transactions (user_id, delta, type)
  VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 1, 'adapt') RETURNING 1)
SELECT is((SELECT count(*)::int FROM i),
  1, 'A can insert a ledger row for themselves');

-- ...but not a row attributed to another user (RLS WITH CHECK → error 42501).
SELECT throws_ok(
  $$ INSERT INTO public.credit_transactions (user_id, delta, type)
     VALUES ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 1, 'adapt') $$,
  '42501', NULL,
  'A cannot insert a ledger row attributed to another user');

RESET role;

-- ── service_role bypasses RLS entirely ───────────────────────────────────────
-- Scope the counts to this test's own users so the assertions are robust to any
-- other data already persisted in the local database (RLS would otherwise hide
-- it from A above, but service_role sees everything).
SET LOCAL role service_role;
SELECT is(
  (SELECT count(*)::int FROM public.profiles
     WHERE id IN ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
                  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')),
  2, 'service_role sees both test profiles (RLS bypassed)');
-- 3 rows: the 2 signup_bonus fixtures + the row A inserted for itself above.
SELECT is(
  (SELECT count(*)::int FROM public.credit_transactions
     WHERE user_id IN ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
                       'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')),
  3, 'service_role sees all test ledger rows (RLS bypassed)');
RESET role;

SELECT * FROM finish();
ROLLBACK;
