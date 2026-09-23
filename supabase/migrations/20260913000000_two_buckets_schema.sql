-- =============================================================================
-- Two credit buckets + access state on profiles; harden profiles and the ledger
-- -----------------------------------------------------------------------------
-- The balance stops being one integer:
--   * plan_credits / plan_period_end  -> the monthly bucket (reset on renewal;
--                                        also where a trial's 50 credits live);
--   * credit_balance                  -> the "extras" bucket, never expires.
-- access_kind says how the account got in: 'subscriber' (paid checkout, the
-- default), 'trial' and 'exempt' (created by the admin, carried in the invite's
-- user_metadata), 'legacy' (accounts that predate this model; set by the data
-- migration). trial_started_at, cpf, must_set_password and the terms columns
-- serve the checkout and the trial trigger that follow.
--
-- The 50-credit signup bonus ends here (credit_balance DEFAULT 0): there is no
-- public signup anymore, and the admin-created trial gets its credits from the
-- trigger, not from a column default.
--
-- Hardening (found in the 2026-09-12 review):
--   * profiles had INSERT and DELETE policies for the owner while both guards
--     are BEFORE UPDATE only: a user could delete and re-insert their own row
--     with any credit_balance / access_kind / is_super_admin. The row is born
--     by handle_new_user only, so both policies go and the privileges are
--     revoked.
--   * credit_transactions had an INSERT policy for the owner: the statement
--     is the audit trail of the balance, so it is written by the money RPCs
--     only.
-- =============================================================================

-- ── profiles ────────────────────────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS plan_credits      integer NOT NULL DEFAULT 0 CHECK (plan_credits >= 0),
  ADD COLUMN IF NOT EXISTS plan_period_end   timestamptz,
  ADD COLUMN IF NOT EXISTS access_kind       text NOT NULL DEFAULT 'subscriber'
    CHECK (access_kind IN ('subscriber', 'trial', 'exempt', 'legacy')),
  ADD COLUMN IF NOT EXISTS trial_started_at  timestamptz,
  ADD COLUMN IF NOT EXISTS cpf               text CHECK (cpf IS NULL OR cpf ~ '^[0-9]{11}$'),
  ADD COLUMN IF NOT EXISTS must_set_password boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS terms_version     text;

ALTER TABLE public.profiles ALTER COLUMN credit_balance SET DEFAULT 0;

DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can delete their own profile" ON public.profiles;
REVOKE INSERT, DELETE ON public.profiles FROM anon, authenticated;

-- The profile is created by the auth trigger. access_kind comes from the auth
-- user's metadata only for the two values the admin invite may set; anything
-- else (including whatever a paid checkout might pass) is a subscriber.
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
  RETURN NEW;
END;
$$;

-- Money AND identity columns: a user may never edit them through PostgREST.
-- CREATE OR REPLACE keeps the ACL from 20260816 (revoked from anon/authenticated).
CREATE OR REPLACE FUNCTION public.prevent_credit_self_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  claims_role text := nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role';
BEGIN
  IF claims_role IN ('authenticated', 'anon')
     AND (
          NEW.credit_balance       IS DISTINCT FROM OLD.credit_balance
       OR NEW.free_adaptation_used IS DISTINCT FROM OLD.free_adaptation_used
       OR NEW.free_extraction_used IS DISTINCT FROM OLD.free_extraction_used
       OR NEW.plan_credits         IS DISTINCT FROM OLD.plan_credits
       OR NEW.plan_period_end      IS DISTINCT FROM OLD.plan_period_end
       OR NEW.access_kind          IS DISTINCT FROM OLD.access_kind
       OR NEW.trial_started_at     IS DISTINCT FROM OLD.trial_started_at
       OR NEW.cpf                  IS DISTINCT FROM OLD.cpf
       OR NEW.must_set_password    IS DISTINCT FROM OLD.must_set_password
       OR NEW.terms_accepted_at    IS DISTINCT FROM OLD.terms_accepted_at
       OR NEW.terms_version        IS DISTINCT FROM OLD.terms_version
     ) THEN
    RAISE EXCEPTION 'not authorized to change credit fields';
  END IF;
  RETURN NEW;
END;
$$;

-- ── credit_transactions (ledger) ────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can insert their own credit_transactions" ON public.credit_transactions;
REVOKE INSERT ON public.credit_transactions FROM anon, authenticated;

ALTER TABLE public.credit_transactions
  ADD COLUMN IF NOT EXISTS bucket text NOT NULL DEFAULT 'extra'
    CHECK (bucket IN ('plan', 'extra', 'exempt'));

ALTER TABLE public.credit_transactions
  DROP CONSTRAINT IF EXISTS credit_transactions_type_check;
ALTER TABLE public.credit_transactions
  ADD CONSTRAINT credit_transactions_type_check
  CHECK (type IN (
    'signup_bonus', 'purchase', 'adapt', 'regenerate', 'chat', 'refund', 'extract',
    'admin_grant', 'trial_grant', 'plan_grant', 'plan_reset', 'compensation', 'clawback'
  ));

-- ── credit_reservations ─────────────────────────────────────────────────────
ALTER TABLE public.credit_reservations
  ADD COLUMN IF NOT EXISTS plan_charged       integer NOT NULL DEFAULT 0 CHECK (plan_charged >= 0),
  ADD COLUMN IF NOT EXISTS extra_charged      integer NOT NULL DEFAULT 0 CHECK (extra_charged >= 0),
  ADD COLUMN IF NOT EXISTS period_end_at_open timestamptz;

ALTER TABLE public.credit_reservations
  DROP CONSTRAINT IF EXISTS credit_reservations_kind_check;
ALTER TABLE public.credit_reservations
  ADD CONSTRAINT credit_reservations_kind_check
  CHECK (kind IN ('adapt', 'extract'));
