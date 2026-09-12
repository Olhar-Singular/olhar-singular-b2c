-- =============================================================================
-- pgTAP: no signup bonus anymore, and access_kind comes from the invite.
-- Exercises the handle_new_user() trigger + the profiles column defaults:
-- credit_balance DEFAULT 0 (the 50-credit bonus ended with the public signup),
-- plan_credits DEFAULT 0, access_kind DEFAULT 'subscriber' unless the auth
-- user's metadata says trial/exempt (set by the admin invite).
-- =============================================================================
BEGIN;
SELECT plan(5);

INSERT INTO auth.users (id, email) VALUES
  ('33333333-3333-3333-3333-333333333333', 'newbie@test.com');

SELECT is(
  (SELECT credit_balance FROM public.profiles
     WHERE id = '33333333-3333-3333-3333-333333333333'),
  0,
  'new users receive no extra credits on signup');
SELECT is(
  (SELECT plan_credits FROM public.profiles
     WHERE id = '33333333-3333-3333-3333-333333333333'),
  0,
  'new users receive no plan credits on signup');
SELECT is(
  (SELECT access_kind FROM public.profiles
     WHERE id = '33333333-3333-3333-3333-333333333333'),
  'subscriber',
  'a plain signup is a subscriber (paid checkout path)');
SELECT is(
  (SELECT full_name FROM public.profiles
     WHERE id = '33333333-3333-3333-3333-333333333333'),
  'newbie',
  'profile full_name defaults to the email local-part');

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('34444444-4444-4444-4444-444444444444', 'invited@test.com',
   '{"full_name":"Convidada","access_kind":"trial"}'::jsonb);
SELECT results_eq(
  $$ SELECT full_name, access_kind FROM public.profiles
      WHERE id = '34444444-4444-4444-4444-444444444444' $$,
  $$ VALUES ('Convidada'::text, 'trial'::text) $$,
  'an admin invite creates a trial profile with the invited name');

SELECT * FROM finish();
ROLLBACK;
