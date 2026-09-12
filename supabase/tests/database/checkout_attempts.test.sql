-- =============================================================================
-- pgTAP: checkout_attempts (rate-limit ledger of the public subscribe endpoint)
-- -----------------------------------------------------------------------------
-- Only service_role touches the table; the RPC records, counts and purges.
-- =============================================================================
BEGIN;
SELECT plan(12);

SELECT has_table('public', 'checkout_attempts', 'checkout_attempts exists');
SELECT col_not_null('public', 'checkout_attempts', 'ip_hash', 'ip_hash is required');
SELECT col_not_null('public', 'checkout_attempts', 'email_hash', 'email_hash is required');
SELECT has_index('public', 'checkout_attempts', 'checkout_attempts_created_at_idx', 'index on created_at for the purge');

-- ── nobody but service_role ─────────────────────────────────────────────────
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
SET LOCAL role anon;
SELECT throws_ok(
  $$ SELECT count(*) FROM public.checkout_attempts $$,
  '42501', NULL, 'anon cannot read checkout_attempts');
SELECT throws_ok(
  $$ SELECT public.record_checkout_attempt('ip', 'mail', 'attempt') $$,
  '42501', NULL, 'anon cannot call record_checkout_attempt');
RESET role;

SELECT set_config('request.jwt.claims',
  '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
SET LOCAL role authenticated;
SELECT throws_ok(
  $$ INSERT INTO public.checkout_attempts (ip_hash, email_hash, outcome) VALUES ('a', 'b', 'attempt') $$,
  '42501', NULL, 'authenticated cannot insert checkout_attempts');
SELECT throws_ok(
  $$ SELECT public.record_checkout_attempt('ip', 'mail', 'attempt') $$,
  '42501', NULL, 'authenticated cannot call record_checkout_attempt');
RESET role;

-- ── counting ────────────────────────────────────────────────────────────────
SELECT public.record_checkout_attempt('ip-1', 'mail-1', 'attempt');
SELECT public.record_checkout_attempt('ip-1', 'mail-2', 'attempt');
SELECT public.record_checkout_attempt('ip-2', 'mail-1', 'rejected');
SELECT is(
  public.record_checkout_attempt('ip-1', 'mail-1', 'attempt'),
  '{"by_ip_1h": 3, "by_email_1h": 2, "rejected_10m": 1}'::jsonb,
  'counts attempts per e-mail and per IP in 1h and rejections in 10min');

-- Old rows are purged by the RPC itself.
INSERT INTO public.checkout_attempts (ip_hash, email_hash, outcome, created_at)
VALUES ('old', 'old', 'attempt', now() - interval '25 hours'),
       ('ip-1', 'mail-1', 'attempt', now() - interval '2 hours');
SELECT is(
  (SELECT count(*)::int FROM public.checkout_attempts WHERE ip_hash = 'old'), 1, 'old row present before the call');
SELECT is(
  (public.record_checkout_attempt('ip-3', 'mail-3', 'refused')->>'by_email_1h')::int,
  0, 'a refused attempt does not count towards the e-mail limit');
SELECT is(
  (SELECT count(*)::int FROM public.checkout_attempts WHERE ip_hash = 'old'), 0, 'rows older than 24h are purged');

SELECT * FROM finish();
ROLLBACK;
