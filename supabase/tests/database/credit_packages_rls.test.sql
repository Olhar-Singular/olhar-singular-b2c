-- =============================================================================
-- pgTAP: public.credit_packages (extra credit packages as data, not code)
-- -----------------------------------------------------------------------------
-- The purchasable packages used to be a hardcoded whitelist duplicated in three
-- places (edge functions, CreditsPage, PricingSection). They now live in a table
-- so prices change without a deploy. The table is public to READ (the landing
-- page has no session) but only service_role writes it, and the super-admin-only
-- R$1 smoke package must never be visible to, or purchasable by, a regular user.
--
-- Also guards the credit_purchases tweaks that ship with it: provider defaults
-- back to 'mercadopago' (Stripe is gone) and status_detail exists for card
-- rejections.
-- =============================================================================
BEGIN;
SELECT plan(12);

-- ── Fixtures ────────────────────────────────────────────────────────────────
INSERT INTO auth.users (id, email) VALUES
  ('a1111111-1111-1111-1111-111111111111', 'regular@test.com'),
  ('a2222222-2222-2222-2222-222222222222', 'admin@test.com');
UPDATE public.profiles SET is_super_admin = true
 WHERE id = 'a2222222-2222-2222-2222-222222222222';

-- An inactive package must be invisible to everyone but service_role.
INSERT INTO public.credit_packages (credits, price_brl, label, sort_order, active)
VALUES (999, 999.00, 'Descontinuado', 50, false);

-- ── Shape ───────────────────────────────────────────────────────────────────
SELECT has_table('public', 'credit_packages', 'credit_packages exists');

SELECT is(
  (SELECT count(*)::int FROM public.credit_packages WHERE active AND NOT admin_only),
  3, 'seed: three public packages');

SELECT is(
  (SELECT count(*)::int FROM public.credit_packages WHERE active AND admin_only),
  1, 'seed: one super-admin-only smoke package');

SELECT is(
  (SELECT credits FROM public.credit_packages WHERE admin_only AND active),
  1, 'the smoke package is 1 credit');

-- ── anon: public read, no admin_only, no inactive ───────────────────────────
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
SET LOCAL role anon;

SELECT is(
  (SELECT count(*)::int FROM public.credit_packages),
  3, 'anon sees exactly the three public active packages');

SELECT is(
  (SELECT count(*)::int FROM public.credit_packages WHERE admin_only OR NOT active),
  0, 'anon sees neither admin_only nor inactive packages');

RESET role;

-- ── regular authenticated user: same as anon, and read-only ─────────────────
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
SET LOCAL role authenticated;

SELECT is(
  (SELECT count(*)::int FROM public.credit_packages),
  3, 'a regular user sees the three public packages only');

SELECT throws_ok(
  $$ INSERT INTO public.credit_packages (credits, price_brl, label)
     VALUES (1, 0.01, 'hack') $$,
  '42501', NULL,
  'authenticated cannot insert a package');

SELECT throws_ok(
  $$ UPDATE public.credit_packages SET price_brl = 0.01 $$,
  '42501', NULL,
  'authenticated cannot change a price');

RESET role;

-- ── super-admin: also sees the smoke package ────────────────────────────────
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"a2222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
SET LOCAL role authenticated;

SELECT is(
  (SELECT count(*)::int FROM public.credit_packages),
  4, 'a super-admin sees the three public packages plus the smoke package');

RESET role;

-- ── credit_purchases tweaks ─────────────────────────────────────────────────
SELECT is(
  (SELECT column_default FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'credit_purchases'
       AND column_name = 'provider'),
  '''mercadopago''::text', 'credit_purchases.provider defaults to mercadopago again');

SELECT has_column('public', 'credit_purchases', 'status_detail',
  'credit_purchases has status_detail for card rejections');

SELECT * FROM finish();
ROLLBACK;
