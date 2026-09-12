-- =============================================================================
-- Monthly plans, subscriptions and their invoices
-- -----------------------------------------------------------------------------
-- plans is the single source of truth for the monthly plans (prices change by
-- UPDATE, not by deploy). The landing page reads it without a session, the
-- checkout validates slug and price against it, and the admin-only R$1/month
-- smoke plan is visible to super-admins only (same two-policy pattern as
-- credit_packages: anon never touches profiles).
--
-- subscriptions mirrors the Mercado Pago preapproval: one live subscription
-- (authorized / past_due / paused) per user, enforced by a partial unique
-- index. subscription_invoices mirrors each recurring charge
-- (authorized_payment); the credit for a charge is granted exactly once, on the
-- transition granted_at IS NULL -> now() (see the RPC migration), so the same
-- invoice going recycling -> approved credits once and a replay never twice.
--
-- Owners read their own rows; only service_role writes any of the three.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.plans (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            text NOT NULL UNIQUE,
  name            text NOT NULL,
  price_brl       numeric(10,2) NOT NULL CHECK (price_brl > 0),
  monthly_credits integer NOT NULL CHECK (monthly_credits > 0),
  highlight       boolean NOT NULL DEFAULT false,
  sort_order      integer NOT NULL DEFAULT 0,
  active          boolean NOT NULL DEFAULT true,
  admin_only      boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER update_plans_updated_at
  BEFORE UPDATE ON public.plans
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anon can view public plans"
  ON public.plans FOR SELECT TO anon
  USING (active AND NOT admin_only);

CREATE POLICY "Users can view plans for their role"
  ON public.plans FOR SELECT TO authenticated
  USING (
    active AND (
      NOT admin_only
      OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_super_admin)
    )
  );

GRANT  SELECT ON public.plans TO anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.plans FROM anon, authenticated;
GRANT  ALL    ON public.plans TO service_role;

-- Curve of 3, 4 and 5 credits per real, derived from the former packages.
INSERT INTO public.plans (slug, name, price_brl, monthly_credits, highlight, sort_order, active, admin_only)
VALUES
  ('basico',       'Básico',        19.90, 60,  false, 1,  true, false),
  ('profissional', 'Profissional',  59.90, 240, true,  2,  true, false),
  ('avancado',     'Avançado',      99.90, 500, false, 3,  true, false),
  ('teste-admin',  'Teste (admin)', 1.00,  1,   false, 99, true, true)
ON CONFLICT (slug) DO NOTHING;

-- ── subscriptions ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),   -- = MP external_reference
  user_id                 uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id                 uuid NOT NULL REFERENCES public.plans(id),
  mp_preapproval_id       text UNIQUE,
  status                  text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'authorized', 'past_due', 'paused', 'cancelled', 'rejected')),
  mp_status               text,
  next_payment_date       timestamptz,
  current_period_start    timestamptz,
  current_period_end      timestamptz,
  first_payment_confirmed boolean NOT NULL DEFAULT false,
  payer_email             text NOT NULL,
  card_brand              text,
  card_last_four          text,
  status_detail           text,
  attribution             jsonb,
  cancel_requested_at     timestamptz,
  cancelled_at            timestamptz,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

-- One live subscription per user. pending is excluded on purpose: a stale
-- pending row must never block a fresh attempt (the subscribe flow expires it).
CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_one_live_per_user
  ON public.subscriptions (user_id)
  WHERE status IN ('authorized', 'past_due', 'paused');

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_created
  ON public.subscriptions (user_id, created_at DESC);

CREATE TRIGGER update_subscriptions_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own subscriptions"
  ON public.subscriptions FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

GRANT  SELECT ON public.subscriptions TO authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.subscriptions FROM anon, authenticated;
REVOKE ALL ON public.subscriptions FROM anon;
GRANT  ALL    ON public.subscriptions TO service_role;

-- ── subscription_invoices ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.subscription_invoices (
  id              text PRIMARY KEY,   -- MP authorized_payment id; 'activation:<subscription id>' for the optimistic activation
  subscription_id uuid NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  mp_payment_id   text,
  status          text,
  payment_status  text,
  amount_brl      numeric(10,2),
  debit_date      timestamptz,
  retry_attempt   integer,
  granted_at      timestamptz,
  raw             jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subscription_invoices_subscription
  ON public.subscription_invoices (subscription_id, debit_date DESC);

CREATE TRIGGER update_subscription_invoices_updated_at
  BEFORE UPDATE ON public.subscription_invoices
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.subscription_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own subscription_invoices"
  ON public.subscription_invoices FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.subscriptions s
     WHERE s.id = subscription_id AND s.user_id = auth.uid()));

GRANT  SELECT ON public.subscription_invoices TO authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.subscription_invoices FROM anon, authenticated;
REVOKE ALL ON public.subscription_invoices FROM anon;
GRANT  ALL    ON public.subscription_invoices TO service_role;

-- ── profiles: start of the current plan period (for the renewal rule) ───────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS plan_period_start timestamptz;

CREATE OR REPLACE FUNCTION public.prevent_credit_self_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  claims_role text := nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role';
BEGIN
  IF claims_role IN ('authenticated', 'anon')
     AND (
          NEW.credit_balance       IS DISTINCT FROM OLD.credit_balance
       OR NEW.free_adaptation_used IS DISTINCT FROM OLD.free_adaptation_used
       OR NEW.free_extraction_used IS DISTINCT FROM OLD.free_extraction_used
       OR NEW.plan_credits         IS DISTINCT FROM OLD.plan_credits
       OR NEW.plan_period_start    IS DISTINCT FROM OLD.plan_period_start
       OR NEW.plan_period_end      IS DISTINCT FROM OLD.plan_period_end
       OR NEW.access_kind          IS DISTINCT FROM OLD.access_kind
       OR NEW.trial_started_at     IS DISTINCT FROM OLD.trial_started_at
       OR NEW.cpf                  IS DISTINCT FROM OLD.cpf
       OR NEW.must_set_password    IS DISTINCT FROM OLD.must_set_password
       OR NEW.terms_accepted_at    IS DISTINCT FROM OLD.terms_accepted_at
       OR NEW.terms_version        IS DISTINCT FROM OLD.terms_version
     ) THEN
    RAISE EXCEPTION 'not authorized to change credit fields';
  END IF;
  RETURN NEW;
END;
$$;
