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
-- cancelled locally) -- but ONLY when this invoice's money actually landed in
-- the bucket it still owns: never granted (still pending/never claimed) or
-- MP's R$0 card-validation charge (case e) and money granted while the row
-- was not live, when the user holds ANOTHER live subscription (paid_while_
-- closed, case f) are both just closed, no confirm_refund, so a different,
-- unrelated live subscription of the same user is never clawed back by
-- mistake. Already-refunded invoices (by confirm_refund or a replayed
-- webhook) are only re-mirrored, never re-clawed, and a stale, out-of-order
-- 'approved' arriving after the refund was recorded can never re-grant or
-- reactivate (case g): the mirror upsert never lets payment_status regress
-- from 'refunded'/'charged_back' back to 'approved'.
-- =============================================================================
BEGIN;
SELECT plan(33);

INSERT INTO auth.users (id, email) VALUES
  ('e1111111-1111-1111-1111-111111111111', 'live-confirmed@test.com'),
  ('e2222222-2222-2222-2222-222222222222', 'already-refunded@test.com'),
  ('e3333333-3333-3333-3333-333333333333', 'never-granted-cancelled@test.com'),
  ('e4444444-4444-4444-4444-444444444444', 'zero-refund-trial@test.com'),
  ('e5555555-5555-5555-5555-555555555555', 'paid-while-closed@test.com'),
  ('e6666666-6666-6666-6666-666666666666', 'out-of-order@test.com');

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
SELECT results_eq(
  $$ SELECT refunded_at IS NOT NULL, mp_refund_id FROM public.subscription_invoices WHERE id = 'ap-z' $$,
  $$ VALUES (true, 'external:charged_back'::text) $$,
  'd) the invoice is marked refunded anyway (never money for confirm_refund to touch, but never approved again either)');

-- ── (e) a refunded R$0 card-validation charge on a live trial: no bucket to touch ─
INSERT INTO public.subscriptions (id, user_id, plan_id, status, payer_email, trial_ends_at)
SELECT 'f0000000-0000-0000-0000-000000000004', 'e4444444-4444-4444-4444-444444444444', id, 'pending',
       'zero-refund-trial@test.com', now() + interval '7 days'
  FROM public.plans WHERE slug = 'basico';
SELECT public.activate_subscription(
  'f0000000-0000-0000-0000-000000000004'::uuid, 'pre-e4', 'authorized',
  now() + interval '7 days', 'visa', '5682');
SELECT is(
  (SELECT public.renew_subscription(
     'f0000000-0000-0000-0000-000000000004'::uuid,
     jsonb_build_object('id', 'ap-zero-trial', 'mp_payment_id', 'pay-zero', 'status', 'processed',
                        'payment_status', 'approved', 'amount_brl', 0)) ->> 'result'),
  'ignored', 'setup: the R$0 card-validation charge is mirrored but never claimed');

SELECT is(
  (SELECT public.renew_subscription(
     'f0000000-0000-0000-0000-000000000004'::uuid,
     jsonb_build_object('id', 'ap-zero-trial', 'status', 'processed', 'payment_status', 'refunded')) ->> 'result'),
  'closed', 'e) a refund of the R$0 validation charge has no bucket to claw back, so it is just closed');
SELECT results_eq(
  $$ SELECT access_kind, plan_credits FROM public.profiles WHERE id = 'e4444444-4444-4444-4444-444444444444' $$,
  $$ VALUES ('trial'::text, 50) $$,
  'e) the trial credits are untouched');
SELECT results_eq(
  $$ SELECT status FROM public.subscriptions WHERE id = 'f0000000-0000-0000-0000-000000000004' $$,
  $$ VALUES ('authorized'::text) $$,
  'e) the live trial row is untouched, not cancelled');
SELECT results_eq(
  $$ SELECT refunded_at IS NOT NULL, mp_refund_id FROM public.subscription_invoices WHERE id = 'ap-zero-trial' $$,
  $$ VALUES (true, 'external:refunded'::text) $$,
  'e) the invoice is marked refunded so a later approved can never claim it as money');
SELECT is(
  (SELECT count(*)::int FROM public.credit_transactions WHERE user_id = 'e4444444-4444-4444-4444-444444444444' AND type = 'refund_clawback'),
  0, 'e) no refund_clawback ledger line (confirm_refund was never called)');

-- ── (f) refund of a paid_while_closed charge must not touch the user's OTHER live subscription ─
-- Subscription A: closed/orphan, will receive the orphan charge.
INSERT INTO public.subscriptions (id, user_id, plan_id, status, payer_email, cancelled_at)
SELECT 'f0000000-0000-0000-0000-000000000005', 'e5555555-5555-5555-5555-555555555555', id, 'cancelled',
       'paid-while-closed@test.com', now() - interval '1 day'
  FROM public.plans WHERE slug = 'basico';
-- Subscription B: the user's real, live subscription (own credits).
INSERT INTO public.subscriptions (id, user_id, plan_id, status, payer_email)
SELECT 'f0000000-0000-0000-0000-000000000006', 'e5555555-5555-5555-5555-555555555555', id, 'pending',
       'paid-while-closed@test.com'
  FROM public.plans WHERE slug = 'basico';
SELECT public.activate_subscription(
  'f0000000-0000-0000-0000-000000000006'::uuid, 'pre-e5b', 'authorized',
  now() + interval '1 month', 'visa', '5682');

SELECT is(
  (SELECT public.renew_subscription(
     'f0000000-0000-0000-0000-000000000005'::uuid,
     jsonb_build_object('id', 'ap-orphan', 'mp_payment_id', 'pay-orphan', 'status', 'processed',
                        'payment_status', 'approved', 'amount_brl', 39.90, 'debit_date', now()::text)) ->> 'result'),
  'paid_while_closed', 'setup: money on the closed row while another subscription is live is reported, not reactivated');

SELECT is(
  (SELECT public.renew_subscription(
     'f0000000-0000-0000-0000-000000000005'::uuid,
     jsonb_build_object('id', 'ap-orphan', 'status', 'processed', 'payment_status', 'refunded')) ->> 'result'),
  'closed', 'f) a refund of the paid_while_closed charge is just closed, never confirm_refund');
SELECT results_eq(
  $$ SELECT plan_credits FROM public.profiles WHERE id = 'e5555555-5555-5555-5555-555555555555' $$,
  $$ VALUES (300) $$,
  'f) the live subscription B keeps its own credits untouched');
SELECT results_eq(
  $$ SELECT status FROM public.subscriptions WHERE id = 'f0000000-0000-0000-0000-000000000006' $$,
  $$ VALUES ('authorized'::text) $$,
  'f) subscription B stays authorized');
SELECT is(
  (SELECT count(*)::int FROM public.credit_transactions WHERE user_id = 'e5555555-5555-5555-5555-555555555555' AND type = 'refund_clawback'),
  0, 'f) no refund_clawback ledger line');
SELECT results_eq(
  $$ SELECT refunded_at IS NOT NULL, mp_refund_id FROM public.subscription_invoices WHERE id = 'ap-orphan' $$,
  $$ VALUES (true, 'external:refunded'::text) $$,
  'f) the orphan invoice is marked refunded anyway');

-- ── (g) an out-of-order approved arriving after the refund never re-grants ─
INSERT INTO public.subscriptions (id, user_id, plan_id, status, payer_email)
SELECT 'f0000000-0000-0000-0000-000000000007', 'e6666666-6666-6666-6666-666666666666', id, 'pending',
       'out-of-order@test.com'
  FROM public.plans WHERE slug = 'basico';
SELECT public.activate_subscription(
  'f0000000-0000-0000-0000-000000000007'::uuid, 'pre-e6', 'authorized',
  now() + interval '1 month', 'visa', '5682');
SELECT public.renew_subscription(
  'f0000000-0000-0000-0000-000000000007'::uuid,
  jsonb_build_object('id', 'ap-g', 'mp_payment_id', 'pay-g', 'status', 'processed',
                     'payment_status', 'approved', 'amount_brl', 39.90, 'debit_date', now()::text));
SELECT is(
  (SELECT public.renew_subscription(
     'f0000000-0000-0000-0000-000000000007'::uuid,
     jsonb_build_object('id', 'ap-g', 'status', 'processed', 'payment_status', 'refunded')) ->> 'result'),
  'refunded_externally', 'setup: the granting charge is refunded externally');

SELECT is(
  (SELECT public.renew_subscription(
     'f0000000-0000-0000-0000-000000000007'::uuid,
     jsonb_build_object('id', 'ap-g', 'mp_payment_id', 'pay-g', 'status', 'processed',
                        'payment_status', 'approved', 'amount_brl', 39.90, 'debit_date', now()::text)) ->> 'result'),
  'refund_mirrored', 'g) a stale out-of-order approved for the already-refunded invoice is only mirrored');
SELECT results_eq(
  $$ SELECT plan_credits FROM public.profiles WHERE id = 'e6666666-6666-6666-6666-666666666666' $$,
  $$ VALUES (0) $$,
  'g) the plan bucket stays zeroed, not re-granted');
SELECT results_eq(
  $$ SELECT status FROM public.subscriptions WHERE id = 'f0000000-0000-0000-0000-000000000007' $$,
  $$ VALUES ('cancelled'::text) $$,
  'g) the subscription stays cancelled, not reactivated');
SELECT results_eq(
  $$ SELECT payment_status FROM public.subscription_invoices WHERE id = 'ap-g' $$,
  $$ VALUES ('refunded'::text) $$,
  'g) the mirror never lets the stale approved downgrade payment_status back from refunded');

-- ── existing pgTAP coverage stays green (rejected/approved paths untouched) ─
SELECT is(
  (SELECT public.renew_subscription(
     'f0000000-0000-0000-0000-000000000003'::uuid,
     jsonb_build_object('id', 'ap-z2', 'status', 'processed', 'payment_status', 'rejected')) ->> 'result'),
  'closed', 'a plain rejected payment on a closed row still just returns closed');

SELECT * FROM finish();
ROLLBACK;
