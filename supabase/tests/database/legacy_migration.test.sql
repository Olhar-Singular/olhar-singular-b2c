-- =============================================================================
-- pgTAP: moving the accounts that predate the two-bucket model
-- -----------------------------------------------------------------------------
-- Existing users keep what they were promised ("credits never expire"): their
-- balance becomes the extras bucket, they get no trial (state 'legacy'), and
-- whoever still had the retired "first adaptation / extraction free" flag is
-- compensated in extras (12 and 5, the cost of the most expensive adaptation
-- and of one extraction). Super-admins become exempt. Stale pending purchases
-- (no payment id, or older than 30 days) are closed so they stop looking
-- payable.
--
-- The logic lives in migrate_legacy_access() so this test can run it over its
-- own fixtures, and so it is idempotent: running it twice compensates nobody
-- twice.
-- =============================================================================
BEGIN;
SELECT plan(14);

INSERT INTO auth.users (id, email) VALUES
  ('b0000000-0000-0000-0000-000000000001', 'old-both-free@test.com'),
  ('b0000000-0000-0000-0000-000000000002', 'old-used@test.com'),
  ('b0000000-0000-0000-0000-000000000003', 'old-admin@test.com'),
  ('b0000000-0000-0000-0000-000000000004', 'already-exempt@test.com');

-- Old accounts: subscriber by default today, with the legacy balance and flags.
UPDATE public.profiles SET credit_balance = 40, free_adaptation_used = false, free_extraction_used = false
 WHERE id = 'b0000000-0000-0000-0000-000000000001';
UPDATE public.profiles SET credit_balance = 7, free_adaptation_used = true, free_extraction_used = true
 WHERE id = 'b0000000-0000-0000-0000-000000000002';
UPDATE public.profiles SET credit_balance = 50, is_super_admin = true, free_adaptation_used = false, free_extraction_used = true
 WHERE id = 'b0000000-0000-0000-0000-000000000003';
UPDATE public.profiles SET access_kind = 'exempt', credit_balance = 0
 WHERE id = 'b0000000-0000-0000-0000-000000000004';

INSERT INTO public.credit_purchases (id, user_id, amount_brl, credits_granted, status, provider, payment_method, payment_id, created_at) VALUES
  ('c0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002', 9.90, 30, 'pending', 'mercadopago', 'pix', NULL, now() - interval '2 days'),
  ('c0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000002', 9.90, 30, 'pending', 'stripe', 'card', 'pi_old', now() - interval '60 days'),
  ('c0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000002', 9.90, 30, 'pending', 'mercadopago', 'pix', 'mp_recent', now() - interval '1 hour'),
  ('c0000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000002', 9.90, 30, 'approved', 'mercadopago', 'pix', 'mp_paid', now() - interval '60 days');

SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SET LOCAL role service_role;

CREATE TEMP TABLE run1 AS SELECT public.migrate_legacy_access() AS res;

-- ── access kind ─────────────────────────────────────────────────────────────
SELECT is(
  (SELECT access_kind FROM public.profiles WHERE id = 'b0000000-0000-0000-0000-000000000001'),
  'legacy', 'an existing subscriber-by-default account becomes legacy');
SELECT is(
  (SELECT access_kind FROM public.profiles WHERE id = 'b0000000-0000-0000-0000-000000000003'),
  'exempt', 'a super-admin becomes exempt');
SELECT is(
  (SELECT access_kind FROM public.profiles WHERE id = 'b0000000-0000-0000-0000-000000000004'),
  'exempt', 'an account already exempt is left alone');
SELECT results_eq(
  $$ SELECT plan_credits, plan_period_end FROM public.profiles WHERE id = 'b0000000-0000-0000-0000-000000000001' $$,
  $$ VALUES (0, NULL::timestamptz) $$,
  'legacy accounts get no trial');

-- ── compensation for the retired free flags ─────────────────────────────────
SELECT is(
  (SELECT credit_balance FROM public.profiles WHERE id = 'b0000000-0000-0000-0000-000000000001'),
  57, 'both flags unused: +12 (adaptation) +5 (extraction) in extras (40 + 17)');
SELECT is(
  (SELECT credit_balance FROM public.profiles WHERE id = 'b0000000-0000-0000-0000-000000000002'),
  7, 'both flags used: no compensation');
SELECT is(
  (SELECT credit_balance FROM public.profiles WHERE id = 'b0000000-0000-0000-0000-000000000003'),
  50, 'a super-admin turned exempt is not compensated (exempt never spends credits)');
SELECT results_eq(
  $$ SELECT type, bucket, delta FROM public.credit_transactions
      WHERE user_id = 'b0000000-0000-0000-0000-000000000001' ORDER BY delta DESC $$,
  $$ VALUES ('compensation'::text, 'extra'::text, 12), ('compensation'::text, 'extra'::text, 5) $$,
  'the compensation is on the ledger, one row per retired flag');

-- ── stale pending purchases ─────────────────────────────────────────────────
SELECT results_eq(
  $$ SELECT id::text, status, status_detail FROM public.credit_purchases
      WHERE user_id = 'b0000000-0000-0000-0000-000000000002' ORDER BY id $$,
  $$ VALUES
       ('c0000000-0000-0000-0000-000000000001', 'cancelled'::text, 'stale'::text),
       ('c0000000-0000-0000-0000-000000000002', 'cancelled', 'stale'),
       ('c0000000-0000-0000-0000-000000000003', 'pending', NULL),
       ('c0000000-0000-0000-0000-000000000004', 'approved', NULL) $$,
  'pending purchases without payment id or older than 30 days are closed; recent and approved ones untouched');

SELECT is((SELECT (res->>'stale_purchases_closed')::int FROM run1), 2, 'the report counts the closed purchases');
-- Counts are scoped to the fixtures: a local database may carry other accounts.
SELECT is(
  (SELECT count(*)::int FROM public.credit_transactions
     WHERE type = 'compensation' AND delta = 12
       AND user_id IN ('b0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002',
                       'b0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000004')),
  1, 'only the legacy account was compensated for the unused adaptation');
SELECT is(
  (SELECT count(*)::int FROM public.credit_transactions
     WHERE type = 'compensation' AND delta = 5
       AND user_id IN ('b0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002',
                       'b0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000004')),
  1, 'one fixture account was compensated for the unused extraction');

-- ── idempotent ──────────────────────────────────────────────────────────────
CREATE TEMP TABLE run2 AS SELECT public.migrate_legacy_access() AS res;
SELECT is(
  (SELECT credit_balance FROM public.profiles WHERE id = 'b0000000-0000-0000-0000-000000000001'),
  57, 'running the migration again compensates nobody twice');
SELECT is((SELECT (res->>'compensated_adaptation')::int FROM run2), 0, 'second run reports zero compensations');

RESET role;
SELECT * FROM finish();
ROLLBACK;
