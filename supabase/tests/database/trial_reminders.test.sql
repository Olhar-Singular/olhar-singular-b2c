-- =============================================================================
-- pgTAP: 48 h reminder of a card trial's first charge
-- -----------------------------------------------------------------------------
-- claim_trial_reminders(window) marks and returns, in one UPDATE ... RETURNING,
-- the live trials ending inside the window that were not confirmed, cancelled
-- nor reminded yet; a second call returns nothing (idempotent). A failed send
-- calls release_trial_reminder(id) so the next hour claims the row again. Only
-- service_role may execute either. invoke_send_trial_reminders() (what pg_cron
-- runs) never errors without Vault secrets or pg_net.
-- =============================================================================
BEGIN;
SELECT plan(29);

-- ── Fixtures (as the migration owner) ───────────────────────────────────────
INSERT INTO auth.users (id, email) VALUES
  ('e1111111-1111-1111-1111-111111111111', 'due@test.com'),
  ('e2222222-2222-2222-2222-222222222222', 'far@test.com'),
  ('e3333333-3333-3333-3333-333333333333', 'confirmed@test.com'),
  ('e4444444-4444-4444-4444-444444444444', 'cancel-requested@test.com'),
  ('e5555555-5555-5555-5555-555555555555', 'cancelled@test.com'),
  ('e6666666-6666-6666-6666-666666666666', 'ended@test.com'),
  ('e7777777-7777-7777-7777-777777777777', 'paid@test.com'),
  ('e8888888-8888-8888-8888-888888888888', 'pending@test.com'),
  ('e9999999-9999-9999-9999-999999999999', 'paused@test.com');

-- The account e-mail (auth.users) is the official channel (Termos 16.1); the
-- card's payer_email may differ (admin-change-email never touches it).
UPDATE auth.users SET email = 'conta-due@test.com' WHERE id = 'e1111111-1111-1111-1111-111111111111';

UPDATE public.profiles SET full_name = 'Ana Lembrete' WHERE id = 'e1111111-1111-1111-1111-111111111111';
UPDATE public.profiles SET full_name = 'Pausado Teste' WHERE id = 'e9999999-9999-9999-9999-999999999999';

-- The eligible one: live trial ending in 30 h, first charge ahead.
INSERT INTO public.subscriptions (id, user_id, plan_id, status, payer_email, trial_ends_at, first_payment_confirmed)
SELECT 'f0000000-0000-0000-0000-000000000001', 'e1111111-1111-1111-1111-111111111111', id, 'authorized',
       'due@test.com', now() + interval '30 hours', false
  FROM public.plans WHERE slug = 'basico';
-- Outside the window (5 days).
INSERT INTO public.subscriptions (id, user_id, plan_id, status, payer_email, trial_ends_at, first_payment_confirmed)
SELECT 'f0000000-0000-0000-0000-000000000002', 'e2222222-2222-2222-2222-222222222222', id, 'authorized',
       'far@test.com', now() + interval '5 days', false
  FROM public.plans WHERE slug = 'basico';
-- Already charged (converted).
INSERT INTO public.subscriptions (id, user_id, plan_id, status, payer_email, trial_ends_at, first_payment_confirmed)
SELECT 'f0000000-0000-0000-0000-000000000003', 'e3333333-3333-3333-3333-333333333333', id, 'authorized',
       'confirmed@test.com', now() + interval '30 hours', true
  FROM public.plans WHERE slug = 'basico';
-- Cancellation requested.
INSERT INTO public.subscriptions (id, user_id, plan_id, status, payer_email, trial_ends_at, first_payment_confirmed, cancel_requested_at)
SELECT 'f0000000-0000-0000-0000-000000000004', 'e4444444-4444-4444-4444-444444444444', id, 'authorized',
       'cancel-requested@test.com', now() + interval '30 hours', false, now()
  FROM public.plans WHERE slug = 'basico';
-- Cancelled.
INSERT INTO public.subscriptions (id, user_id, plan_id, status, payer_email, trial_ends_at, first_payment_confirmed, cancelled_at)
SELECT 'f0000000-0000-0000-0000-000000000005', 'e5555555-5555-5555-5555-555555555555', id, 'cancelled',
       'cancelled@test.com', now() + interval '30 hours', false, now()
  FROM public.plans WHERE slug = 'basico';
-- Trial already over (charge day passed, webhook still to come).
INSERT INTO public.subscriptions (id, user_id, plan_id, status, payer_email, trial_ends_at, first_payment_confirmed)
SELECT 'f0000000-0000-0000-0000-000000000006', 'e6666666-6666-6666-6666-666666666666', id, 'authorized',
       'ended@test.com', now() - interval '1 hour', false
  FROM public.plans WHERE slug = 'basico';
-- Paid from day one: no trial.
INSERT INTO public.subscriptions (id, user_id, plan_id, status, payer_email, first_payment_confirmed)
SELECT 'f0000000-0000-0000-0000-000000000007', 'e7777777-7777-7777-7777-777777777777', id, 'authorized',
       'paid@test.com', false
  FROM public.plans WHERE slug = 'basico';
-- Trial attempt still pending at MP (not live).
INSERT INTO public.subscriptions (id, user_id, plan_id, status, payer_email, trial_ends_at, first_payment_confirmed)
SELECT 'f0000000-0000-0000-0000-000000000008', 'e8888888-8888-8888-8888-888888888888', id, 'pending',
       'pending@test.com', now() + interval '30 hours', false
  FROM public.plans WHERE slug = 'basico';
-- Paused at MP but still a live trial inside the window: reminded (defensive choice).
INSERT INTO public.subscriptions (id, user_id, plan_id, status, payer_email, trial_ends_at, first_payment_confirmed)
SELECT 'f0000000-0000-0000-0000-000000000009', 'e9999999-9999-9999-9999-999999999999', id, 'paused',
       'paused@test.com', now() + interval '40 hours', false
  FROM public.plans WHERE slug = 'basico';

-- ── Schema ──────────────────────────────────────────────────────────────────
SELECT has_column('public', 'subscriptions', 'trial_reminder_sent_at', 'subscriptions.trial_reminder_sent_at exists');
SELECT has_index('public', 'subscriptions', 'subscriptions_trial_reminder_due_idx', 'partial index for the hourly scan exists');

-- ── Privileges: only service_role executes the RPCs ─────────────────────────
SELECT ok(NOT has_function_privilege('anon', 'public.claim_trial_reminders(interval)', 'EXECUTE'),
          'anon cannot EXECUTE claim_trial_reminders');
SELECT ok(NOT has_function_privilege('authenticated', 'public.claim_trial_reminders(interval)', 'EXECUTE'),
          'authenticated cannot EXECUTE claim_trial_reminders');
SELECT ok(has_function_privilege('service_role', 'public.claim_trial_reminders(interval)', 'EXECUTE'),
          'service_role can EXECUTE claim_trial_reminders');
SELECT ok(NOT has_function_privilege('anon', 'public.release_trial_reminder(uuid)', 'EXECUTE'),
          'anon cannot EXECUTE release_trial_reminder');
SELECT ok(NOT has_function_privilege('authenticated', 'public.release_trial_reminder(uuid)', 'EXECUTE'),
          'authenticated cannot EXECUTE release_trial_reminder');
SELECT ok(has_function_privilege('service_role', 'public.release_trial_reminder(uuid)', 'EXECUTE'),
          'service_role can EXECUTE release_trial_reminder');
SELECT ok(NOT has_function_privilege('anon', 'public.invoke_send_trial_reminders()', 'EXECUTE'),
          'anon cannot EXECUTE invoke_send_trial_reminders');
SELECT ok(NOT has_function_privilege('authenticated', 'public.invoke_send_trial_reminders()', 'EXECUTE'),
          'authenticated cannot EXECUTE invoke_send_trial_reminders');

-- ── The cron entry point never errors without secrets (as its owner) ────────
SELECT lives_ok(
  $$ SELECT public.invoke_send_trial_reminders() $$,
  'invoke_send_trial_reminders() without Vault secrets returns quietly');

-- ── Claims, as the edge function (service_role) ─────────────────────────────
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SET LOCAL role service_role;

-- A narrow window finds nothing (the due trial ends in 30 h) and marks nothing.
SELECT is((SELECT count(*)::int FROM public.claim_trial_reminders(interval '1 hour')), 0,
          'claim with a 1 h window: nothing due, nothing marked');
SELECT is((SELECT count(*)::int FROM public.subscriptions WHERE trial_reminder_sent_at IS NOT NULL), 0,
          'claim with a 1 h window: no row marked');

CREATE TEMP TABLE first_claim AS SELECT * FROM public.claim_trial_reminders();

SELECT results_eq(
  $$ SELECT subscription_id, user_id, payer_email, full_name,
            trial_ends_at = (SELECT s.trial_ends_at FROM public.subscriptions s WHERE s.id = first_claim.subscription_id),
            plan_name, price_brl, monthly_credits
       FROM first_claim ORDER BY trial_ends_at $$,
  $$ SELECT 'f0000000-0000-0000-0000-000000000001'::uuid, 'e1111111-1111-1111-1111-111111111111'::uuid,
            'conta-due@test.com'::text, 'Ana Lembrete'::text, true, p.name, p.price_brl, p.monthly_credits
       FROM public.plans p WHERE p.slug = 'basico'
     UNION ALL
     SELECT 'f0000000-0000-0000-0000-000000000009'::uuid, 'e9999999-9999-9999-9999-999999999999'::uuid,
            'paused@test.com'::text, 'Pausado Teste'::text, true, p.name, p.price_brl, p.monthly_credits
       FROM public.plans p WHERE p.slug = 'basico' $$,
  'claim (48 h default): the due authorized trial and the paused one, with plan and profile fields, ordered by charge date');
SELECT is(
  (SELECT payer_email FROM first_claim WHERE subscription_id = 'f0000000-0000-0000-0000-000000000001'),
  'conta-due@test.com', 'claim: the e-mail is the account''s (auth.users), not the card''s payer_email');
SELECT is(
  (SELECT trial_reminder_sent_at IS NOT NULL FROM public.subscriptions WHERE id = 'f0000000-0000-0000-0000-000000000001'),
  true, 'claim: the due row is marked in the same statement');
SELECT is(
  (SELECT trial_reminder_sent_at IS NOT NULL FROM public.subscriptions WHERE id = 'f0000000-0000-0000-0000-000000000009'),
  true, 'claim: a paused trial inside the window is reminded too');
SELECT is(
  (SELECT count(*)::int FROM public.subscriptions
     WHERE trial_reminder_sent_at IS NOT NULL
       AND id NOT IN ('f0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000009')),
  0, 'claim: no other row was marked');

-- Each exclusion, named.
SELECT is((SELECT trial_reminder_sent_at FROM public.subscriptions WHERE id = 'f0000000-0000-0000-0000-000000000002'), NULL,
          'outside the window (5 days): not claimed');
SELECT is((SELECT trial_reminder_sent_at FROM public.subscriptions WHERE id = 'f0000000-0000-0000-0000-000000000003'), NULL,
          'first payment confirmed: not claimed');
SELECT is((SELECT trial_reminder_sent_at FROM public.subscriptions WHERE id = 'f0000000-0000-0000-0000-000000000004'), NULL,
          'cancellation requested: not claimed');
SELECT is((SELECT trial_reminder_sent_at FROM public.subscriptions WHERE id = 'f0000000-0000-0000-0000-000000000005'), NULL,
          'cancelled: not claimed');
SELECT is((SELECT trial_reminder_sent_at FROM public.subscriptions WHERE id = 'f0000000-0000-0000-0000-000000000006'), NULL,
          'trial already over: not claimed');
SELECT is((SELECT trial_reminder_sent_at FROM public.subscriptions WHERE id = 'f0000000-0000-0000-0000-000000000008'), NULL,
          'pending at MP (not live): not claimed');

-- Idempotent: the second run finds nothing.
SELECT is((SELECT count(*)::int FROM public.claim_trial_reminders()), 0,
          'second claim: nothing (the row is marked)');

-- ── Release: the send failed, the next hour tries again ─────────────────────
SELECT is(public.release_trial_reminder('f0000000-0000-0000-0000-000000000001'::uuid), true,
          'release: re-arms the claimed row');
SELECT is((SELECT trial_reminder_sent_at FROM public.subscriptions WHERE id = 'f0000000-0000-0000-0000-000000000001'), NULL,
          'release: trial_reminder_sent_at is NULL again');
SELECT is(public.release_trial_reminder('f0000000-0000-0000-0000-000000000002'::uuid), false,
          'release: a row that was never claimed answers false');
SELECT results_eq(
  $$ SELECT subscription_id FROM public.claim_trial_reminders() $$,
  $$ VALUES ('f0000000-0000-0000-0000-000000000001'::uuid) $$,
  'claim after release: the row is handed out again');

SELECT * FROM finish();
ROLLBACK;
