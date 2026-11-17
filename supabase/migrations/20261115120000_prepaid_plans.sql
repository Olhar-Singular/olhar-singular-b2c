-- =============================================================================
-- Pix prepaid plan: 1, 3 or 12 months paid at once (spec 2026-11-15-checkout-pix-a-vista)
-- -----------------------------------------------------------------------------
-- * prepaid_plans: the catalogue, read like credit_packages (anon sees the
--   public rows, super-admins also the R$1 smoke row, only service_role writes).
-- * credit_purchases gains kind = 'plan' rows. An anonymous buyer has no
--   account until the payment is approved (generating a QR is free, so it must
--   not reserve someone else's e-mail): buyer_email/buyer_name/terms_version
--   carry the checkout facts until then.
-- * Release in two parts (R1): the approval puts one month of credits
--   (credits / months) in the plan bucket and locks the rest until day 8, the
--   end of the 7-day full-refund guarantee. release_prepaid_credits (pg_cron,
--   hourly) moves the locked part in, unless the purchase was refunded or the
--   period is already over.
-- * A rebuy while a prepaid plan runs extends it from its current end (R7).
-- * refund_prepaid_plan: called by mp-webhook when MP reports the payment
--   refunded or charged back (R3).
-- * approve_purchase_and_grant now claims only kind = 'extra': a plan purchase
--   can never be granted as extras by the older path.
--
-- Every function is SECURITY DEFINER, service_role only. MAINTENANCE: change
-- them with CREATE OR REPLACE only (DROP + CREATE resets the ACL to PUBLIC).
-- Covered by prepaid_plans.test.sql.
-- =============================================================================

-- ── Catalogue ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.prepaid_plans (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9-]{1,40}$'),
  months      integer NOT NULL CHECK (months BETWEEN 1 AND 24),
  credits     integer NOT NULL CHECK (credits > 0),
  price_brl   numeric(10,2) NOT NULL CHECK (price_brl > 0),
  highlight   boolean NOT NULL DEFAULT false,
  sort_order  integer NOT NULL DEFAULT 0,
  active      boolean NOT NULL DEFAULT true,
  admin_only  boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER update_prepaid_plans_updated_at
  BEFORE UPDATE ON public.prepaid_plans
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.prepaid_plans ENABLE ROW LEVEL SECURITY;

-- Same two-policy shape as credit_packages: anon must never need to read
-- public.profiles just to list the catalogue.
CREATE POLICY "Anon can view public prepaid_plans"
  ON public.prepaid_plans FOR SELECT
  TO anon
  USING (active AND NOT admin_only);

CREATE POLICY "Users can view prepaid_plans for their role"
  ON public.prepaid_plans FOR SELECT
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

GRANT  SELECT ON public.prepaid_plans TO anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.prepaid_plans FROM anon, authenticated;
GRANT  ALL    ON public.prepaid_plans TO service_role;

-- D8 prices; the R$1 row is the production smoke test (the MP sandbox has no Pix).
INSERT INTO public.prepaid_plans (slug, months, credits, price_brl, highlight, sort_order, active, admin_only)
VALUES
  ('pix-1-mes',       1,  300,   39.90, false, 1,  true, false),
  ('pix-3-meses',     3,  900,   89.90, true,  2,  true, false),
  ('pix-12-meses',    12, 3600, 329.90, false, 3,  true, false),
  ('pix-teste-admin', 1,  1,      1.00, false, 99, true, true)
ON CONFLICT (slug) DO NOTHING;

-- ── credit_purchases: plan rows ─────────────────────────────────────────────
ALTER TABLE public.credit_purchases
  ADD COLUMN IF NOT EXISTS kind                text NOT NULL DEFAULT 'extra'
    CHECK (kind IN ('extra', 'plan')),
  ADD COLUMN IF NOT EXISTS prepaid_plan_id     uuid REFERENCES public.prepaid_plans(id),
  ADD COLUMN IF NOT EXISTS plan_months         integer CHECK (plan_months IS NULL OR plan_months > 0),
  ADD COLUMN IF NOT EXISTS buyer_email         text,
  ADD COLUMN IF NOT EXISTS buyer_name          text,
  ADD COLUMN IF NOT EXISTS terms_version       text,
  ADD COLUMN IF NOT EXISTS plan_locked_credits integer NOT NULL DEFAULT 0 CHECK (plan_locked_credits >= 0),
  ADD COLUMN IF NOT EXISTS plan_unlock_at      timestamptz,
  ADD COLUMN IF NOT EXISTS plan_released_at    timestamptz,
  ADD COLUMN IF NOT EXISTS plan_period_end     timestamptz,
  ADD COLUMN IF NOT EXISTS refunded_at         timestamptz;

-- user_id may become NULL later (ON DELETE SET NULL), so only the months are
-- required of a plan row here; the buyer e-mail is checked by the function.
ALTER TABLE public.credit_purchases
  DROP CONSTRAINT IF EXISTS credit_purchases_plan_shape;
ALTER TABLE public.credit_purchases
  ADD CONSTRAINT credit_purchases_plan_shape CHECK (kind = 'extra' OR plan_months IS NOT NULL);

ALTER TABLE public.credit_purchases
  DROP CONSTRAINT IF EXISTS credit_purchases_status_check;
ALTER TABLE public.credit_purchases
  ADD CONSTRAINT credit_purchases_status_check
  CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled', 'refunded'));

CREATE INDEX IF NOT EXISTS idx_credit_purchases_plan_user
  ON public.credit_purchases (user_id, status) WHERE kind = 'plan';
CREATE INDEX IF NOT EXISTS idx_credit_purchases_plan_unlock
  ON public.credit_purchases (plan_unlock_at)
  WHERE kind = 'plan' AND status = 'approved' AND plan_locked_credits > 0 AND plan_released_at IS NULL;

-- ── Extras RPC: extra rows only ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.approve_purchase_and_grant(
  p_purchase_id uuid,
  p_payment_id  text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row   record;
  v_grant jsonb;
BEGIN
  -- The claim: only the first caller moves the row out of 'pending'. A plan
  -- purchase is never claimed here (approve_prepaid_plan owns it).
  UPDATE public.credit_purchases
     SET status = 'approved', payment_id = p_payment_id
   WHERE id = p_purchase_id
     AND status = 'pending'
     AND kind = 'extra'
  RETURNING user_id, credits_granted INTO v_row;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', true, 'granted', false, 'reason', 'already_processed');
  END IF;

  v_grant := public.grant_credits(
    v_row.user_id, v_row.credits_granted, 'purchase', p_payment_id, p_purchase_id);

  IF (v_grant->>'success')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'grant_credits failed: %', v_grant->>'error';
  END IF;

  RETURN jsonb_build_object(
    'success',     true,
    'granted',     true,
    'user_id',     v_row.user_id,
    'credits',     v_row.credits_granted,
    'new_balance', (v_grant->>'new_balance')::integer
  );
END;
$$;

-- ── Helpers ─────────────────────────────────────────────────────────────────
-- The anonymous Pix funnel needs to know whether an e-mail already has an
-- account (to answer email_exists before the QR) and, on approval, whose it is.
CREATE OR REPLACE FUNCTION public.user_id_by_email(p_email text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.id FROM auth.users u
   WHERE lower(u.email) = lower(btrim(p_email))
   LIMIT 1;
$$;

-- End of the running prepaid plan, or NULL. The bucket counts as prepaid while
-- an approved (not refunded) plan purchase of the user is still in its period.
CREATE OR REPLACE FUNCTION public.prepaid_plan_active(p_user_id uuid)
RETURNS timestamptz
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.plan_period_end
    FROM public.profiles p
   WHERE p.id = p_user_id
     AND p.plan_period_end > now()
     AND EXISTS (
       SELECT 1 FROM public.credit_purchases c
        WHERE c.user_id = p_user_id
          AND c.kind = 'plan'
          AND c.status = 'approved'
          AND c.plan_period_end > now()
     );
$$;

-- ── Approve ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.approve_prepaid_plan(
  p_purchase_id uuid,
  p_payment_id  text,
  p_user_id     uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row         public.credit_purchases%ROWTYPE;
  v_now_credits integer;
  v_locked      integer;
  v_unlock      timestamptz;
  v_active_end  timestamptz;
  v_end         timestamptz;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'approve_prepaid_plan: user required';
  END IF;

  -- Read the running plan BEFORE the claim (the claimed row has no period yet,
  -- so it would not count anyway; this keeps the intent explicit).
  v_active_end := public.prepaid_plan_active(p_user_id);

  UPDATE public.credit_purchases
     SET status = 'approved',
         payment_id = p_payment_id,
         user_id = COALESCE(user_id, p_user_id)
   WHERE id = p_purchase_id
     AND status = 'pending'
     AND kind = 'plan'
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', true, 'granted', false, 'reason', 'already_processed');
  END IF;

  IF v_row.user_id <> p_user_id THEN
    RAISE EXCEPTION 'approve_prepaid_plan: purchase % belongs to another user', p_purchase_id;
  END IF;

  v_now_credits := v_row.credits_granted / v_row.plan_months;
  v_locked      := v_row.credits_granted - v_now_credits;
  v_unlock      := CASE WHEN v_locked > 0 THEN now() + interval '7 days' END;

  IF v_active_end IS NOT NULL THEN
    -- R7: a rebuy extends the running prepaid plan.
    v_end := v_active_end + make_interval(months => v_row.plan_months);
    UPDATE public.profiles
       SET plan_credits    = plan_credits + v_now_credits,
           plan_period_end = v_end
     WHERE id = p_user_id;
    INSERT INTO public.credit_transactions (user_id, delta, type, payment_id, ref_id, bucket)
    VALUES (p_user_id, v_now_credits, 'plan_grant', p_payment_id, p_purchase_id, 'plan');
  ELSE
    -- Anything else in the bucket (an invited trial, a lapsed period) is replaced.
    v_end := now() + make_interval(months => v_row.plan_months);
    PERFORM public.apply_plan_quota(p_user_id, p_purchase_id, v_now_credits, now(), v_end);
  END IF;

  UPDATE public.credit_purchases
     SET plan_locked_credits = v_locked,
         plan_unlock_at      = v_unlock,
         plan_period_end     = v_end
   WHERE id = p_purchase_id;

  IF v_row.terms_version IS NOT NULL THEN
    UPDATE public.profiles
       SET terms_version = v_row.terms_version, terms_accepted_at = now()
     WHERE id = p_user_id;
  END IF;

  RETURN jsonb_build_object(
    'success',        true,
    'granted',        true,
    'user_id',        p_user_id,
    'credits_now',    v_now_credits,
    'credits_locked', v_locked,
    'unlock_at',      v_unlock,
    'period_end',     v_end
  );
END;
$$;

-- ── Release (pg_cron, hourly) ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.release_prepaid_credits()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row   record;
  v_count integer := 0;
BEGIN
  FOR v_row IN
    SELECT id, user_id, plan_locked_credits, payment_id
      FROM public.credit_purchases
     WHERE kind = 'plan'
       AND status = 'approved'
       AND plan_locked_credits > 0
       AND plan_released_at IS NULL
       AND plan_unlock_at <= now()
     FOR UPDATE SKIP LOCKED
  LOOP
    -- Only into a prepaid plan that is still running; an expired one forfeits it.
    IF v_row.user_id IS NOT NULL AND public.prepaid_plan_active(v_row.user_id) IS NOT NULL THEN
      UPDATE public.profiles
         SET plan_credits = plan_credits + v_row.plan_locked_credits
       WHERE id = v_row.user_id;
      INSERT INTO public.credit_transactions (user_id, delta, type, payment_id, ref_id, bucket)
      VALUES (v_row.user_id, v_row.plan_locked_credits, 'plan_grant', v_row.payment_id, v_row.id, 'plan');
    END IF;

    UPDATE public.credit_purchases SET plan_released_at = now() WHERE id = v_row.id;
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

-- ── Refund (mp-webhook: refunded / charged_back) ────────────────────────────
CREATE OR REPLACE FUNCTION public.refund_prepaid_plan(
  p_purchase_id uuid,
  p_payment_id  text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row      public.credit_purchases%ROWTYPE;
  v_released integer;
  v_credits  integer;
  v_end      timestamptz;
  v_remove   integer := 0;
BEGIN
  -- Lock and read first: the released amount depends on the lock state before
  -- the refund cancels it.
  SELECT * INTO v_row
    FROM public.credit_purchases
   WHERE id = p_purchase_id AND kind = 'plan' AND status = 'approved'
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', true, 'refunded', false);
  END IF;

  v_released := CASE WHEN v_row.plan_released_at IS NOT NULL
                     THEN v_row.credits_granted
                     ELSE v_row.credits_granted - v_row.plan_locked_credits END;

  UPDATE public.credit_purchases
     SET status = 'refunded',
         refunded_at = now(),
         plan_locked_credits = 0,
         payment_id = COALESCE(payment_id, p_payment_id)
   WHERE id = p_purchase_id;

  IF v_row.user_id IS NOT NULL THEN
    SELECT plan_credits, plan_period_end INTO v_credits, v_end
      FROM public.profiles WHERE id = v_row.user_id FOR UPDATE;

    IF FOUND THEN
      v_remove := LEAST(COALESCE(v_credits, 0), v_released);
      UPDATE public.profiles
         SET plan_credits    = plan_credits - v_remove,
             plan_period_end = GREATEST(now(), COALESCE(v_end, now()) - make_interval(months => v_row.plan_months))
       WHERE id = v_row.user_id;

      IF v_remove > 0 THEN
        INSERT INTO public.credit_transactions (user_id, delta, type, payment_id, ref_id, bucket)
        VALUES (v_row.user_id, -v_remove, 'clawback', p_payment_id, p_purchase_id, 'plan');
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object('success', true, 'refunded', true, 'credits_removed', v_remove);
END;
$$;

-- ── ACL ─────────────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.user_id_by_email(text)                    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prepaid_plan_active(uuid)                 FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.approve_prepaid_plan(uuid, text, uuid)    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.release_prepaid_credits()                 FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.refund_prepaid_plan(uuid, text)           FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.approve_purchase_and_grant(uuid, text)    FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.user_id_by_email(text)                    TO service_role;
GRANT  EXECUTE ON FUNCTION public.prepaid_plan_active(uuid)                 TO service_role;
GRANT  EXECUTE ON FUNCTION public.approve_prepaid_plan(uuid, text, uuid)    TO service_role;
GRANT  EXECUTE ON FUNCTION public.release_prepaid_credits()                 TO service_role;
GRANT  EXECUTE ON FUNCTION public.refund_prepaid_plan(uuid, text)           TO service_role;
GRANT  EXECUTE ON FUNCTION public.approve_purchase_and_grant(uuid, text)    TO service_role;

-- ── pg_cron: release the locked part every hour ─────────────────────────────
DO $$
BEGIN
  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_cron;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron could not be created here (%): enable it in the Dashboard', SQLERRM;
  END;

  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'release-prepaid-credits') THEN
      PERFORM cron.unschedule('release-prepaid-credits');
    END IF;
    PERFORM cron.schedule(
      'release-prepaid-credits',
      '7 * * * *',
      'SELECT public.release_prepaid_credits();'
    );
    RAISE NOTICE 'prepaid credit release scheduled hourly';
  ELSE
    RAISE NOTICE 'pg_cron absent: release_prepaid_credits installed but NOT scheduled';
  END IF;
END;
$$;
