-- =============================================================================
-- pgTAP: public.grant_credits
-- Verifies the credit-granting path used by the Mercado Pago webhook, the
-- signup bonus and refunds: balance increase, ledger row, type/amount guards.
-- =============================================================================
BEGIN;
SELECT plan(13);

-- ── Fixtures ────────────────────────────────────────────────────────────────
INSERT INTO auth.users (id, email) VALUES
  ('11111111-1111-1111-1111-111111111111', 'u1@test.com');

UPDATE public.profiles SET credit_balance = 10
  WHERE id = '11111111-1111-1111-1111-111111111111';

-- ── Purchase: +30 with an external payment id (10 → 40) ──────────────────────
CREATE TEMP TABLE g1 AS
  SELECT public.grant_credits(
    '11111111-1111-1111-1111-111111111111'::uuid, 30, 'purchase', 'pay_123') AS res;

SELECT is((SELECT res->>'success' FROM g1), 'true',
  'grant: returns success=true on purchase');
SELECT is((SELECT res->>'new_balance' FROM g1), '40',
  'grant: returns the post-credit balance');
SELECT is(
  (SELECT credit_balance FROM public.profiles
     WHERE id = '11111111-1111-1111-1111-111111111111'),
  40,
  'grant: persists the credited balance on profiles');
SELECT is(
  (SELECT count(*)::int FROM public.credit_transactions
     WHERE user_id = '11111111-1111-1111-1111-111111111111'
       AND type = 'purchase' AND delta = 30 AND payment_id = 'pay_123'),
  1,
  'grant: records a positive ledger row with the payment id');

-- ── Signup bonus: +5 (40 → 45) ───────────────────────────────────────────────
CREATE TEMP TABLE g2 AS
  SELECT public.grant_credits(
    '11111111-1111-1111-1111-111111111111'::uuid, 5, 'signup_bonus') AS res;

SELECT is((SELECT res->>'success' FROM g2), 'true',
  'grant: accepts the signup_bonus type');
SELECT is((SELECT res->>'new_balance' FROM g2), '45',
  'grant: signup_bonus credits correctly');
SELECT is(
  (SELECT count(*)::int FROM public.credit_transactions
     WHERE user_id = '11111111-1111-1111-1111-111111111111'
       AND type = 'signup_bonus' AND delta = 5),
  1,
  'grant: records a signup_bonus ledger row');

-- ── Refund: +8 (45 → 53) ─────────────────────────────────────────────────────
CREATE TEMP TABLE g3 AS
  SELECT public.grant_credits(
    '11111111-1111-1111-1111-111111111111'::uuid, 8, 'refund') AS res;

SELECT is((SELECT res->>'new_balance' FROM g3), '53',
  'grant: refund credits correctly');
SELECT is(
  (SELECT count(*)::int FROM public.credit_transactions
     WHERE user_id = '11111111-1111-1111-1111-111111111111'
       AND type = 'refund' AND delta = 8),
  1,
  'grant: records a refund ledger row');

-- ── Unknown user ─────────────────────────────────────────────────────────────
CREATE TEMP TABLE g4 AS
  SELECT public.grant_credits(
    '99999999-9999-9999-9999-999999999999'::uuid, 10, 'purchase') AS res;

SELECT is((SELECT res->>'success' FROM g4), 'false',
  'grant: fails for an unknown user');
SELECT is((SELECT res->>'error' FROM g4), 'user_not_found',
  'grant: returns user_not_found error');

-- ── Guards raise ─────────────────────────────────────────────────────────────
SELECT throws_ok(
  $$ SELECT public.grant_credits(
       '11111111-1111-1111-1111-111111111111'::uuid, 10, 'adapt') $$,
  'invalid type',
  'grant: rejects a type outside the grant allowlist');
SELECT throws_ok(
  $$ SELECT public.grant_credits(
       '11111111-1111-1111-1111-111111111111'::uuid, 0, 'purchase') $$,
  'amount must be positive',
  'grant: rejects a non-positive amount');

SELECT * FROM finish();
ROLLBACK;
