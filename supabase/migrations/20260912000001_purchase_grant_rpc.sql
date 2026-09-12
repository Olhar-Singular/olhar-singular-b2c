-- =============================================================================
-- Atomic purchase approval: claim + grant in ONE transaction
-- -----------------------------------------------------------------------------
-- The Mercado Pago webhook and the synchronous card checkout both used to run
-- two separate statements from the edge function: UPDATE credit_purchases
-- pending -> approved (the idempotency claim) and only then rpc grant_credits.
-- An isolate dying between the two left the purchase marked approved with no
-- ledger row and no balance, and every later webhook saw 0 rows on the claim
-- and concluded the credit had already been granted. Production carries one
-- Stripe payment in exactly that state.
--
-- approve_purchase_and_grant does both inside the database: either the row is
-- approved AND the credits land, or nothing changes. The conditional UPDATE on
-- status = 'pending' keeps it idempotent, so a replayed webhook, a webhook
-- racing the synchronous checkout, or a retry after a timeout can never grant
-- twice. reject_pending_purchase is the matching terminal-failure path and
-- never downgrades an approved purchase.
--
-- service_role only, like every other money RPC (see 20260722000001).
-- MAINTENANCE: only ever change these with CREATE OR REPLACE (a DROP + CREATE
-- resets the ACL to the PUBLIC default). Covered by purchase_grant_rpc.test.sql.
-- =============================================================================

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
  -- The claim: only the first caller moves the row out of 'pending'.
  UPDATE public.credit_purchases
     SET status = 'approved', payment_id = p_payment_id
   WHERE id = p_purchase_id
     AND status = 'pending'
  RETURNING user_id, credits_granted INTO v_row;

  IF NOT FOUND THEN
    -- Already approved/rejected by someone else, or unknown: nothing is owed.
    RETURN jsonb_build_object(
      'success', true, 'granted', false, 'reason', 'already_processed');
  END IF;

  -- Same transaction as the claim: a failure here rolls the claim back too,
  -- so the next notification finds the row still pending and tries again.
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

CREATE OR REPLACE FUNCTION public.reject_pending_purchase(
  p_purchase_id   uuid,
  p_payment_id    text,
  p_status_detail text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rejected boolean;
BEGIN
  -- Scoped to 'pending' so an already-approved purchase can never be downgraded.
  -- A null payment id keeps whatever id the row already stored.
  UPDATE public.credit_purchases
     SET status        = 'rejected',
         payment_id    = COALESCE(p_payment_id, payment_id),
         status_detail = p_status_detail
   WHERE id = p_purchase_id
     AND status = 'pending';
  v_rejected := FOUND;

  RETURN jsonb_build_object('success', true, 'rejected', v_rejected);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.approve_purchase_and_grant(uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reject_pending_purchase(uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.approve_purchase_and_grant(uuid, text)
  TO service_role;
GRANT  EXECUTE ON FUNCTION public.reject_pending_purchase(uuid, text, text)
  TO service_role;
