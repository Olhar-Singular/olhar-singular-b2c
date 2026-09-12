-- =============================================================================
-- pgTAP: the subscription RPCs (activate / renew / clawback / past_due / cancel)
-- -----------------------------------------------------------------------------
-- Activation is optimistic: the preapproval came back authorized, so the plan
-- bucket is loaded now and the first charge (which Mercado Pago collects up to
-- an hour later) only CONFIRMS it, never resets it again. A renewal resets the
-- bucket to the plan's quota and opens a new period. Every charge is mirrored in
-- subscription_invoices and its credit is granted exactly once, on the
-- transition granted_at IS NULL -> now() with an approved payment, so the same
-- invoice going recycling -> approved credits once and a replay never twice.
-- A rejected FIRST charge claws the optimistic credits back; a rejected renewal
-- marks past_due and touches no balance (the period already ran out).
-- =============================================================================
BEGIN;
SELECT plan(35);

INSERT INTO auth.users (id, email) VALUES
  ('a1111111-1111-1111-1111-111111111111', 'trial@test.com'),
  ('a2222222-2222-2222-2222-222222222222', 'fresh@test.com');
-- A trial with credits left: subscribing REPLACES them (decision 5), never sums.
UPDATE public.profiles
   SET access_kind = 'trial', plan_credits = 17, plan_period_end = now() + interval '3 days',
       trial_started_at = now() - interval '4 days', credit_balance = 5
 WHERE id = 'a1111111-1111-1111-1111-111111111111';

INSERT INTO public.subscriptions (id, user_id, plan_id, status, payer_email)
SELECT 'b0000000-0000-0000-0000-000000000001', 'a1111111-1111-1111-1111-111111111111', id, 'pending', 'trial@test.com'
  FROM public.plans WHERE slug = 'profissional';
INSERT INTO public.subscriptions (id, user_id, plan_id, status, payer_email)
SELECT 'b0000000-0000-0000-0000-000000000002', 'a2222222-2222-2222-2222-222222222222', id, 'pending', 'fresh@test.com'
  FROM public.plans WHERE slug = 'basico';

SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SET LOCAL role service_role;

-- ── Activation ──────────────────────────────────────────────────────────────
CREATE TEMP TABLE act AS
  SELECT public.activate_subscription(
    'b0000000-0000-0000-0000-000000000001'::uuid, 'pre-1', 'authorized',
    now() + interval '1 month', 'master', '1234') AS res;

SELECT is((SELECT res->>'success' FROM act), 'true', 'activate: succeeds');
SELECT results_eq(
  $$ SELECT access_kind, plan_credits, credit_balance,
            plan_period_end > now() + interval '29 days', plan_period_start IS NOT NULL
       FROM public.profiles WHERE id = 'a1111111-1111-1111-1111-111111111111' $$,
  $$ VALUES ('subscriber'::text, 240, 5, true, true) $$,
  'activate: subscriber with the plan quota (trial credits replaced, extras kept)');
SELECT results_eq(
  $$ SELECT status, mp_preapproval_id, card_brand, card_last_four, first_payment_confirmed,
            current_period_end IS NOT NULL
       FROM public.subscriptions WHERE id = 'b0000000-0000-0000-0000-000000000001' $$,
  $$ VALUES ('authorized'::text, 'pre-1'::text, 'master'::text, '1234'::text, false, true) $$,
  'activate: the subscription mirrors the preapproval and awaits the first charge');
SELECT results_eq(
  $$ SELECT type, bucket, delta FROM public.credit_transactions
      WHERE user_id = 'a1111111-1111-1111-1111-111111111111' AND type IN ('plan_reset','plan_grant')
      ORDER BY delta $$,
  $$ VALUES ('plan_reset'::text, 'plan'::text, -17), ('plan_grant', 'plan', 240) $$,
  'activate: the ledger shows the trial remainder closed and the quota granted');
SELECT is(
  (SELECT granted_at IS NOT NULL FROM public.subscription_invoices
     WHERE id = 'activation:b0000000-0000-0000-0000-000000000001'),
  true, 'activate: a synthetic activation invoice records the optimistic grant');

-- Idempotent: activating again changes nothing.
SELECT is(
  (SELECT public.activate_subscription(
     'b0000000-0000-0000-0000-000000000001'::uuid, 'pre-1', 'authorized',
     now() + interval '1 month', 'master', '1234') ->> 'already')::boolean,
  true, 'activate: a second call is a no-op');
SELECT is(
  (SELECT plan_credits FROM public.profiles WHERE id = 'a1111111-1111-1111-1111-111111111111'),
  240, 'activate: the replay did not grant again');

-- Spend a bit so the first charge cannot "refund" it.
UPDATE public.profiles SET plan_credits = 200 WHERE id = 'a1111111-1111-1111-1111-111111111111';

-- ── First charge: confirms, never resets ────────────────────────────────────
CREATE TEMP TABLE first_charge AS
  SELECT public.renew_subscription('b0000000-0000-0000-0000-000000000001'::uuid,
    jsonb_build_object('id', 'ap-1', 'mp_payment_id', 'pay-1', 'status', 'processed',
                       'payment_status', 'approved', 'amount_brl', 59.90,
                       'debit_date', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SSOF'), 'retry_attempt', 0)) AS res;

SELECT is((SELECT res->>'result' FROM first_charge), 'first_payment_confirmed', 'first charge: confirms the optimistic activation');
SELECT is(
  (SELECT plan_credits FROM public.profiles WHERE id = 'a1111111-1111-1111-1111-111111111111'),
  200, 'first charge: the bucket is NOT reset (no double quota in month one)');
SELECT is(
  (SELECT first_payment_confirmed FROM public.subscriptions WHERE id = 'b0000000-0000-0000-0000-000000000001'),
  true, 'first charge: the subscription is marked confirmed');
SELECT is(
  (SELECT granted_at IS NOT NULL FROM public.subscription_invoices WHERE id = 'ap-1'),
  true, 'first charge: the invoice is mirrored and marked granted');

-- Replay of the same approved invoice: nothing happens.
SELECT is(
  (SELECT public.renew_subscription('b0000000-0000-0000-0000-000000000001'::uuid,
    jsonb_build_object('id', 'ap-1', 'payment_status', 'approved', 'status', 'processed')) ->> 'result'),
  'already_processed', 'replay: an already granted invoice is ignored');

-- ── Renewal: a new period resets to the quota ───────────────────────────────
UPDATE public.subscriptions SET current_period_end = now() - interval '1 hour'
 WHERE id = 'b0000000-0000-0000-0000-000000000001';
UPDATE public.profiles SET plan_period_end = now() - interval '1 hour', plan_credits = 30
 WHERE id = 'a1111111-1111-1111-1111-111111111111';

-- The charge first arrives in recycling (declined, MP retrying): mirrored, no grant, past_due.
CREATE TEMP TABLE recycling AS
  SELECT public.renew_subscription('b0000000-0000-0000-0000-000000000001'::uuid,
    jsonb_build_object('id', 'ap-2', 'status', 'recycling', 'payment_status', 'rejected',
                       'debit_date', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SSOF'), 'retry_attempt', 1)) AS res;
SELECT is((SELECT res->>'result' FROM recycling), 'past_due', 'renewal declined: the subscription goes past_due');
SELECT is(
  (SELECT status FROM public.subscriptions WHERE id = 'b0000000-0000-0000-0000-000000000001'),
  'past_due', 'renewal declined: status persisted');
SELECT is(
  (SELECT plan_credits FROM public.profiles WHERE id = 'a1111111-1111-1111-1111-111111111111'),
  30, 'renewal declined: no balance touched (the period already ran out)');
SELECT is(
  (SELECT granted_at FROM public.subscription_invoices WHERE id = 'ap-2'),
  NULL, 'renewal declined: the invoice is mirrored without a grant');

-- Then the retry succeeds: SAME invoice id, now approved. Credits once.
CREATE TEMP TABLE renewed AS
  SELECT public.renew_subscription('b0000000-0000-0000-0000-000000000001'::uuid,
    jsonb_build_object('id', 'ap-2', 'mp_payment_id', 'pay-2', 'status', 'processed', 'payment_status', 'approved',
                       'debit_date', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SSOF'), 'retry_attempt', 2)) AS res;
SELECT is((SELECT res->>'result' FROM renewed), 'renewed', 'renewal approved: a new period opens');
SELECT results_eq(
  $$ SELECT plan_credits, plan_period_end > now() + interval '29 days', access_kind
       FROM public.profiles WHERE id = 'a1111111-1111-1111-1111-111111111111' $$,
  $$ VALUES (240, true, 'subscriber'::text) $$,
  'renewal approved: quota reset and period moved');
SELECT is(
  (SELECT status FROM public.subscriptions WHERE id = 'b0000000-0000-0000-0000-000000000001'),
  'authorized', 'renewal approved: back to authorized');
SELECT is(
  (SELECT count(*)::int FROM public.credit_transactions
     WHERE user_id = 'a1111111-1111-1111-1111-111111111111' AND type = 'plan_grant'),
  2, 'renewal approved: exactly one more plan_grant (activation + renewal)');

-- Same approved invoice again: no second grant.
SELECT is(
  (SELECT public.renew_subscription('b0000000-0000-0000-0000-000000000001'::uuid,
    jsonb_build_object('id', 'ap-2', 'payment_status', 'approved', 'status', 'processed')) ->> 'result'),
  'already_processed', 'renewal replay: ignored');
SELECT is(
  (SELECT count(*)::int FROM public.credit_transactions
     WHERE user_id = 'a1111111-1111-1111-1111-111111111111' AND type = 'plan_grant'),
  2, 'renewal replay: still two grants');

-- processed WITHOUT an approved payment is NOT money.
SELECT is(
  (SELECT public.renew_subscription('b0000000-0000-0000-0000-000000000001'::uuid,
    jsonb_build_object('id', 'ap-3', 'status', 'processed', 'payment_status', 'rejected',
                       'debit_date', to_char(now() + interval '1 month', 'YYYY-MM-DD"T"HH24:MI:SSOF'))) ->> 'result'),
  'past_due', 'a processed invoice whose payment was rejected is a failure, not a payment');

-- ── First charge rejected: clawback ─────────────────────────────────────────
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SELECT is(
  (SELECT public.activate_subscription(
     'b0000000-0000-0000-0000-000000000002'::uuid, 'pre-2', 'authorized',
     now() + interval '1 month', 'visa', '9999') ->> 'success'),
  'true', 'fresh user activates');
UPDATE public.profiles SET plan_credits = 55 WHERE id = 'a2222222-2222-2222-2222-222222222222';  -- spent 5 of 60

CREATE TEMP TABLE clawed AS
  SELECT public.renew_subscription('b0000000-0000-0000-0000-000000000002'::uuid,
    jsonb_build_object('id', 'ap-9', 'status', 'cancelled', 'payment_status', 'rejected',
                       'debit_date', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SSOF'))) AS res;
SELECT is((SELECT res->>'result' FROM clawed), 'clawback', 'first charge rejected: clawback');
SELECT results_eq(
  $$ SELECT plan_credits, plan_period_end <= now() FROM public.profiles WHERE id = 'a2222222-2222-2222-2222-222222222222' $$,
  $$ VALUES (0, true) $$,
  'clawback: the optimistic plan credits are gone and the period is closed');
SELECT is(
  (SELECT status FROM public.subscriptions WHERE id = 'b0000000-0000-0000-0000-000000000002'),
  'rejected', 'clawback: the subscription is rejected');
SELECT results_eq(
  $$ SELECT type, bucket, delta FROM public.credit_transactions
      WHERE user_id = 'a2222222-2222-2222-2222-222222222222' AND type = 'clawback' $$,
  $$ VALUES ('clawback'::text, 'plan'::text, -55) $$,
  'clawback: the ledger shows what was taken back');

-- ── Cancel keeps the credits until the period ends ──────────────────────────
SELECT is(
  (SELECT public.cancel_subscription_local('b0000000-0000-0000-0000-000000000001'::uuid, now()) ->> 'success'),
  'true', 'cancel: succeeds');
SELECT results_eq(
  $$ SELECT status, cancelled_at IS NOT NULL FROM public.subscriptions WHERE id = 'b0000000-0000-0000-0000-000000000001' $$,
  $$ VALUES ('cancelled'::text, true) $$,
  'cancel: status and timestamp');
SELECT is(
  (SELECT plan_credits FROM public.profiles WHERE id = 'a1111111-1111-1111-1111-111111111111'),
  240, 'cancel: the paid period keeps its credits');

-- ── sync from the preapproval topic ─────────────────────────────────────────
INSERT INTO public.subscriptions (id, user_id, plan_id, status, payer_email)
SELECT 'b0000000-0000-0000-0000-000000000003', 'a2222222-2222-2222-2222-222222222222', id, 'pending', 'fresh@test.com'
  FROM public.plans WHERE slug = 'basico';
SELECT is(
  (SELECT public.sync_subscription_status('b0000000-0000-0000-0000-000000000003'::uuid, 'pre-3', 'authorized',
     now() + interval '1 month') ->> 'result'),
  'activated', 'sync: pending -> authorized activates the subscription');
SELECT is(
  (SELECT plan_credits FROM public.profiles WHERE id = 'a2222222-2222-2222-2222-222222222222'),
  60, 'sync: activation loaded the plan quota');
SELECT is(
  (SELECT public.sync_subscription_status('b0000000-0000-0000-0000-000000000003'::uuid, 'pre-3', 'paused', NULL) ->> 'result'),
  'paused', 'sync: paused is mirrored');

RESET role;

SELECT ok(
  NOT has_function_privilege('authenticated', 'public.renew_subscription(uuid, jsonb)', 'EXECUTE'),
  'authenticated cannot EXECUTE renew_subscription');

SELECT * FROM finish();
ROLLBACK;
