-- =============================================================================
-- pgTAP: consume_credits, the single point that debits, across two buckets
-- -----------------------------------------------------------------------------
-- Order: plan bucket first (only while plan_period_end is in the future), then
-- extras. Exempt accounts consume nothing but still leave a delta-0 ledger row
-- so the statement shows usage. deduct_credits keeps its signature and payload
-- (success / error / balance / new_balance) as a thin wrapper, so chat and the
-- older callers work unchanged.
-- =============================================================================
BEGIN;
SELECT plan(28);

INSERT INTO auth.users (id, email) VALUES
  ('c1000000-0000-0000-0000-000000000001', 'plan@test.com'),
  ('c1000000-0000-0000-0000-000000000002', 'expired@test.com'),
  ('c1000000-0000-0000-0000-000000000003', 'exempt@test.com'),
  ('c1000000-0000-0000-0000-000000000004', 'poor@test.com'),
  ('c1000000-0000-0000-0000-000000000005', 'extras@test.com');

-- Active plan with 10 credits + 20 extras.
UPDATE public.profiles SET plan_credits = 10, plan_period_end = now() + interval '20 days', credit_balance = 20
 WHERE id = 'c1000000-0000-0000-0000-000000000001';
-- Expired plan: 10 dead plan credits + 20 extras.
UPDATE public.profiles SET plan_credits = 10, plan_period_end = now() - interval '1 day', credit_balance = 20
 WHERE id = 'c1000000-0000-0000-0000-000000000002';
-- Exempt: nothing to debit.
UPDATE public.profiles SET access_kind = 'exempt', plan_credits = 0, credit_balance = 0
 WHERE id = 'c1000000-0000-0000-0000-000000000003';
-- Poor: 2 plan + 2 extras.
UPDATE public.profiles SET plan_credits = 2, plan_period_end = now() + interval '20 days', credit_balance = 2
 WHERE id = 'c1000000-0000-0000-0000-000000000004';
-- Extras only (legacy).
UPDATE public.profiles SET access_kind = 'legacy', credit_balance = 30
 WHERE id = 'c1000000-0000-0000-0000-000000000005';

-- ── plan first, then extras (10 plan + 20 extras, cost 12 → 0 plan, 18 extras) ─
CREATE TEMP TABLE r_mixed AS
  SELECT public.consume_credits('c1000000-0000-0000-0000-000000000001'::uuid, 12, 'adapt', NULL) AS res;

SELECT is((SELECT res->>'mode' FROM r_mixed), 'charged', 'mixed: charged');
SELECT is((SELECT (res->>'plan_charged')::int FROM r_mixed), 10, 'mixed: the plan bucket is drained first');
SELECT is((SELECT (res->>'extra_charged')::int FROM r_mixed), 2, 'mixed: the remainder comes from extras');
SELECT is((SELECT (res->>'plan_balance')::int FROM r_mixed), 0, 'mixed: plan balance reported');
SELECT is((SELECT (res->>'extra_balance')::int FROM r_mixed), 18, 'mixed: extra balance reported');
SELECT is((SELECT (res->>'new_balance')::int FROM r_mixed), 18, 'mixed: new_balance is the total left (compat)');
SELECT results_eq(
  $$ SELECT plan_credits, credit_balance FROM public.profiles WHERE id = 'c1000000-0000-0000-0000-000000000001' $$,
  $$ VALUES (0, 18) $$,
  'mixed: both buckets persisted');
SELECT results_eq(
  $$ SELECT bucket, delta FROM public.credit_transactions
      WHERE user_id = 'c1000000-0000-0000-0000-000000000001' AND type = 'adapt' ORDER BY bucket $$,
  $$ VALUES ('extra'::text, -2), ('plan'::text, -10) $$,
  'mixed: one ledger row per bucket touched');

-- ── expired plan is ignored (only extras count) ─────────────────────────────
CREATE TEMP TABLE r_expired AS
  SELECT public.consume_credits('c1000000-0000-0000-0000-000000000002'::uuid, 5, 'chat', NULL) AS res;

SELECT is((SELECT (res->>'plan_charged')::int FROM r_expired), 0, 'expired: nothing comes from the dead plan bucket');
SELECT is((SELECT (res->>'extra_charged')::int FROM r_expired), 5, 'expired: extras pay the whole cost');
SELECT is((SELECT (res->>'plan_balance')::int FROM r_expired), 0, 'expired: plan balance reports 0 available');
SELECT is(
  (SELECT plan_credits FROM public.profiles WHERE id = 'c1000000-0000-0000-0000-000000000002'),
  10, 'expired: the dead plan credits are left untouched (lazy expiry)');
SELECT is(
  (SELECT count(*)::int FROM public.credit_transactions
     WHERE user_id = 'c1000000-0000-0000-0000-000000000002' AND type = 'chat'),
  1, 'expired: a single extras ledger row');

-- ── exempt: no debit, delta-0 ledger row ────────────────────────────────────
CREATE TEMP TABLE r_exempt AS
  SELECT public.consume_credits('c1000000-0000-0000-0000-000000000003'::uuid, 12, 'adapt', NULL) AS res;

SELECT is((SELECT res->>'mode' FROM r_exempt), 'exempt', 'exempt: mode exempt');
SELECT is((SELECT (res->>'plan_charged')::int + (res->>'extra_charged')::int FROM r_exempt), 0, 'exempt: nothing charged');
SELECT results_eq(
  $$ SELECT bucket, delta FROM public.credit_transactions
      WHERE user_id = 'c1000000-0000-0000-0000-000000000003' AND type = 'adapt' $$,
  $$ VALUES ('exempt'::text, 0) $$,
  'exempt: usage is still recorded with a delta-0 row');

-- ── insufficient: totals reported, nothing moves ────────────────────────────
CREATE TEMP TABLE r_poor AS
  SELECT public.consume_credits('c1000000-0000-0000-0000-000000000004'::uuid, 5, 'adapt', NULL) AS res;

SELECT is((SELECT res->>'success' FROM r_poor), 'false', 'poor: refused');
SELECT is((SELECT res->>'error' FROM r_poor), 'insufficient_credits', 'poor: insufficient_credits');
SELECT is((SELECT (res->>'balance')::int FROM r_poor), 4, 'poor: balance echoes the total available (compat)');
SELECT results_eq(
  $$ SELECT plan_credits, credit_balance FROM public.profiles WHERE id = 'c1000000-0000-0000-0000-000000000004' $$,
  $$ VALUES (2, 2) $$,
  'poor: nothing was debited');

-- ── legacy (extras only) ────────────────────────────────────────────────────
CREATE TEMP TABLE r_legacy AS
  SELECT public.consume_credits('c1000000-0000-0000-0000-000000000005'::uuid, 5, 'extract', NULL) AS res;
SELECT is((SELECT (res->>'extra_charged')::int FROM r_legacy), 5, 'legacy: extras pay');
SELECT is((SELECT (res->>'new_balance')::int FROM r_legacy), 25, 'legacy: total left');

-- ── guards preserved ────────────────────────────────────────────────────────
SELECT throws_ok(
  $$ SELECT public.consume_credits('c1000000-0000-0000-0000-000000000001'::uuid, 0, 'adapt', NULL) $$,
  'amount must be positive', 'consume: rejects a non-positive amount');
SELECT throws_ok(
  $$ SELECT public.consume_credits('c1000000-0000-0000-0000-000000000001'::uuid, 1, 'bogus', NULL) $$,
  'invalid type', 'consume: rejects a type outside the allowlist');
SELECT is(
  (SELECT public.consume_credits('99999999-9999-9999-9999-999999999999'::uuid, 1, 'adapt', NULL) ->> 'error'),
  'user_not_found', 'consume: unknown user');

-- ── deduct_credits is a thin wrapper with the old payload ───────────────────
CREATE TEMP TABLE r_wrap AS
  SELECT public.deduct_credits('c1000000-0000-0000-0000-000000000005'::uuid, 5, 'chat') AS res;
SELECT is((SELECT res->>'success' FROM r_wrap), 'true', 'deduct_credits wrapper: success');
SELECT is((SELECT (res->>'new_balance')::int FROM r_wrap), 20, 'deduct_credits wrapper: new_balance is the total');

-- ── ACL ─────────────────────────────────────────────────────────────────────
SELECT ok(
  NOT has_function_privilege('authenticated', 'public.consume_credits(uuid, integer, text, uuid)', 'EXECUTE'),
  'authenticated cannot EXECUTE consume_credits');

SELECT * FROM finish();
ROLLBACK;
