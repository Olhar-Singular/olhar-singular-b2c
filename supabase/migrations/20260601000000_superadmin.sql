-- ============================================================================
-- Superadmin: role flag, privilege-escalation guard, and cost aggregation RPCs
-- ============================================================================
-- Adds a super-admin capability to the B2C app so a privileged user can manage
-- accounts and see platform-wide AI cost (in USD, from ai_usage_logs.cost_total).
--
-- Security model:
--   * profiles.is_super_admin gates the admin UI (read by the client) AND is
--     re-verified server-side inside the admin-* edge functions.
--   * A BEFORE UPDATE trigger forbids ordinary (authenticated/anon) requests from
--     flipping is_super_admin, preventing self-escalation. service_role and direct
--     postgres (SQL editor) are allowed — that is how the first admin is bootstrapped.
--   * Aggregation RPCs are executable only by service_role (REVOKE FROM PUBLIC);
--     the edge functions call them after authorizing the caller.
-- ============================================================================

-- 1. Role flag --------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_super_admin boolean NOT NULL DEFAULT false;

-- 2. Anti-escalation trigger -------------------------------------------------
CREATE OR REPLACE FUNCTION public.prevent_super_admin_self_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- nullif guards against an empty-string claims setting (treated as "no claims",
  -- i.e. a direct postgres/service_role context where escalation is allowed).
  claims_role text := nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role';
BEGIN
  IF NEW.is_super_admin IS DISTINCT FROM OLD.is_super_admin
     AND claims_role IN ('authenticated', 'anon') THEN
    RAISE EXCEPTION 'not authorized to change is_super_admin';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_super_admin_escalation ON public.profiles;
CREATE TRIGGER trg_prevent_super_admin_escalation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_super_admin_self_escalation();

-- 3. Supporting index for time-bucketed cost queries ------------------------
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_created_at
  ON public.ai_usage_logs (created_at);

-- 4. Aggregation RPCs (service_role only) -----------------------------------

-- Platform AI cost summary in USD: total, current day, current month.
CREATE OR REPLACE FUNCTION public.admin_cost_summary()
RETURNS TABLE (total_usd numeric, today_usd numeric, month_usd numeric)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    COALESCE(SUM(cost_total), 0)                                                              AS total_usd,
    COALESCE(SUM(cost_total) FILTER (WHERE created_at >= date_trunc('day', now())), 0)        AS today_usd,
    COALESCE(SUM(cost_total) FILTER (WHERE created_at >= date_trunc('month', now())), 0)      AS month_usd
  FROM public.ai_usage_logs
  WHERE status = 'success';
$$;

-- Cost time series bucketed by day or month, last p_buckets buckets.
CREATE OR REPLACE FUNCTION public.admin_cost_series(p_granularity text, p_buckets integer)
RETURNS TABLE (bucket timestamptz, cost numeric)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
BEGIN
  IF p_granularity NOT IN ('day', 'month') THEN
    RAISE EXCEPTION 'invalid granularity: %', p_granularity;
  END IF;
  IF p_buckets IS NULL OR p_buckets < 1 THEN
    RAISE EXCEPTION 'invalid buckets: %', p_buckets;
  END IF;

  RETURN QUERY
  SELECT
    date_trunc(p_granularity, created_at) AS bucket,
    COALESCE(SUM(cost_total), 0)          AS cost
  FROM public.ai_usage_logs
  WHERE status = 'success'
    AND created_at >= date_trunc(p_granularity, now())
                      - (((p_buckets - 1)::text) || ' ' || p_granularity)::interval
  GROUP BY 1
  ORDER BY 1;
END;
$$;

-- Per-user spending: total USD cost and last AI action timestamp.
CREATE OR REPLACE FUNCTION public.admin_user_spending()
RETURNS TABLE (user_id uuid, total_usd numeric, last_action timestamptz)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    user_id,
    COALESCE(SUM(cost_total), 0) AS total_usd,
    MAX(created_at)              AS last_action
  FROM public.ai_usage_logs
  WHERE user_id IS NOT NULL
  GROUP BY user_id;
$$;

-- Lock down: only service_role (used by the admin edge functions) may execute.
-- Supabase grants EXECUTE to anon/authenticated via default privileges, so they
-- must be revoked explicitly — REVOKE FROM PUBLIC alone is not enough.
REVOKE EXECUTE ON FUNCTION public.admin_cost_summary()             FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_cost_series(text, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_user_spending()            FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_cost_summary()             TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_cost_series(text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_user_spending()            TO service_role;
