-- =============================================================================
-- renew_subscription: never claw back / convert on an unsettled or
-- zero-amount invoice
-- -----------------------------------------------------------------------------
-- The trial widened the webhook window that renew_subscription has to react
-- correctly in from roughly an hour (a normal monthly renewal settles fast)
-- to 7 days: MP can emit the day-8 authorized_payment ahead of the debit
-- (status 'scheduled', no payment block yet, interpretAuthorizedPayment maps
-- that to payment_status 'pending') or with payment.status in
-- pending/in_process/authorized (authorized-not-captured). Before this guard
-- any non-'approved' payment_status on an unconfirmed row was treated as a
-- definitive refusal, so a trial could be clawed back days before MP actually
-- settles the charge, or a confirmed paid row could be marked past_due on a
-- payment that is merely still processing. Guard 1 mirrors and stops on that
-- unsettled state (result 'pending'): MP sends the final state later, and
-- only a genuinely rejected/cancelled payment reaches the clawback/past_due
-- branches below. Guard 2 covers the other trial-specific case: an approved
-- invoice with amount_brl = 0 is MP's card-validation charge, never money,
-- and must not convert a trial nor renew anything (result 'ignored').
--
-- CREATE OR REPLACE with the SAME signature (p_subscription_id uuid,
-- p_invoice jsonb): the service_role-only ACL granted in 20260914000001 is
-- unchanged, nothing is re-granted or revoked here.
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

  SELECT s.id, s.user_id, s.status, s.first_payment_confirmed, s.current_period_end,
         s.trial_ends_at, p.monthly_credits
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

  -- A zero-amount approved invoice is never money (MP's card validation):
  -- mirror it and stop, before any claim. NULL amount is unknown and proceeds.
  IF v_paid AND NULLIF(p_invoice->>'amount_brl', '')::numeric = 0 THEN
    RETURN jsonb_build_object('success', true, 'result', 'ignored');
  END IF;

  -- A charge MP has not settled yet (scheduled ahead of the debit, or a
  -- payment still pending / in process / authorized-not-captured) is only
  -- mirrored: never a clawback, never past_due. MP sends the final state
  -- later; only rejected/cancelled reach the branches below.
  IF NOT v_paid AND (
       p_invoice->>'status' = 'scheduled'
    OR COALESCE(p_invoice->>'payment_status', '') IN ('pending', 'in_process', 'authorized')
  ) THEN
    RETURN jsonb_build_object('success', true, 'result', 'pending');
  END IF;

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
    IF v_sub.trial_ends_at IS NOT NULL THEN
      -- Trial with card: this is the first money. The plan quota replaces what
      -- is left of the 50 trial credits and the account becomes a subscriber
      -- (apply_plan_quota does both); a new paid period opens from the debit.
      v_period_end := COALESCE(v_debit, now()) + interval '1 month';
      UPDATE public.subscriptions
         SET first_payment_confirmed = true,
             status                  = 'authorized',
             current_period_start    = COALESCE(v_debit, now()),
             current_period_end      = v_period_end,
             next_payment_date       = v_period_end
       WHERE id = p_subscription_id;
      PERFORM public.apply_plan_quota(v_sub.user_id, p_subscription_id, v_sub.monthly_credits,
                                      COALESCE(v_debit, now()), v_period_end);
      RETURN jsonb_build_object('success', true, 'result', 'trial_converted', 'plan_period_end', v_period_end);
    END IF;

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
