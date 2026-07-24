-- =============================================================================
-- Crash-safe credit charging: persisted reservation + reconciliation
-- -----------------------------------------------------------------------------
-- adapt-activity charges BEFORE calling the AI (to close the double-spend race)
-- and refunds on every failure path — but the refund only runs if the isolate is
-- still alive to run it. The generation loop can reach ~270s (3 attempts × 90s),
-- so an evicted/OOM-killed isolate or a platform restart between the debit and
-- the refund left the user paying for nothing, with no trace anywhere that a
-- charge had ever been in flight. Nothing could detect it, let alone fix it.
--
-- A reservation row is now written BEFORE the money moves:
--   open     → this request charged something and still owes an outcome
--   settled  → the user actually received their adaptation (charge is final)
--   reversed → the charge was given back (by the request itself, or by the job)
--
-- Anything still `open` after the longest possible request is, by definition, a
-- charge whose owner died: reconcile_stale_credit_reservations() gives it back.
--
-- Two guarantees fall out of the row itself:
--   * the id IS the idempotency key — it is the client's request_id, so a
--     replayed request hits the primary key and cannot charge twice;
--   * only one actor can win the `open → reversed` transition (a conditional
--     UPDATE), so the request and the job can race freely without double-paying.
--
-- Covered by supabase/tests/database/credit_reservations.test.sql.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.credit_reservations (
  id              uuid PRIMARY KEY,          -- = the caller's request_id
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind            text NOT NULL CHECK (kind IN ('adapt')),
  -- What this request consumed. Exactly one is meaningful in practice: the
  -- free-first claim costs 0 credits, a paid run never claims the free slot.
  credits_charged integer NOT NULL DEFAULT 0 CHECK (credits_charged >= 0),
  free_claimed    boolean NOT NULL DEFAULT false,
  state           text NOT NULL DEFAULT 'open'
                    CHECK (state IN ('open', 'settled', 'reversed')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  settled_at      timestamptz,
  reversed_at     timestamptz
);

-- The reconciliation job's only access path: open rows, oldest first.
CREATE INDEX IF NOT EXISTS idx_credit_reservations_open
  ON public.credit_reservations (created_at)
  WHERE state = 'open';

CREATE INDEX IF NOT EXISTS idx_credit_reservations_user_id
  ON public.credit_reservations (user_id);

-- Service-role only: this table is written exclusively by edge functions and
-- read exclusively by the job. RLS is enabled with NO policies, so every
-- authenticated/anon request matches nothing; the missing table GRANT stops
-- them one step earlier (42501). service_role bypasses both, by design.
ALTER TABLE public.credit_reservations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.credit_reservations FROM anon, authenticated;
GRANT  ALL ON public.credit_reservations TO service_role;

-- =============================================================================
-- open_adapt_reservation(request_id, user_id, amount) → jsonb
-- -----------------------------------------------------------------------------
-- Reserve AND charge in ONE transaction. The atomicity is the entire point: if
-- the row were written after the debit, a crash in between would leave a charge
-- no job can see; if it were written before, a crash would leave a reservation
-- claiming a debit that never happened and the job would refund credits that
-- were never taken. Doing both here means a request either owns a reservation
-- that exactly describes what it consumed, or it consumed nothing.
--
-- Free-first is preserved: the one free adaptation is claimed with the same
-- atomic `WHERE free_adaptation_used = false` that closes the double-spend race.
--
-- Returns one of:
--   { success: false, error: 'duplicate_request' }                (replayed id)
--   { success: false, error: 'insufficient_credits', balance: n }
--   { success: true,  mode: 'free',    credits_charged: 0 }
--   { success: true,  mode: 'charged', credits_charged: n, new_balance: n }
-- =============================================================================
CREATE OR REPLACE FUNCTION public.open_adapt_reservation(
  p_request_id uuid,
  p_user_id    uuid,
  p_amount     integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claimed_free boolean := false;
  v_deduct       jsonb;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'amount must be positive';
  END IF;

  -- The primary key IS the idempotency guard: a replayed request_id cannot open
  -- a second reservation, so it cannot charge a second time.
  BEGIN
    INSERT INTO public.credit_reservations (id, user_id, kind)
    VALUES (p_request_id, p_user_id, 'adapt');
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('success', false, 'error', 'duplicate_request');
  END;

  -- Free first: claim the one free adaptation if it is still available.
  UPDATE public.profiles
     SET free_adaptation_used = true
   WHERE id = p_user_id
     AND free_adaptation_used = false;
  v_claimed_free := FOUND;

  IF v_claimed_free THEN
    UPDATE public.credit_reservations
       SET free_claimed = true
     WHERE id = p_request_id;
    RETURN jsonb_build_object(
      'success', true, 'mode', 'free', 'credits_charged', 0);
  END IF;

  v_deduct := public.deduct_credits(p_user_id, p_amount, 'adapt', p_request_id);

  IF (v_deduct->>'success')::boolean IS NOT TRUE THEN
    -- Nothing was charged, so nothing is owed: drop the reservation instead of
    -- leaving an `open` row the job would later "refund". This also keeps the
    -- request_id reusable after the user tops up.
    DELETE FROM public.credit_reservations WHERE id = p_request_id;
    RETURN v_deduct;
  END IF;

  UPDATE public.credit_reservations
     SET credits_charged = p_amount
   WHERE id = p_request_id;

  RETURN jsonb_build_object(
    'success',         true,
    'mode',            'charged',
    'credits_charged', p_amount,
    'new_balance',     (v_deduct->>'new_balance')::integer
  );
END;
$$;

-- =============================================================================
-- settle_credit_reservation(id) → jsonb
-- -----------------------------------------------------------------------------
-- Mark the charge final: the user received their adaptation. Called right
-- before the edge function returns 200, so a reservation is only ever settled
-- once the response content actually exists. Anything left `open` is, by
-- definition, a charge whose request died.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.settle_credit_reservation(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settled boolean;
BEGIN
  UPDATE public.credit_reservations
     SET state = 'settled', settled_at = now()
   WHERE id = p_id
     AND state = 'open';
  v_settled := FOUND;
  RETURN jsonb_build_object('success', true, 'settled', v_settled);
END;
$$;

-- =============================================================================
-- reverse_credit_reservation(id) → jsonb
-- -----------------------------------------------------------------------------
-- Give back whatever the reservation consumed. This is the single reversal path
-- shared by the failing request itself and by the reconciliation job, so they
-- can race freely: the conditional `open → reversed` UPDATE is the claim, and
-- only its winner pays. A settled (delivered) charge is never reversible.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.reverse_credit_reservation(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row          record;
  v_free_release boolean := false;
BEGIN
  UPDATE public.credit_reservations
     SET state = 'reversed', reversed_at = now()
   WHERE id = p_id
     AND state = 'open'
  RETURNING user_id, credits_charged, free_claimed INTO v_row;

  IF NOT FOUND THEN
    -- Already settled, already reversed, or unknown: nothing is owed.
    RETURN jsonb_build_object(
      'success', true, 'reversed', false, 'credits_refunded', 0,
      'free_released', false);
  END IF;

  IF v_row.credits_charged > 0 THEN
    -- ref_id ties the refund back to the reservation, so the ledger explains
    -- itself to anyone auditing a balance later.
    PERFORM public.grant_credits(
      v_row.user_id, v_row.credits_charged, 'refund', NULL, p_id);
  END IF;

  IF v_row.free_claimed THEN
    -- Guarded release: only undo a slot that is actually still marked used.
    UPDATE public.profiles
       SET free_adaptation_used = false
     WHERE id = v_row.user_id
       AND free_adaptation_used = true;
    v_free_release := FOUND;
  END IF;

  RETURN jsonb_build_object(
    'success',          true,
    'reversed',         true,
    'credits_refunded', v_row.credits_charged,
    'free_released',    v_free_release
  );
END;
$$;

-- =============================================================================
-- reconcile_stale_credit_reservations(interval) → jsonb
-- -----------------------------------------------------------------------------
-- Give back every charge whose request never reported an outcome. Intended to
-- run on a schedule (see the note at the bottom of this file) but safe to call
-- by hand at any time: it is idempotent and never touches a live request.
--
-- p_older_than MUST stay comfortably above the worst-case request duration
-- (~270s of AI attempts + overhead), or the job would refund requests that are
-- still legitimately running and the user would get their adaptation for free.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.reconcile_stale_credit_reservations(
  p_older_than interval DEFAULT interval '10 minutes'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id               uuid;
  v_res              jsonb;
  v_reversed         integer := 0;
  v_credits_refunded integer := 0;
  v_free_released    integer := 0;
BEGIN
  FOR v_id IN
    SELECT id FROM public.credit_reservations
     WHERE state = 'open'
       AND created_at < now() - p_older_than
     ORDER BY created_at
  LOOP
    -- Same reversal path the failing request itself uses, so the two can race:
    -- reverse_credit_reservation claims `open → reversed` and only its winner
    -- pays. A request that wakes up late finds nothing left to refund.
    v_res := public.reverse_credit_reservation(v_id);

    IF (v_res->>'reversed')::boolean THEN
      v_reversed         := v_reversed + 1;
      v_credits_refunded := v_credits_refunded + (v_res->>'credits_refunded')::integer;
      IF (v_res->>'free_released')::boolean THEN
        v_free_released := v_free_released + 1;
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'reversed',         v_reversed,
    'credits_refunded', v_credits_refunded,
    'free_released',    v_free_released
  );
END;
$$;

-- Money-moving RPCs: same lockdown as grant_credits / deduct_credits. Without
-- it a logged-in user could open a free reservation for themselves or reverse
-- (i.e. refund) a charge for an adaptation they already received.
-- MAINTENANCE: only ever change these with CREATE OR REPLACE — a DROP + CREATE
-- resets the ACL to the PUBLIC default and silently reopens the vector.
REVOKE EXECUTE ON FUNCTION public.open_adapt_reservation(uuid, uuid, integer)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.settle_credit_reservation(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reverse_credit_reservation(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reconcile_stale_credit_reservations(interval)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.open_adapt_reservation(uuid, uuid, integer)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.settle_credit_reservation(uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.reverse_credit_reservation(uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.reconcile_stale_credit_reservations(interval)
  TO service_role;

-- =============================================================================
-- Scheduling
-- -----------------------------------------------------------------------------
-- The job is scheduled with pg_cron when the extension is present. The extension
-- is NOT created here: `CREATE EXTENSION pg_cron` needs privileges that
-- `supabase db push` does not reliably have, and a failure would break the whole
-- deploy.
--
-- To turn reconciliation on in a project: enable pg_cron (Dashboard → Database →
-- Extensions), then re-run this DO block. Until then the reservations still
-- accumulate, so nothing is lost — an operator can always run
-- `select public.reconcile_stale_credit_reservations();` by hand.
-- =============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'reconcile-credit-reservations') THEN
      PERFORM cron.unschedule('reconcile-credit-reservations');
    END IF;
    PERFORM cron.schedule(
      'reconcile-credit-reservations',
      '*/15 * * * *',
      'SELECT public.reconcile_stale_credit_reservations();'
    );
    RAISE NOTICE 'credit reservation reconciliation scheduled every 15 minutes';
  ELSE
    RAISE NOTICE 'pg_cron absent — reconciliation RPC installed but NOT scheduled';
  END IF;
END;
$$;
