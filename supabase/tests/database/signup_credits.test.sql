-- =============================================================================
-- pgTAP: signup bonus — every new user starts with 50 free credits.
-- Exercises the handle_new_user() trigger + the profiles column defaults
-- (credit_balance DEFAULT 50, free_*_used DEFAULT false).
-- =============================================================================
BEGIN;
SELECT plan(4);

-- Inserting into auth.users fires handle_new_user(), which auto-creates the
-- public.profiles row with the column defaults.
INSERT INTO auth.users (id, email) VALUES
  ('33333333-3333-3333-3333-333333333333', 'newbie@test.com');

SELECT is(
  (SELECT credit_balance FROM public.profiles
     WHERE id = '33333333-3333-3333-3333-333333333333'),
  50,
  'new users receive 50 free credits on signup');
SELECT is(
  (SELECT free_adaptation_used FROM public.profiles
     WHERE id = '33333333-3333-3333-3333-333333333333'),
  false,
  'new users have not used their free adaptation');
SELECT is(
  (SELECT free_extraction_used FROM public.profiles
     WHERE id = '33333333-3333-3333-3333-333333333333'),
  false,
  'new users have not used their free extraction');
SELECT is(
  (SELECT full_name FROM public.profiles
     WHERE id = '33333333-3333-3333-3333-333333333333'),
  'newbie',
  'profile full_name defaults to the email local-part');

SELECT * FROM finish();
ROLLBACK;
