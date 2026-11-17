-- =============================================================================
-- pgTAP: Pix prepaid plan (spec 2026-11-15-checkout-pix-a-vista)
-- -----------------------------------------------------------------------------
-- Catalogue visibility, the extra-only guard on approve_purchase_and_grant,
-- and the money RPCs of the prepaid plan: approve (1st month now, the rest
-- locked until day 8), extend on rebuy, hourly release, refund, and the
-- helpers the edge functions read (user lookup by e-mail, active plan end).
-- =============================================================================
BEGIN;
SELECT plan(43);

-- ── Fixtures ────────────────────────────────────────────────────────────────
INSERT INTO auth.users (id, email) VALUES
  ('a1111111-1111-1111-1111-111111111111', 'Buyer@Test.com'),
  ('a2222222-2222-2222-2222-222222222222', 'other@test.com'),
  ('a3333333-3333-3333-3333-333333333333', 'monthly@test.com');

-- The buyer is an invited trial (no card) with credits left: buying replaces it.
UPDATE public.profiles
   SET access_kind = 'trial', plan_credits = 20, plan_period_end = now() + interval '3 days',
       credit_balance = 5
 WHERE id = 'a1111111-1111-1111-1111-111111111111';

-- ── Catalogue ───────────────────────────────────────────────────────────────
SELECT results_eq(
  $$ SELECT slug, months, credits, price_brl, highlight FROM public.prepaid_plans
      WHERE NOT admin_only ORDER BY sort_order $$,
  $$ VALUES ('pix-1-mes'::text, 1, 300, 39.90::numeric(10,2), false),
            ('pix-3-meses'::text, 3, 900, 89.90::numeric(10,2), true),
            ('pix-12-meses'::text, 12, 3600, 329.90::numeric(10,2), false) $$,
  'the three public offers carry the prices of D8');

SELECT is(
  (SELECT count(*)::int FROM public.prepaid_plans WHERE admin_only AND price_brl = 1.00 AND credits = 1),
  1, 'there is one R$1 admin-only smoke offer');

SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
SET LOCAL role anon;
SELECT is((SELECT count(*)::int FROM public.prepaid_plans), 3, 'anon sees the public offers only');
SELECT throws_ok(
  $$ UPDATE public.prepaid_plans SET price_brl = 0.01 $$,
  '42501', NULL, 'anon cannot write the catalogue');
RESET role;
SELECT set_config('request.jwt.claims', '', true);

-- ── Purchases used below ────────────────────────────────────────────────────
INSERT INTO public.credit_purchases
  (id, user_id, amount_brl, credits_granted, status, provider, payment_method,
   kind, prepaid_plan_id, plan_months, buyer_email, buyer_name, terms_version)
VALUES
  -- 3 months bought anonymously by the trial buyer
  ('c1000000-0000-0000-0000-000000000001', NULL, 89.90, 900, 'pending', 'mercadopago', 'pix',
   'plan', (SELECT id FROM public.prepaid_plans WHERE slug = 'pix-3-meses'), 3,
   'buyer@test.com', 'Ana', '2026-11.1'),
  -- a rebuy of 12 months by the same user, logged in
  ('c1000000-0000-0000-0000-000000000002', 'a1111111-1111-1111-1111-111111111111', 329.90, 3600, 'pending', 'mercadopago', 'pix',
   'plan', (SELECT id FROM public.prepaid_plans WHERE slug = 'pix-12-meses'), 12, NULL, NULL, NULL),
  -- 1 month for another user
  ('c1000000-0000-0000-0000-000000000003', 'a3333333-3333-3333-3333-333333333333', 39.90, 300, 'pending', 'mercadopago', 'pix',
   'plan', (SELECT id FROM public.prepaid_plans WHERE slug = 'pix-1-mes'), 1, NULL, NULL, NULL);

-- ── approve_purchase_and_grant never grants a plan as extras ─────────────────
SELECT is(
  (SELECT (public.approve_purchase_and_grant('c1000000-0000-0000-0000-000000000003', 'mp-x') ->> 'granted')::boolean),
  false, 'the extras RPC refuses a plan purchase');
SELECT is(
  (SELECT status FROM public.credit_purchases WHERE id = 'c1000000-0000-0000-0000-000000000003'),
  'pending', 'and leaves it pending for the plan RPC');

-- ── user_id_by_email ────────────────────────────────────────────────────────
SELECT is(public.user_id_by_email('  BUYER@test.COM '), 'a1111111-1111-1111-1111-111111111111'::uuid,
  'the lookup ignores case and surrounding spaces');
SELECT is(public.user_id_by_email('nobody@test.com'), NULL::uuid, 'an unknown e-mail has no user');

-- ── approve_prepaid_plan: 3 months replacing a trial bucket ──────────────────
SELECT is(
  (SELECT (public.approve_prepaid_plan('c1000000-0000-0000-0000-000000000001', 'mp-1',
     'a1111111-1111-1111-1111-111111111111') ->> 'granted')::boolean),
  true, 'a pending plan purchase is approved');

SELECT results_eq(
  $$ SELECT access_kind, plan_credits, plan_period_end, credit_balance, terms_version
       FROM public.profiles WHERE id = 'a1111111-1111-1111-1111-111111111111' $$,
  $$ VALUES ('subscriber'::text, 300, now() + interval '3 months', 5, '2026-11.1'::text) $$,
  'the 1st month lands now, the trial is replaced, extras stay, terms are recorded');

SELECT results_eq(
  $$ SELECT status, user_id, payment_id, plan_locked_credits, plan_unlock_at, plan_period_end
       FROM public.credit_purchases WHERE id = 'c1000000-0000-0000-0000-000000000001' $$,
  $$ VALUES ('approved'::text, 'a1111111-1111-1111-1111-111111111111'::uuid, 'mp-1'::text, 600,
             now() + interval '7 days', now() + interval '3 months') $$,
  'the purchase gets its owner, 600 locked until day 8 and the period end');

SELECT is(
  (SELECT count(*)::int FROM public.credit_transactions
    WHERE user_id = 'a1111111-1111-1111-1111-111111111111' AND bucket = 'plan'
      AND ((type = 'plan_reset' AND delta = -20) OR (type = 'plan_grant' AND delta = 300))
      AND ref_id = 'c1000000-0000-0000-0000-000000000001'),
  2, 'the ledger closes the trial credits and grants the 1st month');

SELECT is(
  (SELECT public.approve_prepaid_plan('c1000000-0000-0000-0000-000000000001', 'mp-1',
     'a1111111-1111-1111-1111-111111111111') ->> 'reason'),
  'already_processed', 'a replayed approval is a no-op');
SELECT is(
  (SELECT plan_credits FROM public.profiles WHERE id = 'a1111111-1111-1111-1111-111111111111'),
  300, 'the replay granted nothing');

SELECT throws_ok(
  $$ SELECT public.approve_prepaid_plan('c1000000-0000-0000-0000-000000000003', 'mp-3',
       'a2222222-2222-2222-2222-222222222222') $$,
  NULL, NULL, 'a purchase owned by someone else cannot be approved for another user');
SELECT is(
  (SELECT status FROM public.credit_purchases WHERE id = 'c1000000-0000-0000-0000-000000000003'),
  'pending', 'the failed approval rolled back the claim');

-- ── prepaid_plan_active ─────────────────────────────────────────────────────
SELECT is(public.prepaid_plan_active('a1111111-1111-1111-1111-111111111111'), now() + interval '3 months',
  'the active prepaid plan ends with the bucket');
SELECT is(public.prepaid_plan_active('a2222222-2222-2222-2222-222222222222'), NULL::timestamptz,
  'no prepaid plan, no end');

-- ── Rebuy: extends from the current end and adds the 1st month ──────────────
SELECT is(
  (SELECT (public.approve_prepaid_plan('c1000000-0000-0000-0000-000000000002', 'mp-2',
     'a1111111-1111-1111-1111-111111111111') ->> 'credits_locked')::int),
  3300, 'a 12-month rebuy locks all but its 1st month');
SELECT results_eq(
  $$ SELECT plan_credits, plan_period_end FROM public.profiles
      WHERE id = 'a1111111-1111-1111-1111-111111111111' $$,
  $$ VALUES (600, now() + interval '3 months' + interval '12 months') $$,
  'the rebuy adds 300 and pushes the end 12 months past the current one');
SELECT is(
  (SELECT count(*)::int FROM public.credit_transactions
    WHERE ref_id = 'c1000000-0000-0000-0000-000000000002' AND type = 'plan_reset'),
  0, 'extending does not reset the bucket');
SELECT is(public.prepaid_plan_active('a1111111-1111-1111-1111-111111111111'),
  now() + interval '3 months' + interval '12 months', 'the active end follows the extension');

-- ── 1 month: nothing locked ─────────────────────────────────────────────────
SELECT results_eq(
  $$ SELECT (r ->> 'credits_now')::int, (r ->> 'credits_locked')::int, r ->> 'unlock_at'
       FROM (SELECT public.approve_prepaid_plan('c1000000-0000-0000-0000-000000000003', 'mp-3',
               'a3333333-3333-3333-3333-333333333333') AS r) s $$,
  $$ VALUES (300, 0, NULL::text) $$,
  'a 1-month plan releases everything at once');

-- ── release_prepaid_credits ─────────────────────────────────────────────────
SELECT is(public.release_prepaid_credits(), 0, 'nothing is released before day 8');

UPDATE public.credit_purchases SET plan_unlock_at = now() - interval '1 minute'
 WHERE id = 'c1000000-0000-0000-0000-000000000001';
SELECT is(public.release_prepaid_credits(), 1, 'one purchase is due');
SELECT is(
  (SELECT plan_credits FROM public.profiles WHERE id = 'a1111111-1111-1111-1111-111111111111'),
  1200, 'the 600 locked credits joined the bucket');
SELECT is(
  (SELECT count(*)::int FROM public.credit_transactions
    WHERE ref_id = 'c1000000-0000-0000-0000-000000000001' AND type = 'plan_grant' AND delta = 600),
  1, 'the release is in the ledger');
SELECT is(public.release_prepaid_credits(), 0, 'a released purchase is never released twice');
SELECT isnt(
  (SELECT plan_released_at FROM public.credit_purchases WHERE id = 'c1000000-0000-0000-0000-000000000001'),
  NULL, 'the purchase records when it was released');

-- ── refund_prepaid_plan ─────────────────────────────────────────────────────
-- Refund of the 12-month rebuy (still locked): its released 300 leave, the lock dies,
-- the end goes back 12 months.
SELECT is(
  (SELECT (public.refund_prepaid_plan('c1000000-0000-0000-0000-000000000002', 'mp-2') ->> 'credits_removed')::int),
  300, 'the refund removes what this purchase released');
SELECT results_eq(
  $$ SELECT plan_credits, plan_period_end FROM public.profiles
      WHERE id = 'a1111111-1111-1111-1111-111111111111' $$,
  $$ VALUES (900, now() + interval '3 months' + interval '12 months' - interval '12 months') $$,
  'the bucket and the end go back');
SELECT results_eq(
  $$ SELECT status, plan_locked_credits, refunded_at IS NOT NULL FROM public.credit_purchases
      WHERE id = 'c1000000-0000-0000-0000-000000000002' $$,
  $$ VALUES ('refunded'::text, 0, true) $$,
  'the purchase is refunded and its lock cancelled');
SELECT is(
  (SELECT count(*)::int FROM public.credit_transactions
    WHERE ref_id = 'c1000000-0000-0000-0000-000000000002' AND type = 'clawback' AND delta = -300),
  1, 'the clawback is in the ledger');
SELECT is(
  (SELECT (public.refund_prepaid_plan('c1000000-0000-0000-0000-000000000002', 'mp-2') ->> 'refunded')::boolean),
  false, 'a replayed refund is a no-op');

-- A refunded purchase is never released, even when its unlock date passes.
UPDATE public.credit_purchases SET plan_unlock_at = now() - interval '1 minute', plan_locked_credits = 3300
 WHERE id = 'c1000000-0000-0000-0000-000000000002';
SELECT is(public.release_prepaid_credits(), 0, 'a refunded purchase is never released');

-- Refund removing more than the balance holds stops at the balance, and the end
-- never goes before now.
UPDATE public.profiles SET plan_credits = 100 WHERE id = 'a3333333-3333-3333-3333-333333333333';
SELECT is(
  (SELECT (public.refund_prepaid_plan('c1000000-0000-0000-0000-000000000003', 'mp-3') ->> 'credits_removed')::int),
  100, 'the clawback is capped by the balance');
SELECT is(
  (SELECT plan_period_end FROM public.profiles WHERE id = 'a3333333-3333-3333-3333-333333333333'),
  now(), 'a fully refunded plan ends now, never in the past');
SELECT is(public.prepaid_plan_active('a3333333-3333-3333-3333-333333333333'), NULL::timestamptz,
  'a refunded plan is no longer active');

-- An expired period forfeits the locked part instead of reviving the bucket.
INSERT INTO public.credit_purchases
  (id, user_id, amount_brl, credits_granted, status, provider, payment_method, kind, plan_months,
   plan_locked_credits, plan_unlock_at, plan_period_end)
VALUES
  ('c1000000-0000-0000-0000-000000000004', 'a2222222-2222-2222-2222-222222222222', 89.90, 900, 'approved',
   'mercadopago', 'pix', 'plan', 3, 600, now() - interval '1 minute', now() - interval '1 day');
UPDATE public.profiles SET plan_credits = 0, plan_period_end = now() - interval '1 day'
 WHERE id = 'a2222222-2222-2222-2222-222222222222';
SELECT is(public.release_prepaid_credits(), 1, 'the expired purchase is closed out');
SELECT is(
  (SELECT plan_credits FROM public.profiles WHERE id = 'a2222222-2222-2222-2222-222222222222'),
  0, 'but nothing entered an expired bucket');

-- ── ACL: service_role only ──────────────────────────────────────────────────
SELECT ok(NOT has_function_privilege('authenticated', 'public.approve_prepaid_plan(uuid, text, uuid)', 'EXECUTE'),
  'authenticated cannot EXECUTE approve_prepaid_plan');
SELECT ok(NOT has_function_privilege('anon', 'public.user_id_by_email(text)', 'EXECUTE'),
  'anon cannot EXECUTE user_id_by_email');
SELECT ok(NOT has_function_privilege('authenticated', 'public.refund_prepaid_plan(uuid, text)', 'EXECUTE')
      AND NOT has_function_privilege('authenticated', 'public.release_prepaid_credits()', 'EXECUTE')
      AND NOT has_function_privilege('authenticated', 'public.prepaid_plan_active(uuid)', 'EXECUTE'),
  'authenticated cannot EXECUTE the other prepaid RPCs');

SELECT * FROM finish();
ROLLBACK;
