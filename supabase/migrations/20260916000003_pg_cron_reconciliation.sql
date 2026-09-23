-- =============================================================================
-- pg_cron for the credit reservation reconciliation (runbook step 3)
-- -----------------------------------------------------------------------------
-- Tries to enable pg_cron and (re)schedule reconcile_stale_credit_reservations
-- every 15 minutes. Everything is wrapped so a project where the extension
-- cannot be created by `db push` logs a NOTICE instead of failing the deploy;
-- in that case enable it in the Dashboard (Database → Extensions) and re-run
-- the DO block of 20260723140633_credit_reservations.sql.
-- =============================================================================
DO $$
BEGIN
  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_cron;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron could not be created here (%): enable it in the Dashboard', SQLERRM;
  END;

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
    RAISE NOTICE 'pg_cron absent: reconciliation RPC installed but NOT scheduled';
  END IF;
END;
$$;
