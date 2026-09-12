-- =============================================================================
-- checkout_attempts: rate limit of the public subscribe endpoint
-- -----------------------------------------------------------------------------
-- /assinar works without a session (the account is born from the payment), so
-- the endpoint is public. Every attempt is recorded by HMAC of the normalized
-- e-mail and of the client IP (never the raw values), and the function decides
-- from the counts: max 5 attempts per e-mail and 10 per IP in 1h; more than 20
-- rejected attempts in 10 min opens a circuit that refuses anonymous checkouts
-- for 30 min (card-testing storm). Rows older than 24h are purged by the same
-- RPC, so the table never needs a cron.
--
-- No policy: only service_role reads or writes.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.checkout_attempts (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_hash    text NOT NULL,
  email_hash text NOT NULL,
  outcome    text NOT NULL CHECK (outcome IN ('attempt', 'authorized', 'pending', 'rejected', 'refused')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS checkout_attempts_created_at_idx ON public.checkout_attempts (created_at);
CREATE INDEX IF NOT EXISTS checkout_attempts_email_idx ON public.checkout_attempts (email_hash, created_at);
CREATE INDEX IF NOT EXISTS checkout_attempts_ip_idx    ON public.checkout_attempts (ip_hash, created_at);

ALTER TABLE public.checkout_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.checkout_attempts FROM PUBLIC, anon, authenticated;
GRANT  ALL ON public.checkout_attempts TO service_role;

-- Records one attempt (outcome 'attempt' before talking to MP; the final outcome
-- is recorded by a second call) and returns the counts the guard needs. Purges
-- rows older than 24h on the way.
CREATE OR REPLACE FUNCTION public.record_checkout_attempt(
  p_ip_hash    text,
  p_email_hash text,
  p_outcome    text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_by_email int;
  v_by_ip    int;
  v_rejected int;
BEGIN
  DELETE FROM public.checkout_attempts WHERE created_at < now() - interval '24 hours';

  INSERT INTO public.checkout_attempts (ip_hash, email_hash, outcome)
  VALUES (p_ip_hash, p_email_hash, p_outcome);

  SELECT count(*) INTO v_by_email FROM public.checkout_attempts
   WHERE email_hash = p_email_hash AND outcome = 'attempt' AND created_at > now() - interval '1 hour';
  SELECT count(*) INTO v_by_ip FROM public.checkout_attempts
   WHERE ip_hash = p_ip_hash AND outcome = 'attempt' AND created_at > now() - interval '1 hour';
  SELECT count(*) INTO v_rejected FROM public.checkout_attempts
   WHERE outcome = 'rejected' AND created_at > now() - interval '10 minutes';

  RETURN jsonb_build_object(
    'by_email_1h', v_by_email,
    'by_ip_1h',    v_by_ip,
    'rejected_10m', v_rejected
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_checkout_attempt(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.record_checkout_attempt(text, text, text) TO service_role;
