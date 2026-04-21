-- =============================================================================
-- Add 'extract' to credit transaction types and free extraction flag
-- =============================================================================

-- Add free_extraction_used to profiles (mirrors free_adaptation_used)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS free_extraction_used boolean NOT NULL DEFAULT false;

-- Drop old CHECK constraint and recreate including 'extract'
ALTER TABLE public.credit_transactions
  DROP CONSTRAINT IF EXISTS credit_transactions_type_check;

ALTER TABLE public.credit_transactions
  ADD CONSTRAINT credit_transactions_type_check
  CHECK (type IN ('signup_bonus','purchase','adapt','regenerate','chat','refund','extract'));

-- Recreate deduct_credits to accept 'extract' in the type guard
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

  IF p_type NOT IN ('adapt', 'regenerate', 'chat', 'extract') THEN
    RAISE EXCEPTION 'invalid type';
  END IF;

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
