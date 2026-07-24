-- =============================================================================
-- Harden the credit paywall against direct-PostgREST bypasses
-- ----------------------------------------------------------------------------
-- The whole paywall could be circumvented without ever calling an edge function:
--
--   Vector 1 — auto-grant via RPC. grant_credits / deduct_credits are
--   SECURITY DEFINER but were never REVOKEd, so Supabase's default EXECUTE grant
--   to anon + authenticated let any caller POST /rest/v1/rpc/grant_credits and
--   mint an infinite balance. Only the edge functions (service_role) should call
--   them. Same lockdown already applied to admin_grant_credits + the admin_*
--   aggregation RPCs.
--
--   Vector 2 — self-edit of the money columns. The "Users can update their own
--   profile" policy has no column scope and every column is GRANTed to
--   authenticated, so a PATCH /rest/v1/profiles?id=eq.<me> could set
--   credit_balance / free_adaptation_used / free_extraction_used arbitrarily
--   (infinite balance + infinite "free" adaptations/extractions).
--
-- Legit writers are untouched: the webhooks and the adapt/extract/chat edge
-- functions call the RPCs and claim the free-first flags as service_role.
-- =============================================================================

-- ── Vector 1: lock the credit RPCs to service_role only ─────────────────────
-- Supabase grants EXECUTE to anon + authenticated via PUBLIC defaults, so
-- REVOKE FROM PUBLIC alone is not enough — both roles must be named explicitly.
--
-- MAINTENANCE: only ever change these two functions with CREATE OR REPLACE.
-- A DROP + CREATE resets the ACL to the PUBLIC default and silently reopens this
-- vector. The 42501 assertions in credit_paywall_guard.test.sql are the CI net.
REVOKE EXECUTE ON FUNCTION public.grant_credits(uuid, integer, text, text, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.deduct_credits(uuid, integer, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.grant_credits(uuid, integer, text, text, uuid)
  TO service_role;
GRANT  EXECUTE ON FUNCTION public.deduct_credits(uuid, integer, text, uuid)
  TO service_role;

-- ── Vector 2: forbid ordinary requests from editing the money columns ───────
-- A BEFORE UPDATE guard, mirroring prevent_super_admin_self_escalation: it
-- blocks a change to any money column only when the request comes from an
-- authenticated/anon JWT. service_role (webhooks + edge-fn free-first/deduct)
-- and direct postgres (empty claims) pass through, so every legit write still
-- works. Non-money columns (e.g. full_name) remain freely editable by the owner.
CREATE OR REPLACE FUNCTION public.prevent_credit_self_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- nullif treats an empty claims setting as "no claims" (direct postgres /
  -- service_role context), where money-column writes are allowed.
  claims_role text := nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role';
BEGIN
  IF claims_role IN ('authenticated', 'anon')
     AND (
          NEW.credit_balance       IS DISTINCT FROM OLD.credit_balance
       OR NEW.free_adaptation_used IS DISTINCT FROM OLD.free_adaptation_used
       OR NEW.free_extraction_used IS DISTINCT FROM OLD.free_extraction_used
     ) THEN
    RAISE EXCEPTION 'not authorized to change credit fields';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_credit_self_mutation ON public.profiles;
CREATE TRIGGER trg_prevent_credit_self_mutation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_credit_self_mutation();
