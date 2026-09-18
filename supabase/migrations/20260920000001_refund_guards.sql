-- =============================================================================
-- Refund guards (round-2 final-review fix wave)
-- -----------------------------------------------------------------------------
-- Item 1: the R$ 0 card-validation invoice mirrored by renew_subscription must
-- never be offered as the "last charge" (amount_brl > 0, NULL amount = unknown
-- = not refundable either).
-- Item 2: the lifetime "one refund per subscription" guard locked a user out
-- of ever refunding again if the best-effort preapproval cancel failed at MP
-- (MP keeps charging, renew_subscription reactivates). Replaced by "never
-- offer a charge older than an already-refunded one": bounded by the newest
-- refunded invoice's debit_date instead of an EXISTS on the whole history.
-- =============================================================================

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

  -- Only real money: an approved invoice with an MP payment id (never the
  -- synthetic activation row, never the R$ 0 card-validation charge), not
  -- refunded yet, and never older than the newest already-refunded invoice
  -- (a refund does not unwind the whole payment history one invoice at a
  -- time; a NULL debit_date is then never offered while a refund exists).
  SELECT id, mp_payment_id, amount_brl
    INTO v_invoice
    FROM public.subscription_invoices
   WHERE subscription_id = v_sub.id
     AND payment_status = 'approved'
     AND mp_payment_id IS NOT NULL
     AND refunded_at IS NULL
     AND COALESCE(amount_brl, 0) > 0
     AND debit_date > COALESCE(
           (SELECT max(debit_date) FROM public.subscription_invoices
             WHERE subscription_id = v_sub.id AND refunded_at IS NOT NULL),
           '-infinity'::timestamptz)
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
