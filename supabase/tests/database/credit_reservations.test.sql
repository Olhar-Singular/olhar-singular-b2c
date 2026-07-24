-- =============================================================================
-- pgTAP: persisted reservation + reconciliation (crash-safe charging)
-- -----------------------------------------------------------------------------
-- adapt-activity charges BEFORE calling the AI and refunds on every failure
-- path — but the refund only runs if the isolate is still alive. The generation
-- loop can reach ~270s (3 attempts × 90s), so a killed/evicted isolate, an OOM
-- or a platform restart between the debit and the refund left the user paying
-- for nothing, with no record anywhere that a charge was ever in flight.
--
-- The fix is a reservation row written BEFORE the money moves:
--   open     → the request has charged something and owes an outcome
--   settled  → the user actually received their adaptation (charge is final)
--   reversed → the charge was given back (by the request itself or by this job)
--
-- Anything still `open` after the longest possible request is, by definition, a
-- charge whose owner died. reconcile_stale_credit_reservations() gives it back.
-- The reservation id doubles as the idempotency key: a replayed request_id
-- cannot charge twice (primary key), and only one actor can ever win the
-- `open → reversed` transition, so the reversal can never double-pay.
-- =============================================================================
BEGIN;
SELECT plan(36);

-- ── Fixtures ────────────────────────────────────────────────────────────────
-- (auth.users inserts must happen here, as superuser: service_role cannot write
-- to the auth schema.)
INSERT INTO auth.users (id, email) VALUES
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'paid@test.com'),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'free@test.com'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'fresh@test.com'),
  ('f1111111-1111-1111-1111-111111111111', 'openfree@test.com'),
  ('f2222222-2222-2222-2222-222222222222', 'openpaid@test.com'),
  ('f3333333-3333-3333-3333-333333333333', 'openpoor@test.com');

-- Fixtures for the open/settle/reverse section below.
UPDATE public.profiles SET credit_balance = 20, free_adaptation_used = false
 WHERE id = 'f1111111-1111-1111-1111-111111111111';
UPDATE public.profiles SET credit_balance = 100, free_adaptation_used = true
 WHERE id = 'f2222222-2222-2222-2222-222222222222';
UPDATE public.profiles SET credit_balance = 1, free_adaptation_used = true
 WHERE id = 'f3333333-3333-3333-3333-333333333333';

-- Paid user: already debited 12 by deduct_credits (52 → 40).
UPDATE public.profiles SET credit_balance = 40, free_adaptation_used = true
 WHERE id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
-- Free user: the free slot was claimed by the request that then died.
UPDATE public.profiles SET credit_balance = 30, free_adaptation_used = true
 WHERE id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
-- Fresh user: a request that is still legitimately running.
UPDATE public.profiles SET credit_balance = 30, free_adaptation_used = true
 WHERE id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

-- ═══════════════════════════════════════════════════════════════════════════
-- The table is service_role-only (edge functions), never client-reachable
-- ═══════════════════════════════════════════════════════════════════════════
SELECT has_table('public', 'credit_reservations', 'credit_reservations exists');

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc","role":"authenticated"}', true);
SET LOCAL role authenticated;

SELECT throws_ok(
  $$ SELECT * FROM public.credit_reservations $$,
  '42501', NULL,
  'authenticated cannot read credit_reservations');

SELECT throws_ok(
  $$ SELECT public.reconcile_stale_credit_reservations() $$,
  '42501', NULL,
  'authenticated cannot EXECUTE the reconciliation job');

-- The whole reservation API moves money: none of it may be client-callable,
-- or a user could open a free reservation or reverse their own paid charge.
SELECT throws_ok(
  $$ SELECT public.open_adapt_reservation(
       '99999999-9999-9999-9999-999999999999'::uuid,
       'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid, 1) $$,
  '42501', NULL,
  'authenticated cannot EXECUTE open_adapt_reservation');

SELECT throws_ok(
  $$ SELECT public.reverse_credit_reservation(
       '99999999-9999-9999-9999-999999999999'::uuid) $$,
  '42501', NULL,
  'authenticated cannot EXECUTE reverse_credit_reservation');

SELECT throws_ok(
  $$ SELECT public.settle_credit_reservation(
       '99999999-9999-9999-9999-999999999999'::uuid) $$,
  '42501', NULL,
  'authenticated cannot EXECUTE settle_credit_reservation');

RESET role;

SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
SET LOCAL role anon;
SELECT throws_ok(
  $$ SELECT public.reconcile_stale_credit_reservations() $$,
  '42501', NULL,
  'anon cannot EXECUTE the reconciliation job');
RESET role;

-- ═══════════════════════════════════════════════════════════════════════════
-- As service_role (the edge functions + the scheduled job)
-- ═══════════════════════════════════════════════════════════════════════════
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SET LOCAL role service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- open_adapt_reservation: reserve AND charge in ONE transaction
-- ---------------------------------------------------------------------------
-- The reservation must be atomic with the money it describes. If the row were
-- written after the debit, a crash in between would leave a charge no job can
-- see; if it were written before, a crash would leave a reservation claiming a
-- debit that never happened, and the job would refund credits never taken.
-- ═══════════════════════════════════════════════════════════════════════════
-- ── Free-first: the first adaptation costs nothing but still reserves ────────
CREATE TEMP TABLE open_free AS
  SELECT public.open_adapt_reservation(
    'aa000000-0000-0000-0000-000000000001'::uuid,
    'f1111111-1111-1111-1111-111111111111'::uuid, 12) AS res;

SELECT is((SELECT res->>'mode' FROM open_free), 'free',
  'the first adaptation opens a free reservation');

SELECT is(
  (SELECT free_adaptation_used FROM public.profiles
     WHERE id = 'f1111111-1111-1111-1111-111111111111'),
  true,
  'opening the reservation claims the free slot in the same transaction');

SELECT is(
  (SELECT free_claimed FROM public.credit_reservations
     WHERE id = 'aa000000-0000-0000-0000-000000000001'),
  true,
  'the reservation records that it was the free slot that was consumed');

SELECT is(
  (SELECT credit_balance FROM public.profiles
     WHERE id = 'f1111111-1111-1111-1111-111111111111'),
  20,
  'a free adaptation does not touch the balance');

-- ── Replay: the request_id is the idempotency key ───────────────────────────
CREATE TEMP TABLE open_replay AS
  SELECT public.open_adapt_reservation(
    'aa000000-0000-0000-0000-000000000001'::uuid,
    'f1111111-1111-1111-1111-111111111111'::uuid, 12) AS res;

SELECT is((SELECT res->>'error' FROM open_replay), 'duplicate_request',
  'a replayed request_id is rejected instead of charging twice');

SELECT is(
  (SELECT count(*)::int FROM public.credit_reservations
     WHERE id = 'aa000000-0000-0000-0000-000000000001'),
  1,
  'the replay leaves exactly one reservation');

-- ── Paid path ───────────────────────────────────────────────────────────────
CREATE TEMP TABLE open_paid AS
  SELECT public.open_adapt_reservation(
    'aa000000-0000-0000-0000-000000000002'::uuid,
    'f2222222-2222-2222-2222-222222222222'::uuid, 12) AS res;

SELECT is((SELECT res->>'mode' FROM open_paid), 'charged',
  'a user who already used their free slot is charged');

SELECT is(
  (SELECT credit_balance FROM public.profiles
     WHERE id = 'f2222222-2222-2222-2222-222222222222'),
  88,
  'the balance is debited by the cost (100 - 12)');

SELECT is(
  (SELECT credits_charged FROM public.credit_reservations
     WHERE id = 'aa000000-0000-0000-0000-000000000002'),
  12,
  'the reservation records exactly what was debited');

-- ── Insufficient credits: nothing charged, nothing reserved ─────────────────
CREATE TEMP TABLE open_poor AS
  SELECT public.open_adapt_reservation(
    'aa000000-0000-0000-0000-000000000003'::uuid,
    'f3333333-3333-3333-3333-333333333333'::uuid, 12) AS res;

SELECT is((SELECT res->>'error' FROM open_poor), 'insufficient_credits',
  'a user without enough credits is refused');

SELECT is(
  (SELECT count(*)::int FROM public.credit_reservations
     WHERE id = 'aa000000-0000-0000-0000-000000000003'),
  0,
  'a refused request leaves no reservation behind (the id stays reusable)');

-- ═══════════════════════════════════════════════════════════════════════════
-- settle / reverse
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Delivered: settling makes the charge final ──────────────────────────────
CREATE TEMP TABLE settle_ok AS
  SELECT public.settle_credit_reservation(
    'aa000000-0000-0000-0000-000000000002'::uuid) AS res;

SELECT is((SELECT res->>'settled' FROM settle_ok), 'true',
  'a delivered adaptation settles its reservation');

CREATE TEMP TABLE reverse_settled AS
  SELECT public.reverse_credit_reservation(
    'aa000000-0000-0000-0000-000000000002'::uuid) AS res;

SELECT is((SELECT res->>'reversed' FROM reverse_settled), 'false',
  'a settled charge can never be reversed afterwards');

SELECT is(
  (SELECT credit_balance FROM public.profiles
     WHERE id = 'f2222222-2222-2222-2222-222222222222'),
  88,
  'the settled balance is untouched by the attempted reversal');

-- ── Failed generation: reversing an open paid reservation ───────────────────
CREATE TEMP TABLE open_paid2 AS
  SELECT public.open_adapt_reservation(
    'aa000000-0000-0000-0000-000000000004'::uuid,
    'f2222222-2222-2222-2222-222222222222'::uuid, 8) AS res;

CREATE TEMP TABLE reverse_paid AS
  SELECT public.reverse_credit_reservation(
    'aa000000-0000-0000-0000-000000000004'::uuid) AS res;

SELECT is((SELECT res->>'reversed' FROM reverse_paid), 'true',
  'a failed generation reverses its own reservation');

SELECT is(
  (SELECT credit_balance FROM public.profiles
     WHERE id = 'f2222222-2222-2222-2222-222222222222'),
  88,
  'the reversal restores the balance (88 - 8 + 8)');

-- ── Reversal is idempotent (the request AND the job may both try) ───────────
CREATE TEMP TABLE reverse_again AS
  SELECT public.reverse_credit_reservation(
    'aa000000-0000-0000-0000-000000000004'::uuid) AS res;

SELECT is((SELECT res->>'reversed' FROM reverse_again), 'false',
  'a second reversal of the same reservation does nothing');

SELECT is(
  (SELECT credit_balance FROM public.profiles
     WHERE id = 'f2222222-2222-2222-2222-222222222222'),
  88,
  'the repeated reversal does not pay the user twice');

-- ── Reversing a free reservation gives the free slot back ───────────────────
CREATE TEMP TABLE reverse_free AS
  SELECT public.reverse_credit_reservation(
    'aa000000-0000-0000-0000-000000000001'::uuid) AS res;

SELECT is(
  (SELECT free_adaptation_used FROM public.profiles
     WHERE id = 'f1111111-1111-1111-1111-111111111111'),
  false,
  'reversing a free reservation releases the free adaptation');

-- Stale + paid: the isolate died after debiting 12.
INSERT INTO public.credit_reservations
  (id, user_id, kind, credits_charged, free_claimed, state, created_at)
VALUES
  ('11111111-1111-1111-1111-111111111111',
   'cccccccc-cccc-cccc-cccc-cccccccccccc', 'adapt', 12, false, 'open',
   now() - interval '1 hour');

-- Stale + free: the isolate died after claiming the free slot.
INSERT INTO public.credit_reservations
  (id, user_id, kind, credits_charged, free_claimed, state, created_at)
VALUES
  ('22222222-2222-2222-2222-222222222222',
   'dddddddd-dddd-dddd-dddd-dddddddddddd', 'adapt', 0, true, 'open',
   now() - interval '1 hour');

-- Still running: opened seconds ago, must be left alone.
INSERT INTO public.credit_reservations
  (id, user_id, kind, credits_charged, free_claimed, state, created_at)
VALUES
  ('33333333-3333-3333-3333-333333333333',
   'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'adapt', 5, true, 'open', now());

-- Delivered: old, but the user got their adaptation — the charge is final.
INSERT INTO public.credit_reservations
  (id, user_id, kind, credits_charged, free_claimed, state, created_at, settled_at)
VALUES
  ('44444444-4444-4444-4444-444444444444',
   'cccccccc-cccc-cccc-cccc-cccccccccccc', 'adapt', 7, false, 'settled',
   now() - interval '1 hour', now() - interval '1 hour');

-- ── The id is the idempotency key: a replayed request cannot charge twice ────
SELECT throws_ok(
  $$ INSERT INTO public.credit_reservations (id, user_id, kind, credits_charged)
     VALUES ('11111111-1111-1111-1111-111111111111',
             'cccccccc-cccc-cccc-cccc-cccccccccccc', 'adapt', 12) $$,
  '23505', NULL,
  'a replayed request_id cannot open a second reservation (no double charge)');

-- ── Run the job ─────────────────────────────────────────────────────────────
CREATE TEMP TABLE recon AS
  SELECT public.reconcile_stale_credit_reservations('10 minutes'::interval) AS res;

SELECT is((SELECT (res->>'reversed')::int FROM recon), 2,
  'exactly the two dead reservations were reversed');

-- ── Paid user got their credits back, with an auditable ledger row ──────────
SELECT is(
  (SELECT credit_balance FROM public.profiles
     WHERE id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'),
  52,
  'credits charged by a dead isolate are refunded (40 + 12)');

SELECT is(
  (SELECT count(*)::int FROM public.credit_transactions
    WHERE user_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
      AND type = 'refund'
      AND ref_id = '11111111-1111-1111-1111-111111111111'),
  1,
  'the refund is traceable back to the reservation via ref_id');

-- ── Free user got their free adaptation back ────────────────────────────────
SELECT is(
  (SELECT free_adaptation_used FROM public.profiles
     WHERE id = 'dddddddd-dddd-dddd-dddd-dddddddddddd'),
  false,
  'a free slot claimed by a dead isolate is released');

-- ── The in-flight request was NOT touched ───────────────────────────────────
SELECT is(
  (SELECT state FROM public.credit_reservations
     WHERE id = '33333333-3333-3333-3333-333333333333'),
  'open',
  'a reservation younger than the cutoff is left running');

SELECT is(
  (SELECT credit_balance FROM public.profiles
     WHERE id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'),
  30,
  'an in-flight request is not refunded mid-generation');

-- ── The settled charge stayed settled ───────────────────────────────────────
SELECT is(
  (SELECT count(*)::int FROM public.credit_transactions
    WHERE ref_id = '44444444-4444-4444-4444-444444444444'),
  0,
  'a delivered adaptation is never refunded by the job');

-- ── Idempotent: a second run finds nothing and pays nobody twice ────────────
CREATE TEMP TABLE recon2 AS
  SELECT public.reconcile_stale_credit_reservations('10 minutes'::interval) AS res;

SELECT is((SELECT (res->>'reversed')::int FROM recon2), 0,
  'a second run reverses nothing (open → reversed happens once)');

SELECT is(
  (SELECT credit_balance FROM public.profiles
     WHERE id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'),
  52,
  'balance is unchanged by the repeated run (no double refund)');

RESET role;

SELECT * FROM finish();
ROLLBACK;
