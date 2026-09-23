-- =============================================================================
-- pgTAP: webhook guards (migration 20260916000002 + hardening 20260915000001)
-- -----------------------------------------------------------------------------
-- A charge for a row that is not live must never flip it to 'authorized'
-- without the quota; sync must propagate a refused activation; the
-- mp_preapproval_id collision branch of activate_subscription is exercised.
-- =============================================================================
BEGIN;
SELECT plan(16);

INSERT INTO auth.users (id, email) VALUES
  ('c1111111-1111-1111-1111-111111111111', 'abandoned@test.com'),
  ('c2222222-2222-2222-2222-222222222222', 'retried@test.com'),
  ('c3333333-3333-3333-3333-333333333333', 'collision@test.com');
UPDATE public.profiles SET access_kind = 'legacy', plan_credits = 0, plan_period_end = NULL, credit_balance = 2
 WHERE id IN ('c1111111-1111-1111-1111-111111111111', 'c2222222-2222-2222-2222-222222222222', 'c3333333-3333-3333-3333-333333333333');

-- c1: a pending attempt expired to rejected/abandoned, then MP charged it.
INSERT INTO public.subscriptions (id, user_id, plan_id, status, status_detail, payer_email, mp_preapproval_id)
SELECT 'd0000000-0000-0000-0000-000000000001', 'c1111111-1111-1111-1111-111111111111', id, 'rejected', 'abandoned', 'abandoned@test.com', 'pre-c1'
  FROM public.plans WHERE slug = 'basico';
-- c2: an abandoned attempt AND a later live subscription.
INSERT INTO public.subscriptions (id, user_id, plan_id, status, status_detail, payer_email, mp_preapproval_id)
SELECT 'd0000000-0000-0000-0000-000000000002', 'c2222222-2222-2222-2222-222222222222', id, 'rejected', 'abandoned', 'retried@test.com', 'pre-c2-old'
  FROM public.plans WHERE slug = 'basico';
INSERT INTO public.subscriptions (id, user_id, plan_id, status, payer_email, mp_preapproval_id, first_payment_confirmed)
SELECT 'd0000000-0000-0000-0000-000000000003', 'c2222222-2222-2222-2222-222222222222', id, 'authorized', 'retried@test.com', 'pre-c2-new', true
  FROM public.plans WHERE slug = 'profissional';
-- c3: two pending rows, the webhook reports the same preapproval for both.
INSERT INTO public.subscriptions (id, user_id, plan_id, status, payer_email)
SELECT 'd0000000-0000-0000-0000-000000000004', 'c3333333-3333-3333-3333-333333333333', id, 'pending', 'collision@test.com'
  FROM public.plans WHERE slug = 'basico';
INSERT INTO public.subscriptions (id, user_id, plan_id, status, payer_email)
SELECT 'd0000000-0000-0000-0000-000000000005', 'c3333333-3333-3333-3333-333333333333', id, 'pending', 'collision@test.com'
  FROM public.plans WHERE slug = 'basico';

SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SET LOCAL role service_role;

-- ── renew on a closed row with no other live subscription: reactivate WITH quota
SELECT is(
  (SELECT public.renew_subscription('d0000000-0000-0000-0000-000000000001'::uuid,
     '{"id":"ap-1","payment_status":"approved","status":"processed","amount_brl":"19.90","debit_date":"2026-09-12T12:00:00Z"}'::jsonb) ->> 'result'),
  'reactivated', 'renew: a paid charge for an abandoned row reactivates it');
SELECT results_eq(
  $$ SELECT status, status_detail, first_payment_confirmed, current_period_end IS NOT NULL
       FROM public.subscriptions WHERE id = 'd0000000-0000-0000-0000-000000000001' $$,
  $$ VALUES ('authorized'::text, NULL::text, true, true) $$,
  'renew: the reactivated row is live and confirmed');
SELECT results_eq(
  $$ SELECT access_kind, plan_credits, credit_balance FROM public.profiles
      WHERE id = 'c1111111-1111-1111-1111-111111111111' $$,
  $$ VALUES ('subscriber'::text, 300, 2) $$,
  'renew: the user got the plan quota (the money was taken)');
SELECT is(
  (SELECT public.renew_subscription('d0000000-0000-0000-0000-000000000001'::uuid,
     '{"id":"ap-1","payment_status":"approved"}'::jsonb) ->> 'result'),
  'already_processed', 'renew: the same invoice again is a no-op');

-- ── renew on a closed row while another subscription is live: report, no quota
SELECT is(
  (SELECT public.renew_subscription('d0000000-0000-0000-0000-000000000002'::uuid,
     '{"id":"ap-2","payment_status":"approved","status":"processed"}'::jsonb) ->> 'result'),
  'paid_while_closed', 'renew: money for an abandoned row while another is live is reported');
SELECT is(
  (SELECT status FROM public.subscriptions WHERE id = 'd0000000-0000-0000-0000-000000000002'),
  'rejected', 'renew: the abandoned row stays closed');
SELECT is(
  (SELECT plan_credits FROM public.profiles WHERE id = 'c2222222-2222-2222-2222-222222222222'),
  0, 'renew: no quota was granted for the orphan charge');
SELECT is(
  (SELECT granted_at IS NOT NULL FROM public.subscription_invoices WHERE id = 'ap-2'),
  true, 'renew: the orphan invoice is still claimed (never granted twice)');

-- ── a declined charge for a closed row does nothing
SELECT is(
  (SELECT public.renew_subscription('d0000000-0000-0000-0000-000000000002'::uuid,
     '{"id":"ap-3","payment_status":"rejected","status":"processed"}'::jsonb) ->> 'result'),
  'closed', 'renew: a decline for a closed row is acknowledged without clawback');

-- ── sync propagates a refused activation
SELECT is(
  (SELECT public.sync_subscription_status('d0000000-0000-0000-0000-000000000004'::uuid, 'pre-c3', 'authorized', now() + interval '1 month') ->> 'result'),
  'activated', 'sync: the first pending row of the user activates');
SELECT is(
  public.sync_subscription_status('d0000000-0000-0000-0000-000000000005'::uuid, 'pre-c3', 'authorized', now() + interval '1 month'),
  '{"success": false, "result": "duplicate_live_subscription", "error": "duplicate_live_subscription"}'::jsonb,
  'sync: the second pending row with the SAME preapproval is refused, not reported as activated');
SELECT results_eq(
  $$ SELECT status, status_detail, mp_preapproval_id FROM public.subscriptions
      WHERE id = 'd0000000-0000-0000-0000-000000000005' $$,
  $$ VALUES ('rejected'::text, 'duplicate_live_subscription'::text, NULL::text) $$,
  'activate: on an mp_preapproval_id collision the loser keeps its (null) preapproval id');
SELECT is(
  (SELECT mp_preapproval_id FROM public.subscriptions WHERE id = 'd0000000-0000-0000-0000-000000000004'),
  'pre-c3', 'activate: the winner keeps the preapproval id');
SELECT is(
  (SELECT plan_credits FROM public.profiles WHERE id = 'c3333333-3333-3333-3333-333333333333'),
  300, 'activate: the quota was granted exactly once');

-- ── sync on a closed row is inert
SELECT is(
  (SELECT public.sync_subscription_status('d0000000-0000-0000-0000-000000000005'::uuid, 'pre-c3', 'authorized', NULL) ->> 'result'),
  'unchanged', 'sync: authorized for a rejected row changes nothing');

RESET role;

SELECT ok(
  NOT has_function_privilege('authenticated', 'public.sync_subscription_status(uuid, text, text, timestamptz)', 'EXECUTE'),
  'authenticated cannot EXECUTE sync_subscription_status');

SELECT * FROM finish();
ROLLBACK;
