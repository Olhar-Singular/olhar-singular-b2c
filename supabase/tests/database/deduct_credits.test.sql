-- =============================================================================
-- pgTAP: public.deduct_credits
-- Runs inside a transaction that is rolled back by `supabase test db`.
-- Verifies the money-critical debit path: success, insufficient balance,
-- unknown user, type/amount guards, and ledger side effects.
--
-- KNOWN LIMITATION: the FOR UPDATE row lock that serialises concurrent debits
-- (preventing a double-spend on a stale balance read) is NOT exercised here.
-- pgTAP runs in a single session, so true concurrency can't be reproduced
-- without dblink-driven async sessions — which are flaky and not worth the
-- false confidence. The lock's correctness rests on the SQL `FOR UPDATE` clause
-- and code review, not on an automated concurrency test.
-- =============================================================================
BEGIN;
SELECT plan(16);

-- ── Fixtures ────────────────────────────────────────────────────────────────
-- Inserting into auth.users fires handle_new_user(), which auto-creates the
-- matching public.profiles row. We then set deterministic balances.
INSERT INTO auth.users (id, email) VALUES
  ('11111111-1111-1111-1111-111111111111', 'u1@test.com'),
  ('22222222-2222-2222-2222-222222222222', 'u2@test.com');

UPDATE public.profiles SET credit_balance = 100, free_adaptation_used = true
  WHERE id = '11111111-1111-1111-1111-111111111111';
UPDATE public.profiles SET credit_balance = 3, free_adaptation_used = true
  WHERE id = '22222222-2222-2222-2222-222222222222';

-- ── Happy path: deduct 5 'adapt' from U1 (100 → 95) ──────────────────────────
CREATE TEMP TABLE r1 AS
  SELECT public.deduct_credits(
    '11111111-1111-1111-1111-111111111111'::uuid, 5, 'adapt') AS res;

SELECT is((SELECT res->>'success' FROM r1), 'true',
  'deduct: returns success=true on happy path');
SELECT is((SELECT res->>'new_balance' FROM r1), '95',
  'deduct: returns the post-debit balance');
SELECT is(
  (SELECT credit_balance FROM public.profiles
     WHERE id = '11111111-1111-1111-1111-111111111111'),
  95,
  'deduct: persists the debited balance on profiles');
SELECT is(
  (SELECT count(*)::int FROM public.credit_transactions
     WHERE user_id = '11111111-1111-1111-1111-111111111111'
       AND type = 'adapt' AND delta = -5),
  1,
  'deduct: records a negative ledger row of the correct type');

-- ── 'extract' is an accepted type (95 → 90) ──────────────────────────────────
CREATE TEMP TABLE r2 AS
  SELECT public.deduct_credits(
    '11111111-1111-1111-1111-111111111111'::uuid, 5, 'extract') AS res;

SELECT is((SELECT res->>'success' FROM r2), 'true',
  'deduct: accepts the extract type');
SELECT is((SELECT res->>'new_balance' FROM r2), '90',
  'deduct: extract debits correctly');

-- ── The remaining allowlisted types are accepted (regression guard) ──────────
CREATE TEMP TABLE r5 AS
  SELECT public.deduct_credits(
    '11111111-1111-1111-1111-111111111111'::uuid, 2, 'regenerate') AS res;
SELECT is((SELECT res->>'success' FROM r5), 'true',
  'deduct: accepts the regenerate type');

CREATE TEMP TABLE r6 AS
  SELECT public.deduct_credits(
    '11111111-1111-1111-1111-111111111111'::uuid, 3, 'chat') AS res;
SELECT is((SELECT res->>'success' FROM r6), 'true',
  'deduct: accepts the chat type');

-- ── Insufficient balance: U2 has 3, tries to spend 5 ─────────────────────────
CREATE TEMP TABLE r3 AS
  SELECT public.deduct_credits(
    '22222222-2222-2222-2222-222222222222'::uuid, 5, 'adapt') AS res;

SELECT is((SELECT res->>'success' FROM r3), 'false',
  'deduct: fails when balance is insufficient');
SELECT is((SELECT res->>'error' FROM r3), 'insufficient_credits',
  'deduct: returns insufficient_credits error');
SELECT is((SELECT res->>'balance' FROM r3), '3',
  'deduct: echoes the current balance on insufficiency');
SELECT is(
  (SELECT credit_balance FROM public.profiles
     WHERE id = '22222222-2222-2222-2222-222222222222'),
  3,
  'deduct: does NOT debit when balance is insufficient');

-- ── Unknown user ─────────────────────────────────────────────────────────────
CREATE TEMP TABLE r4 AS
  SELECT public.deduct_credits(
    '99999999-9999-9999-9999-999999999999'::uuid, 5, 'adapt') AS res;

SELECT is((SELECT res->>'success' FROM r4), 'false',
  'deduct: fails for an unknown user');
SELECT is((SELECT res->>'error' FROM r4), 'user_not_found',
  'deduct: returns user_not_found error');

-- ── Guards raise ─────────────────────────────────────────────────────────────
SELECT throws_ok(
  $$ SELECT public.deduct_credits(
       '11111111-1111-1111-1111-111111111111'::uuid, 5, 'bogus') $$,
  'invalid type',
  'deduct: rejects a type outside the allowlist');
SELECT throws_ok(
  $$ SELECT public.deduct_credits(
       '11111111-1111-1111-1111-111111111111'::uuid, 0, 'adapt') $$,
  'amount must be positive',
  'deduct: rejects a non-positive amount');

SELECT * FROM finish();
ROLLBACK;
