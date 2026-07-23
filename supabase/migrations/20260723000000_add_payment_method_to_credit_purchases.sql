-- =============================================================================
-- Distinguish card from Pix inside the Stripe provider.
--
-- Pix moved from Mercado Pago to Stripe, so `provider` alone no longer tells how
-- a purchase was paid — both methods now write provider='stripe'. This adds an
-- explicit payment_method column for reconciliation and admin reporting.
--
-- Backfill: every Mercado Pago row was Pix (create-checkout excluded card/ticket
-- payment types); every Stripe row so far was card (payment_method_types=['card']).
--
-- RLS is unchanged — only service_role writes this table.
-- =============================================================================

ALTER TABLE public.credit_purchases
  ADD COLUMN payment_method text;

UPDATE public.credit_purchases
   SET payment_method = CASE WHEN provider = 'mercadopago' THEN 'pix' ELSE 'card' END;

ALTER TABLE public.credit_purchases
  ALTER COLUMN payment_method SET DEFAULT 'card',
  ALTER COLUMN payment_method SET NOT NULL,
  ADD CONSTRAINT credit_purchases_payment_method_check
    CHECK (payment_method IN ('card', 'pix'));

-- Stripe is the only provider of new purchases; 'mercadopago' stays in the
-- provider CHECK because historical rows still carry it.
ALTER TABLE public.credit_purchases
  ALTER COLUMN provider SET DEFAULT 'stripe';
