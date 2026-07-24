-- =============================================================================
-- A7 — the server, not the browser, persists a generated adaptation
--
-- `adapt-activity` used to generate, charge and return; the INSERT into
-- public.adaptations was the CLIENT's job, on its first autosave. That left a
-- window in which the user had already paid (the credit reservation is settled
-- the moment the document is validated) but the document itself lived only in
-- the HTTP response: closing the tab, a failed insert, or the wizard aborting
-- the request after the 200 destroyed the only copy of something already sold.
--
-- The edge function now inserts the draft row itself, via service_role, BEFORE
-- settling the reservation — so a failed write refunds instead of selling
-- nothing. This migration gives that row the one thing it was missing: the
-- idempotency key it must carry.
--
--   request_id — the id of the credit reservation that paid for this
--                adaptation (see 20260723140633_credit_reservations). Storing
--                it here means the row and the charge can always be matched up
--                (reconciliation, support, refunds), and the UNIQUE index makes
--                a replayed request incapable of leaving a second adaptation
--                behind — the same protection the reservation already gives the
--                money, now extended to the document.
--
-- The index is PARTIAL (WHERE request_id IS NOT NULL) so historical rows, and
-- any row created outside a generation, are simply unconstrained rather than
-- colliding with each other on NULL.
--
-- Additive only: nullable column + partial index. No backfill, no rewrite of
-- existing rows, no RLS change — the owner-based policies from the initial
-- schema still govern reads/updates, which is what lets the user open a row the
-- server created for them.
--
-- After running: `make gen-types` (adaptations gains request_id).
-- =============================================================================

ALTER TABLE public.adaptations
  ADD COLUMN IF NOT EXISTS request_id uuid;

COMMENT ON COLUMN public.adaptations.request_id IS
  'Id of the credit reservation that paid for this adaptation; also the '
  'idempotency key of the generation request. NULL for rows not created by a '
  'server-side generation (legacy).';

CREATE UNIQUE INDEX IF NOT EXISTS adaptations_request_id_key
  ON public.adaptations (request_id)
  WHERE request_id IS NOT NULL;
