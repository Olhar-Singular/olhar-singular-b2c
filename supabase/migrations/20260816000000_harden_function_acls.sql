-- =============================================================================
-- Function-level hardening: trigger-function ACLs + pinned search_path
-- -----------------------------------------------------------------------------
-- Clears the two function lint families reported by the Supabase security
-- advisor. Neither is exploitable today; both are removable surface.
--
--   1. *_security_definer_function_executable (WARN ×6)
--      handle_new_user, prevent_credit_self_mutation and
--      prevent_super_admin_self_escalation are SECURITY DEFINER and still
--      carried Supabase's default EXECUTE grant to anon + authenticated. They
--      return `trigger`, so PostgREST never exposes them as RPC and Postgres
--      refuses a direct call ("trigger functions can only be called as
--      triggers") — the grant has no legitimate user at all. Revoking it costs
--      nothing: EXECUTE on a trigger function is checked when the TRIGGER is
--      created, not when it fires, so every guard keeps running for roles that
--      no longer hold the privilege. That is what the pgTAP test asserts.
--
--   2. function_search_path_mutable (WARN ×2)
--      handle_updated_at and get_user_school_id resolved their names through a
--      caller-controlled search_path. Neither is SECURITY DEFINER, so this is
--      not an escalation path today — it is a trap for the day one of them
--      becomes one. Pinned to `public`, matching every other function here.
--
-- ALTER FUNCTION ... SET is used on purpose instead of CREATE OR REPLACE: it
-- pins the setting without rewriting the body (and without touching the ACL).
-- The definitions still live in 20260420000000_initial_schema.sql.
--
-- Covered by supabase/tests/database/function_hardening.test.sql.
-- =============================================================================

-- ── 1. Trigger functions: no EXECUTE for the API roles ──────────────────────
-- Supabase grants EXECUTE via PUBLIC defaults, so REVOKE FROM PUBLIC alone is
-- not enough — both roles must be named explicitly.
-- MAINTENANCE: only ever change these three with CREATE OR REPLACE. A DROP +
-- CREATE resets the ACL to the PUBLIC default and silently re-adds the grant.
REVOKE EXECUTE ON FUNCTION public.handle_new_user()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_credit_self_mutation()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_super_admin_self_escalation()
  FROM PUBLIC, anon, authenticated;

-- ── 2. Pin the search_path on the two functions that lacked it ──────────────
ALTER FUNCTION public.handle_updated_at()          SET search_path = public;
ALTER FUNCTION public.get_user_school_id(uuid)     SET search_path = public;
