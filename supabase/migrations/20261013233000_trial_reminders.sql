-- =============================================================================
-- Trial reminder: e-mail 48 h before the first charge of a card trial
-- -----------------------------------------------------------------------------
-- CDC art. 6 III and 39 (and the card networks' free-trial rules): whoever is
-- testing with a card gets a reminder, with the date, the amount and how to
-- cancel, before the first charge. pg_cron calls the edge function
-- send-trial-reminders every hour (through pg_net, with the secret kept in the
-- Vault); the function claims the due rows here and e-mails them.
--
-- The claim is ONE `UPDATE ... RETURNING`: a row is marked and handed out in the
-- same statement, so two concurrent runs can never remind twice. A send that
-- fails is released (release_trial_reminder → NULL) and retried next hour.
--
-- Eligible: a live trial (status 'authorized' or 'paused', trial_ends_at set,
-- first charge not confirmed), not cancelled nor cancellation requested, ending
-- within the window (default 48 h) and still in the future, not reminded yet.
-- 'paused' stays in on purpose: MP may still collect when it resumes, and
-- warning the consumer is the defensive choice. 'past_due' is not a possible
-- state before the first charge (it is only set by a declined renewal), so it
-- is not listed. The e-mail returned is the ACCOUNT's (auth.users.email, the
-- official channel of Termos 16.1), falling back to the card's payer_email;
-- admin-change-email never rewrites subscriptions.payer_email.
--
-- The scheduling block is defensive (same pattern as the reconciliation cron):
-- without pg_cron/pg_net it logs a NOTICE instead of failing the deploy; the
-- Vault secrets (functions_url, cron_secret) and the function secrets
-- (CRON_SECRET, RESEND_API_KEY) are created by the owner, never by a migration.
-- Runbook: docs/runbooks/lembrete-teste-gratis.md. Covered by
-- trial_reminders.test.sql.
-- =============================================================================

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS trial_reminder_sent_at timestamptz;

COMMENT ON COLUMN public.subscriptions.trial_reminder_sent_at IS
  'Trial with card: when the 48 h first-charge reminder was claimed for sending (NULL = not yet). release_trial_reminder sets it back to NULL when the send failed.';

-- The hourly scan: only trials whose first charge is still ahead and not reminded.
CREATE INDEX IF NOT EXISTS subscriptions_trial_reminder_due_idx
  ON public.subscriptions (trial_ends_at)
  WHERE trial_reminder_sent_at IS NULL
    AND first_payment_confirmed = false
    AND trial_ends_at IS NOT NULL;

-- ── claim_trial_reminders(window) → due rows, marked ───────────────────────
CREATE OR REPLACE FUNCTION public.claim_trial_reminders(p_window interval DEFAULT interval '48 hours')
RETURNS TABLE (
  subscription_id uuid,
  user_id         uuid,
  /* the account e-mail (auth.users), payer_email only as fallback; column name kept for the function's consumers */
  payer_email     text,
  full_name       text,
  trial_ends_at   timestamptz,
  plan_name       text,
  price_brl       numeric,
  monthly_credits integer
)
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH claimed AS (
    UPDATE public.subscriptions s
       SET trial_reminder_sent_at = now()
     WHERE s.status IN ('authorized', 'paused')
       AND s.trial_ends_at IS NOT NULL
       AND s.first_payment_confirmed = false
       AND s.trial_ends_at > now()
       AND s.trial_ends_at <= now() + p_window
       AND s.cancel_requested_at IS NULL
       AND s.cancelled_at IS NULL
       AND s.trial_reminder_sent_at IS NULL
    RETURNING s.id, s.user_id, s.payer_email, s.trial_ends_at, s.plan_id
  )
  SELECT c.id, c.user_id, COALESCE(u.email, c.payer_email), pr.full_name, c.trial_ends_at,
         p.name, p.price_brl, p.monthly_credits
    FROM claimed c
    JOIN public.plans p ON p.id = c.plan_id
    LEFT JOIN auth.users u ON u.id = c.user_id
    LEFT JOIN public.profiles pr ON pr.id = c.user_id
   ORDER BY c.trial_ends_at;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_trial_reminders(interval) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.claim_trial_reminders(interval) TO service_role;

-- ── release_trial_reminder(id) → boolean ────────────────────────────────────
-- The send failed: re-arm the row so the next hourly run claims it again.
-- True when a claimed row was released; false when there was nothing to release.
CREATE OR REPLACE FUNCTION public.release_trial_reminder(p_subscription_id uuid)
RETURNS boolean
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH released AS (
    UPDATE public.subscriptions
       SET trial_reminder_sent_at = NULL
     WHERE id = p_subscription_id
       AND trial_reminder_sent_at IS NOT NULL
    RETURNING 1
  )
  SELECT EXISTS (SELECT 1 FROM released);
$$;

REVOKE EXECUTE ON FUNCTION public.release_trial_reminder(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.release_trial_reminder(uuid) TO service_role;

-- ── invoke_send_trial_reminders() ───────────────────────────────────────────
-- What the cron job runs: POST <functions_url>/send-trial-reminders with the
-- bearer secret, both read from the Vault. Without the secrets, without the
-- Vault or without pg_net it only logs a NOTICE (the deploy and the job never
-- error). Everything that depends on an optional extension is dynamic SQL, so
-- the function itself always compiles.
CREATE OR REPLACE FUNCTION public.invoke_send_trial_reminders()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url        text;
  v_secret     text;
  v_request_id bigint;
BEGIN
  IF to_regclass('vault.decrypted_secrets') IS NULL THEN
    RAISE NOTICE 'send-trial-reminders: vault.decrypted_secrets absent, nothing invoked';
    RETURN;
  END IF;

  EXECUTE 'SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = $1 LIMIT 1'
     INTO v_url USING 'functions_url';
  EXECUTE 'SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = $1 LIMIT 1'
     INTO v_secret USING 'cron_secret';

  IF coalesce(v_url, '') = '' OR coalesce(v_secret, '') = '' THEN
    RAISE NOTICE 'send-trial-reminders: vault secrets functions_url/cron_secret missing, nothing invoked';
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    RAISE NOTICE 'send-trial-reminders: pg_net absent, nothing invoked';
    RETURN;
  END IF;

  -- Bind parameters, never string-building: the secret must not sit in the
  -- statement text, which Postgres echoes in the CONTEXT of any error (server
  -- log and cron.job_run_details.return_message).
  EXECUTE 'SELECT net.http_post(url := $1, headers := $2, body := $3, timeout_milliseconds := 30000)'
     INTO v_request_id
    USING rtrim(v_url, '/') || '/send-trial-reminders',
          jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_secret),
          '{}'::jsonb;

  RAISE NOTICE 'send-trial-reminders: invoked (pg_net request %)', v_request_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.invoke_send_trial_reminders() FROM PUBLIC, anon, authenticated;

-- ── Schedule: every hour at minute 5 ────────────────────────────────────────
DO $$
BEGIN
  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_net;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pg_net could not be created here (%): enable it in the Dashboard', SQLERRM;
  END;

  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-trial-reminders') THEN
      PERFORM cron.unschedule('send-trial-reminders');
    END IF;
    PERFORM cron.schedule(
      'send-trial-reminders',
      '5 * * * *',
      'SELECT public.invoke_send_trial_reminders();'
    );
    RAISE NOTICE 'trial reminders scheduled every hour (minute 5)';
  ELSE
    RAISE NOTICE 'pg_cron absent: trial reminder RPCs installed but NOT scheduled';
  END IF;
END;
$$;
