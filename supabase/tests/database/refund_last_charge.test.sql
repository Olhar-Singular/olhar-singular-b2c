-- =============================================================================
-- pgTAP: self-service refund of the last charge + no extension of a card trial
-- -----------------------------------------------------------------------------
-- refund_last_charge finds the newest approved invoice with an MP payment id
-- that was not refunded yet, for the user's live subscription or the most
-- recent one cancelled less than 30 days ago; it never touches money (the edge
-- function talks to MP first). confirm_refund records the refund exactly once,
-- zeroes the plan bucket (ledger refund_clawback, extras untouched) and cancels
-- the subscription locally. admin_extend_trial refuses a card trial: MP does
-- not move the day-8 charge.
-- =============================================================================
BEGIN;
SELECT plan(26);

INSERT INTO auth.users (id, email) VALUES
  ('e1111111-1111-1111-1111-111111111111', 'payer@test.com'),
  ('e2222222-2222-2222-2222-222222222222', 'trial-only@test.com'),
  ('e3333333-3333-3333-3333-333333333333', 'cancelled-recent@test.com'),
  ('e4444444-4444-4444-4444-444444444444', 'cancelled-old@test.com'),
  ('e5555555-5555-5555-5555-555555555555', 'card-trial@test.com');

-- Paid subscriber with two approved charges (and the synthetic activation row).
INSERT INTO public.subscriptions (id, user_id, plan_id, status, payer_email, first_payment_confirmed, mp_preapproval_id)
SELECT 'f0000000-0000-0000-0000-000000000001', 'e1111111-1111-1111-1111-111111111111', id, 'authorized', 'payer@test.com', true, 'pre-1'
  FROM public.plans WHERE slug = 'basico';
INSERT INTO public.subscription_invoices (id, subscription_id, mp_payment_id, status, payment_status, amount_brl, debit_date, granted_at)
VALUES ('activation:f0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001', NULL, 'activation', 'approved', NULL, NULL, now() - interval '40 days'),
       ('ap-old', 'f0000000-0000-0000-0000-000000000001', 'pay-old', 'processed', 'approved', 39.90, now() - interval '35 days', now() - interval '35 days'),
       ('ap-new', 'f0000000-0000-0000-0000-000000000001', 'pay-new', 'processed', 'approved', 39.90, now() - interval '5 days', now() - interval '5 days'),
       ('ap-pending', 'f0000000-0000-0000-0000-000000000001', NULL, 'scheduled', 'pending', 39.90, now() + interval '25 days', NULL);
UPDATE public.profiles SET access_kind = 'subscriber', plan_credits = 210, credit_balance = 30, plan_period_end = now() + interval '25 days'
 WHERE id = 'e1111111-1111-1111-1111-111111111111';

-- Trial with card, no money yet: nothing to refund.
INSERT INTO public.subscriptions (id, user_id, plan_id, status, payer_email, trial_ends_at, mp_preapproval_id)
SELECT 'f0000000-0000-0000-0000-000000000002', 'e2222222-2222-2222-2222-222222222222', id, 'authorized', 'trial-only@test.com', now() + interval '5 days', 'pre-2'
  FROM public.plans WHERE slug = 'basico';
UPDATE public.profiles SET access_kind = 'trial', plan_credits = 50, plan_period_end = now() + interval '5 days', trial_started_at = now() - interval '2 days'
 WHERE id = 'e2222222-2222-2222-2222-222222222222';

-- Cancelled 10 days ago with a paid charge: still refundable.
INSERT INTO public.subscriptions (id, user_id, plan_id, status, payer_email, first_payment_confirmed, cancelled_at, mp_preapproval_id)
SELECT 'f0000000-0000-0000-0000-000000000003', 'e3333333-3333-3333-3333-333333333333', id, 'cancelled', 'cancelled-recent@test.com', true, now() - interval '10 days', 'pre-3'
  FROM public.plans WHERE slug = 'basico';
INSERT INTO public.subscription_invoices (id, subscription_id, mp_payment_id, status, payment_status, amount_brl, debit_date, granted_at)
VALUES ('ap-3', 'f0000000-0000-0000-0000-000000000003', 'pay-3', 'processed', 'approved', 39.90, now() - interval '12 days', now() - interval '12 days');

-- Cancelled 40 days ago: window closed.
INSERT INTO public.subscriptions (id, user_id, plan_id, status, payer_email, first_payment_confirmed, cancelled_at, mp_preapproval_id)
SELECT 'f0000000-0000-0000-0000-000000000004', 'e4444444-4444-4444-4444-444444444444', id, 'cancelled', 'cancelled-old@test.com', true, now() - interval '40 days', 'pre-4'
  FROM public.plans WHERE slug = 'basico';
INSERT INTO public.subscription_invoices (id, subscription_id, mp_payment_id, status, payment_status, amount_brl, debit_date, granted_at)
VALUES ('ap-4', 'f0000000-0000-0000-0000-000000000004', 'pay-4', 'processed', 'approved', 39.90, now() - interval '42 days', now() - interval '42 days');

-- Card trial for admin_extend_trial.
INSERT INTO public.subscriptions (id, user_id, plan_id, status, payer_email, trial_ends_at, mp_preapproval_id)
SELECT 'f0000000-0000-0000-0000-000000000005', 'e5555555-5555-5555-5555-555555555555', id, 'authorized', 'card-trial@test.com', now() + interval '6 days', 'pre-5'
  FROM public.plans WHERE slug = 'basico';
UPDATE public.profiles SET access_kind = 'trial', plan_credits = 50, plan_period_end = now() + interval '6 days', trial_started_at = now() - interval '1 day'
 WHERE id = 'e5555555-5555-5555-5555-555555555555';

SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SET LOCAL role service_role;

-- ── Schema ──────────────────────────────────────────────────────────────────
SELECT has_column('public', 'subscription_invoices', 'refunded_at', 'subscription_invoices.refunded_at exists');
SELECT has_column('public', 'subscription_invoices', 'mp_refund_id', 'subscription_invoices.mp_refund_id exists');

-- ── refund_last_charge: finds the newest approved charge with money ─────────
CREATE TEMP TABLE found AS
  SELECT public.refund_last_charge('e1111111-1111-1111-1111-111111111111'::uuid) AS res;
SELECT is((SELECT res->>'success' FROM found), 'true', 'find: succeeds for a live subscriber');
SELECT results_eq(
  $$ SELECT res->>'invoice_id', res->>'mp_payment_id', (res->>'amount_brl')::numeric, res->>'subscription_id', res->>'mp_preapproval_id' FROM found $$,
  $$ VALUES ('ap-new'::text, 'pay-new'::text, 39.90::numeric, 'f0000000-0000-0000-0000-000000000001'::text, 'pre-1'::text) $$,
  'find: the newest approved invoice with an MP payment id (never the activation row, never a pending one)');
SELECT is(
  (SELECT plan_credits FROM public.profiles WHERE id = 'e1111111-1111-1111-1111-111111111111'),
  210, 'find: touches no money');

SELECT is(
  (SELECT public.refund_last_charge('e2222222-2222-2222-2222-222222222222'::uuid) ->> 'error'),
  'nothing_to_refund', 'find: a card trial without a charge has nothing to refund');
SELECT is(
  (SELECT public.refund_last_charge('e3333333-3333-3333-3333-333333333333'::uuid) ->> 'invoice_id'),
  'ap-3', 'find: a subscription cancelled less than 30 days ago is still refundable');
SELECT is(
  (SELECT public.refund_last_charge('e4444444-4444-4444-4444-444444444444'::uuid) ->> 'error'),
  'nothing_to_refund', 'find: cancelled more than 30 days ago is out of the window');
SELECT is(
  (SELECT public.refund_last_charge('e5555555-5555-5555-5555-555555555555'::uuid) ->> 'error'),
  'nothing_to_refund', 'find: unknown or chargeless user has nothing to refund');

-- ── confirm_refund: once, zeroes the plan bucket, keeps extras, cancels ─────
CREATE TEMP TABLE conf AS
  SELECT public.confirm_refund('ap-new', 'refund-1') AS res;
SELECT is((SELECT res->>'success' FROM conf), 'true', 'confirm: succeeds');
SELECT is((SELECT res->>'already' FROM conf), 'false', 'confirm: first confirmation');
SELECT is((SELECT (res->>'credits_removed')::int FROM conf), 210, 'confirm: reports the plan credits removed');
SELECT results_eq(
  $$ SELECT refunded_at IS NOT NULL, mp_refund_id FROM public.subscription_invoices WHERE id = 'ap-new' $$,
  $$ VALUES (true, 'refund-1'::text) $$,
  'confirm: the invoice records the refund');
SELECT results_eq(
  $$ SELECT access_kind, plan_credits, credit_balance, plan_period_end <= now()
       FROM public.profiles WHERE id = 'e1111111-1111-1111-1111-111111111111' $$,
  $$ VALUES ('subscriber'::text, 0, 30, true) $$,
  'confirm: plan bucket zeroed and closed, extras untouched');
SELECT results_eq(
  $$ SELECT type, bucket, delta, ref_id FROM public.credit_transactions
      WHERE user_id = 'e1111111-1111-1111-1111-111111111111' $$,
  $$ VALUES ('refund_clawback'::text, 'plan'::text, -210, 'f0000000-0000-0000-0000-000000000001'::uuid) $$,
  'confirm: one refund_clawback ledger line');
SELECT results_eq(
  $$ SELECT status, cancelled_at IS NOT NULL FROM public.subscriptions WHERE id = 'f0000000-0000-0000-0000-000000000001' $$,
  $$ VALUES ('cancelled'::text, true) $$,
  'confirm: the subscription is cancelled locally');

-- Replay: nothing happens twice.
SELECT is(
  (SELECT (public.confirm_refund('ap-new', 'refund-1') ->> 'already')::boolean),
  true, 'confirm: a replay is a no-op');
SELECT is(
  (SELECT count(*)::int FROM public.credit_transactions WHERE user_id = 'e1111111-1111-1111-1111-111111111111'),
  1, 'confirm: the replay wrote no ledger line');
SELECT is(
  (SELECT public.refund_last_charge('e1111111-1111-1111-1111-111111111111'::uuid) ->> 'error'),
  'nothing_to_refund', 'find: after the refund, the older charge is NOT offered (last charge only)');
SELECT is(
  (SELECT public.confirm_refund('does-not-exist', 'r') ->> 'error'),
  'invoice_not_found', 'confirm: unknown invoice');

-- An already-cancelled subscription: confirm keeps it cancelled and still zeroes the bucket.
UPDATE public.profiles SET plan_credits = 100, plan_period_end = now() + interval '10 days' WHERE id = 'e3333333-3333-3333-3333-333333333333';
SELECT is((SELECT public.confirm_refund('ap-3', 'refund-3') ->> 'success'), 'true', 'confirm: works on a cancelled subscription');
SELECT is(
  (SELECT plan_credits FROM public.profiles WHERE id = 'e3333333-3333-3333-3333-333333333333'),
  0, 'confirm: the leftover of a cancelled period is removed too');

-- ── admin_extend_trial refuses a card trial ─────────────────────────────────
SELECT is(
  (SELECT public.admin_extend_trial('e5555555-5555-5555-5555-555555555555'::uuid, 7) ->> 'error'),
  'card_trial', 'extend: a trial with card cannot be extended (MP charges on day 8 regardless)');
SELECT ok(
  (SELECT plan_period_end < now() + interval '7 days' FROM public.profiles WHERE id = 'e5555555-5555-5555-5555-555555555555'),
  'extend: the period was not moved');

-- ── ACL ─────────────────────────────────────────────────────────────────────
RESET role;
SELECT ok(NOT has_function_privilege('authenticated', 'public.refund_last_charge(uuid)', 'EXECUTE'), 'acl: authenticated cannot call refund_last_charge');
SELECT ok(NOT has_function_privilege('authenticated', 'public.confirm_refund(text, text)', 'EXECUTE'), 'acl: authenticated cannot call confirm_refund');

SELECT * FROM finish();
ROLLBACK;
