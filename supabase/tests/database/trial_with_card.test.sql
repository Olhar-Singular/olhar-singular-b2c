-- =============================================================================
-- pgTAP: trial with card (7 days, first charge on day 8)
-- -----------------------------------------------------------------------------
-- The subscribe function writes subscriptions.trial_ends_at on the pending row
-- (the start_date sent to Mercado Pago). activate_subscription branches on it:
-- 50 trial credits in the plan bucket until the trial ends, account kind
-- 'trial', no plan quota and no activation invoice. The first charge (day 8)
-- is the first money: renew_subscription converts the trial into the paid
-- plan (quota, subscriber). Cancelling inside the trial removes the trial
-- credits at once (decision 3); cancelling a paid period keeps them (lazy
-- expiry). One trial per CPF (decision 4): trial_used_by_cpf.
-- =============================================================================
BEGIN;
SELECT plan(33);

INSERT INTO auth.users (id, email) VALUES
  ('c1111111-1111-1111-1111-111111111111', 'card-trial@test.com'),
  ('c2222222-2222-2222-2222-222222222222', 'trial-cancel@test.com'),
  ('c3333333-3333-3333-3333-333333333333', 'trial-declined@test.com'),
  ('c4444444-4444-4444-4444-444444444444', 'paid@test.com'),
  ('c5555555-5555-5555-5555-555555555555', 'never@test.com');

-- Trial rows carry the intent from the INSERT: trial_ends_at = the start_date sent to MP.
INSERT INTO public.subscriptions (id, user_id, plan_id, status, payer_email, trial_ends_at)
SELECT 'd0000000-0000-0000-0000-000000000001', 'c1111111-1111-1111-1111-111111111111', id, 'pending',
       'card-trial@test.com', now() + interval '7 days'
  FROM public.plans WHERE slug = 'basico';
INSERT INTO public.subscriptions (id, user_id, plan_id, status, payer_email, trial_ends_at)
SELECT 'd0000000-0000-0000-0000-000000000002', 'c2222222-2222-2222-2222-222222222222', id, 'pending',
       'trial-cancel@test.com', now() + interval '7 days'
  FROM public.plans WHERE slug = 'basico';
INSERT INTO public.subscriptions (id, user_id, plan_id, status, payer_email, trial_ends_at)
SELECT 'd0000000-0000-0000-0000-000000000003', 'c3333333-3333-3333-3333-333333333333', id, 'pending',
       'trial-declined@test.com', now() + interval '7 days'
  FROM public.plans WHERE slug = 'basico';
-- Paid control row: no trial_ends_at.
INSERT INTO public.subscriptions (id, user_id, plan_id, status, payer_email)
SELECT 'd0000000-0000-0000-0000-000000000004', 'c4444444-4444-4444-4444-444444444444', id, 'pending',
       'paid@test.com'
  FROM public.plans WHERE slug = 'basico';

SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SET LOCAL role service_role;

-- ── Schema ──────────────────────────────────────────────────────────────────
SELECT has_column('public', 'subscriptions', 'trial_ends_at', 'subscriptions.trial_ends_at exists');

-- ── Activation of a trial ───────────────────────────────────────────────────
CREATE TEMP TABLE act AS
  SELECT public.activate_subscription(
    'd0000000-0000-0000-0000-000000000001'::uuid, 'pre-t1', 'authorized',
    now() + interval '7 days', 'visa', '5682') AS res;

SELECT is((SELECT res->>'success' FROM act), 'true', 'trial activate: succeeds');
SELECT is((SELECT res->>'trial' FROM act), 'true', 'trial activate: reports the trial');
SELECT is((SELECT (res->>'plan_credits')::int FROM act), 50, 'trial activate: reports the 50 credits');
SELECT results_eq(
  $$ SELECT access_kind, plan_credits, credit_balance, trial_started_at IS NOT NULL,
            plan_period_start IS NOT NULL,
            plan_period_end = (SELECT trial_ends_at FROM public.subscriptions
                                WHERE id = 'd0000000-0000-0000-0000-000000000001')
       FROM public.profiles WHERE id = 'c1111111-1111-1111-1111-111111111111' $$,
  $$ VALUES ('trial'::text, 50, 0, true, true, true) $$,
  'trial activate: 50 trial credits in the plan bucket until trial_ends_at, account kind trial');
SELECT results_eq(
  $$ SELECT status, first_payment_confirmed, mp_preapproval_id, card_brand, card_last_four,
            current_period_end = trial_ends_at
       FROM public.subscriptions WHERE id = 'd0000000-0000-0000-0000-000000000001' $$,
  $$ VALUES ('authorized'::text, false, 'pre-t1'::text, 'visa'::text, '5682'::text, true) $$,
  'trial activate: the row is live, its period ends with the trial, first charge still to come');
SELECT results_eq(
  $$ SELECT type, bucket, delta, ref_id FROM public.credit_transactions
      WHERE user_id = 'c1111111-1111-1111-1111-111111111111' $$,
  $$ VALUES ('trial_grant'::text, 'plan'::text, 50, 'd0000000-0000-0000-0000-000000000001'::uuid) $$,
  'trial activate: one trial_grant, no plan_grant');
SELECT is(
  (SELECT count(*)::int FROM public.subscription_invoices
     WHERE subscription_id = 'd0000000-0000-0000-0000-000000000001'),
  0, 'trial activate: no activation invoice (nothing was granted against money)');

-- Idempotent: activating again changes nothing.
SELECT is(
  (SELECT (public.activate_subscription(
     'd0000000-0000-0000-0000-000000000001'::uuid, 'pre-t1', 'authorized',
     now() + interval '7 days', 'visa', '5682') ->> 'already')::boolean),
  true, 'trial activate: a second call is a no-op');
SELECT is(
  (SELECT plan_credits FROM public.profiles WHERE id = 'c1111111-1111-1111-1111-111111111111'),
  50, 'trial activate: the replay did not grant again');

-- ── Day 8: the first charge converts the trial into the paid plan ───────────
UPDATE public.profiles SET plan_credits = 30 WHERE id = 'c1111111-1111-1111-1111-111111111111';  -- 20 spent

CREATE TEMP TABLE conv AS
  SELECT public.renew_subscription(
    'd0000000-0000-0000-0000-000000000001'::uuid,
    jsonb_build_object(
      'id', 'ap-t1', 'mp_payment_id', 'pay-t1', 'status', 'processed', 'payment_status', 'approved',
      'amount_brl', 39.90, 'debit_date', (now() + interval '7 days')::text, 'retry_attempt', 0,
      'raw', '{}'::jsonb)) AS res;

SELECT is((SELECT res->>'result' FROM conv), 'trial_converted', 'first charge: converts the trial');
SELECT results_eq(
  $$ SELECT access_kind, plan_credits, plan_period_end > now() + interval '34 days'
       FROM public.profiles WHERE id = 'c1111111-1111-1111-1111-111111111111' $$,
  $$ VALUES ('subscriber'::text, 300, true) $$,
  'first charge: subscriber with the plan quota and a new period');
SELECT results_eq(
  $$ SELECT first_payment_confirmed, status, current_period_end > now() + interval '34 days',
            next_payment_date = current_period_end
       FROM public.subscriptions WHERE id = 'd0000000-0000-0000-0000-000000000001' $$,
  $$ VALUES (true, 'authorized'::text, true, true) $$,
  'first charge: confirmed, period opened from the debit date');
SELECT results_eq(
  $$ SELECT type, delta FROM public.credit_transactions
      WHERE user_id = 'c1111111-1111-1111-1111-111111111111' AND type IN ('plan_reset', 'plan_grant')
      ORDER BY delta $$,
  $$ VALUES ('plan_reset'::text, -30), ('plan_grant', 300) $$,
  'first charge: the leftover trial credits are closed and the quota granted');
SELECT is(
  (SELECT granted_at IS NOT NULL FROM public.subscription_invoices WHERE id = 'ap-t1'),
  true, 'first charge: the invoice is mirrored and claimed');
SELECT is(
  (SELECT public.renew_subscription(
     'd0000000-0000-0000-0000-000000000001'::uuid,
     jsonb_build_object('id', 'ap-t1', 'mp_payment_id', 'pay-t1', 'status', 'processed',
                        'payment_status', 'approved', 'amount_brl', 39.90,
                        'debit_date', (now() + interval '7 days')::text)) ->> 'result'),
  'already_processed', 'first charge: a replay grants nothing');
SELECT is(
  (SELECT plan_credits FROM public.profiles WHERE id = 'c1111111-1111-1111-1111-111111111111'),
  300, 'first charge: the replay left the quota alone');

-- ── Cancelling inside the trial: paywall now, nothing charged ───────────────
SELECT public.activate_subscription(
  'd0000000-0000-0000-0000-000000000002'::uuid, 'pre-t2', 'authorized',
  now() + interval '7 days', 'visa', '5682');
UPDATE public.profiles SET plan_credits = 44 WHERE id = 'c2222222-2222-2222-2222-222222222222';  -- 6 spent

CREATE TEMP TABLE canc AS
  SELECT public.cancel_subscription_local('d0000000-0000-0000-0000-000000000002'::uuid, now()) AS res;

SELECT is((SELECT res->>'trial_closed' FROM canc), 'true', 'trial cancel: reports the trial closed');
SELECT is((SELECT (res->>'credits_removed')::int FROM canc), 44, 'trial cancel: reports what was removed');
SELECT results_eq(
  $$ SELECT access_kind, plan_credits, plan_period_end <= now()
       FROM public.profiles WHERE id = 'c2222222-2222-2222-2222-222222222222' $$,
  $$ VALUES ('trial'::text, 0, true) $$,
  'trial cancel: the trial credits are gone at once and the period is closed');
SELECT is(
  (SELECT status FROM public.subscriptions WHERE id = 'd0000000-0000-0000-0000-000000000002'),
  'cancelled', 'trial cancel: the row is cancelled');
SELECT results_eq(
  $$ SELECT type, delta FROM public.credit_transactions
      WHERE user_id = 'c2222222-2222-2222-2222-222222222222' ORDER BY delta $$,
  $$ VALUES ('plan_reset'::text, -44), ('trial_grant', 50) $$,
  'trial cancel: the ledger shows the removal');

-- ── Cancelling a paid subscription keeps the period (regression) ────────────
SELECT public.activate_subscription(
  'd0000000-0000-0000-0000-000000000004'::uuid, 'pre-p4', 'authorized',
  now() + interval '1 month', 'master', '1234');
SELECT public.cancel_subscription_local('d0000000-0000-0000-0000-000000000004'::uuid, now());
SELECT results_eq(
  $$ SELECT access_kind, plan_credits, plan_period_end > now() + interval '29 days'
       FROM public.profiles WHERE id = 'c4444444-4444-4444-4444-444444444444' $$,
  $$ VALUES ('subscriber'::text, 300, true) $$,
  'paid cancel: the credits of the paid period stay (lazy expiry)');

-- ── Declined first charge of a trial: clawback ──────────────────────────────
SELECT public.activate_subscription(
  'd0000000-0000-0000-0000-000000000003'::uuid, 'pre-t3', 'authorized',
  now() + interval '7 days', 'visa', '5682');
SELECT is(
  (SELECT public.renew_subscription(
     'd0000000-0000-0000-0000-000000000003'::uuid,
     jsonb_build_object('id', 'ap-t3', 'mp_payment_id', 'pay-t3', 'status', 'processed',
                        'payment_status', 'rejected', 'amount_brl', 39.90,
                        'debit_date', (now() + interval '7 days')::text)) ->> 'result'),
  'clawback', 'declined first charge: clawback');
SELECT results_eq(
  $$ SELECT access_kind, plan_credits, plan_period_end <= now()
       FROM public.profiles WHERE id = 'c3333333-3333-3333-3333-333333333333' $$,
  $$ VALUES ('trial'::text, 0, true) $$,
  'declined first charge: the trial credits are removed');
SELECT is(
  (SELECT status FROM public.subscriptions WHERE id = 'd0000000-0000-0000-0000-000000000003'),
  'rejected', 'declined first charge: the subscription is rejected');

-- ── One trial per CPF ───────────────────────────────────────────────────────
UPDATE public.profiles SET cpf = '11111111111' WHERE id = 'c1111111-1111-1111-1111-111111111111';
UPDATE public.profiles SET cpf = '44444444444' WHERE id = 'c4444444-4444-4444-4444-444444444444';
UPDATE public.profiles SET cpf = '55555555555' WHERE id = 'c5555555-5555-5555-5555-555555555555';

SELECT is(public.trial_used_by_cpf('11111111111'), true,  'cpf: a CPF that had the trial is used');
SELECT is(public.trial_used_by_cpf('44444444444'), true,  'cpf: a CPF with a subscription (no trial) is used');
SELECT is(public.trial_used_by_cpf('55555555555'), false, 'cpf: a CPF with neither is free');
SELECT is(public.trial_used_by_cpf('99999999999'), false, 'cpf: an unknown CPF is free');

-- ── ACL ─────────────────────────────────────────────────────────────────────
RESET role;
SELECT ok(NOT has_function_privilege('anon', 'public.trial_used_by_cpf(text)', 'EXECUTE'),
  'acl: anon cannot call trial_used_by_cpf');
SELECT ok(NOT has_function_privilege('authenticated', 'public.trial_used_by_cpf(text)', 'EXECUTE'),
  'acl: authenticated cannot call trial_used_by_cpf');
SELECT ok(has_function_privilege('service_role', 'public.trial_used_by_cpf(text)', 'EXECUTE'),
  'acl: service_role can call trial_used_by_cpf');

SELECT * FROM finish();
ROLLBACK;
