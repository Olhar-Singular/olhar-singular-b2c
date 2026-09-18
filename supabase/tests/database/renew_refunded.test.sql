-- =============================================================================
-- pgTAP: renew_subscription treats an external refund / chargeback (MP panel,
-- acquirer) exactly like our own self-service refund
-- -----------------------------------------------------------------------------
-- An authorized_payment can arrive with payment_status 'refunded' or
-- 'charged_back' when support refunds the charge directly in the MP panel, or
-- the cardholder's bank reverses it. Before this guard that just looked like
-- "not paid" to renew_subscription: a live confirmed subscription would be
-- marked past_due (money still gone, access untouched) and an unconfirmed one
-- would be clawed back (access removed, but the plan credits of the paid
-- period stayed granted). Both are wrong: the money went back, so the same
-- consequences as confirm_refund apply (plan bucket zeroed, subscription
-- cancelled locally). Already-refunded invoices (by confirm_refund or a
-- replayed webhook) are only re-mirrored, never re-clawed.
-- =============================================================================
BEGIN;
SELECT plan(16);

INSERT INTO auth.users (id, email) VALUES
  ('e1111111-1111-1111-1111-111111111111', 'live-confirmed@test.com'),
  ('e2222222-2222-2222-2222-222222222222', 'already-refunded@test.com'),
  ('e3333333-3333-3333-3333-333333333333', 'never-granted-cancelled@test.com');

SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SET LOCAL role service_role;

-- ── (a) live confirmed subscriber, its granting invoice is refunded externally ─
INSERT INTO public.subscriptions (id, user_id, plan_id, status, payer_email)
SELECT 'f0000000-0000-0000-0000-000000000001', 'e1111111-1111-1111-1111-111111111111', id, 'pending',
       'live-confirmed@test.com'
  FROM public.plans WHERE slug = 'basico';
SELECT public.activate_subscription(
  'f0000000-0000-0000-0000-000000000001'::uuid, 'pre-e1', 'authorized',
  now() + interval '1 month', 'visa', '5682');
SELECT is(
  (SELECT public.renew_subscription(
     'f0000000-0000-0000-0000-000000000001'::uuid,
     jsonb_build_object('id', 'ap-x', 'mp_payment_id', 'pay-x', 'status', 'processed',
                        'payment_status', 'approved', 'amount_brl', 39.90,
                        'debit_date', now()::text)) ->> 'result'),
  'first_payment_confirmed', 'setup: the granting charge confirms the subscription');

SELECT is(
  (SELECT public.renew_subscription(
     'f0000000-0000-0000-0000-000000000001'::uuid,
     jsonb_build_object('id', 'ap-x', 'status', 'processed', 'payment_status', 'refunded')) ->> 'result'),
  'refunded_externally', 'a) an external refund of the granting charge is reported as refunded_externally');
SELECT results_eq(
  $$ SELECT plan_credits, plan_period_end <= now() FROM public.profiles
      WHERE id = 'e1111111-1111-1111-1111-111111111111' $$,
  $$ VALUES (0, true) $$,
  'a) the plan bucket is zeroed and closed, exactly like confirm_refund');
SELECT results_eq(
  $$ SELECT type, bucket FROM public.credit_transactions
      WHERE user_id = 'e1111111-1111-1111-1111-111111111111' AND type = 'refund_clawback' $$,
  $$ VALUES ('refund_clawback'::text, 'plan'::text) $$,
  'a) one refund_clawback ledger line');
SELECT results_eq(
  $$ SELECT status FROM public.subscriptions WHERE id = 'f0000000-0000-0000-0000-000000000001' $$,
  $$ VALUES ('cancelled'::text) $$,
  'a) the subscription is cancelled locally');
SELECT results_eq(
  $$ SELECT refunded_at IS NOT NULL, mp_refund_id FROM public.subscription_invoices WHERE id = 'ap-x' $$,
  $$ VALUES (true, 'external:refunded'::text) $$,
  'a) the invoice mirrors the refund with an external mp_refund_id');

-- ── (b) a replay of the same external refund is only mirrored ──────────────
SELECT is(
  (SELECT public.renew_subscription(
     'f0000000-0000-0000-0000-000000000001'::uuid,
     jsonb_build_object('id', 'ap-x', 'status', 'processed', 'payment_status', 'refunded')) ->> 'result'),
  'refund_mirrored', 'b) a replay of the same refunded invoice is only mirrored');
SELECT is(
  (SELECT count(*)::int FROM public.credit_transactions
     WHERE user_id = 'e1111111-1111-1111-1111-111111111111' AND type = 'refund_clawback'),
  1, 'b) the replay wrote no second ledger line');
SELECT is(
  (SELECT plan_credits FROM public.profiles WHERE id = 'e1111111-1111-1111-1111-111111111111'),
  0, 'b) the plan bucket stays zeroed');

-- ── (c) an invoice already refunded via confirm_refund is only mirrored ────
INSERT INTO public.subscriptions (id, user_id, plan_id, status, payer_email, first_payment_confirmed, mp_preapproval_id)
SELECT 'f0000000-0000-0000-0000-000000000002', 'e2222222-2222-2222-2222-222222222222', id, 'authorized',
       'already-refunded@test.com', true, 'pre-e2'
  FROM public.plans WHERE slug = 'basico';
INSERT INTO public.subscription_invoices (id, subscription_id, mp_payment_id, status, payment_status, amount_brl, debit_date, granted_at)
VALUES ('ap-y', 'f0000000-0000-0000-0000-000000000002', 'pay-y', 'processed', 'approved', 39.90, now() - interval '2 days', now() - interval '2 days');
UPDATE public.profiles SET access_kind = 'subscriber', plan_credits = 300, plan_period_end = now() + interval '20 days'
 WHERE id = 'e2222222-2222-2222-2222-222222222222';

SELECT public.confirm_refund('ap-y', 'refund-1');
SELECT is(
  (SELECT public.renew_subscription(
     'f0000000-0000-0000-0000-000000000002'::uuid,
     jsonb_build_object('id', 'ap-y', 'status', 'processed', 'payment_status', 'refunded')) ->> 'result'),
  'refund_mirrored', 'c) an invoice already refunded by confirm_refund is only mirrored, never reprocessed');
SELECT is(
  (SELECT count(*)::int FROM public.credit_transactions
     WHERE user_id = 'e2222222-2222-2222-2222-222222222222' AND type = 'refund_clawback'),
  1, 'c) still just the one ledger line confirm_refund wrote');
SELECT results_eq(
  $$ SELECT mp_refund_id FROM public.subscription_invoices WHERE id = 'ap-y' $$,
  $$ VALUES ('refund-1'::text) $$,
  'c) the mp_refund_id stays the one confirm_refund recorded, not overwritten by the mirror');

-- ── (d) a chargeback on a cancelled subscription whose invoice was never granted ─
INSERT INTO public.subscriptions (id, user_id, plan_id, status, payer_email, cancelled_at)
SELECT 'f0000000-0000-0000-0000-000000000003', 'e3333333-3333-3333-3333-333333333333', id, 'cancelled',
       'never-granted-cancelled@test.com', now() - interval '1 day'
  FROM public.plans WHERE slug = 'basico';

SELECT is(
  (SELECT public.renew_subscription(
     'f0000000-0000-0000-0000-000000000003'::uuid,
     jsonb_build_object('id', 'ap-z', 'status', 'processed', 'payment_status', 'charged_back')) ->> 'result'),
  'closed', 'd) a chargeback on a cancelled subscription that was never granted is just closed');
SELECT is(
  (SELECT count(*)::int FROM public.credit_transactions WHERE user_id = 'e3333333-3333-3333-3333-333333333333'),
  0, 'd) no ledger line at all');
SELECT is(
  (SELECT refunded_at IS NULL FROM public.subscription_invoices WHERE id = 'ap-z'),
  true, 'd) the invoice is mirrored but confirm_refund was never called');

-- ── existing pgTAP coverage stays green (rejected/approved paths untouched) ─
SELECT is(
  (SELECT public.renew_subscription(
     'f0000000-0000-0000-0000-000000000003'::uuid,
     jsonb_build_object('id', 'ap-z2', 'status', 'processed', 'payment_status', 'rejected')) ->> 'result'),
  'closed', 'a plain rejected payment on a closed row still just returns closed');

SELECT * FROM finish();
ROLLBACK;
