-- =============================================================================
-- consume_credits: the single point that debits, across the two buckets
-- -----------------------------------------------------------------------------
-- Order: the plan bucket first (only while plan_period_end is still in the
-- future; expiry is lazy, nothing zeroes the column), then extras. Exempt
-- accounts consume nothing but still leave a delta-0 ledger row so the
-- statement shows usage. One ledger row per bucket touched.
--
-- deduct_credits keeps its signature and payload (success / error / balance /
-- new_balance) as a thin wrapper, so chat and any older caller work unchanged
-- and the ACL from 20260722000001 is preserved (CREATE OR REPLACE, same args).
--
-- Reservations learn the buckets: open_credit_reservation(kind) records what
-- came from where, extract-questions joins the crash-safe model (kind
-- 'extract'), and reverse_credit_reservation gives each part back to its
-- origin. A plan part is returned only while the SAME period is still active
-- (period_end_at_open); otherwise it is dropped, never converted into a
-- perpetual extra credit. The free-first path is gone with the free flags.
--
-- All money RPCs stay service_role only. Covered by
-- consume_credits_two_buckets.test.sql and credit_reservations.test.sql.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.consume_credits(
  p_user_id uuid,
  p_amount  integer,
  p_type    text,
  p_ref_id  uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile        record;
  v_plan_available integer;
  v_plan_charged   integer := 0;
  v_extra_charged  integer := 0;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'amount must be positive';
  END IF;

  IF p_type NOT IN ('adapt', 'regenerate', 'chat', 'extract') THEN
    RAISE EXCEPTION 'invalid type';
  END IF;

  -- FOR UPDATE serialises concurrent debits (and the plan reset) on this row.
  SELECT access_kind, plan_credits, plan_period_end, credit_balance
    INTO v_profile
    FROM public.profiles
   WHERE id = p_user_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'user_not_found');
  END IF;

  IF v_profile.access_kind = 'exempt' THEN
    INSERT INTO public.credit_transactions (user_id, delta, type, ref_id, bucket)
    VALUES (p_user_id, 0, p_type, p_ref_id, 'exempt');
    RETURN jsonb_build_object(
      'success', true, 'mode', 'exempt',
      'plan_charged', 0, 'extra_charged', 0,
      'plan_balance', v_profile.plan_credits, 'extra_balance', v_profile.credit_balance,
      'new_balance', v_profile.plan_credits + v_profile.credit_balance);
  END IF;

  v_plan_available := CASE
    WHEN v_profile.plan_period_end IS NOT NULL AND v_profile.plan_period_end > now()
      THEN v_profile.plan_credits
    ELSE 0
  END;

  IF v_plan_available + v_profile.credit_balance < p_amount THEN
    RETURN jsonb_build_object(
      'success', false,
      'error',   'insufficient_credits',
      'balance', v_plan_available + v_profile.credit_balance,
      'plan_balance',  v_plan_available,
      'extra_balance', v_profile.credit_balance);
  END IF;

  v_plan_charged  := LEAST(v_plan_available, p_amount);
  v_extra_charged := p_amount - v_plan_charged;

  UPDATE public.profiles
     SET plan_credits   = plan_credits   - v_plan_charged,
         credit_balance = credit_balance - v_extra_charged
   WHERE id = p_user_id;

  IF v_plan_charged > 0 THEN
    INSERT INTO public.credit_transactions (user_id, delta, type, ref_id, bucket)
    VALUES (p_user_id, -v_plan_charged, p_type, p_ref_id, 'plan');
  END IF;
  IF v_extra_charged > 0 THEN
    INSERT INTO public.credit_transactions (user_id, delta, type, ref_id, bucket)
    VALUES (p_user_id, -v_extra_charged, p_type, p_ref_id, 'extra');
  END IF;

  RETURN jsonb_build_object(
    'success',       true,
    'mode',          'charged',
    'plan_charged',  v_plan_charged,
    'extra_charged', v_extra_charged,
    'plan_balance',  v_plan_available - v_plan_charged,
    'extra_balance', v_profile.credit_balance - v_extra_charged,
    'new_balance',   (v_plan_available - v_plan_charged) + (v_profile.credit_balance - v_extra_charged)
  );
END;
$$;

-- Thin wrapper: same signature, same payload keys the callers already read.
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
BEGIN
  RETURN public.consume_credits(p_user_id, p_amount, p_type, p_ref_id);
END;
$$;

-- =============================================================================
-- open_credit_reservation(request_id, user_id, amount, kind) → jsonb
-- Reserve AND charge in ONE transaction, recording which bucket paid.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.open_credit_reservation(
  p_request_id uuid,
  p_user_id    uuid,
  p_amount     integer,
  p_kind       text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_consume    jsonb;
  v_period_end timestamptz;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'amount must be positive';
  END IF;
  IF p_kind NOT IN ('adapt', 'extract') THEN
    RAISE EXCEPTION 'invalid kind';
  END IF;

  -- The primary key IS the idempotency guard.
  BEGIN
    INSERT INTO public.credit_reservations (id, user_id, kind)
    VALUES (p_request_id, p_user_id, p_kind);
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('success', false, 'error', 'duplicate_request');
  END;

  v_consume := public.consume_credits(p_user_id, p_amount, p_kind, p_request_id);

  IF (v_consume->>'success')::boolean IS NOT TRUE THEN
    -- Nothing was charged, so nothing is owed: drop the reservation instead of
    -- leaving an `open` row the job would later "refund".
    DELETE FROM public.credit_reservations WHERE id = p_request_id;
    RETURN v_consume;
  END IF;

  SELECT plan_period_end INTO v_period_end FROM public.profiles WHERE id = p_user_id;

  UPDATE public.credit_reservations
     SET credits_charged    = (v_consume->>'plan_charged')::integer + (v_consume->>'extra_charged')::integer,
         plan_charged       = (v_consume->>'plan_charged')::integer,
         extra_charged      = (v_consume->>'extra_charged')::integer,
         period_end_at_open = v_period_end
   WHERE id = p_request_id;

  RETURN jsonb_build_object(
    'success',         true,
    'mode',            v_consume->>'mode',
    'credits_charged', (v_consume->>'plan_charged')::integer + (v_consume->>'extra_charged')::integer,
    'plan_charged',    (v_consume->>'plan_charged')::integer,
    'extra_charged',   (v_consume->>'extra_charged')::integer,
    'plan_balance',    (v_consume->>'plan_balance')::integer,
    'extra_balance',   (v_consume->>'extra_balance')::integer,
    'new_balance',     (v_consume->>'new_balance')::integer
  );
END;
$$;

-- Same signature as before (ACL preserved); the adapt flavour delegates.
CREATE OR REPLACE FUNCTION public.open_adapt_reservation(
  p_request_id uuid,
  p_user_id    uuid,
  p_amount     integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.open_credit_reservation(p_request_id, p_user_id, p_amount, 'adapt');
END;
$$;

-- =============================================================================
-- reverse_credit_reservation(id) → jsonb, now bucket-aware
-- =============================================================================
CREATE OR REPLACE FUNCTION public.reverse_credit_reservation(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row            record;
  v_profile        record;
  v_extra_part     integer;
  v_plan_refunded  integer := 0;
  v_extra_refunded integer := 0;
BEGIN
  UPDATE public.credit_reservations
     SET state = 'reversed', reversed_at = now()
   WHERE id = p_id
     AND state = 'open'
  RETURNING user_id, credits_charged, plan_charged, extra_charged, period_end_at_open INTO v_row;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', true, 'reversed', false, 'credits_refunded', 0,
      'plan_refunded', 0, 'extra_refunded', 0, 'free_released', false);
  END IF;

  -- Rows opened before the buckets existed carry only credits_charged: they
  -- were debited from the single balance, i.e. today's extras.
  v_extra_part := CASE
    WHEN v_row.plan_charged = 0 AND v_row.extra_charged = 0 THEN v_row.credits_charged
    ELSE v_row.extra_charged
  END;

  SELECT plan_period_end INTO v_profile FROM public.profiles WHERE id = v_row.user_id FOR UPDATE;

  IF v_row.plan_charged > 0 THEN
    IF v_profile.plan_period_end IS NOT DISTINCT FROM v_row.period_end_at_open
       AND v_profile.plan_period_end > now() THEN
      UPDATE public.profiles SET plan_credits = plan_credits + v_row.plan_charged
       WHERE id = v_row.user_id;
      v_plan_refunded := v_row.plan_charged;
    END IF;
    -- Audit trail either way: delta 0 says the plan part was dropped because
    -- the period it came from is over (never converted into an extra).
    INSERT INTO public.credit_transactions (user_id, delta, type, ref_id, bucket)
    VALUES (v_row.user_id, v_plan_refunded, 'refund', p_id, 'plan');
  END IF;

  IF v_extra_part > 0 THEN
    UPDATE public.profiles SET credit_balance = credit_balance + v_extra_part
     WHERE id = v_row.user_id;
    INSERT INTO public.credit_transactions (user_id, delta, type, ref_id, bucket)
    VALUES (v_row.user_id, v_extra_part, 'refund', p_id, 'extra');
    v_extra_refunded := v_extra_part;
  END IF;

  RETURN jsonb_build_object(
    'success',          true,
    'reversed',         true,
    'credits_refunded', v_plan_refunded + v_extra_refunded,
    'plan_refunded',    v_plan_refunded,
    'extra_refunded',   v_extra_refunded,
    'free_released',    false
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.consume_credits(uuid, integer, text, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.open_credit_reservation(uuid, uuid, integer, text)
  FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.consume_credits(uuid, integer, text, uuid)
  TO service_role;
GRANT  EXECUTE ON FUNCTION public.open_credit_reservation(uuid, uuid, integer, text)
  TO service_role;
