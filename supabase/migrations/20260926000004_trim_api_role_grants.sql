-- =============================================================================
-- Trim the table privileges of the API roles (anon, authenticated) in public.
--
-- Legacy databases (local, prod) were provisioned with broad default ACLs:
-- every table created by postgres granted anon and authenticated ALL
-- (arwdDxtm). Row access stayed safe under RLS, but:
--   * TRUNCATE, REFERENCES, TRIGGER (and MAINTAIN on Postgres 17+) are not
--     governed by RLS at all, and no app path needs them;
--   * anon never writes: no policy grants anon INSERT/UPDATE/DELETE anywhere,
--     and the public catalogs (plans, credit_packages, ai_model_pricing) are
--     SELECT-only for anon.
-- Databases created by current Supabase images (CI) never had these grants,
-- so this also removes a difference between environments.
--
-- Untouched on purpose: SELECT for both roles and INSERT/UPDATE/DELETE for
-- authenticated (governed by RLS and relied on by the app), and service_role.
--
-- Idempotent and catalog-driven: loops over every table in public, and only
-- revokes an anon write when no policy lets anon (or PUBLIC) run that command,
-- so a future anon policy is not silently undercut by a re-run.
-- =============================================================================

DO $grants$
DECLARE
  t   record;
  op  text;
  has_maintain constant boolean := current_setting('server_version_num')::int >= 170000;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format(
      'REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.%I FROM anon, authenticated',
      t.tablename);
    IF has_maintain THEN
      EXECUTE format('REVOKE MAINTAIN ON public.%I FROM anon, authenticated', t.tablename);
    END IF;

    FOREACH op IN ARRAY ARRAY['INSERT', 'UPDATE', 'DELETE'] LOOP
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies p
         WHERE p.schemaname = 'public' AND p.tablename = t.tablename
           AND p.cmd IN (op, 'ALL')
           AND p.roles && ARRAY['anon', 'public']::name[]
      ) THEN
        EXECUTE format('REVOKE %s ON public.%I FROM anon', op, t.tablename);
      END IF;
    END LOOP;
  END LOOP;

  -- Tables created by later migrations (owned by postgres) start trimmed too.
  -- A future table that really needs an anon write grants it explicitly,
  -- as every table already does for its authenticated privileges.
  ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
    REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLES FROM anon, authenticated;
  ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
    REVOKE INSERT, UPDATE, DELETE ON TABLES FROM anon;
  IF has_maintain THEN
    EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public '
         || 'REVOKE MAINTAIN ON TABLES FROM anon, authenticated';
  END IF;
END
$grants$;

-- Fail the push loudly if any table in public still hands the API roles a
-- privilege RLS cannot govern, or lets anon write without a policy.
DO $check$
DECLARE
  leftover text;
BEGIN
  SELECT string_agg(DISTINCT format('%s:%s:%s', t.tablename, r.rolname, pr.priv), ', ')
    INTO leftover
    FROM pg_tables t
   CROSS JOIN (VALUES ('anon'), ('authenticated')) AS r(rolname)
   CROSS JOIN (VALUES ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) AS pr(priv)
   WHERE t.schemaname = 'public'
     AND has_table_privilege(r.rolname, format('public.%I', t.tablename), pr.priv);
  IF leftover IS NOT NULL THEN
    RAISE EXCEPTION 'API roles still hold ungoverned privileges: %', leftover;
  END IF;

  SELECT string_agg(DISTINCT format('%s:%s', t.tablename, op.cmd), ', ')
    INTO leftover
    FROM pg_tables t
   CROSS JOIN (VALUES ('INSERT'), ('UPDATE'), ('DELETE')) AS op(cmd)
   WHERE t.schemaname = 'public'
     AND has_table_privilege('anon', format('public.%I', t.tablename), op.cmd)
     AND NOT EXISTS (
       SELECT 1 FROM pg_policies p
        WHERE p.schemaname = 'public' AND p.tablename = t.tablename
          AND p.cmd IN (op.cmd, 'ALL')
          AND p.roles && ARRAY['anon', 'public']::name[]
     );
  IF leftover IS NOT NULL THEN
    RAISE EXCEPTION 'anon can still write without a policy: %', leftover;
  END IF;
END
$check$;
