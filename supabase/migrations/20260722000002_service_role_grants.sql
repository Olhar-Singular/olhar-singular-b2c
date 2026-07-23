-- =============================================================================
-- Complete the explicit grant model started by 20260622000000_grant_table_privileges.
--
-- Databases provisioned by current Supabase images ship WITHOUT the legacy broad
-- default privileges for the API roles, so every privilege must be granted by
-- migration. 20260622000000 covered anon/authenticated but missed service_role:
-- on a fresh database (CI's `supabase db start`) service_role could not even
-- SELECT from public tables, breaking the edge functions' access model and the
-- pgTAP suite ("permission denied for table adaptations").
--
-- service_role bypasses RLS by design and must have full table access — parity
-- with the hosted-project default. Idempotent on legacy databases (local/prod)
-- that still carry the old defaults.
-- =============================================================================

GRANT USAGE ON SCHEMA public TO service_role;
GRANT ALL ON ALL TABLES    IN SCHEMA public TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- Future tables/sequences created by migrations keep the same access.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO service_role;

-- =============================================================================
-- Ledger immutability, now deterministic across environments.
-- 20260622000000 deliberately granted only SELECT+INSERT on credit_transactions
-- to authenticated, but legacy databases still carry UPDATE/DELETE from the old
-- defaults. Revoke them so every environment enforces immutability at the grant
-- level (RLS has no UPDATE/DELETE policy either — defense in depth).
-- =============================================================================

REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.credit_transactions FROM anon, authenticated;
