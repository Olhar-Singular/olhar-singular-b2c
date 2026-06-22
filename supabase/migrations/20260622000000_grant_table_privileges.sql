-- =============================================================================
-- Grant table-level privileges to authenticated and anon roles.
--
-- RLS policies control WHICH rows a role can access; table-level GRANTs control
-- WHETHER the role can attempt access at all. PostgreSQL requires both — without
-- a GRANT, the engine raises "permission denied for table" before RLS evaluates.
--
-- Each table is granted only the operations its RLS policies permit:
--   - Full CRUD tables (owner can read/write their own rows)
--   - INSERT-only ledger: credit_transactions allows INSERT but no UPDATE/DELETE
--   - Read-only for authenticated: credit_purchases, ai_usage_logs
--   - Read-only for both anon and authenticated: ai_model_pricing
-- =============================================================================

GRANT USAGE ON SCHEMA public TO authenticated, anon;

-- Owner CRUD
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles           TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.barrier_profiles   TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.adaptations        TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_sessions      TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.question_bank      TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pdf_uploads        TO authenticated;

-- Ledger: immutable rows — no UPDATE or DELETE policy, so no GRANT needed for those
GRANT SELECT, INSERT ON public.credit_transactions TO authenticated;

-- Read-only for authenticated owners (service_role handles inserts)
GRANT SELECT ON public.credit_purchases TO authenticated;
GRANT SELECT ON public.ai_usage_logs    TO authenticated;

-- Public read: pricing data is not sensitive
GRANT SELECT ON public.ai_model_pricing TO anon, authenticated;
