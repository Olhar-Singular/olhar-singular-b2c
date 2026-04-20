-- =============================================================================
-- RPCs for credit mutations
-- Called exclusively by edge functions via service_role key (bypasses RLS).
-- SECURITY DEFINER + fixed search_path prevents search_path injection.
-- =============================================================================


-- =============================================================================
-- public.deduct_credits
-- Atomically debits p_amount credits from profiles and records the transaction.
-- Returns jsonb so the caller can pattern-match success/failure without
-- catching Postgres exceptions.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.deduct_credits(
  p_user_id  uuid,
  p_amount   integer,
  p_type     text,
  p_ref_id   uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance integer;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'amount must be positive';
  END IF;

  IF p_type NOT IN ('adapt', 'regenerate', 'chat') THEN
    RAISE EXCEPTION 'invalid type';
  END IF;

  -- FOR UPDATE acquires a row-level lock so concurrent calls for the same user
  -- are serialised and cannot both pass the balance check on stale reads.
  SELECT credit_balance
    INTO v_balance
    FROM public.profiles
   WHERE id = p_user_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'user_not_found');
  END IF;

  IF v_balance < p_amount THEN
    RETURN jsonb_build_object(
      'success', false,
      'error',   'insufficient_credits',
      'balance', v_balance
    );
  END IF;

  UPDATE public.profiles
     SET credit_balance = credit_balance - p_amount
   WHERE id = p_user_id;

  INSERT INTO public.credit_transactions (user_id, delta, type, ref_id)
  VALUES (p_user_id, -p_amount, p_type, p_ref_id);

  RETURN jsonb_build_object('success', true, 'new_balance', v_balance - p_amount);
END;
$$;


-- =============================================================================
-- public.grant_credits
-- Atomically credits p_amount credits to profiles and records the transaction.
-- Intended for the Mercado Pago webhook and signup-bonus flows.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.grant_credits(
  p_user_id    uuid,
  p_amount     integer,
  p_type       text,
  p_payment_id text DEFAULT NULL,
  p_ref_id     uuid DEFAULT NULL
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

  IF p_type NOT IN ('purchase', 'signup_bonus', 'refund') THEN
    RAISE EXCEPTION 'invalid type';
  END IF;

  UPDATE public.profiles
     SET credit_balance = credit_balance + p_amount
   WHERE id = p_user_id
  RETURNING credit_balance INTO v_new_balance;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'user_not_found');
  END IF;

  INSERT INTO public.credit_transactions (user_id, delta, type, payment_id, ref_id)
  VALUES (p_user_id, p_amount, p_type, p_payment_id, p_ref_id);

  RETURN jsonb_build_object('success', true, 'new_balance', v_new_balance);
END;
$$;
