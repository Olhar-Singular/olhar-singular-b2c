-- =============================================================================
-- Self-service refund of the last charge + card trials cannot be extended
-- -----------------------------------------------------------------------------
-- refund_last_charge only FINDS the eligible charge (newest approved invoice
-- with an MP payment id, not refunded, of the live subscription or the most
-- recent one cancelled < 30 days ago) and locks the subscription row: the edge
-- function talks to Mercado Pago first. confirm_refund then records the refund
-- exactly once (refunded_at), zeroes the plan bucket with a refund_clawback
-- ledger line (extras untouched) and cancels the subscription locally.
-- admin_extend_trial refuses a card trial: MP ignores changes to start_date
-- (sandbox 2026-09-18) and charges on day 8 regardless.
-- Covered by refund_last_charge.test.sql.
-- =============================================================================

ALTER TABLE public.subscription_invoices
  ADD COLUMN IF NOT EXISTS refunded_at  timestamptz,
  ADD COLUMN IF NOT EXISTS mp_refund_id text;

ALTER TABLE public.credit_transactions
  DROP CONSTRAINT IF EXISTS credit_transactions_type_check;
ALTER TABLE public.credit_transactions
  ADD CONSTRAINT credit_transactions_type_check
  CHECK (type IN (
    'signup_bonus', 'purchase', 'adapt', 'regenerate', 'chat', 'refund', 'extract',
    'admin_grant', 'trial_grant', 'plan_grant', 'plan_reset', 'compensation', 'clawback',
    'refund_clawback'
  ));

CREATE OR REPLACE FUNCTION public.refund_last_charge(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub     record;
  v_invoice record;
BEGIN
  -- The live subscription wins; otherwise the most recent one cancelled
  -- less than 30 days ago (the refund window after cancelling).
  SELECT id, mp_preapproval_id
    INTO v_sub
    FROM public.subscriptions
   WHERE user_id = p_user_id
     AND (status IN ('authorized', 'past_due', 'paused')
          OR (status = 'cancelled' AND cancelled_at > now() - interval '30 days'))
   ORDER BY (status IN ('authorized', 'past_due', 'paused')) DESC, created_at DESC
   LIMIT 1
     FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'nothing_to_refund');
  END IF;

  -- One refund per subscription lifetime: once its last charge was refunded,
  -- an older charge is never offered next (this is not a way to unwind the
  -- whole payment history one invoice at a time).
  IF EXISTS (
    SELECT 1 FROM public.subscription_invoices
     WHERE subscription_id = v_sub.id AND refunded_at IS NOT NULL
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'nothing_to_refund');
  END IF;

  -- Only real money: an approved invoice with an MP payment id (never the
  -- synthetic activation row), not refunded yet. Last charge only.
  SELECT id, mp_payment_id, amount_brl
    INTO v_invoice
    FROM public.subscription_invoices
   WHERE subscription_id = v_sub.id
     AND payment_status = 'approved'
     AND mp_payment_id IS NOT NULL
     AND refunded_at IS NULL
   ORDER BY debit_date DESC NULLS LAST, created_at DESC
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'nothing_to_refund');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'invoice_id', v_invoice.id,
    'mp_payment_id', v_invoice.mp_payment_id,
    'amount_brl', v_invoice.amount_brl,
    'subscription_id', v_sub.id,
    'mp_preapproval_id', v_sub.mp_preapproval_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.confirm_refund(p_invoice_id text, p_mp_refund_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub_id  uuid;
  v_invoice record;
  v_user    uuid;
  v_left    integer;
BEGIN
  -- Lock order: subscription, then invoice, then profile. Matches
  -- renew_subscription (locks the subscription first, updates the invoice
  -- row by id after) so a webhook replay racing this RPC on the same
  -- subscription cannot deadlock.
  SELECT subscription_id INTO v_sub_id
    FROM public.subscription_invoices
   WHERE id = p_invoice_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'invoice_not_found');
  END IF;

  SELECT user_id INTO v_user FROM public.subscriptions WHERE id = v_sub_id FOR UPDATE;

  SELECT id, subscription_id, refunded_at
    INTO v_invoice
    FROM public.subscription_invoices
   WHERE id = p_invoice_id
     FOR UPDATE;
  IF v_invoice.refunded_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'already', true, 'subscription_id', v_invoice.subscription_id);
  END IF;

  UPDATE public.subscription_invoices
     SET refunded_at = now(), mp_refund_id = p_mp_refund_id
   WHERE id = p_invoice_id;

  -- The money went back: the plan credits of that charge go too (extras stay).
  SELECT plan_credits INTO v_left FROM public.profiles WHERE id = v_user FOR UPDATE;
  UPDATE public.profiles SET plan_credits = 0, plan_period_end = now() WHERE id = v_user;
  IF v_left > 0 THEN
    INSERT INTO public.credit_transactions (user_id, delta, type, ref_id, bucket)
    VALUES (v_user, -v_left, 'refund_clawback', v_invoice.subscription_id, 'plan');
  END IF;

  -- Already cancelled → not_cancellable, which is fine here.
  PERFORM public.cancel_subscription_local(v_invoice.subscription_id, now());

  RETURN jsonb_build_object(
    'success', true, 'already', false,
    'subscription_id', v_invoice.subscription_id,
    'credits_removed', COALESCE(v_left, 0));
END;
$$;

-- admin_extend_trial: a card trial cannot be extended (same signature).
CREATE OR REPLACE FUNCTION public.admin_extend_trial(
  p_user_id uuid,
  p_days    integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile record;
  v_new_end timestamptz;
BEGIN
  IF p_days IS NULL OR p_days <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_days');
  END IF;

  SELECT access_kind, plan_period_end, trial_started_at
    INTO v_profile
    FROM public.profiles
   WHERE id = p_user_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'user_not_found');
  END IF;
  IF v_profile.access_kind <> 'trial' OR v_profile.trial_started_at IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_a_trial');
  END IF;

  -- Mercado Pago charges on the trial's start_date no matter what we store
  -- here: extending would only postpone the paywall while the card is charged.
  IF EXISTS (
    SELECT 1 FROM public.subscriptions s
     WHERE s.user_id = p_user_id
       AND s.status IN ('authorized', 'past_due', 'paused')
       AND s.trial_ends_at IS NOT NULL
       AND NOT s.first_payment_confirmed
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'card_trial');
  END IF;

  -- An expired trial restarts from now; a running one is pushed further out.
  v_new_end := GREATEST(now(), COALESCE(v_profile.plan_period_end, now()))
               + make_interval(days => p_days);

  IF v_new_end > v_profile.trial_started_at + interval '90 days' THEN
    RETURN jsonb_build_object('success', false, 'error', 'trial_limit_reached');
  END IF;

  UPDATE public.profiles SET plan_period_end = v_new_end WHERE id = p_user_id;

  RETURN jsonb_build_object('success', true, 'plan_period_end', v_new_end);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.refund_last_charge(uuid)      FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.confirm_refund(text, text)     FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.refund_last_charge(uuid)      TO service_role;
GRANT  EXECUTE ON FUNCTION public.confirm_refund(text, text)     TO service_role;
