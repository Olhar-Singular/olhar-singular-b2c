-- =============================================================================
-- Trial with card: 7 days free, first charge on day 8
-- -----------------------------------------------------------------------------
-- The landing no longer asks for an invite: the card creates a Mercado Pago
-- preapproval with auto_recurring.start_date = now + 7 days (validated in the
-- sandbox on 2026-09-15: authorized, next_payment_date = start_date, no charge).
--
-- The ROW carries the intent: the subscribe function writes
-- subscriptions.trial_ends_at on the pending row, and the RPCs below branch on
-- it with their signatures unchanged (CREATE OR REPLACE keeps the
-- service_role-only ACL; a new DEFAULT parameter would have created an
-- ambiguous overload). The webhook path (sync_subscription_status →
-- activate_subscription) therefore activates a trial left pending correctly.
--
-- Activation of a trial: 50 credits in the plan bucket until trial_ends_at,
-- access_kind 'trial', no plan quota, no activation invoice (nothing was
-- granted against money). The first approved charge (day 8) converts the trial:
-- apply_plan_quota closes what is left of the 50 and loads the quota
-- ('subscriber'). A declined first charge is the existing clawback. Cancelling
-- inside the trial removes the trial credits at once (decision 3); a paid
-- period keeps its credits until plan_period_end (lazy expiry).
--
-- One trial per CPF (decision 4): trial_used_by_cpf, called by subscribe BEFORE
-- the account exists so a barred CPF never leaves an orphan account.
--
-- Covered by trial_with_card.test.sql.
-- =============================================================================

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz;

COMMENT ON COLUMN public.subscriptions.trial_ends_at IS
  'Trial with card: the start_date sent to MP (first charge). NULL = paid from day one.';

-- trial_used_by_cpf is a point lookup on every trial checkout.
CREATE INDEX IF NOT EXISTS profiles_cpf_idx ON public.profiles (cpf) WHERE cpf IS NOT NULL;

-- ── trial_used_by_cpf(cpf) → boolean ───────────────────────────────────────
-- A CPF that already ran a trial (invite or card) or ever held a subscription
-- row only subscribes paid. The CPF lands on the profile after an accepted or
-- pending card (recordProfileFacts), so a refused attempt never burns it.
CREATE OR REPLACE FUNCTION public.trial_used_by_cpf(p_cpf text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.profiles p
     WHERE p.cpf = p_cpf
       AND (p.trial_started_at IS NOT NULL
            OR EXISTS (SELECT 1 FROM public.subscriptions s WHERE s.user_id = p.id))
  );
$$;

REVOKE EXECUTE ON FUNCTION public.trial_used_by_cpf(text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.trial_used_by_cpf(text) TO service_role;

-- ── activate_subscription: branch on trial_ends_at ──────────────────────────
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
  v_left       integer;
BEGIN
  SELECT s.id, s.user_id, s.status, s.trial_ends_at, p.monthly_credits
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

  v_quota := v_sub.monthly_credits;
  -- A trial's first period ends when the trial ends: the day MP collects.
  v_period_end := CASE
    WHEN v_sub.trial_ends_at IS NOT NULL THEN v_sub.trial_ends_at
    ELSE COALESCE(p_next_payment_date, now() + interval '1 month')
  END;

  BEGIN
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
  EXCEPTION WHEN unique_violation THEN
    -- Another live subscription of this user already exists (or this
    -- preapproval id is already mirrored on another row). Close this attempt
    -- without touching the credits; the caller cancels it at MP.
    UPDATE public.subscriptions
       SET status        = 'rejected',
           status_detail = 'duplicate_live_subscription',
           mp_preapproval_id = CASE
             WHEN EXISTS (SELECT 1 FROM public.subscriptions o
                           WHERE o.mp_preapproval_id = p_mp_preapproval_id AND o.id <> p_subscription_id)
             THEN mp_preapproval_id ELSE p_mp_preapproval_id END
     WHERE id = p_subscription_id;
    RETURN jsonb_build_object('success', false, 'error', 'duplicate_live_subscription');
  END;

  IF v_sub.trial_ends_at IS NOT NULL THEN
    -- Trial with card: 50 trial credits until the trial ends, account kind
    -- 'trial'. The plan quota only lands with the first charge
    -- (renew_subscription → trial_converted). No activation invoice: nothing
    -- was granted against money.
    SELECT plan_credits INTO v_left FROM public.profiles WHERE id = v_sub.user_id FOR UPDATE;
    IF v_left > 0 THEN
      INSERT INTO public.credit_transactions (user_id, delta, type, ref_id, bucket)
      VALUES (v_sub.user_id, -v_left, 'plan_reset', p_subscription_id, 'plan');
    END IF;

    UPDATE public.profiles
       SET access_kind       = 'trial',
           trial_started_at  = now(),
           plan_credits      = 50,
           plan_period_start = now(),
           plan_period_end   = v_sub.trial_ends_at
     WHERE id = v_sub.user_id;

    INSERT INTO public.credit_transactions (user_id, delta, type, ref_id, bucket)
    VALUES (v_sub.user_id, 50, 'trial_grant', p_subscription_id, 'plan');

    RETURN jsonb_build_object(
      'success', true, 'already', false, 'trial', true,
      'plan_credits', 50, 'plan_period_end', v_sub.trial_ends_at);
  END IF;

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

-- ── renew_subscription: the first charge of a trial converts it ─────────────
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

-- ── cancel_subscription_local: inside the trial the credits go now ──────────
CREATE OR REPLACE FUNCTION public.cancel_subscription_local(
  p_subscription_id uuid,
  p_cancelled_at    timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub  record;
  v_left integer;
BEGIN
  SELECT user_id, trial_ends_at, first_payment_confirmed
    INTO v_sub
    FROM public.subscriptions
   WHERE id = p_subscription_id
     FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_cancellable');
  END IF;

  UPDATE public.subscriptions
     SET status = 'cancelled', cancelled_at = COALESCE(p_cancelled_at, now())
   WHERE id = p_subscription_id
     AND status IN ('pending', 'authorized', 'past_due', 'paused');
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_cancellable');
  END IF;

  -- Cancelling inside the trial (no charge yet): the trial credits go now and
  -- the paywall closes (decision 3). Credits of a paid period stay until
  -- plan_period_end (lazy expiry). Guarded on the account kind so a trial row
  -- that never activated cannot touch a paid profile.
  IF v_sub.trial_ends_at IS NOT NULL AND NOT v_sub.first_payment_confirmed THEN
    SELECT plan_credits INTO v_left
      FROM public.profiles
     WHERE id = v_sub.user_id AND access_kind = 'trial'
       FOR UPDATE;
    IF FOUND THEN
      UPDATE public.profiles
         SET plan_credits = 0, plan_period_end = now()
       WHERE id = v_sub.user_id;
      IF v_left > 0 THEN
        INSERT INTO public.credit_transactions (user_id, delta, type, ref_id, bucket)
        VALUES (v_sub.user_id, -v_left, 'plan_reset', p_subscription_id, 'plan');
      END IF;
      RETURN jsonb_build_object('success', true, 'trial_closed', true, 'credits_removed', COALESCE(v_left, 0));
    END IF;
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;
