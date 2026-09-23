-- =============================================================================
-- pgTAP: two credit buckets on profiles + the columns that describe access
-- -----------------------------------------------------------------------------
-- The balance stops being one integer. `plan_credits` is the monthly bucket
-- (also where a trial's 50 credits live), valid until `plan_period_end`;
-- `credit_balance` becomes the "extras" bucket that never expires. `access_kind`
-- says how the account got in (subscriber / trial / exempt / legacy) and comes
-- from the invite's user_metadata for admin-created users.
--
-- Also covered: the signup bonus is gone (credit_balance DEFAULT 0), the
-- reservation rows record what came from which bucket, and the ledger knows
-- which bucket each row touched.
-- =============================================================================
BEGIN;
SELECT plan(22);

-- ── profiles: new columns and defaults ──────────────────────────────────────
SELECT has_column('public', 'profiles', 'plan_credits',      'profiles.plan_credits exists');
SELECT has_column('public', 'profiles', 'plan_period_end',   'profiles.plan_period_end exists');
SELECT has_column('public', 'profiles', 'access_kind',       'profiles.access_kind exists');
SELECT has_column('public', 'profiles', 'trial_started_at',  'profiles.trial_started_at exists');
SELECT has_column('public', 'profiles', 'cpf',               'profiles.cpf exists');
SELECT has_column('public', 'profiles', 'must_set_password', 'profiles.must_set_password exists');
SELECT has_column('public', 'profiles', 'terms_accepted_at', 'profiles.terms_accepted_at exists');
SELECT has_column('public', 'profiles', 'terms_version',     'profiles.terms_version exists');

-- A plain INSERT into auth.users (what the paid checkout's createUser does)
-- yields a subscriber with empty buckets: no more 50-credit signup bonus.
INSERT INTO auth.users (id, email) VALUES
  ('d1111111-1111-1111-1111-111111111111', 'paid@test.com');

SELECT results_eq(
  $$ SELECT credit_balance, plan_credits, access_kind, must_set_password
       FROM public.profiles WHERE id = 'd1111111-1111-1111-1111-111111111111' $$,
  $$ VALUES (0, 0, 'subscriber'::text, false) $$,
  'a new user starts as a subscriber with zero credits in both buckets');

-- The admin invite carries access_kind in user_metadata; only trial/exempt are honoured.
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('d2222222-2222-2222-2222-222222222222', 'trial@test.com',
   '{"full_name":"Ana","access_kind":"trial"}'::jsonb),
  ('d3333333-3333-3333-3333-333333333333', 'exempt@test.com',
   '{"access_kind":"exempt"}'::jsonb),
  ('d4444444-4444-4444-4444-444444444444', 'hacker@test.com',
   '{"access_kind":"exempt_or_whatever"}'::jsonb);

SELECT is(
  (SELECT access_kind FROM public.profiles WHERE id = 'd2222222-2222-2222-2222-222222222222'),
  'trial', 'user_metadata.access_kind = trial creates a trial profile');
SELECT is(
  (SELECT access_kind FROM public.profiles WHERE id = 'd3333333-3333-3333-3333-333333333333'),
  'exempt', 'user_metadata.access_kind = exempt creates an exempt profile');
SELECT is(
  (SELECT access_kind FROM public.profiles WHERE id = 'd4444444-4444-4444-4444-444444444444'),
  'subscriber', 'an unknown access_kind in user_metadata falls back to subscriber');

-- ── constraints ─────────────────────────────────────────────────────────────
SELECT throws_ok(
  $$ UPDATE public.profiles SET access_kind = 'vip'
      WHERE id = 'd1111111-1111-1111-1111-111111111111' $$,
  '23514', NULL, 'access_kind outside the allowed set is rejected');

SELECT throws_ok(
  $$ UPDATE public.profiles SET cpf = '123.456.789-09'
      WHERE id = 'd1111111-1111-1111-1111-111111111111' $$,
  '23514', NULL, 'cpf must be exactly 11 digits (no punctuation)');

SELECT lives_ok(
  $$ UPDATE public.profiles SET cpf = '12345678909'
      WHERE id = 'd1111111-1111-1111-1111-111111111111' $$,
  'an 11-digit cpf is accepted');

-- ── ledger: bucket column and the new types ─────────────────────────────────
SELECT is(
  (SELECT column_default FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'credit_transactions'
       AND column_name = 'bucket'),
  '''extra''::text', 'credit_transactions.bucket defaults to extra');

SELECT lives_ok(
  $$ INSERT INTO public.credit_transactions (user_id, delta, type, bucket)
     VALUES ('d2222222-2222-2222-2222-222222222222', 50, 'trial_grant', 'plan') $$,
  'the ledger accepts the new plan-bucket types');

SELECT throws_ok(
  $$ INSERT INTO public.credit_transactions (user_id, delta, type, bucket)
     VALUES ('d2222222-2222-2222-2222-222222222222', 1, 'adapt', 'wallet') $$,
  '23514', NULL, 'an unknown bucket is rejected');

-- ── reservations: what came from which bucket ───────────────────────────────
SELECT has_column('public', 'credit_reservations', 'plan_charged',       'credit_reservations.plan_charged exists');
SELECT has_column('public', 'credit_reservations', 'extra_charged',      'credit_reservations.extra_charged exists');
SELECT has_column('public', 'credit_reservations', 'period_end_at_open', 'credit_reservations.period_end_at_open exists');

SELECT lives_ok(
  $$ INSERT INTO public.credit_reservations (id, user_id, kind)
     VALUES ('e0000000-0000-0000-0000-000000000001', 'd1111111-1111-1111-1111-111111111111', 'extract') $$,
  'reservations accept the extract kind');

SELECT * FROM finish();
ROLLBACK;
