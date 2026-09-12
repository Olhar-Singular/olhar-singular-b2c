-- =============================================================================
-- Data migration: the accounts that predate the two-bucket model
-- -----------------------------------------------------------------------------
-- Existing users keep what the landing page promised them ("credits never
-- expire"): their balance stays as the extras bucket, they get no trial and no
-- paywall until it runs out (access_kind 'legacy'). Whoever still had the
-- retired "first adaptation / first extraction free" flag is compensated in
-- extras (12 and 5 credits: the most expensive adaptation and one extraction).
-- Super-admins become exempt, which is how the smoke tests run without a plan.
--
-- Pending purchases that can no longer be paid (no payment id, or older than
-- 30 days) are closed so they stop looking payable in the user's history; the
-- ones still worth checking against Mercado Pago are listed in a NOTICE for
-- the deploy runbook. Same for Stripe payments approved without a ledger row.
--
-- The logic lives in a function so it is idempotent (compensation is keyed on
-- the ledger) and testable over fixtures; the migration calls it once.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.migrate_legacy_access()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_legacy    integer;
  v_exempt    integer;
  v_adapt     integer := 0;
  v_extract   integer := 0;
  v_closed    integer;
  v_row       record;
BEGIN
  -- Everyone who exists today entered under the old model.
  UPDATE public.profiles SET access_kind = 'legacy'
   WHERE access_kind = 'subscriber' AND NOT is_super_admin;
  GET DIAGNOSTICS v_legacy = ROW_COUNT;

  UPDATE public.profiles SET access_kind = 'exempt'
   WHERE is_super_admin AND access_kind <> 'exempt';
  GET DIAGNOSTICS v_exempt = ROW_COUNT;

  -- Compensation, once per account per flag (keyed on the ledger row). Exempt
  -- accounts never spend credits, so there is nothing to compensate there.
  FOR v_row IN
    SELECT id FROM public.profiles p
     WHERE p.free_adaptation_used = false
       AND p.access_kind <> 'exempt'
       AND NOT EXISTS (
         SELECT 1 FROM public.credit_transactions t
          WHERE t.user_id = p.id AND t.type = 'compensation' AND t.delta = 12)
  LOOP
    UPDATE public.profiles SET credit_balance = credit_balance + 12 WHERE id = v_row.id;
    INSERT INTO public.credit_transactions (user_id, delta, type, bucket)
    VALUES (v_row.id, 12, 'compensation', 'extra');
    v_adapt := v_adapt + 1;
  END LOOP;

  FOR v_row IN
    SELECT id FROM public.profiles p
     WHERE p.free_extraction_used = false
       AND p.access_kind <> 'exempt'
       AND NOT EXISTS (
         SELECT 1 FROM public.credit_transactions t
          WHERE t.user_id = p.id AND t.type = 'compensation' AND t.delta = 5)
  LOOP
    UPDATE public.profiles SET credit_balance = credit_balance + 5 WHERE id = v_row.id;
    INSERT INTO public.credit_transactions (user_id, delta, type, bucket)
    VALUES (v_row.id, 5, 'compensation', 'extra');
    v_extract := v_extract + 1;
  END LOOP;

  -- Purchases nobody can pay anymore.
  UPDATE public.credit_purchases
     SET status = 'cancelled', status_detail = 'stale'
   WHERE status = 'pending'
     AND (payment_id IS NULL OR created_at < now() - interval '30 days');
  GET DIAGNOSTICS v_closed = ROW_COUNT;

  -- Worth a look before the deploy: recent pending rows with a payment id.
  FOR v_row IN
    SELECT id, provider, payment_id, created_at FROM public.credit_purchases
     WHERE status = 'pending'
  LOOP
    RAISE NOTICE 'pending purchase to check at the provider: % (%, %, %)',
      v_row.id, v_row.provider, v_row.payment_id, v_row.created_at;
  END LOOP;

  -- Stripe payments marked approved whose credit never landed.
  FOR v_row IN
    SELECT cp.id, cp.payment_id FROM public.credit_purchases cp
     WHERE cp.provider = 'stripe' AND cp.status = 'approved'
       AND NOT EXISTS (
         SELECT 1 FROM public.credit_transactions t
          WHERE t.type = 'purchase' AND t.ref_id = cp.id)
  LOOP
    RAISE NOTICE 'approved Stripe purchase without a credit grant: % (%)', v_row.id, v_row.payment_id;
  END LOOP;

  RETURN jsonb_build_object(
    'legacy',                 v_legacy,
    'exempt',                 v_exempt,
    'compensated_adaptation', v_adapt,
    'compensated_extraction', v_extract,
    'stale_purchases_closed', v_closed
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.migrate_legacy_access() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.migrate_legacy_access() TO service_role;

-- Run once, now. Local and CI databases are empty: this is a no-op there.
DO $$
DECLARE
  v_report jsonb;
BEGIN
  v_report := public.migrate_legacy_access();
  RAISE NOTICE 'legacy access migration: %', v_report;
END;
$$;
