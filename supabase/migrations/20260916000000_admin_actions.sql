-- =============================================================================
-- admin_actions: audit trail of super-admin support actions
-- -----------------------------------------------------------------------------
-- Every admin-* edge function (create user by invite, change e-mail, extend
-- trial, change access kind, grant extras, ban/unban, cancel subscription on
-- behalf of a user) records what was done, by whom and to whom. The payload
-- carries ids, the action and values only: never an e-mail, a CPF or a
-- password (LGPD; the functions sanitize before calling).
--
-- No policy: only service_role reads or writes (the admin UI reads through the
-- admin-dashboard function, never directly).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.admin_actions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id       uuid NOT NULL,
  target_user_id uuid,
  action         text NOT NULL,
  payload        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_actions_target_idx ON public.admin_actions (target_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS admin_actions_created_at_idx ON public.admin_actions (created_at DESC);

ALTER TABLE public.admin_actions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_actions FROM PUBLIC, anon, authenticated;
GRANT  ALL ON public.admin_actions TO service_role;

CREATE OR REPLACE FUNCTION public.log_admin_action(
  p_actor_id  uuid,
  p_target_id uuid,
  p_action    text,
  p_payload   jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_action IS NULL OR length(trim(p_action)) = 0 THEN
    RAISE EXCEPTION 'admin action is required';
  END IF;
  INSERT INTO public.admin_actions (actor_id, target_user_id, action, payload)
  VALUES (p_actor_id, p_target_id, p_action, COALESCE(p_payload, '{}'::jsonb))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.log_admin_action(uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.log_admin_action(uuid, uuid, text, jsonb) TO service_role;
