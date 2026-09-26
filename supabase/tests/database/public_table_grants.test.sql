-- =============================================================================
-- pgTAP: table privileges of the API roles on every table in `public`
--
-- Legacy databases (local, prod) were provisioned with broad default ACLs:
-- anon and authenticated held every privilege on every public table. RLS kept
-- rows safe, but TRUNCATE, REFERENCES and TRIGGER are not governed by RLS at
-- all, and anon never needs to write anywhere. 20260926000004 trims them.
--
-- The assertions are generic (catalog-driven) so a table added later is
-- covered without editing this file; each lists the offenders on failure.
-- =============================================================================
BEGIN;
SELECT plan(8);

-- ── Nothing RLS cannot govern ────────────────────────────────────────────────
SELECT is_empty($$
  SELECT t.tablename, r.role, p.priv
    FROM pg_tables t
   CROSS JOIN (VALUES ('anon'), ('authenticated')) AS r(role)
   CROSS JOIN (VALUES ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) AS p(priv)
   WHERE t.schemaname = 'public'
     AND has_table_privilege(r.role, format('public.%I', t.tablename), p.priv)
$$, 'anon/authenticated hold no TRUNCATE, REFERENCES or TRIGGER on any public table');

-- MAINTAIN (VACUUM/ANALYZE/REINDEX/CLUSTER/LOCK) exists from Postgres 17 on.
SELECT CASE WHEN current_setting('server_version_num')::int >= 170000
  THEN is_empty($$
    SELECT t.tablename, r.role
      FROM pg_tables t
     CROSS JOIN (VALUES ('anon'), ('authenticated')) AS r(role)
     WHERE t.schemaname = 'public'
       AND has_table_privilege(r.role, format('public.%I', t.tablename), 'MAINTAIN')
  $$, 'anon/authenticated hold no MAINTAIN on any public table')
  ELSE skip('MAINTAIN privilege needs Postgres 17', 1)
END;

-- ── anon writes nothing unless a policy lets it ──────────────────────────────
-- No policy grants anon a write today, so this means: no INSERT/UPDATE/DELETE
-- for anon anywhere in public (user data and the public catalogs alike).
SELECT is_empty($$
  SELECT t.tablename, c.cmd
    FROM pg_tables t
   CROSS JOIN (VALUES ('INSERT'), ('UPDATE'), ('DELETE')) AS c(cmd)
   WHERE t.schemaname = 'public'
     AND has_table_privilege('anon', format('public.%I', t.tablename), c.cmd)
     AND NOT EXISTS (
       SELECT 1 FROM pg_policies pol
        WHERE pol.schemaname = 'public' AND pol.tablename = t.tablename
          AND pol.cmd IN (c.cmd, 'ALL')
          AND pol.roles && ARRAY['anon', 'public']::name[])
$$, 'anon holds no write privilege on a public table without an anon policy for it');

-- ── Tables created by later migrations inherit the trimmed defaults ──────────
CREATE TABLE public.zz_grants_probe (id int);

SELECT ok(
  NOT has_table_privilege('anon', 'public.zz_grants_probe', 'TRUNCATE')
  AND NOT has_table_privilege('anon', 'public.zz_grants_probe', 'REFERENCES')
  AND NOT has_table_privilege('anon', 'public.zz_grants_probe', 'TRIGGER')
  AND NOT has_table_privilege('authenticated', 'public.zz_grants_probe', 'TRUNCATE')
  AND NOT has_table_privilege('authenticated', 'public.zz_grants_probe', 'REFERENCES')
  AND NOT has_table_privilege('authenticated', 'public.zz_grants_probe', 'TRIGGER'),
  'a new public table gives anon/authenticated no TRUNCATE, REFERENCES or TRIGGER');

SELECT ok(
  NOT has_table_privilege('anon', 'public.zz_grants_probe', 'INSERT')
  AND NOT has_table_privilege('anon', 'public.zz_grants_probe', 'UPDATE')
  AND NOT has_table_privilege('anon', 'public.zz_grants_probe', 'DELETE'),
  'a new public table gives anon no write privilege');

-- ── Nothing the app relies on was taken away ─────────────────────────────────
-- Every command a policy grants authenticated is still backed by the grant.
SELECT is_empty($$
  SELECT pol.tablename, c.cmd
    FROM pg_policies pol
   CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) AS c(cmd)
   WHERE pol.schemaname = 'public'
     AND pol.roles && ARRAY['authenticated', 'public']::name[]
     AND pol.cmd IN (c.cmd, 'ALL')
     AND NOT has_table_privilege('authenticated', format('public.%I', pol.tablename), c.cmd)
$$, 'authenticated keeps every privilege its policies rely on');

SELECT ok(
  has_table_privilege('anon', 'public.plans', 'SELECT')
  AND has_table_privilege('anon', 'public.credit_packages', 'SELECT')
  AND has_table_privilege('anon', 'public.ai_model_pricing', 'SELECT'),
  'anon still reads the public catalogs (plans, credit_packages, ai_model_pricing)');

-- service_role (edge functions, webhooks, jobs) is left untouched.
SELECT is_empty($$
  SELECT t.tablename, p.priv
    FROM pg_tables t
   CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'),
                      ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) AS p(priv)
   WHERE t.schemaname = 'public'
     AND t.tablename <> 'zz_grants_probe'
     AND NOT has_table_privilege('service_role', format('public.%I', t.tablename), p.priv)
$$, 'service_role keeps every table privilege on every public table');

SELECT * FROM finish();
ROLLBACK;
