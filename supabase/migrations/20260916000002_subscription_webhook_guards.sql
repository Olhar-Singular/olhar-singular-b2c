-- =============================================================================
-- Webhook guards for subscriptions (final review of 2026-09-12)
-- -----------------------------------------------------------------------------
-- 1. renew_subscription used to trust first_payment_confirmed alone: a charge
--    for a row that was never activated (a pending attempt expired to
--    'rejected/abandoned' after 15 min, or a clawed-back one) flipped the row
--    to 'authorized' WITHOUT loading the plan quota: the card was charged and
--    the user got nothing. Now, if the row is not live, the paid charge either
--    reactivates it WITH the quota (no other live subscription for the user)
--    or is reported as 'paid_while_closed' so the caller cancels that
--    preapproval at Mercado Pago (the user meanwhile subscribed again).
-- 2. sync_subscription_status discarded the result of activate_subscription;
--    with the hardening migration that result can be
--    { success: false, error: 'duplicate_live_subscription' } and the caller
--    must cancel the orphan preapproval at MP. It is now propagated.
-- Same signatures, CREATE OR REPLACE only: the service_role-only ACL is kept.
-- =============================================================================

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
  v_other_live boolean;
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
    -- Declined (recycling) or terminally failed. A closed row stays closed.
    IF v_sub.status IN ('cancelled', 'rejected') THEN
      RETURN jsonb_build_object('success', true, 'result', 'closed');
    END IF;
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

  -- Money for a row that is not live (never activated, abandoned, clawed
  -- back, or cancelled locally without MP knowing). Reactivate with the quota
  -- when the user holds no other live subscription; otherwise report it so
  -- the caller cancels this preapproval at MP.
  IF v_sub.status NOT IN ('authorized', 'past_due', 'paused') THEN
    SELECT EXISTS (
      SELECT 1 FROM public.subscriptions o
       WHERE o.user_id = v_sub.user_id AND o.id <> p_subscription_id
         AND o.status IN ('authorized', 'past_due', 'paused')
    ) INTO v_other_live;
    IF v_other_live THEN
      RETURN jsonb_build_object('success', true, 'result', 'paid_while_closed');
    END IF;

    v_period_end := COALESCE(v_debit, now()) + interval '1 month';
    UPDATE public.subscriptions
       SET status                  = 'authorized',
           first_payment_confirmed = true,
           status_detail           = NULL,
           cancelled_at            = NULL,
           current_period_start    = COALESCE(v_debit, now()),
           current_period_end      = v_period_end,
           next_payment_date       = v_period_end
     WHERE id = p_subscription_id;
    PERFORM public.apply_plan_quota(v_sub.user_id, p_subscription_id, v_sub.monthly_credits,
                                    COALESCE(v_debit, now()), v_period_end);
    RETURN jsonb_build_object('success', true, 'result', 'reactivated', 'plan_period_end', v_period_end);
  END IF;

  IF NOT v_sub.first_payment_confirmed THEN
    -- The first charge confirms the optimistic activation; the quota was
    -- loaded by activate_subscription (the row is live, checked above).
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
  v_status     text;
  v_activation jsonb;
BEGIN
  SELECT status INTO v_status FROM public.subscriptions WHERE id = p_subscription_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'subscription_not_found');
  END IF;

  -- Mirror without ever colliding on mp_preapproval_id (UNIQUE): a preapproval
  -- already mirrored on another row is left for activate_subscription to
  -- refuse as duplicate_live_subscription.
  UPDATE public.subscriptions
     SET mp_status         = p_mp_status,
         mp_preapproval_id = COALESCE(
           mp_preapproval_id,
           CASE WHEN EXISTS (SELECT 1 FROM public.subscriptions o
                              WHERE o.mp_preapproval_id = p_mp_preapproval_id AND o.id <> p_subscription_id)
                THEN NULL ELSE p_mp_preapproval_id END),
         next_payment_date = COALESCE(p_next_payment_date, next_payment_date)
   WHERE id = p_subscription_id;

  IF p_mp_status = 'authorized' THEN
    IF v_status = 'pending' THEN
      v_activation := public.activate_subscription(p_subscription_id, p_mp_preapproval_id, p_mp_status,
                                                   p_next_payment_date, NULL, NULL);
      IF (v_activation->>'success')::boolean THEN
        RETURN jsonb_build_object('success', true, 'result', 'activated');
      END IF;
      -- duplicate_live_subscription (the row is now rejected) or closed: the
      -- caller must cancel this preapproval at MP.
      RETURN jsonb_build_object('success', false, 'result', v_activation->>'error', 'error', v_activation->>'error');
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
