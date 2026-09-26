-- =============================================================================
-- chat_sessions: only the `chat` edge function writes rows.
--
-- 20260420000002 gave the owner INSERT and UPDATE policies and 20260622000000
-- granted both to authenticated. Through PostgREST a user could therefore:
--   * INSERT a session directly, skipping the 3-credit charge the chat function
--     takes when it opens one;
--   * UPDATE `messages` (e.g. back to []), resetting the per-session exchange
--     limit, which the function now counts from the persisted transcript.
--
-- The app never writes this table from the client: useChatSessions only
-- SELECTs, and the chat function inserts/updates with the service_role client
-- (which bypasses RLS and keeps its own grants). So both write paths are
-- closed at the policy AND grant layers, the grant revoke naming anon and
-- authenticated explicitly because legacy databases still carry the old broad
-- defaults (same pattern as credit_transactions in 20260722000002).
--
-- Kept: owner SELECT (history list) and owner DELETE. Deleting frees a slot
-- under the session cap, but opening the next session is charged again.
-- =============================================================================

DROP POLICY IF EXISTS "Users can insert their own chat_sessions" ON public.chat_sessions;
DROP POLICY IF EXISTS "Users can update their own chat_sessions" ON public.chat_sessions;

REVOKE INSERT, UPDATE, TRUNCATE, REFERENCES, TRIGGER
  ON public.chat_sessions FROM anon, authenticated;
