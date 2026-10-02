-- =============================================================================
-- pgTAP: cross-user isolation on the owner-scoped tables that had no RLS test
--
--   Owner CRUD (policies for SELECT/INSERT/UPDATE/DELETE, authenticated only):
--     barrier_profiles                  (user_id = auth.uid())
--     question_bank                     (created_by = auth.uid(), FOR ALL)
--     pdf_uploads                       (user_id = auth.uid(),    FOR ALL)
--   Owner read + delete only; writes belong to the `chat` edge function
--   (service_role), which charges 3 credits per new session and trusts the
--   stored `messages` for its exchange limit (20260926000002):
--     chat_sessions                     (user_id = auth.uid())
--   Read-only for the owner (SELECT policy only; 20260622000000 grants
--   authenticated SELECT only, writes are service_role's job):
--     ai_usage_logs, credit_purchases
--
-- The contract proven here: the owner reads their own rows; another
-- authenticated user can neither read, update, delete, nor forge a row in the
-- owner's name; anon reads nothing; and on the read-only tables not even the
-- owner can write (chat_sessions: only delete). None of these tables has a super-admin policy, so there is
-- no cross-tenant read path to assert.
-- =============================================================================
BEGIN;
SELECT plan(54);

-- ── Environment-agnostic helpers ─────────────────────────────────────────────
-- WHICH layer says no depends on how the database was provisioned. On a
-- database created by a current Supabase image (CI's `supabase db start`) anon
-- holds no grant on these tables and authenticated holds only what
-- 20260622000000 grants, so a forbidden statement raises 42501 before RLS is
-- consulted. On a legacy database (local, prod) both roles still carry the old
-- broad default grants, and RLS filters every row instead (0 rows, no error).
-- Asserting either mechanism alone would pass in one environment and fail in
-- the other, so these helpers report the OUTCOME: rows actually reached.
-- SECURITY INVOKER (the default): they run as the caller's role, under RLS.

-- Rows of `tbl` the current role can read (0 when it cannot read at all).
CREATE FUNCTION pg_temp.visible_rows(tbl regclass) RETURNS int
LANGUAGE plpgsql AS $fn$
DECLARE n int;
BEGIN
  EXECUTE format('SELECT count(*) FROM %s', tbl) INTO n;
  RETURN n;
EXCEPTION WHEN insufficient_privilege THEN
  RETURN 0;
END
$fn$;

-- Rows an UPDATE/DELETE actually touched (0 when the grant layer refused it).
CREATE FUNCTION pg_temp.rows_written(stmt text) RETURNS int
LANGUAGE plpgsql AS $fn$
DECLARE n int;
BEGIN
  EXECUTE stmt;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
EXCEPTION WHEN insufficient_privilege THEN
  RETURN 0;
END
$fn$;

-- ── Fixtures (created as postgres, the table owner, so RLS does not apply) ───
-- A = owner of the rows under attack; B = another authenticated user.
INSERT INTO auth.users (id, email) VALUES
  ('a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1', 'owner-a@test.com'),
  ('b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2', 'other-b@test.com');

INSERT INTO public.barrier_profiles (id, user_id, name, barriers) VALUES
  ('a0000000-0000-4000-8000-000000000001', 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1', 'Perfil da A', ARRAY['tea']),
  ('b0000000-0000-4000-8000-000000000001', 'b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2', 'Perfil da B', ARRAY['tdah']);

INSERT INTO public.chat_sessions (id, user_id, title) VALUES
  ('a0000000-0000-4000-8000-000000000002', 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1', 'Conversa da A'),
  ('a0000000-0000-4000-8000-000000000012', 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1', 'Conversa velha da A'),
  ('b0000000-0000-4000-8000-000000000002', 'b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2', 'Conversa da B');

-- A's question is flagged is_public on purpose: no policy honours that flag,
-- so it must stay exactly as private as any other row.
INSERT INTO public.question_bank (id, created_by, text, subject, is_public) VALUES
  ('a0000000-0000-4000-8000-000000000003', 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1', 'Questão da A', 'Matemática', true),
  ('b0000000-0000-4000-8000-000000000003', 'b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2', 'Questão da B', 'Geografia', false);

INSERT INTO public.pdf_uploads (id, user_id, file_name, file_path) VALUES
  ('a0000000-0000-4000-8000-000000000004', 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1', 'prova-a.pdf', 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1/prova-a.pdf'),
  ('b0000000-0000-4000-8000-000000000004', 'b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2', 'prova-b.pdf', 'b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2/prova-b.pdf');

INSERT INTO public.ai_usage_logs (id, user_id, action_type, model, cost_total) VALUES
  ('a0000000-0000-4000-8000-000000000005', 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1', 'adaptation', 'model-x', 0.0123),
  ('b0000000-0000-4000-8000-000000000005', 'b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2', 'chat', 'model-x', 0.0456);

INSERT INTO public.credit_purchases (id, user_id, amount_brl, credits_granted, status) VALUES
  ('a0000000-0000-4000-8000-000000000006', 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1', 39.90, 300, 'pending'),
  ('b0000000-0000-4000-8000-000000000006', 'b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2', 59.90, 480, 'approved');

SELECT is(
  (SELECT array_agg(relname::text ORDER BY relname) FROM pg_class
     WHERE relnamespace = 'public'::regnamespace AND relrowsecurity
       AND relname IN ('barrier_profiles', 'chat_sessions', 'question_bank',
                       'pdf_uploads', 'ai_usage_logs', 'credit_purchases')),
  ARRAY['ai_usage_logs', 'barrier_profiles', 'chat_sessions',
        'credit_purchases', 'pdf_uploads', 'question_bank'],
  'RLS is enabled on all six owner-scoped tables');

-- ═══════════════════════════════════════════════════════════════════════════
-- Owner A reads exactly their own rows (and none of B's)
-- ═══════════════════════════════════════════════════════════════════════════
SELECT set_config('request.jwt.claims',
  '{"sub":"a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1","role":"authenticated"}', true);
SET LOCAL role authenticated;

SELECT is((SELECT array_agg(id) FROM public.barrier_profiles),
  ARRAY['a0000000-0000-4000-8000-000000000001'::uuid],
  'barrier_profiles: owner sees exactly their own row');
SELECT is((SELECT array_agg(id ORDER BY id) FROM public.chat_sessions),
  ARRAY['a0000000-0000-4000-8000-000000000002'::uuid,
        'a0000000-0000-4000-8000-000000000012'::uuid],
  'chat_sessions: owner sees exactly their own rows');
SELECT is((SELECT array_agg(id) FROM public.question_bank),
  ARRAY['a0000000-0000-4000-8000-000000000003'::uuid],
  'question_bank: owner sees exactly their own row');
SELECT is((SELECT array_agg(id) FROM public.pdf_uploads),
  ARRAY['a0000000-0000-4000-8000-000000000004'::uuid],
  'pdf_uploads: owner sees exactly their own row');
SELECT is((SELECT array_agg(id) FROM public.ai_usage_logs),
  ARRAY['a0000000-0000-4000-8000-000000000005'::uuid],
  'ai_usage_logs: owner sees exactly their own row');
SELECT is((SELECT array_agg(id) FROM public.credit_purchases),
  ARRAY['a0000000-0000-4000-8000-000000000006'::uuid],
  'credit_purchases: owner sees exactly their own row');

-- ── Read-only tables: not even the owner may write ───────────────────────────
-- A forged usage log would skew the admin cost dashboards; a self-approved or
-- inflated purchase row would lie about money. Only service_role writes them.
SELECT is(pg_temp.rows_written($$
  UPDATE public.ai_usage_logs SET cost_total = 0
   WHERE id = 'a0000000-0000-4000-8000-000000000005' $$), 0,
  'ai_usage_logs: owner cannot rewrite their own usage log');
SELECT is(pg_temp.rows_written($$
  DELETE FROM public.ai_usage_logs
   WHERE id = 'a0000000-0000-4000-8000-000000000005' $$), 0,
  'ai_usage_logs: owner cannot delete their own usage log');
SELECT throws_ok(
  $$ INSERT INTO public.ai_usage_logs (user_id, action_type, model)
     VALUES ('a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1', 'adaptation', 'forged') $$,
  '42501', NULL,
  'ai_usage_logs: owner cannot insert a usage log, not even their own');
SELECT is(pg_temp.rows_written($$
  UPDATE public.credit_purchases SET status = 'approved', credits_granted = 99999
   WHERE id = 'a0000000-0000-4000-8000-000000000006' $$), 0,
  'credit_purchases: owner cannot approve or inflate their own purchase');
SELECT is(pg_temp.rows_written($$
  DELETE FROM public.credit_purchases
   WHERE id = 'a0000000-0000-4000-8000-000000000006' $$), 0,
  'credit_purchases: owner cannot delete their own purchase record');

-- ── chat_sessions: the owner reads and deletes, never writes ─────────────────
-- A direct INSERT would open a session without the chat function's 3-credit
-- charge; a direct UPDATE could reset `messages`, which the function trusts
-- to count exchanges. No grant exists for either since 20260926000002, so
-- both fail at the grant layer in every environment.
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.chat_sessions', 'INSERT')
  AND NOT has_table_privilege('authenticated', 'public.chat_sessions', 'UPDATE')
  AND NOT has_table_privilege('authenticated', 'public.chat_sessions', 'TRUNCATE')
  AND NOT has_table_privilege('anon', 'public.chat_sessions', 'INSERT')
  AND NOT has_table_privilege('anon', 'public.chat_sessions', 'UPDATE')
  AND NOT has_table_privilege('anon', 'public.chat_sessions', 'TRUNCATE'),
  'chat_sessions: anon/authenticated hold no INSERT, UPDATE or TRUNCATE grant');
SELECT throws_ok(
  $$ INSERT INTO public.chat_sessions (user_id, title)
     VALUES ('a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1', 'sessão sem cobrança') $$,
  '42501', NULL,
  'chat_sessions: owner cannot open a session directly (skipping the charge)');
SELECT throws_ok(
  $$ UPDATE public.chat_sessions SET messages = '[]'::jsonb
      WHERE id = 'a0000000-0000-4000-8000-000000000002' $$,
  '42501', NULL,
  'chat_sessions: owner cannot rewrite their own messages (exchange limit)');
WITH d AS (
  DELETE FROM public.chat_sessions
   WHERE id = 'a0000000-0000-4000-8000-000000000012' RETURNING 1)
SELECT is((SELECT count(*)::int FROM d), 1,
  'chat_sessions: owner can still delete their own session');

RESET role;

-- ═══════════════════════════════════════════════════════════════════════════
-- Another authenticated user (B) cannot reach A's rows
-- ═══════════════════════════════════════════════════════════════════════════
SELECT set_config('request.jwt.claims',
  '{"sub":"b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2","role":"authenticated"}', true);
SET LOCAL role authenticated;

-- ── SELECT ───────────────────────────────────────────────────────────────────
SELECT is((SELECT count(*)::int FROM public.barrier_profiles
            WHERE user_id = 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1'), 0,
  'barrier_profiles: B cannot read A''s profiles');
SELECT is((SELECT count(*)::int FROM public.chat_sessions
            WHERE user_id = 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1'), 0,
  'chat_sessions: B cannot read A''s conversations');
SELECT is((SELECT count(*)::int FROM public.question_bank
            WHERE created_by = 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1'), 0,
  'question_bank: B cannot read A''s questions, not even one flagged is_public');
SELECT is((SELECT count(*)::int FROM public.pdf_uploads
            WHERE user_id = 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1'), 0,
  'pdf_uploads: B cannot read A''s upload history');
SELECT is((SELECT count(*)::int FROM public.ai_usage_logs
            WHERE user_id = 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1'), 0,
  'ai_usage_logs: B cannot read A''s usage logs');
SELECT is((SELECT count(*)::int FROM public.credit_purchases
            WHERE user_id = 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1'), 0,
  'credit_purchases: B cannot read A''s purchases');

-- ── UPDATE (owner CRUD tables: granted, RLS filters the target → 0 rows) ─────
-- The data-modifying CTE must sit at the top level of the statement.
WITH u AS (
  UPDATE public.barrier_profiles SET name = 'hacked'
   WHERE id = 'a0000000-0000-4000-8000-000000000001' RETURNING 1)
SELECT is((SELECT count(*)::int FROM u), 0,
  'barrier_profiles: B cannot update A''s profile');
SELECT throws_ok(
  $$ UPDATE public.chat_sessions SET title = 'hacked'
      WHERE id = 'a0000000-0000-4000-8000-000000000002' $$,
  '42501', NULL,
  'chat_sessions: B cannot update A''s conversation');
WITH u AS (
  UPDATE public.question_bank SET text = 'hacked'
   WHERE id = 'a0000000-0000-4000-8000-000000000003' RETURNING 1)
SELECT is((SELECT count(*)::int FROM u), 0,
  'question_bank: B cannot update A''s question');
WITH u AS (
  UPDATE public.pdf_uploads SET file_path = 'b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2/hijack.pdf'
   WHERE id = 'a0000000-0000-4000-8000-000000000004' RETURNING 1)
SELECT is((SELECT count(*)::int FROM u), 0,
  'pdf_uploads: B cannot update A''s upload record');
-- Read-only tables: whichever layer refuses, nothing may be touched.
SELECT is(pg_temp.rows_written($$
  UPDATE public.ai_usage_logs SET cost_total = 999
   WHERE id = 'a0000000-0000-4000-8000-000000000005' $$), 0,
  'ai_usage_logs: B cannot update A''s usage log');
SELECT is(pg_temp.rows_written($$
  UPDATE public.credit_purchases SET status = 'cancelled'
   WHERE id = 'a0000000-0000-4000-8000-000000000006' $$), 0,
  'credit_purchases: B cannot update A''s purchase');

-- ── DELETE ───────────────────────────────────────────────────────────────────
WITH d AS (
  DELETE FROM public.barrier_profiles
   WHERE id = 'a0000000-0000-4000-8000-000000000001' RETURNING 1)
SELECT is((SELECT count(*)::int FROM d), 0,
  'barrier_profiles: B cannot delete A''s profile');
WITH d AS (
  DELETE FROM public.chat_sessions
   WHERE id = 'a0000000-0000-4000-8000-000000000002' RETURNING 1)
SELECT is((SELECT count(*)::int FROM d), 0,
  'chat_sessions: B cannot delete A''s conversation');
WITH d AS (
  DELETE FROM public.question_bank
   WHERE id = 'a0000000-0000-4000-8000-000000000003' RETURNING 1)
SELECT is((SELECT count(*)::int FROM d), 0,
  'question_bank: B cannot delete A''s question');
WITH d AS (
  DELETE FROM public.pdf_uploads
   WHERE id = 'a0000000-0000-4000-8000-000000000004' RETURNING 1)
SELECT is((SELECT count(*)::int FROM d), 0,
  'pdf_uploads: B cannot delete A''s upload record');
SELECT is(pg_temp.rows_written($$
  DELETE FROM public.ai_usage_logs
   WHERE id = 'a0000000-0000-4000-8000-000000000005' $$), 0,
  'ai_usage_logs: B cannot delete A''s usage log');
SELECT is(pg_temp.rows_written($$
  DELETE FROM public.credit_purchases
   WHERE id = 'a0000000-0000-4000-8000-000000000006' $$), 0,
  'credit_purchases: B cannot delete A''s purchase');

-- ── INSERT in A's name (WITH CHECK or missing grant → 42501 either way) ──────
SELECT throws_ok(
  $$ INSERT INTO public.barrier_profiles (user_id, name)
     VALUES ('a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1', 'forged') $$,
  '42501', NULL,
  'barrier_profiles: B cannot create a profile owned by A');
SELECT throws_ok(
  $$ INSERT INTO public.chat_sessions (user_id, title)
     VALUES ('a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1', 'forged') $$,
  '42501', NULL,
  'chat_sessions: B cannot create a conversation owned by A');
SELECT throws_ok(
  $$ INSERT INTO public.question_bank (created_by, text, subject)
     VALUES ('a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1', 'forged', 'Matemática') $$,
  '42501', NULL,
  'question_bank: B cannot create a question owned by A');
SELECT throws_ok(
  $$ INSERT INTO public.pdf_uploads (user_id, file_name, file_path)
     VALUES ('a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1', 'forged.pdf',
             'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1/forged.pdf') $$,
  '42501', NULL,
  'pdf_uploads: B cannot create an upload record owned by A');
SELECT throws_ok(
  $$ INSERT INTO public.ai_usage_logs (user_id, action_type, model)
     VALUES ('a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1', 'adaptation', 'forged') $$,
  '42501', NULL,
  'ai_usage_logs: B cannot create a usage log attributed to A');
SELECT throws_ok(
  $$ INSERT INTO public.credit_purchases (user_id, amount_brl, credits_granted, status)
     VALUES ('a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1', 0.01, 99999, 'approved') $$,
  '42501', NULL,
  'credit_purchases: B cannot create a purchase attributed to A');

RESET role;

-- ═══════════════════════════════════════════════════════════════════════════
-- anon reads nothing (no anon policy on any of the six tables)
-- ═══════════════════════════════════════════════════════════════════════════
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
SET LOCAL role anon;

SELECT is(pg_temp.visible_rows('public.barrier_profiles'), 0,
  'barrier_profiles: anon sees no rows');
SELECT is(pg_temp.visible_rows('public.chat_sessions'), 0,
  'chat_sessions: anon sees no rows');
SELECT is(pg_temp.visible_rows('public.question_bank'), 0,
  'question_bank: anon sees no rows, not even is_public ones');
SELECT is(pg_temp.visible_rows('public.pdf_uploads'), 0,
  'pdf_uploads: anon sees no rows');
SELECT is(pg_temp.visible_rows('public.ai_usage_logs'), 0,
  'ai_usage_logs: anon sees no rows');
SELECT is(pg_temp.visible_rows('public.credit_purchases'), 0,
  'credit_purchases: anon sees no rows');

RESET role;

-- ═══════════════════════════════════════════════════════════════════════════
-- A's rows came through every attempt above untouched (checked as
-- service_role, which bypasses RLS: a deleted row would read back as NULL)
-- ═══════════════════════════════════════════════════════════════════════════
SET LOCAL role service_role;

SELECT is((SELECT name FROM public.barrier_profiles
            WHERE id = 'a0000000-0000-4000-8000-000000000001'),
  'Perfil da A', 'barrier_profiles: A''s row is intact');
SELECT is((SELECT title FROM public.chat_sessions
            WHERE id = 'a0000000-0000-4000-8000-000000000002'),
  'Conversa da A', 'chat_sessions: A''s row is intact');
SELECT is((SELECT text FROM public.question_bank
            WHERE id = 'a0000000-0000-4000-8000-000000000003'),
  'Questão da A', 'question_bank: A''s row is intact');
SELECT is((SELECT file_path FROM public.pdf_uploads
            WHERE id = 'a0000000-0000-4000-8000-000000000004'),
  'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1/prova-a.pdf',
  'pdf_uploads: A''s row is intact');
SELECT is((SELECT cost_total FROM public.ai_usage_logs
            WHERE id = 'a0000000-0000-4000-8000-000000000005'),
  0.0123, 'ai_usage_logs: A''s row is intact');
SELECT is((SELECT status || ':' || credits_granted FROM public.credit_purchases
            WHERE id = 'a0000000-0000-4000-8000-000000000006'),
  'pending:300', 'credit_purchases: A''s row is intact');

-- The chat edge function writes with service_role: its path must stay open.
SELECT lives_ok(
  $$ INSERT INTO public.chat_sessions (user_id, title, messages)
     VALUES ('a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1', 'Nova conversa',
             '[{"role":"user","content":"oi"}]'::jsonb) $$,
  'chat_sessions: service_role can still open a session');
WITH u AS (
  UPDATE public.chat_sessions
     SET messages = '[{"role":"user","content":"oi"},{"role":"assistant","content":"olá"}]'::jsonb
   WHERE id = 'a0000000-0000-4000-8000-000000000002' RETURNING 1)
SELECT is((SELECT count(*)::int FROM u), 1,
  'chat_sessions: service_role can still persist messages');

RESET role;

SELECT * FROM finish();
ROLLBACK;
