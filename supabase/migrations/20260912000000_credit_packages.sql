-- =============================================================================
-- Extra credit packages as data + credit_purchases tweaks for the MP card rail
-- -----------------------------------------------------------------------------
-- The purchasable packages were a hardcoded whitelist duplicated in the edge
-- functions (_shared/creditPackages.ts), CreditsPage and PricingSection. They
-- move into public.credit_packages so a price change is an UPDATE, not a
-- deploy, and so the landing page (no session) and the checkouts (service_role)
-- read the same rows.
--
-- Visibility rules:
--   * anon + authenticated: SELECT active rows that are not admin_only;
--   * super-admins additionally see admin_only rows (the R$1 real-payment smoke
--     package, previously TEST_PACKAGE);
--   * nobody but service_role writes (no INSERT/UPDATE/DELETE policy).
--
-- credit_purchases: Stripe is removed, so `provider` defaults to 'mercadopago'
-- again ('stripe' stays in the CHECK for historical rows), and status_detail
-- records why the Mercado Pago card rail rejected a payment.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.credit_packages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  credits     integer NOT NULL CHECK (credits > 0),
  price_brl   numeric(10,2) NOT NULL CHECK (price_brl > 0),
  label       text NOT NULL,
  highlight   boolean NOT NULL DEFAULT false,
  sort_order  integer NOT NULL DEFAULT 0,
  active      boolean NOT NULL DEFAULT true,
  admin_only  boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- One row per (credits, price) pair keeps the seed idempotent across resets.
CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_packages_credits_price
  ON public.credit_packages (credits, price_brl);

CREATE TRIGGER update_credit_packages_updated_at
  BEFORE UPDATE ON public.credit_packages
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.credit_packages ENABLE ROW LEVEL SECURITY;

-- Public catalogue: the landing page reads it without a session. admin_only rows
-- are only for super-admins (profiles.is_super_admin is re-verified server-side
-- by the checkouts as well; this policy is what keeps the card off the UI).
--
-- Two policies on purpose: a policy expression runs with the caller's
-- privileges, and anon must never need to read public.profiles just to list
-- the catalogue. Only the authenticated policy consults profiles.
CREATE POLICY "Anon can view public credit_packages"
  ON public.credit_packages FOR SELECT
  TO anon
  USING (active AND NOT admin_only);

CREATE POLICY "Users can view credit_packages for their role"
  ON public.credit_packages FOR SELECT
  TO authenticated
  USING (
    active
    AND (
      NOT admin_only
      OR EXISTS (
        SELECT 1 FROM public.profiles p
         WHERE p.id = auth.uid() AND p.is_super_admin
      )
    )
  );

-- INSERT / UPDATE / DELETE intentionally omitted: only service_role writes.
-- Supabase's default privileges hand ALL on new public tables to anon and
-- authenticated, and RLS without a write policy makes an UPDATE match zero rows
-- silently instead of failing. Revoking the write privileges turns any client
-- write into a hard 42501, which is what credit_packages_rls.test.sql asserts.
GRANT  SELECT ON public.credit_packages TO anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.credit_packages FROM anon, authenticated;
GRANT  ALL    ON public.credit_packages TO service_role;

-- Seed: the three packages that were in the whitelist, plus the super-admin
-- smoke package (1 credit, R$1,00) that used to be TEST_PACKAGE.
INSERT INTO public.credit_packages (credits, price_brl, label, highlight, sort_order, active, admin_only)
VALUES
  (30,  9.90,  'Básico',        false, 1,  true, false),
  (120, 29.90, 'Profissional',  true,  2,  true, false),
  (300, 59.90, 'Avançado',      false, 3,  true, false),
  (1,   1.00,  'Teste (admin)', false, 99, true, true)
ON CONFLICT (credits, price_brl) DO NOTHING;

-- ── credit_purchases ────────────────────────────────────────────────────────
ALTER TABLE public.credit_purchases
  ALTER COLUMN provider SET DEFAULT 'mercadopago';

ALTER TABLE public.credit_purchases
  ADD COLUMN IF NOT EXISTS status_detail text;
