-- =============================================================================
-- Subscription RPCs: activate / renew / clawback / past_due / cancel / sync
-- -----------------------------------------------------------------------------
-- Money in SQL, like every other credit path in this project. The edge
-- functions only interpret payloads and call these.
--
-- Activation is OPTIMISTIC: the preapproval came back authorized (the card was
-- validated by Mercado Pago), so the plan bucket is loaded now and the user can
-- work. MP collects the first charge up to about an hour later; when that
-- authorized_payment arrives approved it only CONFIRMS the activation. It must
-- never reset the bucket again (that would hand out a second quota in month
-- one). A later charge whose debit_date reaches the current period end is a
-- renewal: reset to the plan's quota, open a new period.
--
-- Every charge is mirrored in subscription_invoices (upsert by the MP id). The
-- credit is granted exactly once, on the transition granted_at IS NULL -> now()
-- with payment_status = 'approved': the same invoice going recycling ->
-- approved credits once, a replay never twice, and 'processed' without an
-- approved payment is a failure, not money.
--
-- A rejected FIRST charge means the card passed validation and never paid: the
-- optimistic credits are clawed back and the subscription is rejected. A
-- rejected RENEWAL leaves the balance alone (the period already ran out, so the
-- plan bucket is unavailable by the lazy rule) and marks past_due.
--
-- All FOR UPDATE on the profile, all service_role only. Covered by
-- subscription_rpcs.test.sql.
-- =============================================================================

-- Load the plan quota into the profile, closing whatever was left in the bucket.
CREATE OR REPLACE FUNCTION public.apply_plan_quota(
  p_user_id       uuid,
  p_subscription  uuid,
  p_quota         integer,
  p_period_start  timestamptz,
  p_period_end    timestamptz
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_left integer;
BEGIN
  SELECT plan_credits INTO v_left FROM public.profiles WHERE id = p_user_id FOR UPDATE;

  IF v_left > 0 THEN
    INSERT INTO public.credit_transactions (user_id, delta, type, ref_id, bucket)
    VALUES (p_user_id, -v_left, 'plan_reset', p_subscription, 'plan');
  END IF;

  UPDATE public.profiles
     SET access_kind       = 'subscriber',
         plan_credits      = p_quota,
         plan_period_start = p_period_start,
         plan_period_end   = p_period_end
   WHERE id = p_user_id;

  INSERT INTO public.credit_transactions (user_id, delta, type, ref_id, bucket)
  VALUES (p_user_id, p_quota, 'plan_grant', p_subscription, 'plan');
END;
$$;

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

CREATE OR REPLACE FUNCTION public.clawback_subscription(p_subscription_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid;
  v_left integer;
BEGIN
  SELECT user_id INTO v_user FROM public.subscriptions WHERE id = p_subscription_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'subscription_not_found');
  END IF;

  SELECT plan_credits INTO v_left FROM public.profiles WHERE id = v_user FOR UPDATE;

  UPDATE public.profiles
     SET plan_credits = 0, plan_period_end = now()
   WHERE id = v_user;

  IF v_left > 0 THEN
    INSERT INTO public.credit_transactions (user_id, delta, type, ref_id, bucket)
    VALUES (v_user, -v_left, 'clawback', p_subscription_id, 'plan');
  END IF;

  UPDATE public.subscriptions
     SET status = 'rejected', status_detail = COALESCE(status_detail, 'first_payment_rejected')
   WHERE id = p_subscription_id;

  RETURN jsonb_build_object('success', true, 'clawed_back', v_left);
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_subscription_past_due(p_subscription_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.subscriptions
     SET status = 'past_due'
   WHERE id = p_subscription_id
     AND status IN ('authorized', 'past_due');
  RETURN jsonb_build_object('success', true, 'marked', FOUND);
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_subscription_local(
  p_subscription_id uuid,
  p_cancelled_at    timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Credits of the paid period stay until plan_period_end (lazy expiry).
  UPDATE public.subscriptions
     SET status = 'cancelled', cancelled_at = COALESCE(p_cancelled_at, now())
   WHERE id = p_subscription_id
     AND status IN ('pending', 'authorized', 'past_due', 'paused');
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_cancellable');
  END IF;
  RETURN jsonb_build_object('success', true);
END;
$$;

-- p_invoice: { id, mp_payment_id, status, payment_status, amount_brl, debit_date, retry_attempt, raw }
CREATE OR REPLACE FUNCTION public.renew_subscription(
  p_subscription_id uuid,
  p_invoice         jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub        record;
  v_invoice_id text := p_invoice->>'id';
  v_paid       boolean := (p_invoice->>'payment_status') = 'approved';
  v_debit      timestamptz := NULLIF(p_invoice->>'debit_date', '')::timestamptz;
  v_claimed    boolean;
  v_period_end timestamptz;
BEGIN
  IF v_invoice_id IS NULL OR v_invoice_id = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_invoice');
  END IF;

  SELECT s.id, s.user_id, s.status, s.first_payment_confirmed, s.current_period_end, p.monthly_credits
    INTO v_sub
    FROM public.subscriptions s
    JOIN public.plans p ON p.id = s.plan_id
   WHERE s.id = p_subscription_id
     FOR UPDATE OF s;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'subscription_not_found');
  END IF;

  -- Mirror first: the row is the audit trail whatever happens next.
  INSERT INTO public.subscription_invoices
    (id, subscription_id, mp_payment_id, status, payment_status, amount_brl, debit_date, retry_attempt, raw)
  VALUES
    (v_invoice_id, p_subscription_id, p_invoice->>'mp_payment_id', p_invoice->>'status',
     p_invoice->>'payment_status', NULLIF(p_invoice->>'amount_brl', '')::numeric, v_debit,
     NULLIF(p_invoice->>'retry_attempt', '')::integer, p_invoice->'raw')
  ON CONFLICT (id) DO UPDATE
    SET mp_payment_id  = COALESCE(EXCLUDED.mp_payment_id, subscription_invoices.mp_payment_id),
        status         = COALESCE(EXCLUDED.status, subscription_invoices.status),
        payment_status = COALESCE(EXCLUDED.payment_status, subscription_invoices.payment_status),
        amount_brl     = COALESCE(EXCLUDED.amount_brl, subscription_invoices.amount_brl),
        debit_date     = COALESCE(EXCLUDED.debit_date, subscription_invoices.debit_date),
        retry_attempt  = COALESCE(EXCLUDED.retry_attempt, subscription_invoices.retry_attempt),
        raw            = COALESCE(EXCLUDED.raw, subscription_invoices.raw);

  IF NOT v_paid THEN
    -- Declined (recycling) or terminally failed. Never touch a balance here
    -- unless it is the first charge that never came.
    IF NOT v_sub.first_payment_confirmed THEN
      PERFORM public.clawback_subscription(p_subscription_id);
      RETURN jsonb_build_object('success', true, 'result', 'clawback');
    END IF;
    PERFORM public.mark_subscription_past_due(p_subscription_id);
    RETURN jsonb_build_object('success', true, 'result', 'past_due');
  END IF;

  -- Paid. The grant happens on the claim of granted_at, once per invoice.
  UPDATE public.subscription_invoices
     SET granted_at = now()
   WHERE id = v_invoice_id
     AND granted_at IS NULL;
  v_claimed := FOUND;

  IF NOT v_claimed THEN
    RETURN jsonb_build_object('success', true, 'result', 'already_processed');
  END IF;

  IF NOT v_sub.first_payment_confirmed THEN
    -- The first charge confirms the optimistic activation; the quota was already loaded.
    UPDATE public.subscriptions
       SET first_payment_confirmed = true, status = 'authorized'
     WHERE id = p_subscription_id;
    RETURN jsonb_build_object('success', true, 'result', 'first_payment_confirmed');
  END IF;

  IF v_debit IS NOT NULL AND v_sub.current_period_end IS NOT NULL
     AND v_debit < v_sub.current_period_end - interval '1 day' THEN
    -- A payment inside the current period (e.g. a late confirmation): no new quota.
    UPDATE public.subscriptions SET status = 'authorized' WHERE id = p_subscription_id;
    RETURN jsonb_build_object('success', true, 'result', 'same_period');
  END IF;

  v_period_end := COALESCE(v_debit, now()) + interval '1 month';

  UPDATE public.subscriptions
     SET status               = 'authorized',
         current_period_start = COALESCE(v_debit, now()),
         current_period_end   = v_period_end,
         next_payment_date    = v_period_end
   WHERE id = p_subscription_id;

  PERFORM public.apply_plan_quota(v_sub.user_id, p_subscription_id, v_sub.monthly_credits,
                                  COALESCE(v_debit, now()), v_period_end);

  RETURN jsonb_build_object('success', true, 'result', 'renewed', 'plan_period_end', v_period_end);
END;
$$;

-- Mirror of the subscription_preapproval topic.
CREATE OR REPLACE FUNCTION public.sync_subscription_status(
  p_subscription_id   uuid,
  p_mp_preapproval_id text,
  p_mp_status         text,
  p_next_payment_date timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
BEGIN
  SELECT status INTO v_status FROM public.subscriptions WHERE id = p_subscription_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'subscription_not_found');
  END IF;

  UPDATE public.subscriptions
     SET mp_status         = p_mp_status,
         mp_preapproval_id = COALESCE(mp_preapproval_id, p_mp_preapproval_id),
         next_payment_date = COALESCE(p_next_payment_date, next_payment_date)
   WHERE id = p_subscription_id;

  IF p_mp_status = 'authorized' THEN
    IF v_status = 'pending' THEN
      PERFORM public.activate_subscription(p_subscription_id, p_mp_preapproval_id, p_mp_status,
                                           p_next_payment_date, NULL, NULL);
      RETURN jsonb_build_object('success', true, 'result', 'activated');
    END IF;
    IF v_status = 'paused' THEN
      UPDATE public.subscriptions SET status = 'authorized' WHERE id = p_subscription_id;
      RETURN jsonb_build_object('success', true, 'result', 'resumed');
    END IF;
    RETURN jsonb_build_object('success', true, 'result', 'unchanged');
  END IF;

  IF p_mp_status = 'paused' AND v_status IN ('authorized', 'past_due') THEN
    UPDATE public.subscriptions SET status = 'paused' WHERE id = p_subscription_id;
    RETURN jsonb_build_object('success', true, 'result', 'paused');
  END IF;

  IF p_mp_status = 'cancelled' AND v_status NOT IN ('cancelled', 'rejected') THEN
    PERFORM public.cancel_subscription_local(p_subscription_id, now());
    RETURN jsonb_build_object('success', true, 'result', 'cancelled');
  END IF;

  RETURN jsonb_build_object('success', true, 'result', 'unchanged');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.apply_plan_quota(uuid, uuid, integer, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.activate_subscription(uuid, text, text, timestamptz, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.clawback_subscription(uuid)            FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.mark_subscription_past_due(uuid)       FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cancel_subscription_local(uuid, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.renew_subscription(uuid, jsonb)        FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_subscription_status(uuid, text, text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.apply_plan_quota(uuid, uuid, integer, timestamptz, timestamptz) TO service_role;
GRANT  EXECUTE ON FUNCTION public.activate_subscription(uuid, text, text, timestamptz, text, text) TO service_role;
GRANT  EXECUTE ON FUNCTION public.clawback_subscription(uuid)            TO service_role;
GRANT  EXECUTE ON FUNCTION public.mark_subscription_past_due(uuid)       TO service_role;
GRANT  EXECUTE ON FUNCTION public.cancel_subscription_local(uuid, timestamptz) TO service_role;
GRANT  EXECUTE ON FUNCTION public.renew_subscription(uuid, jsonb)        TO service_role;
GRANT  EXECUTE ON FUNCTION public.sync_subscription_status(uuid, text, text, timestamptz) TO service_role;
