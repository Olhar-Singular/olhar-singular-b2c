-- =============================================================================
-- pgTAP: persisted reservation + reconciliation (crash-safe charging), by bucket
-- -----------------------------------------------------------------------------
-- adapt-activity (and now extract-questions) charge BEFORE calling the AI and
-- refund on every failure path, but the refund only runs if the isolate is
-- still alive. A reservation row is written BEFORE the money moves:
--   open     -> the request has charged something and owes an outcome
--   settled  -> the user actually received their result (charge is final)
--   reversed -> the charge was given back (by the request itself or by the job)
--
-- With two buckets the row also records what came from where, and a reversal
-- returns each part to its origin: the plan part only while the same period is
-- still active (otherwise it is dropped, never turned into a perpetual extra).
-- The reservation id doubles as the idempotency key.
-- =============================================================================
BEGIN;
SELECT plan(43);

-- ── Fixtures ────────────────────────────────────────────────────────────────
INSERT INTO auth.users (id, email) VALUES
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'stalepaid@test.com'),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'stalemixed@test.com'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'fresh@test.com'),
  ('f1111111-1111-1111-1111-111111111111', 'mixed@test.com'),
  ('f2222222-2222-2222-2222-222222222222', 'extras@test.com'),
  ('f3333333-3333-3333-3333-333333333333', 'poor@test.com'),
  ('f4444444-4444-4444-4444-444444444444', 'exempt@test.com');

-- mixed: 5 plan credits (active) + 20 extras.
UPDATE public.profiles SET plan_credits = 5, plan_period_end = now() + interval '20 days', credit_balance = 20
 WHERE id = 'f1111111-1111-1111-1111-111111111111';
-- extras only, legacy.
UPDATE public.profiles SET access_kind = 'legacy', credit_balance = 100
 WHERE id = 'f2222222-2222-2222-2222-222222222222';
-- poor: 1 extra.
UPDATE public.profiles SET credit_balance = 1
 WHERE id = 'f3333333-3333-3333-3333-333333333333';
-- exempt.
UPDATE public.profiles SET access_kind = 'exempt'
 WHERE id = 'f4444444-4444-4444-4444-444444444444';
-- stale paid (extras): already debited 12 by a dead isolate (52 -> 40).
UPDATE public.profiles SET access_kind = 'legacy', credit_balance = 40
 WHERE id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
-- stale mixed: dead isolate took 8 from the plan and 4 from extras; period still active.
UPDATE public.profiles SET plan_credits = 2, plan_period_end = date_trunc('day', now()) + interval '10 days', credit_balance = 6
 WHERE id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
-- fresh: a request still running.
UPDATE public.profiles SET credit_balance = 30
 WHERE id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

-- ═══════════════════════════════════════════════════════════════════════════
-- The table and the RPCs are service_role-only, never client-reachable
-- ═══════════════════════════════════════════════════════════════════════════
SELECT has_table('public', 'credit_reservations', 'credit_reservations exists');

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc","role":"authenticated"}', true);
SET LOCAL role authenticated;

SELECT throws_ok(
  $$ SELECT * FROM public.credit_reservations $$,
  '42501', NULL, 'authenticated cannot read credit_reservations');
SELECT throws_ok(
  $$ SELECT public.reconcile_stale_credit_reservations() $$,
  '42501', NULL, 'authenticated cannot EXECUTE the reconciliation job');
SELECT throws_ok(
  $$ SELECT public.open_adapt_reservation(
       '99999999-9999-9999-9999-999999999999'::uuid,
       'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid, 1) $$,
  '42501', NULL, 'authenticated cannot EXECUTE open_adapt_reservation');
SELECT throws_ok(
  $$ SELECT public.open_credit_reservation(
       '99999999-9999-9999-9999-999999999999'::uuid,
       'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid, 1, 'extract') $$,
  '42501', NULL, 'authenticated cannot EXECUTE open_credit_reservation');
SELECT throws_ok(
  $$ SELECT public.reverse_credit_reservation('99999999-9999-9999-9999-999999999999'::uuid) $$,
  '42501', NULL, 'authenticated cannot EXECUTE reverse_credit_reservation');
SELECT throws_ok(
  $$ SELECT public.settle_credit_reservation('99999999-9999-9999-9999-999999999999'::uuid) $$,
  '42501', NULL, 'authenticated cannot EXECUTE settle_credit_reservation');

RESET role;

SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
SET LOCAL role anon;
SELECT throws_ok(
  $$ SELECT public.reconcile_stale_credit_reservations() $$,
  '42501', NULL, 'anon cannot EXECUTE the reconciliation job');
RESET role;

-- ═══════════════════════════════════════════════════════════════════════════
-- As service_role (the edge functions + the scheduled job)
-- ═══════════════════════════════════════════════════════════════════════════
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SET LOCAL role service_role;

-- ── Mixed: the plan pays first, extras cover the rest, the row records both ──
CREATE TEMP TABLE open_mixed AS
  SELECT public.open_adapt_reservation(
    'aa000000-0000-0000-0000-000000000001'::uuid,
    'f1111111-1111-1111-1111-111111111111'::uuid, 12) AS res;

SELECT is((SELECT res->>'mode' FROM open_mixed), 'charged', 'mixed: charged');
SELECT is((SELECT (res->>'plan_charged')::int FROM open_mixed), 5, 'mixed: 5 from the plan');
SELECT is((SELECT (res->>'extra_charged')::int FROM open_mixed), 7, 'mixed: 7 from extras');
SELECT results_eq(
  $$ SELECT credits_charged, plan_charged, extra_charged, kind, state,
            period_end_at_open = (SELECT plan_period_end FROM public.profiles
                                   WHERE id = 'f1111111-1111-1111-1111-111111111111')
       FROM public.credit_reservations WHERE id = 'aa000000-0000-0000-0000-000000000001' $$,
  $$ VALUES (12, 5, 7, 'adapt'::text, 'open'::text, true) $$,
  'mixed: the reservation records both parts and the period it was opened in');
SELECT results_eq(
  $$ SELECT plan_credits, credit_balance FROM public.profiles WHERE id = 'f1111111-1111-1111-1111-111111111111' $$,
  $$ VALUES (0, 13) $$,
  'mixed: both buckets debited');

-- ── Replay: the request_id is the idempotency key ───────────────────────────
CREATE TEMP TABLE open_replay AS
  SELECT public.open_adapt_reservation(
    'aa000000-0000-0000-0000-000000000001'::uuid,
    'f1111111-1111-1111-1111-111111111111'::uuid, 12) AS res;

SELECT is((SELECT res->>'error' FROM open_replay), 'duplicate_request',
  'a replayed request_id is rejected instead of charging twice');
SELECT is(
  (SELECT count(*)::int FROM public.credit_reservations WHERE id = 'aa000000-0000-0000-0000-000000000001'),
  1, 'the replay leaves exactly one reservation');

-- ── Reversing the mixed reservation gives each part back to its bucket ──────
CREATE TEMP TABLE reverse_mixed AS
  SELECT public.reverse_credit_reservation('aa000000-0000-0000-0000-000000000001'::uuid) AS res;

SELECT results_eq(
  $$ SELECT (res->>'reversed')::boolean, (res->>'plan_refunded')::int, (res->>'extra_refunded')::int FROM reverse_mixed $$,
  $$ VALUES (true, 5, 7) $$,
  'mixed reversal: 5 back to the plan, 7 back to extras');
SELECT results_eq(
  $$ SELECT plan_credits, credit_balance FROM public.profiles WHERE id = 'f1111111-1111-1111-1111-111111111111' $$,
  $$ VALUES (5, 20) $$,
  'mixed reversal: both buckets restored');
SELECT results_eq(
  $$ SELECT bucket, delta FROM public.credit_transactions
      WHERE ref_id = 'aa000000-0000-0000-0000-000000000001' AND type = 'refund' ORDER BY bucket $$,
  $$ VALUES ('extra'::text, 7), ('plan'::text, 5) $$,
  'mixed reversal: one refund ledger row per bucket');

-- ── Extract kind, extras only, then settled: settled charges never come back ─
CREATE TEMP TABLE open_extract AS
  SELECT public.open_credit_reservation(
    'aa000000-0000-0000-0000-000000000002'::uuid,
    'f2222222-2222-2222-2222-222222222222'::uuid, 5, 'extract') AS res;

SELECT is((SELECT (res->>'extra_charged')::int FROM open_extract), 5, 'extract: extras pay');
SELECT is(
  (SELECT kind FROM public.credit_reservations WHERE id = 'aa000000-0000-0000-0000-000000000002'),
  'extract', 'extract: the reservation carries its kind');
SELECT is(
  (SELECT public.settle_credit_reservation('aa000000-0000-0000-0000-000000000002'::uuid) ->> 'settled'),
  'true', 'a delivered extraction settles its reservation');
SELECT is(
  (SELECT public.reverse_credit_reservation('aa000000-0000-0000-0000-000000000002'::uuid) ->> 'reversed'),
  'false', 'a settled charge can never be reversed afterwards');
SELECT is(
  (SELECT credit_balance FROM public.profiles WHERE id = 'f2222222-2222-2222-2222-222222222222'),
  95, 'the settled balance is untouched by the attempted reversal');

-- ── Reversal is idempotent ──────────────────────────────────────────────────
CREATE TEMP TABLE open_paid2 AS
  SELECT public.open_adapt_reservation(
    'aa000000-0000-0000-0000-000000000004'::uuid,
    'f2222222-2222-2222-2222-222222222222'::uuid, 8) AS res;
SELECT is(
  (SELECT public.reverse_credit_reservation('aa000000-0000-0000-0000-000000000004'::uuid) ->> 'reversed'),
  'true', 'a failed generation reverses its own reservation');
SELECT is(
  (SELECT public.reverse_credit_reservation('aa000000-0000-0000-0000-000000000004'::uuid) ->> 'reversed'),
  'false', 'a second reversal of the same reservation does nothing');
SELECT is(
  (SELECT credit_balance FROM public.profiles WHERE id = 'f2222222-2222-2222-2222-222222222222'),
  95, 'the repeated reversal does not pay the user twice (95 - 8 + 8)');

-- ── Insufficient: nothing charged, nothing reserved ─────────────────────────
CREATE TEMP TABLE open_poor AS
  SELECT public.open_adapt_reservation(
    'aa000000-0000-0000-0000-000000000003'::uuid,
    'f3333333-3333-3333-3333-333333333333'::uuid, 12) AS res;
SELECT is((SELECT res->>'error' FROM open_poor), 'insufficient_credits', 'poor: refused');
SELECT is(
  (SELECT count(*)::int FROM public.credit_reservations WHERE id = 'aa000000-0000-0000-0000-000000000003'),
  0, 'a refused request leaves no reservation behind (the id stays reusable)');

-- ── Exempt: reserved for idempotency, nothing charged ───────────────────────
CREATE TEMP TABLE open_exempt AS
  SELECT public.open_adapt_reservation(
    'aa000000-0000-0000-0000-000000000005'::uuid,
    'f4444444-4444-4444-4444-444444444444'::uuid, 12) AS res;
SELECT is((SELECT res->>'mode' FROM open_exempt), 'exempt', 'exempt: mode exempt');
SELECT is(
  (SELECT credits_charged FROM public.credit_reservations WHERE id = 'aa000000-0000-0000-0000-000000000005'),
  0, 'exempt: the reservation records a zero charge');
SELECT is(
  (SELECT public.reverse_credit_reservation('aa000000-0000-0000-0000-000000000005'::uuid) ->> 'credits_refunded'),
  '0', 'exempt: reversing refunds nothing');

-- ── A plan part is dropped when the period it came from is over ─────────────
-- f1 has 5 plan credits again; charge 3 from the plan, then end the period.
CREATE TEMP TABLE open_expiring AS
  SELECT public.open_adapt_reservation(
    'aa000000-0000-0000-0000-000000000006'::uuid,
    'f1111111-1111-1111-1111-111111111111'::uuid, 3) AS res;
SELECT is((SELECT (res->>'plan_charged')::int FROM open_expiring), 3, 'expiring: 3 from the plan');
UPDATE public.profiles SET plan_period_end = now() - interval '1 second'
 WHERE id = 'f1111111-1111-1111-1111-111111111111';
CREATE TEMP TABLE reverse_expiring AS
  SELECT public.reverse_credit_reservation('aa000000-0000-0000-0000-000000000006'::uuid) AS res;
SELECT results_eq(
  $$ SELECT (res->>'reversed')::boolean, (res->>'plan_refunded')::int, (res->>'extra_refunded')::int FROM reverse_expiring $$,
  $$ VALUES (true, 0, 0) $$,
  'expiring: the plan part is dropped, never turned into an extra');
SELECT is(
  (SELECT plan_credits FROM public.profiles WHERE id = 'f1111111-1111-1111-1111-111111111111'),
  2, 'expiring: the dead plan bucket is left as it was (5 - 3)');
SELECT is(
  (SELECT count(*)::int FROM public.credit_transactions
     WHERE ref_id = 'aa000000-0000-0000-0000-000000000006' AND type = 'refund' AND bucket = 'plan' AND delta = 0),
  1, 'expiring: the drop is still on the ledger (delta 0)');

-- ═══════════════════════════════════════════════════════════════════════════
-- Reconciliation of reservations whose isolate died
-- ═══════════════════════════════════════════════════════════════════════════
-- Stale + extras (pre-bucket row: only credits_charged filled).
INSERT INTO public.credit_reservations (id, user_id, kind, credits_charged, state, created_at)
VALUES ('11111111-1111-1111-1111-111111111111', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'adapt', 12, 'open',
        now() - interval '1 hour');
-- Stale + mixed (8 plan + 4 extras), same period still active.
INSERT INTO public.credit_reservations
  (id, user_id, kind, credits_charged, plan_charged, extra_charged, period_end_at_open, state, created_at)
VALUES ('22222222-2222-2222-2222-222222222222', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'extract', 12, 8, 4,
        date_trunc('day', now()) + interval '10 days', 'open', now() - interval '1 hour');
-- Still running: opened seconds ago, must be left alone.
INSERT INTO public.credit_reservations (id, user_id, kind, credits_charged, extra_charged, state, created_at)
VALUES ('33333333-3333-3333-3333-333333333333', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'adapt', 5, 5, 'open', now());
-- Delivered: old, but settled.
INSERT INTO public.credit_reservations (id, user_id, kind, credits_charged, extra_charged, state, created_at, settled_at)
VALUES ('44444444-4444-4444-4444-444444444444', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'adapt', 7, 7, 'settled',
        now() - interval '1 hour', now() - interval '1 hour');

SELECT throws_ok(
  $$ INSERT INTO public.credit_reservations (id, user_id, kind, credits_charged)
     VALUES ('11111111-1111-1111-1111-111111111111', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'adapt', 12) $$,
  '23505', NULL, 'a replayed request_id cannot open a second reservation (no double charge)');

CREATE TEMP TABLE recon AS
  SELECT public.reconcile_stale_credit_reservations('10 minutes'::interval) AS res;

SELECT is((SELECT (res->>'reversed')::int FROM recon), 2, 'exactly the two dead reservations were reversed');
SELECT is(
  (SELECT credit_balance FROM public.profiles WHERE id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'),
  52, 'a pre-bucket stale charge is refunded to extras (40 + 12)');
SELECT results_eq(
  $$ SELECT plan_credits, credit_balance FROM public.profiles WHERE id = 'dddddddd-dddd-dddd-dddd-dddddddddddd' $$,
  $$ VALUES (10, 10) $$,
  'a stale mixed charge goes back to both buckets (2 + 8, 6 + 4)');
SELECT is(
  (SELECT state FROM public.credit_reservations WHERE id = '33333333-3333-3333-3333-333333333333'),
  'open', 'a reservation younger than the cutoff is left running');
SELECT is(
  (SELECT count(*)::int FROM public.credit_transactions WHERE ref_id = '44444444-4444-4444-4444-444444444444'),
  0, 'a delivered adaptation is never refunded by the job');

CREATE TEMP TABLE recon2 AS
  SELECT public.reconcile_stale_credit_reservations('10 minutes'::interval) AS res;
SELECT is((SELECT (res->>'reversed')::int FROM recon2), 0, 'a second run reverses nothing');
SELECT is(
  (SELECT credit_balance FROM public.profiles WHERE id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'),
  52, 'balance is unchanged by the repeated run (no double refund)');

RESET role;

SELECT * FROM finish();
ROLLBACK;
