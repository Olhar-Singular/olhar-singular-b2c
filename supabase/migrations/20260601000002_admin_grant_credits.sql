-- ============================================================================
-- Admin free credit grants
-- ----------------------------------------------------------------------------
-- Lets a super-admin add credits to any user at no charge. The grant is logged
-- in credit_transactions with a dedicated 'admin_grant' type so it is auditable
-- and never confused with a paid 'purchase' (revenue). It only touches the
-- credit ledger + balance — never ai_usage_logs — so it has ZERO effect on the
-- platform cost dashboard (which sums ai_usage_logs.cost_total in USD).
-- ============================================================================

-- 1. Allow the new ledger type.
ALTER TABLE public.credit_transactions
  DROP CONSTRAINT IF EXISTS credit_transactions_type_check;

ALTER TABLE public.credit_transactions
  ADD CONSTRAINT credit_transactions_type_check
  CHECK (type IN ('signup_bonus','purchase','adapt','regenerate','chat','refund','extract','admin_grant'));

-- 2. Dedicated RPC: atomically credit a user and log the grant.
--    Kept separate from grant_credits so the admin path is isolated and locked
--    down to service_role only.
CREATE OR REPLACE FUNCTION public.admin_grant_credits(
  p_user_id uuid,
  p_amount  integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_balance integer;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'amount must be positive';
  END IF;

  UPDATE public.profiles
     SET credit_balance = credit_balance + p_amount
   WHERE id = p_user_id
  RETURNING credit_balance INTO v_new_balance;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'user_not_found');
  END IF;

  INSERT INTO public.credit_transactions (user_id, delta, type)
  VALUES (p_user_id, p_amount, 'admin_grant');

  RETURN jsonb_build_object('success', true, 'new_balance', v_new_balance);
END;
$$;

-- 3. Only service_role (via the admin-grant-credits edge function) may execute.
REVOKE EXECUTE ON FUNCTION public.admin_grant_credits(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.admin_grant_credits(uuid, integer) TO service_role;
