-- =============================================================================
-- Add a payment provider column to credit_purchases.
-- Distinguishes Pix purchases (Mercado Pago) from credit-card purchases (Stripe).
-- Existing rows and the Mercado Pago flow default to 'mercadopago';
-- the Stripe checkout flow writes 'stripe'.
-- RLS is unchanged — only service_role (edge functions) writes this table.
-- =============================================================================

ALTER TABLE public.credit_purchases
  ADD COLUMN provider text NOT NULL DEFAULT 'mercadopago'
    CHECK (provider IN ('mercadopago', 'stripe'));
