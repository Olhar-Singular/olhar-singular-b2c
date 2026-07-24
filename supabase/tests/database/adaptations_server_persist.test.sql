-- =============================================================================
-- pgTAP: the server owns the adaptation row (A7)
-- -----------------------------------------------------------------------------
-- Before this, `adapt-activity` generated, charged and RETURNED — the INSERT
-- into public.adaptations was done by the browser on its first autosave. Every
-- millisecond between the 200 and that insert was a window where the user had
-- already paid and the document existed nowhere durable: close the tab, lose
-- the network, let the wizard abort the request, and the adaptation was gone
-- while the credit (correctly protected by the reservation) stayed spent.
--
-- Now the edge function inserts the draft row itself, via service_role, BEFORE
-- settling the reservation. Two properties have to hold in the database for
-- that to be safe, and both are asserted here:
--
--   1. `request_id` (the reservation id — the same idempotency key) is stored
--      on the row and is UNIQUE, so a replayed request cannot leave a second
--      adaptation behind. Legacy rows (NULL) are exempt.
--   2. A row written by the server with no client involvement is immediately
--      visible to its owner (and only to its owner) through RLS — i.e. it is
--      already in the "Minhas Adaptações" history without anyone pressing
--      Salvar.
-- =============================================================================
BEGIN;
SELECT plan(11);

-- ── Fixtures ────────────────────────────────────────────────────────────────
INSERT INTO auth.users (id, email) VALUES
  ('a7a7a7a7-a7a7-4a7a-8a7a-a7a7a7a7a7a7', 'owner@test.com'),
  ('b7b7b7b7-b7b7-4b7b-8b7b-b7b7b7b7b7b7', 'stranger@test.com');

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. The idempotency key is a first-class column
-- ═══════════════════════════════════════════════════════════════════════════
SELECT has_column('public', 'adaptations', 'request_id',
  'adaptations.request_id exists (links the row to its credit reservation)');

SELECT col_type_is('public', 'adaptations', 'request_id', 'uuid',
  'adaptations.request_id is a uuid (same shape as the reservation id)');

SELECT has_index('public', 'adaptations', 'adaptations_request_id_key',
  'a unique index backs the idempotency key');

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. The server write path (service_role) + replay protection
-- ═══════════════════════════════════════════════════════════════════════════
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SET LOCAL role service_role;

WITH i AS (
  INSERT INTO public.adaptations
    (user_id, request_id, title, original_activity, activity_type,
     barriers_used, adaptation_result, status, credits_spent)
  VALUES
    ('a7a7a7a7-a7a7-4a7a-8a7a-a7a7a7a7a7a7',
     'c7c7c7c7-c7c7-4c7c-8c7c-c7c7c7c7c7c7',
     '1) Quanto é 2+2?', '1) Quanto é 2+2?', 'prova',
     '[]'::jsonb, '{"schemaVersion":1}'::jsonb, 'draft', 12)
  RETURNING 1)
SELECT is((SELECT count(*)::int FROM i), 1,
  'service_role inserts the generated adaptation (server-owned write path)');

SELECT is(
  (SELECT status FROM public.adaptations
    WHERE request_id = 'c7c7c7c7-c7c7-4c7c-8c7c-c7c7c7c7c7c7'),
  'draft',
  'the server-written row lands as a draft (the user still has to Salvar)');

SELECT is(
  (SELECT credits_spent FROM public.adaptations
    WHERE request_id = 'c7c7c7c7-c7c7-4c7c-8c7c-c7c7c7c7c7c7'),
  12,
  'the row records what the reservation actually charged');

-- Replay: the same request_id must never produce a second adaptation.
SELECT throws_ok(
  $$ INSERT INTO public.adaptations
       (user_id, request_id, title, original_activity, adaptation_result)
     VALUES ('a7a7a7a7-a7a7-4a7a-8a7a-a7a7a7a7a7a7',
             'c7c7c7c7-c7c7-4c7c-8c7c-c7c7c7c7c7c7',
             'replay', 'replay', '{"schemaVersion":1}'::jsonb) $$,
  '23505', NULL,
  'a replayed request_id cannot leave a duplicate adaptation');

-- Legacy/unkeyed rows (pre-A7, or a client with no request_id) stay allowed.
WITH i AS (
  INSERT INTO public.adaptations (user_id, title, original_activity, adaptation_result)
  VALUES
    ('a7a7a7a7-a7a7-4a7a-8a7a-a7a7a7a7a7a7', 'legacy 1', 'x', '{}'::jsonb),
    ('a7a7a7a7-a7a7-4a7a-8a7a-a7a7a7a7a7a7', 'legacy 2', 'y', '{}'::jsonb)
  RETURNING 1)
SELECT is((SELECT count(*)::int FROM i), 2,
  'rows without a request_id are not constrained (legacy rows, partial index)');

RESET role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. The owner sees it immediately — no client save involved
-- ═══════════════════════════════════════════════════════════════════════════
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"a7a7a7a7-a7a7-4a7a-8a7a-a7a7a7a7a7a7","role":"authenticated"}', true);
SET LOCAL role authenticated;

SELECT is(
  (SELECT count(*)::int FROM public.adaptations
    WHERE request_id = 'c7c7c7c7-c7c7-4c7c-8c7c-c7c7c7c7c7c7'),
  1,
  'the owner reads back the server-written adaptation (it is in the history)');

-- ...and can still edit it: autosave now UPDATEs a row it never created.
WITH u AS (
  UPDATE public.adaptations
     SET adaptation_result = '{"schemaVersion":1,"edited":true}'::jsonb
   WHERE request_id = 'c7c7c7c7-c7c7-4c7c-8c7c-c7c7c7c7c7c7' RETURNING 1)
SELECT is((SELECT count(*)::int FROM u), 1,
  'the owner can UPDATE the server-written row (autosave path intact)');

RESET role;

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"b7b7b7b7-b7b7-4b7b-8b7b-b7b7b7b7b7b7","role":"authenticated"}', true);
SET LOCAL role authenticated;

SELECT is(
  (SELECT count(*)::int FROM public.adaptations
    WHERE request_id = 'c7c7c7c7-c7c7-4c7c-8c7c-c7c7c7c7c7c7'),
  0,
  'a stranger cannot read the server-written adaptation (RLS still owner-based)');

RESET role;

SELECT * FROM finish();
ROLLBACK;
