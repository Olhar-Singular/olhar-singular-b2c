-- =============================================================================
-- pgTAP: the trial clock and the access state the admin assigns
-- -----------------------------------------------------------------------------
-- There is no public signup: trial and courtesy accounts are created by the
-- admin, who invites the person with access_kind in the auth metadata. The
-- trial's 50 credits land in the PLAN bucket and the 7-day clock starts when
-- the invite is accepted (email_confirmed_at goes from NULL to a timestamp),
-- never at INSERT: whoever never confirmed never entered, and must not lose
-- days waiting.
--
-- The trigger fires on the transition only, and a failure inside it can never
-- break the GoTrue request that confirmed the e-mail (an exception there would
-- turn the invite acceptance into a 500).
-- =============================================================================
BEGIN;
SELECT plan(24);

-- ── The clock does not start before the e-mail is confirmed ─────────────────
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'pending@test.com', '{"access_kind":"trial"}'::jsonb);

SELECT results_eq(
  $$ SELECT plan_credits, plan_period_end, trial_started_at
       FROM public.profiles WHERE id = 'a0000000-0000-0000-0000-000000000001' $$,
  $$ VALUES (0, NULL::timestamptz, NULL::timestamptz) $$,
  'an unconfirmed trial invite has no credits and no clock');

-- ── Accepting the invite starts it ──────────────────────────────────────────
UPDATE auth.users SET email_confirmed_at = now() WHERE id = 'a0000000-0000-0000-0000-000000000001';

SELECT is(
  (SELECT plan_credits FROM public.profiles WHERE id = 'a0000000-0000-0000-0000-000000000001'),
  50, 'confirming the e-mail grants the 50 trial credits');
SELECT ok(
  (SELECT plan_period_end > now() + interval '6 days 20 hours'
     AND plan_period_end < now() + interval '7 days 4 hours'
     FROM public.profiles WHERE id = 'a0000000-0000-0000-0000-000000000001'),
  'the trial lasts 7 days from the confirmation');
SELECT ok(
  (SELECT trial_started_at IS NOT NULL FROM public.profiles WHERE id = 'a0000000-0000-0000-0000-000000000001'),
  'trial_started_at is stamped');
SELECT results_eq(
  $$ SELECT type, bucket, delta FROM public.credit_transactions
      WHERE user_id = 'a0000000-0000-0000-0000-000000000001' $$,
  $$ VALUES ('trial_grant'::text, 'plan'::text, 50) $$,
  'the grant is on the ledger, in the plan bucket');

-- ── Idempotent: another UPDATE that touches the column grants nothing more ──
UPDATE auth.users SET email_confirmed_at = now() WHERE id = 'a0000000-0000-0000-0000-000000000001';
SELECT is(
  (SELECT plan_credits FROM public.profiles WHERE id = 'a0000000-0000-0000-0000-000000000001'),
  50, 'a second confirmation does not grant the trial twice');
SELECT is(
  (SELECT count(*)::int FROM public.credit_transactions
     WHERE user_id = 'a0000000-0000-0000-0000-000000000001' AND type = 'trial_grant'),
  1, 'and does not duplicate the ledger row');

-- ── A user created already confirmed (admin createUser) starts right away ───
INSERT INTO auth.users (id, email, email_confirmed_at, raw_user_meta_data) VALUES
  ('a0000000-0000-0000-0000-000000000002', 'ready@test.com', now(), '{"access_kind":"trial"}'::jsonb);
SELECT is(
  (SELECT plan_credits FROM public.profiles WHERE id = 'a0000000-0000-0000-0000-000000000002'),
  50, 'a user created already confirmed starts the trial at once');

-- ── Other access kinds get nothing from the trigger ─────────────────────────
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('a0000000-0000-0000-0000-000000000003', 'buyer@test.com', '{}'::jsonb),
  ('a0000000-0000-0000-0000-000000000004', 'guest@test.com', '{"access_kind":"exempt"}'::jsonb);
UPDATE auth.users SET email_confirmed_at = now()
 WHERE id IN ('a0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000004');

SELECT is(
  (SELECT plan_credits FROM public.profiles WHERE id = 'a0000000-0000-0000-0000-000000000003'),
  0, 'a subscriber (paid checkout) gets no trial credits');
SELECT is(
  (SELECT plan_credits FROM public.profiles WHERE id = 'a0000000-0000-0000-0000-000000000004'),
  0, 'a courtesy account needs no credits (it is exempt)');

-- ═══════════════════════════════════════════════════════════════════════════
-- Admin actions
-- ═══════════════════════════════════════════════════════════════════════════
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SET LOCAL role service_role;

-- ── Extending a running trial ───────────────────────────────────────────────
CREATE TEMP TABLE ext AS
  SELECT public.admin_extend_trial('a0000000-0000-0000-0000-000000000001'::uuid, 7) AS res;
SELECT is((SELECT res->>'success' FROM ext), 'true', 'extend: a running trial can be extended');
SELECT ok(
  (SELECT plan_period_end > now() + interval '13 days'
     FROM public.profiles WHERE id = 'a0000000-0000-0000-0000-000000000001'),
  'extend: the deadline moves by the given days');

-- ── The 90-day ceiling ──────────────────────────────────────────────────────
SELECT is(
  (SELECT public.admin_extend_trial('a0000000-0000-0000-0000-000000000001'::uuid, 90) ->> 'error'),
  'trial_limit_reached', 'extend: refuses to go past 90 days of trial');

-- ── Only trials, and only after the clock started ───────────────────────────
SELECT is(
  (SELECT public.admin_extend_trial('a0000000-0000-0000-0000-000000000003'::uuid, 7) ->> 'error'),
  'not_a_trial', 'extend: a subscriber cannot be extended');
SELECT is(
  (SELECT public.admin_extend_trial('99999999-9999-9999-9999-999999999999'::uuid, 7) ->> 'error'),
  'user_not_found', 'extend: unknown user');
SELECT is(
  (SELECT public.admin_extend_trial('a0000000-0000-0000-0000-000000000001'::uuid, 0) ->> 'error'),
  'invalid_days', 'extend: days must be positive');

-- ── Changing the access kind ────────────────────────────────────────────────
CREATE TEMP TABLE to_exempt AS
  SELECT public.admin_set_access_kind('a0000000-0000-0000-0000-000000000003'::uuid, 'exempt') AS res;
SELECT is((SELECT res->>'success' FROM to_exempt), 'true', 'access: a subscriber can be made a courtesy account');
SELECT is(
  (SELECT access_kind FROM public.profiles WHERE id = 'a0000000-0000-0000-0000-000000000003'),
  'exempt', 'access: the kind is persisted');

-- Turning a confirmed user into a trial starts the clock on the spot.
CREATE TEMP TABLE to_trial AS
  SELECT public.admin_set_access_kind('a0000000-0000-0000-0000-000000000003'::uuid, 'trial') AS res;
SELECT is((SELECT res->>'success' FROM to_trial), 'true', 'access: a confirmed user can be moved to trial');
SELECT results_eq(
  $$ SELECT plan_credits, trial_started_at IS NOT NULL
       FROM public.profiles WHERE id = 'a0000000-0000-0000-0000-000000000003' $$,
  $$ VALUES (50, true) $$,
  'access: moving to trial grants the credits and starts the clock');

SELECT is(
  (SELECT public.admin_set_access_kind('a0000000-0000-0000-0000-000000000003'::uuid, 'subscriber') ->> 'error'),
  'invalid_kind', 'access: subscriber is set by the subscription flow, never by hand');

RESET role;

-- ── ACL: both are service_role only ─────────────────────────────────────────
SELECT ok(
  NOT has_function_privilege('authenticated', 'public.admin_extend_trial(uuid, integer)', 'EXECUTE'),
  'authenticated cannot EXECUTE admin_extend_trial');
SELECT ok(
  NOT has_function_privilege('authenticated', 'public.admin_set_access_kind(uuid, text)', 'EXECUTE'),
  'authenticated cannot EXECUTE admin_set_access_kind');
SELECT ok(
  NOT has_function_privilege('anon', 'public.start_trial_for(uuid)', 'EXECUTE'),
  'anon cannot EXECUTE start_trial_for');

SELECT * FROM finish();
ROLLBACK;
