-- =============================================================================
-- Subscription hardening (review of 2026-09-12)
-- -----------------------------------------------------------------------------
-- 1. activate_subscription: a second pending row of the same user reaching
--    'authorized' (a delayed webhook for an older preapproval racing the
--    synchronous checkout) used to raise unique_violation on
--    subscriptions_one_live_per_user, which surfaced as an unhandled 500 and
--    an MP retry storm. It now returns { success: false,
--    error: 'duplicate_live_subscription' } and marks the row rejected, so the
--    caller can cancel that preapproval at MP.
-- 2. Index on subscriptions(plan_id): the only FK of the batch without one.
--
-- Same signature, CREATE OR REPLACE only: the service_role-only ACL is kept.
-- =============================================================================

CREATE INDEX IF NOT EXISTS subscriptions_plan_id_idx ON public.subscriptions (plan_id);

CREATE OR REPLACE FUNCTION public.activate_subscription(
  p_subscription_id   uuid,
  p_mp_preapproval_id text,
  p_mp_status         text,
  p_next_payment_date timestamptz,
  p_card_brand        text,
  p_card_last_four    text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub        record;
  v_quota      integer;
  v_period_end timestamptz;
BEGIN
  SELECT s.id, s.user_id, s.status, p.monthly_credits
    INTO v_sub
    FROM public.subscriptions s
    JOIN public.plans p ON p.id = s.plan_id
   WHERE s.id = p_subscription_id
     FOR UPDATE OF s;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'subscription_not_found');
  END IF;
  IF v_sub.status IN ('authorized', 'past_due', 'paused') THEN
    RETURN jsonb_build_object('success', true, 'already', true);
  END IF;
  IF v_sub.status IN ('cancelled', 'rejected') THEN
    RETURN jsonb_build_object('success', false, 'error', 'subscription_closed');
  END IF;

  v_quota      := v_sub.monthly_credits;
  v_period_end := COALESCE(p_next_payment_date, now() + interval '1 month');

  BEGIN
    UPDATE public.subscriptions
       SET status               = 'authorized',
           mp_preapproval_id    = p_mp_preapproval_id,
           mp_status            = p_mp_status,
           next_payment_date    = p_next_payment_date,
           current_period_start = now(),
           current_period_end   = v_period_end,
           card_brand           = COALESCE(p_card_brand, card_brand),
           card_last_four       = COALESCE(p_card_last_four, card_last_four)
     WHERE id = p_subscription_id;
  EXCEPTION WHEN unique_violation THEN
    -- Another live subscription of this user already exists (or this
    -- preapproval id is already mirrored on another row). Close this attempt
    -- without touching the credits; the caller cancels it at MP.
    UPDATE public.subscriptions
       SET status        = 'rejected',
           status_detail = 'duplicate_live_subscription',
           mp_preapproval_id = CASE
             WHEN EXISTS (SELECT 1 FROM public.subscriptions o
                           WHERE o.mp_preapproval_id = p_mp_preapproval_id AND o.id <> p_subscription_id)
             THEN mp_preapproval_id ELSE p_mp_preapproval_id END
     WHERE id = p_subscription_id;
    RETURN jsonb_build_object('success', false, 'error', 'duplicate_live_subscription');
  END;

  PERFORM public.apply_plan_quota(v_sub.user_id, p_subscription_id, v_quota, now(), v_period_end);

  -- The optimistic grant leaves a trace the first real charge can be matched to.
  INSERT INTO public.subscription_invoices (id, subscription_id, status, payment_status, granted_at)
  VALUES ('activation:' || p_subscription_id::text, p_subscription_id, 'activation', 'approved', now())
  ON CONFLICT (id) DO NOTHING;

  RETURN jsonb_build_object(
    'success', true, 'already', false,
    'plan_credits', v_quota, 'plan_period_end', v_period_end);
END;
$$;
