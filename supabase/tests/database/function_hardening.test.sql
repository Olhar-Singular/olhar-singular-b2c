-- =============================================================================
-- pgTAP: function-level hardening flagged by the Supabase security advisor
-- -----------------------------------------------------------------------------
-- Two lint families, both about functions rather than tables:
--
--   1. *_security_definer_function_executable — the three SECURITY DEFINER
--      TRIGGER functions (handle_new_user, prevent_credit_self_mutation,
--      prevent_super_admin_self_escalation) still carried the default EXECUTE
--      grant to anon + authenticated. PostgREST does not expose functions
--      returning `trigger`, so nothing could actually be called, but the grant
--      is pure surface with zero legitimate user: revoke it.
--
--   2. function_search_path_mutable — handle_updated_at and get_user_school_id
--      ran with a caller-controlled search_path. Neither is SECURITY DEFINER,
--      so this is not an escalation path today, but a resolution that depends
--      on the caller is a trap waiting for the day one of them becomes DEFINER.
--
-- The point of the tests below is the OTHER half: proving the revoke does not
-- break anything. PostgreSQL checks EXECUTE on a trigger function when the
-- TRIGGER is created, not when it fires, so a role with no EXECUTE must still
-- see the guards fire on its own writes. If that assumption were wrong, signup
-- (handle_new_user) and both money guards would silently stop running.
-- =============================================================================
BEGIN;
SELECT plan(11);

-- ── Fixture (superuser: empty JWT claims ⇒ guard triggers allow the write) ────
INSERT INTO auth.users (id, email) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a@test.com');

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. The SECURITY DEFINER trigger functions are not executable by API roles
-- ═══════════════════════════════════════════════════════════════════════════
SELECT ok(
  NOT has_function_privilege('anon', 'public.handle_new_user()', 'EXECUTE'),
  'anon cannot EXECUTE handle_new_user()');
SELECT ok(
  NOT has_function_privilege('authenticated', 'public.handle_new_user()', 'EXECUTE'),
  'authenticated cannot EXECUTE handle_new_user()');

SELECT ok(
  NOT has_function_privilege('anon', 'public.prevent_credit_self_mutation()', 'EXECUTE'),
  'anon cannot EXECUTE prevent_credit_self_mutation()');
SELECT ok(
  NOT has_function_privilege('authenticated', 'public.prevent_credit_self_mutation()', 'EXECUTE'),
  'authenticated cannot EXECUTE prevent_credit_self_mutation()');

SELECT ok(
  NOT has_function_privilege('anon', 'public.prevent_super_admin_self_escalation()', 'EXECUTE'),
  'anon cannot EXECUTE prevent_super_admin_self_escalation()');
SELECT ok(
  NOT has_function_privilege('authenticated', 'public.prevent_super_admin_self_escalation()', 'EXECUTE'),
  'authenticated cannot EXECUTE prevent_super_admin_self_escalation()');

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. search_path is pinned on the two functions that lacked it
-- ═══════════════════════════════════════════════════════════════════════════
SELECT ok(
  (SELECT proconfig FROM pg_proc p
     JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'handle_updated_at')
    @> ARRAY['search_path=public'],
  'handle_updated_at has a pinned search_path');

SELECT ok(
  (SELECT proconfig FROM pg_proc p
     JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'get_user_school_id')
    @> ARRAY['search_path=public'],
  'get_user_school_id has a pinned search_path');

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. The triggers still fire for a role that holds no EXECUTE on them
-- ═══════════════════════════════════════════════════════════════════════════
-- handle_new_user: the fixture INSERT above must still have produced a profile.
SELECT is(
  (SELECT count(*)::int FROM public.profiles
     WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  1,
  'handle_new_user still auto-creates the profile on signup');

-- The two assertions below are the load-bearing ones: `authenticated` provably
-- holds no EXECUTE (tests 4 and 6 above) and its writes still hit both guards,
-- which is the general proof that trigger firing ignores the function ACL.
-- Signup is not asserted under supabase_auth_admin because the test runner
-- (role postgres) is not a member of it and cannot SET ROLE to it.
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}',
  true);
SET LOCAL role authenticated;

SELECT throws_ok(
  $$ UPDATE public.profiles SET credit_balance = 999999
       WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$,
  'not authorized to change credit fields',
  'prevent_credit_self_mutation still fires for a role without EXECUTE');

SELECT throws_ok(
  $$ UPDATE public.profiles SET is_super_admin = true
       WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$,
  'not authorized to change is_super_admin',
  'prevent_super_admin_self_escalation still fires for a role without EXECUTE');

RESET role;

SELECT * FROM finish();
ROLLBACK;
