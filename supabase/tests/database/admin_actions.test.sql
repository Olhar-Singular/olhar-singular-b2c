-- =============================================================================
-- pgTAP: admin_actions (audit trail of super-admin actions)
-- -----------------------------------------------------------------------------
-- Only service_role reads or writes; the RPC validates the action name.
-- =============================================================================
BEGIN;
SELECT plan(9);

INSERT INTO auth.users (id, email) VALUES
  ('a1111111-1111-1111-1111-111111111111', 'admin@test.com'),
  ('a2222222-2222-2222-2222-222222222222', 'target@test.com');

SELECT has_table('public', 'admin_actions', 'admin_actions exists');
SELECT col_not_null('public', 'admin_actions', 'actor_id', 'actor is required');
SELECT has_index('public', 'admin_actions', 'admin_actions_target_idx', 'index by target and time');

-- ── nobody but service_role ─────────────────────────────────────────────────
SELECT set_config('request.jwt.claims',
  '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
SET LOCAL role authenticated;
SELECT throws_ok(
  $$ SELECT count(*) FROM public.admin_actions $$,
  '42501', NULL, 'authenticated cannot read admin_actions');
SELECT throws_ok(
  $$ SELECT public.log_admin_action('a1111111-1111-1111-1111-111111111111', NULL, 'x', '{}') $$,
  '42501', NULL, 'authenticated cannot call log_admin_action');
RESET role;

SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
SET LOCAL role anon;
SELECT throws_ok(
  $$ INSERT INTO public.admin_actions (actor_id, action) VALUES ('a1111111-1111-1111-1111-111111111111', 'x') $$,
  '42501', NULL, 'anon cannot insert admin_actions');
RESET role;

-- ── the RPC ─────────────────────────────────────────────────────────────────
SELECT ok(
  public.log_admin_action(
    'a1111111-1111-1111-1111-111111111111', 'a2222222-2222-2222-2222-222222222222',
    'grant_credits', '{"amount": 30}'::jsonb) IS NOT NULL,
  'log_admin_action returns the new id');
SELECT results_eq(
  $$ SELECT actor_id, target_user_id, action, payload FROM public.admin_actions $$,
  $$ VALUES ('a1111111-1111-1111-1111-111111111111'::uuid, 'a2222222-2222-2222-2222-222222222222'::uuid,
             'grant_credits'::text, '{"amount": 30}'::jsonb) $$,
  'the row carries actor, target, action and payload');
SELECT throws_ok(
  $$ SELECT public.log_admin_action('a1111111-1111-1111-1111-111111111111', NULL, '  ', NULL) $$,
  'P0001', 'admin action is required', 'an empty action is refused');

SELECT * FROM finish();
ROLLBACK;
