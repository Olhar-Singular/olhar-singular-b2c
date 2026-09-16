-- =============================================================================
-- pgTAP: renew_subscription must not claw back / convert on an unsettled or
-- zero-amount invoice
-- -----------------------------------------------------------------------------
-- With a 7-day trial, MP may emit the day-8 authorized_payment ahead of the
-- debit (status 'scheduled', no payment block yet) or with payment.status in
-- pending/in_process/authorized (not captured yet). Before this guard,
-- renew_subscription treated anything that was not payment_status = 'approved'
-- as a definitive refusal: on a trial row (first_payment_confirmed = false)
-- that meant an immediate clawback, days before MP actually settles the
-- charge. A card-validation charge (amount_brl = 0) is never money either and
-- must not convert a trial nor renew anything. Both cases are now only
-- mirrored (result 'pending' / 'ignored'); MP sends the final state later.
-- =============================================================================
BEGIN;
SELECT plan(16);

INSERT INTO auth.users (id, email) VALUES
  ('e1111111-1111-1111-1111-111111111111', 'unsettled-trial@test.com'),
  ('e2222222-2222-2222-2222-222222222222', 'zero-amount-trial@test.com'),
  ('e3333333-3333-3333-3333-333333333333', 'unsettled-paid@test.com'),
  ('e4444444-4444-4444-4444-444444444444', 'confirmed-paid@test.com');

-- Trial row (activated below): first invoice arrives 'scheduled', no payment yet.
INSERT INTO public.subscriptions (id, user_id, plan_id, status, payer_email, trial_ends_at)
SELECT 'f0000000-0000-0000-0000-000000000001', 'e1111111-1111-1111-1111-111111111111', id, 'pending',
       'unsettled-trial@test.com', now() + interval '7 days'
  FROM public.plans WHERE slug = 'basico';
-- Second trial row: an approved but zero-amount invoice (card validation).
INSERT INTO public.subscriptions (id, user_id, plan_id, status, payer_email, trial_ends_at)
SELECT 'f0000000-0000-0000-0000-000000000002', 'e2222222-2222-2222-2222-222222222222', id, 'pending',
       'zero-amount-trial@test.com', now() + interval '7 days'
  FROM public.plans WHERE slug = 'basico';
-- Paid row (no trial_ends_at): first invoice arrives 'in_process'.
INSERT INTO public.subscriptions (id, user_id, plan_id, status, payer_email)
SELECT 'f0000000-0000-0000-0000-000000000003', 'e3333333-3333-3333-3333-333333333333', id, 'pending',
       'unsettled-paid@test.com'
  FROM public.plans WHERE slug = 'basico';
-- Paid row, already confirmed once: a later invoice arrives 'pending'.
INSERT INTO public.subscriptions (id, user_id, plan_id, status, payer_email)
SELECT 'f0000000-0000-0000-0000-000000000004', 'e4444444-4444-4444-4444-444444444444', id, 'pending',
       'confirmed-paid@test.com'
  FROM public.plans WHERE slug = 'basico';

SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SET LOCAL role service_role;

-- ── Trial row: a scheduled/pending charge ahead of the debit is only mirrored ─
SELECT public.activate_subscription(
  'f0000000-0000-0000-0000-000000000001'::uuid, 'pre-e1', 'authorized',
  now() + interval '7 days', 'visa', '5682');

SELECT is(
  (SELECT public.renew_subscription(
     'f0000000-0000-0000-0000-000000000001'::uuid,
     jsonb_build_object('id', 'ap-e1', 'status', 'scheduled', 'payment_status', 'pending')) ->> 'result'),
  'pending', 'trial: a scheduled invoice with pending payment is only mirrored');
SELECT results_eq(
  $$ SELECT access_kind, plan_credits FROM public.profiles WHERE id = 'e1111111-1111-1111-1111-111111111111' $$,
  $$ VALUES ('trial'::text, 50) $$,
  'trial: the profile keeps the 50 trial credits (no clawback)');
SELECT results_eq(
  $$ SELECT status, first_payment_confirmed FROM public.subscriptions
      WHERE id = 'f0000000-0000-0000-0000-000000000001' $$,
  $$ VALUES ('authorized'::text, false) $$,
  'trial: the row stays authorized, not confirmed yet');
SELECT is(
  (SELECT granted_at IS NULL FROM public.subscription_invoices WHERE id = 'ap-e1'),
  true, 'trial: the invoice is mirrored but not claimed');

-- Now the real debit lands (approved, day 8): converts the trial as before.
SELECT is(
  (SELECT public.renew_subscription(
     'f0000000-0000-0000-0000-000000000001'::uuid,
     jsonb_build_object('id', 'ap-e1b', 'mp_payment_id', 'pay-e1b', 'status', 'processed',
                        'payment_status', 'approved', 'amount_brl', 39.90,
                        'debit_date', (now() + interval '7 days')::text)) ->> 'result'),
  'trial_converted', 'trial: the settled charge still converts the trial');
SELECT results_eq(
  $$ SELECT access_kind, plan_credits FROM public.profiles WHERE id = 'e1111111-1111-1111-1111-111111111111' $$,
  $$ VALUES ('subscriber'::text, 300) $$,
  'trial: converted to subscriber with the plan quota');

-- ── Trial row: an approved but zero-amount invoice never converts ──────────
SELECT public.activate_subscription(
  'f0000000-0000-0000-0000-000000000002'::uuid, 'pre-e2', 'authorized',
  now() + interval '7 days', 'visa', '5682');

SELECT is(
  (SELECT public.renew_subscription(
     'f0000000-0000-0000-0000-000000000002'::uuid,
     jsonb_build_object('id', 'ap-e2', 'mp_payment_id', 'pay-e2', 'status', 'processed',
                        'payment_status', 'approved', 'amount_brl', 0)) ->> 'result'),
  'ignored', 'trial: an approved zero-amount invoice is ignored');
SELECT results_eq(
  $$ SELECT access_kind, plan_credits FROM public.profiles WHERE id = 'e2222222-2222-2222-2222-222222222222' $$,
  $$ VALUES ('trial'::text, 50) $$,
  'trial: zero-amount invoice, credits and access_kind untouched');
SELECT is(
  (SELECT count(*)::int FROM public.subscription_invoices WHERE id = 'ap-e2'),
  1, 'trial: the zero-amount invoice row exists (mirrored)');
SELECT is(
  (SELECT granted_at IS NULL FROM public.subscription_invoices WHERE id = 'ap-e2'),
  true, 'trial: the zero-amount invoice is never claimed');

-- ── Paid row (not confirmed yet): an in_process charge is only mirrored ────
SELECT public.activate_subscription(
  'f0000000-0000-0000-0000-000000000003'::uuid, 'pre-e3', 'authorized',
  now() + interval '1 month', 'visa', '5682');

SELECT is(
  (SELECT public.renew_subscription(
     'f0000000-0000-0000-0000-000000000003'::uuid,
     jsonb_build_object('id', 'ap-e3', 'status', 'processed', 'payment_status', 'in_process')) ->> 'result'),
  'pending', 'paid, unconfirmed: an in_process charge is only mirrored, no clawback');
SELECT results_eq(
  $$ SELECT plan_credits FROM public.profiles WHERE id = 'e3333333-3333-3333-3333-333333333333' $$,
  $$ VALUES (300) $$,
  'paid, unconfirmed: the plan credits are untouched');
SELECT results_eq(
  $$ SELECT status FROM public.subscriptions WHERE id = 'f0000000-0000-0000-0000-000000000003' $$,
  $$ VALUES ('authorized'::text) $$,
  'paid, unconfirmed: the row stays authorized');

-- The same row later gets a definitive rejection: still a clawback.
SELECT is(
  (SELECT public.renew_subscription(
     'f0000000-0000-0000-0000-000000000003'::uuid,
     jsonb_build_object('id', 'ap-e3b', 'status', 'processed', 'payment_status', 'rejected')) ->> 'result'),
  'clawback', 'paid, unconfirmed: a rejected charge is still a clawback');

-- ── Paid row (already confirmed): a pending charge never becomes past_due ──
SELECT public.activate_subscription(
  'f0000000-0000-0000-0000-000000000004'::uuid, 'pre-e4', 'authorized',
  now() + interval '1 month', 'visa', '5682');
SELECT public.renew_subscription(
  'f0000000-0000-0000-0000-000000000004'::uuid,
  jsonb_build_object('id', 'ap-e4a', 'mp_payment_id', 'pay-e4a', 'status', 'processed',
                     'payment_status', 'approved', 'amount_brl', 39.90,
                     'debit_date', (now() + interval '1 month')::text));

SELECT is(
  (SELECT public.renew_subscription(
     'f0000000-0000-0000-0000-000000000004'::uuid,
     jsonb_build_object('id', 'ap-e4b', 'status', 'processed', 'payment_status', 'pending')) ->> 'result'),
  'pending', 'paid, confirmed: a pending charge is only mirrored');
SELECT results_eq(
  $$ SELECT status FROM public.subscriptions WHERE id = 'f0000000-0000-0000-0000-000000000004' $$,
  $$ VALUES ('authorized'::text) $$,
  'paid, confirmed: the row stays authorized, not past_due');

SELECT * FROM finish();
ROLLBACK;
