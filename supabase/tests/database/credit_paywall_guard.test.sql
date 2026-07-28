-- =============================================================================
-- pgTAP: paywall-bypass hardening (money columns + credit RPCs)
-- -----------------------------------------------------------------------------
-- Closes two direct-PostgREST bypasses of the whole credit paywall:
--
--   Vector 1 — auto-grant via RPC. grant_credits / deduct_credits are
--   SECURITY DEFINER and, without an explicit REVOKE, are executable by anon +
--   authenticated (Supabase grants EXECUTE to PUBLIC by default). A user could
--   POST /rest/v1/rpc/grant_credits and mint themselves an infinite balance.
--
--   Vector 2 — self-edit of the money columns. The "Users can update their own
--   profile" policy has no column restriction, and every column is GRANTed to
--   authenticated, so a user could PATCH /rest/v1/profiles?id=eq.<me> setting
--   credit_balance / free_adaptation_used / free_extraction_used arbitrarily.
--
-- Legit paths that MUST stay intact are asserted too: the webhooks + edge
-- functions call the RPCs and touch the money columns as service_role, and the
-- owner can still edit non-money profile columns (e.g. full_name).
-- =============================================================================
BEGIN;
SELECT plan(12);

-- ── Fixtures (created as superuser: empty JWT claims ⇒ guard trigger allows) ──
-- Inserting into auth.users fires handle_new_user(), which auto-creates the
-- matching public.profiles row; we then set deterministic money-column values.
INSERT INTO auth.users (id, email) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a@test.com');

UPDATE public.profiles
   SET credit_balance       = 50,
       free_adaptation_used = true,
       free_extraction_used = true
 WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

-- ═══════════════════════════════════════════════════════════════════════════
-- Vector 1 — credit RPCs are NOT executable by anon / authenticated
-- ═══════════════════════════════════════════════════════════════════════════

-- ── As authenticated user A ──────────────────────────────────────────────────
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}',
  true);
SET LOCAL role authenticated;

SELECT throws_ok(
  $$ SELECT public.grant_credits(
       'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 1000000, 'purchase') $$,
  '42501', NULL,
  'authenticated cannot EXECUTE grant_credits (self auto-grant blocked)');

SELECT throws_ok(
  $$ SELECT public.deduct_credits(
       'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 1, 'adapt') $$,
  '42501', NULL,
  'authenticated cannot EXECUTE deduct_credits');

RESET role;

-- ── As anon ──────────────────────────────────────────────────────────────────
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
SET LOCAL role anon;

SELECT throws_ok(
  $$ SELECT public.grant_credits(
       'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 1000000, 'purchase') $$,
  '42501', NULL,
  'anon cannot EXECUTE grant_credits');

SELECT throws_ok(
  $$ SELECT public.deduct_credits(
       'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 1, 'adapt') $$,
  '42501', NULL,
  'anon cannot EXECUTE deduct_credits');

RESET role;

-- ═══════════════════════════════════════════════════════════════════════════
-- Vector 2 — owner cannot mutate their own money columns
-- ═══════════════════════════════════════════════════════════════════════════

-- ── As authenticated user A ──────────────────────────────────────────────────
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}',
  true);
SET LOCAL role authenticated;

SELECT throws_ok(
  $$ UPDATE public.profiles SET credit_balance = 999999
       WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$,
  'not authorized to change credit fields',
  'authenticated cannot inflate their own credit_balance');

SELECT throws_ok(
  $$ UPDATE public.profiles SET free_adaptation_used = false
       WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$,
  'not authorized to change credit fields',
  'authenticated cannot reset their own free_adaptation_used');

SELECT throws_ok(
  $$ UPDATE public.profiles SET free_extraction_used = false
       WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$,
  'not authorized to change credit fields',
  'authenticated cannot reset their own free_extraction_used');

-- ...but a non-money column (full_name) is still editable by the owner.
WITH u AS (
  UPDATE public.profiles SET full_name = 'Nova Maria'
    WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' RETURNING 1)
SELECT is((SELECT count(*)::int FROM u), 1,
  'authenticated CAN still update non-money profile columns (full_name)');

RESET role;

-- ── As anon: the row must be untouchable, whichever layer says no ────────────
-- WHICH layer blocks it depends on how the database was provisioned, so the
-- assertion must not name one. On a database created by a current Supabase
-- image (CI's `supabase db start`) anon holds NO grant on profiles — the
-- UPDATE raises 42501 before RLS is ever consulted. On a legacy database
-- (local, prod) anon still carries the old default UPDATE grant, and RLS
-- filters every row instead, affecting 0 rows without raising. Asserting
-- either mechanism alone makes the suite pass in one environment and fail in
-- the other, so assert the OUTCOME: the money column is unchanged.
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
SET LOCAL role anon;

DO $anon_update$
BEGIN
  UPDATE public.profiles SET credit_balance = 999999
    WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
EXCEPTION WHEN insufficient_privilege THEN
  -- Blocked at the grant layer. Swallowed so the outer transaction survives;
  -- the assertion below is what actually decides the test.
  NULL;
END
$anon_update$;

RESET role;

SELECT is(
  (SELECT credit_balance FROM public.profiles
     WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  50,
  'anon cannot change any profile row (money column untouched)');

-- ═══════════════════════════════════════════════════════════════════════════
-- Legit service_role paths stay intact (webhooks, edge-fn free-first + deduct)
-- ═══════════════════════════════════════════════════════════════════════════
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SET LOCAL role service_role;

CREATE TEMP TABLE svc_grant AS
  SELECT public.grant_credits(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 5, 'purchase') AS res;
SELECT is((SELECT res->>'success' FROM svc_grant), 'true',
  'service_role can still EXECUTE grant_credits (webhook path intact)');

-- service_role may write the money columns directly (edge-fn free-first claim).
WITH u AS (
  UPDATE public.profiles
     SET free_adaptation_used = false, credit_balance = 123
     WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' RETURNING 1)
SELECT is((SELECT count(*)::int FROM u), 1,
  'service_role can still mutate money columns directly');
SELECT is(
  (SELECT credit_balance FROM public.profiles
     WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  123,
  'service_role money-column write persists');

RESET role;

SELECT * FROM finish();
ROLLBACK;
