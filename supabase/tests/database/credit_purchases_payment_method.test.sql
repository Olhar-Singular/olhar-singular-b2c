-- =============================================================================
-- pgTAP: public.credit_purchases.payment_method
-- Stripe is now the single provider for BOTH payment methods (card and Pix), so
-- `provider` alone no longer says how a purchase was paid. This guards the new
-- payment_method column: allowed values, default, NOT NULL, and that widening
-- the table did not loosen RLS (authenticated stays read-only).
-- =============================================================================
BEGIN;
SELECT plan(8);

-- ── Fixtures ────────────────────────────────────────────────────────────────
INSERT INTO auth.users (id, email) VALUES
  ('11111111-1111-1111-1111-111111111111', 'buyer@test.com');

-- ── Column shape ────────────────────────────────────────────────────────────
SELECT is(
  (SELECT count(*)::int FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'credit_purchases'
       AND column_name = 'payment_method'),
  1, 'credit_purchases has a payment_method column');

SELECT is(
  (SELECT is_nullable FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'credit_purchases'
       AND column_name = 'payment_method'),
  'NO', 'payment_method is NOT NULL');

SELECT is(
  (SELECT column_default FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'credit_purchases'
       AND column_name = 'payment_method'),
  '''card''::text', 'payment_method defaults to card');

-- Stripe took over new purchases; 'mercadopago' survives only for history.
SELECT is(
  (SELECT column_default FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'credit_purchases'
       AND column_name = 'provider'),
  '''stripe''::text', 'provider defaults to stripe');

-- ── CHECK constraint ────────────────────────────────────────────────────────
SELECT lives_ok(
  $$ INSERT INTO public.credit_purchases
       (user_id, amount_brl, credits_granted, provider, payment_method)
     VALUES ('11111111-1111-1111-1111-111111111111', 9.90, 30, 'stripe', 'pix') $$,
  'a Pix purchase can be recorded');

SELECT throws_ok(
  $$ INSERT INTO public.credit_purchases
       (user_id, amount_brl, credits_granted, provider, payment_method)
     VALUES ('11111111-1111-1111-1111-111111111111', 9.90, 30, 'stripe', 'boleto') $$,
  '23514', NULL,
  'an unknown payment_method is rejected by the CHECK constraint');

SELECT lives_ok(
  $$ INSERT INTO public.credit_purchases
       (user_id, amount_brl, credits_granted, provider, payment_method)
     VALUES ('11111111-1111-1111-1111-111111111111', 9.90, 30, 'mercadopago', 'pix') $$,
  'the legacy mercadopago provider is still accepted for historical rows');

-- ── RLS unchanged: authenticated has SELECT only (42501 before RLS runs) ─────
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}',
  true);
SET LOCAL role authenticated;

SELECT throws_ok(
  $$ INSERT INTO public.credit_purchases
       (user_id, amount_brl, credits_granted, provider, payment_method)
     VALUES ('11111111-1111-1111-1111-111111111111', 0.01, 9999, 'stripe', 'pix') $$,
  '42501', NULL,
  'authenticated still cannot insert a purchase');

RESET role;

SELECT * FROM finish();
ROLLBACK;
