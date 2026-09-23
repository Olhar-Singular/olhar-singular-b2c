-- =============================================================================
-- The trial clock and the access state the admin assigns
-- -----------------------------------------------------------------------------
-- There is no public signup anymore: trial and courtesy accounts are created by
-- the admin, who invites the person with access_kind in the auth metadata
-- (handle_new_user reads it). The trial's 50 credits land in the PLAN bucket and
-- the 7-day clock starts when the invite is ACCEPTED, not at INSERT: whoever
-- never confirmed never entered, and must not lose days waiting.
--
-- The trigger fires only on the NULL -> timestamp transition of
-- email_confirmed_at (a plain "UPDATE OF" would also fire when GoTrue rewrites
-- the same value), and it swallows its own errors: an exception inside a trigger
-- on auth.users turns the invite acceptance into a 500 in GoTrue, which would
-- lock the user out over a bookkeeping problem.
--
-- Covered by trial_and_access.test.sql.
-- =============================================================================

-- Shared body: grant the trial exactly once per account.
CREATE OR REPLACE FUNCTION public.start_trial_for(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_started boolean;
BEGIN
  UPDATE public.profiles
     SET plan_credits     = 50,
         plan_period_end  = now() + interval '7 days',
         trial_started_at = now()
   WHERE id = p_user_id
     AND access_kind = 'trial'
     AND trial_started_at IS NULL;
  v_started := FOUND;

  IF v_started THEN
    INSERT INTO public.credit_transactions (user_id, delta, type, bucket)
    VALUES (p_user_id, 50, 'trial_grant', 'plan');
  END IF;

  RETURN v_started;
END;
$$;

CREATE OR REPLACE FUNCTION public.start_trial_on_confirm()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.start_trial_for(NEW.id);
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never break the auth request that confirmed the e-mail.
  RAISE WARNING 'start_trial_on_confirm failed for %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_confirmed ON auth.users;
CREATE TRIGGER on_auth_user_confirmed
  AFTER UPDATE OF email_confirmed_at ON auth.users
  FOR EACH ROW
  WHEN (OLD.email_confirmed_at IS NULL AND NEW.email_confirmed_at IS NOT NULL)
  EXECUTE FUNCTION public.start_trial_on_confirm();

-- A user created already confirmed (the admin's createUser path) never sees the
-- UPDATE, so handle_new_user starts the clock inline.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_kind text := NEW.raw_user_meta_data->>'access_kind';
BEGIN
  IF v_kind IS NULL OR v_kind NOT IN ('trial', 'exempt') THEN
    v_kind := 'subscriber';
  END IF;

  INSERT INTO public.profiles (id, full_name, access_kind)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      split_part(NEW.email, '@', 1)
    ),
    v_kind
  )
  ON CONFLICT (id) DO NOTHING;

  IF v_kind = 'trial' AND NEW.email_confirmed_at IS NOT NULL THEN
    PERFORM public.start_trial_for(NEW.id);
  END IF;

  RETURN NEW;
END;
$$;

-- =============================================================================
-- admin_extend_trial(user_id, days) → jsonb
-- Support action: give a trial a few more days. Bounded so a fat-fingered
-- number cannot hand out a year, and limited to accounts whose clock started
-- (extending before acceptance would silently disable the trigger).
-- =============================================================================
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

-- =============================================================================
-- admin_set_access_kind(user_id, kind) → jsonb
-- Moves an account between the states the admin owns. 'subscriber' is NOT one
-- of them: that state is produced by the subscription flow, and setting it by
-- hand would claim a payment that does not exist.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.admin_set_access_kind(
  p_user_id uuid,
  p_kind    text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_confirmed boolean;
BEGIN
  IF p_kind IS NULL OR p_kind NOT IN ('trial', 'exempt', 'legacy') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_kind');
  END IF;

  UPDATE public.profiles SET access_kind = p_kind WHERE id = p_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'user_not_found');
  END IF;

  -- Moving an account that already confirmed its e-mail into a trial starts the
  -- clock now; one that has not confirmed yet is handled by the trigger.
  IF p_kind = 'trial' THEN
    SELECT email_confirmed_at IS NOT NULL INTO v_confirmed FROM auth.users WHERE id = p_user_id;
    IF v_confirmed THEN
      PERFORM public.start_trial_for(p_user_id);
    END IF;
  END IF;

  RETURN jsonb_build_object('success', true, 'access_kind', p_kind);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.start_trial_for(uuid)              FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.start_trial_on_confirm()           FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_extend_trial(uuid, integer)  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_set_access_kind(uuid, text)  FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.start_trial_for(uuid)              TO service_role;
GRANT  EXECUTE ON FUNCTION public.admin_extend_trial(uuid, integer)  TO service_role;
GRANT  EXECUTE ON FUNCTION public.admin_set_access_kind(uuid, text)  TO service_role;
