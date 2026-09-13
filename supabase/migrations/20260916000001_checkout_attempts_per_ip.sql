-- =============================================================================
-- record_checkout_attempt: rejections per IP (review of 2026-09-12)
-- -----------------------------------------------------------------------------
-- The circuit breaker used a single global count of rejections: ~21 declined
-- attempts from anywhere took the whole (only) signup funnel offline for as
-- long as an attacker kept a trickle going. The RPC now also returns the
-- rejections from the same IP in the last 10 minutes, so the function trips
-- per IP first and keeps the global ceiling only as a last resort.
-- Same signature, CREATE OR REPLACE only: the service_role-only ACL is kept.
-- =============================================================================

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
  v_by_email    int;
  v_by_ip       int;
  v_rejected    int;
  v_rejected_ip int;
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
  SELECT count(*) INTO v_rejected_ip FROM public.checkout_attempts
   WHERE ip_hash = p_ip_hash AND outcome = 'rejected' AND created_at > now() - interval '10 minutes';

  RETURN jsonb_build_object(
    'by_email_1h',     v_by_email,
    'by_ip_1h',        v_by_ip,
    'rejected_10m',    v_rejected,
    'rejected_10m_ip', v_rejected_ip
  );
END;
$$;
