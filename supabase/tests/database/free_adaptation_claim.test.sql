-- =============================================================================
-- pgTAP: the one free adaptation must survive a failed generation
-- -----------------------------------------------------------------------------
-- adapt-activity claims the free slot BEFORE calling the AI (atomically, so two
-- concurrent requests cannot both run for free). If the generation then fails,
-- the user received nothing and the slot MUST come back — otherwise a brand-new
-- user whose first generation times out loses their free adaptation forever,
-- with no credit to refund and nothing in the UI to notice.
--
-- This exercises the exact statements the edge function runs as service_role:
--   claim   → UPDATE … SET free_adaptation_used = true  WHERE id = ? AND free_adaptation_used = false
--   release → UPDATE … SET free_adaptation_used = false WHERE id = ? AND free_adaptation_used = true
--
-- The mirror-image assertion — that an ordinary authenticated user can NEVER
-- run the release themselves — lives in credit_paywall_guard.test.sql.
-- =============================================================================
BEGIN;
SELECT plan(6);

-- Inserting into auth.users fires handle_new_user(), which creates the matching
-- public.profiles row with free_adaptation_used = false (initial_schema default).
INSERT INTO auth.users (id, email) VALUES
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'free@test.com');

SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SET LOCAL role service_role;

-- ── The claim is atomic: exactly one request can win the free slot ───────────
WITH claim AS (
  UPDATE public.profiles SET free_adaptation_used = true
    WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
      AND free_adaptation_used = false RETURNING 1)
SELECT is((SELECT count(*)::int FROM claim), 1,
  'first request claims the free adaptation');

WITH claim AS (
  UPDATE public.profiles SET free_adaptation_used = true
    WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
      AND free_adaptation_used = false RETURNING 1)
SELECT is((SELECT count(*)::int FROM claim), 0,
  'a second request cannot claim the same free adaptation (no double free)');

-- ── Generation failed: the release gives the slot back ──────────────────────
WITH release AS (
  UPDATE public.profiles SET free_adaptation_used = false
    WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
      AND free_adaptation_used = true RETURNING 1)
SELECT is((SELECT count(*)::int FROM release), 1,
  'a failed generation releases the free adaptation back to the user');

SELECT is(
  (SELECT free_adaptation_used FROM public.profiles
     WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  false,
  'the released free slot is persisted as unused');

-- ── The release is idempotent: it can never hand out a slot twice ───────────
-- The refund guard already fires at most once, but the WHERE clause is the
-- second line of defence: a replayed release finds nothing to undo.
WITH release AS (
  UPDATE public.profiles SET free_adaptation_used = false
    WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
      AND free_adaptation_used = true RETURNING 1)
SELECT is((SELECT count(*)::int FROM release), 0,
  'a replayed release affects no row (cannot mint extra free adaptations)');

-- ── After the release the user can genuinely retry for free ─────────────────
WITH claim AS (
  UPDATE public.profiles SET free_adaptation_used = true
    WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
      AND free_adaptation_used = false RETURNING 1)
SELECT is((SELECT count(*)::int FROM claim), 1,
  'the user can retry the first adaptation for free after a failure');

RESET role;

SELECT * FROM finish();
ROLLBACK;
