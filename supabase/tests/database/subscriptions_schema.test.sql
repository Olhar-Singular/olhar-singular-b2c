-- =============================================================================
-- pgTAP: plans, subscriptions and subscription_invoices (schema + RLS)
-- -----------------------------------------------------------------------------
-- plans is the single source of truth for the monthly plans: the landing page
-- reads it without a session, the checkout validates slug and price against it,
-- and the admin-only R$1/month smoke plan is visible to super-admins only.
-- subscriptions mirrors the Mercado Pago preapproval (one live subscription per
-- user); subscription_invoices mirrors each recurring charge. Owners read their
-- own rows; only service_role writes any of the three.
-- =============================================================================
BEGIN;
SELECT plan(21);

INSERT INTO auth.users (id, email) VALUES
  ('a1111111-1111-1111-1111-111111111111', 'regular@test.com'),
  ('a2222222-2222-2222-2222-222222222222', 'admin@test.com'),
  ('a3333333-3333-3333-3333-333333333333', 'other@test.com');
UPDATE public.profiles SET is_super_admin = true WHERE id = 'a2222222-2222-2222-2222-222222222222';

-- ── plans: seed and visibility ──────────────────────────────────────────────
SELECT has_table('public', 'plans', 'plans exists');
SELECT results_eq(
  $$ SELECT slug, price_brl::text, monthly_credits, highlight FROM public.plans
      WHERE active AND NOT admin_only ORDER BY sort_order $$,
  $$ VALUES ('basico'::text, '19.90'::text, 60, false),
            ('profissional', '59.90', 240, true),
            ('avancado', '99.90', 500, false) $$,
  'seed: the three public monthly plans with their credits');
SELECT is(
  (SELECT count(*)::int FROM public.plans WHERE admin_only AND active),
  1, 'seed: one admin-only smoke plan');

SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
SET LOCAL role anon;
SELECT is((SELECT count(*)::int FROM public.plans), 3, 'anon sees the three public plans');
RESET role;

SELECT set_config('request.jwt.claims',
  '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
SET LOCAL role authenticated;
SELECT is((SELECT count(*)::int FROM public.plans), 3, 'a regular user sees the three public plans');
SELECT throws_ok(
  $$ UPDATE public.plans SET price_brl = 0.01 $$, '42501', NULL,
  'authenticated cannot change a plan price');
RESET role;

SELECT set_config('request.jwt.claims',
  '{"sub":"a2222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
SET LOCAL role authenticated;
SELECT is((SELECT count(*)::int FROM public.plans), 4, 'a super-admin also sees the smoke plan');
RESET role;

-- ── subscriptions: shape, one live per user, owner read ─────────────────────
SELECT has_table('public', 'subscriptions', 'subscriptions exists');
SELECT has_table('public', 'subscription_invoices', 'subscription_invoices exists');
SELECT has_column('public', 'profiles', 'plan_period_start', 'profiles.plan_period_start exists');

INSERT INTO public.subscriptions (id, user_id, plan_id, status, payer_email)
SELECT 'b0000000-0000-0000-0000-000000000001', 'a1111111-1111-1111-1111-111111111111', id, 'authorized', 'regular@test.com'
  FROM public.plans WHERE slug = 'profissional';

SELECT throws_ok(
  $$ INSERT INTO public.subscriptions (id, user_id, plan_id, status, payer_email)
     SELECT 'b0000000-0000-0000-0000-000000000002', 'a1111111-1111-1111-1111-111111111111', id, 'past_due', 'regular@test.com'
       FROM public.plans WHERE slug = 'basico' $$,
  '23505', NULL, 'a user cannot hold two live subscriptions');

SELECT lives_ok(
  $$ INSERT INTO public.subscriptions (id, user_id, plan_id, status, payer_email)
     SELECT 'b0000000-0000-0000-0000-000000000003', 'a1111111-1111-1111-1111-111111111111', id, 'cancelled', 'regular@test.com'
       FROM public.plans WHERE slug = 'basico' $$,
  'a cancelled subscription does not count as live');

SELECT throws_ok(
  $$ UPDATE public.subscriptions SET status = 'weird' WHERE id = 'b0000000-0000-0000-0000-000000000001' $$,
  '23514', NULL, 'status outside the allowed set is rejected');

INSERT INTO public.subscription_invoices (id, subscription_id, status, payment_status, amount_brl, debit_date)
VALUES ('ap-1', 'b0000000-0000-0000-0000-000000000001', 'processed', 'approved', 59.90, now());

SELECT set_config('request.jwt.claims',
  '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
SET LOCAL role authenticated;
SELECT is((SELECT count(*)::int FROM public.subscriptions), 2, 'the owner reads their own subscriptions');
SELECT is((SELECT count(*)::int FROM public.subscription_invoices), 1, 'the owner reads their own invoices');
SELECT throws_ok(
  $$ UPDATE public.subscriptions SET status = 'cancelled' WHERE id = 'b0000000-0000-0000-0000-000000000001' $$,
  '42501', NULL, 'the owner cannot change their subscription directly');
SELECT throws_ok(
  $$ INSERT INTO public.subscription_invoices (id, subscription_id, status) VALUES ('hack', 'b0000000-0000-0000-0000-000000000001', 'x') $$,
  '42501', NULL, 'the owner cannot forge an invoice');
RESET role;

SELECT set_config('request.jwt.claims',
  '{"sub":"a3333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
SET LOCAL role authenticated;
SELECT is((SELECT count(*)::int FROM public.subscriptions), 0, 'another user sees no subscription');
SELECT is((SELECT count(*)::int FROM public.subscription_invoices), 0, 'another user sees no invoice');
RESET role;

SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
SET LOCAL role anon;
SELECT throws_ok(
  $$ SELECT * FROM public.subscriptions $$, '42501', NULL, 'anon cannot read subscriptions');
RESET role;

-- ── guard covers the new profile column ─────────────────────────────────────
SELECT set_config('request.jwt.claims',
  '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
SET LOCAL role authenticated;
SELECT throws_ok(
  $$ UPDATE public.profiles SET plan_period_start = now() WHERE id = 'a1111111-1111-1111-1111-111111111111' $$,
  'not authorized to change credit fields', 'authenticated cannot edit plan_period_start');
RESET role;

SELECT * FROM finish();
ROLLBACK;
