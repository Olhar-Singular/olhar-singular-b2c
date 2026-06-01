-- ============================================================================
-- Cria (ou promove) um SUPER-ADMIN da plataforma.
-- ----------------------------------------------------------------------------
-- Onde rodar:
--   * Supabase Studio  -> SQL Editor (papel `postgres`), OU
--   * psql:  psql "$DATABASE_URL" -f supabase/scripts/create_admin_user.sql
--            (local:  postgresql://postgres:postgres@127.0.0.1:54322/postgres)
--
-- IMPORTANTE:
--   * Edite `v_email` antes de rodar.
--   * `v_password` é gerada ALEATORIAMENTE por padrão. Anote a senha exibida no
--     aviso (NOTICE) ao final e troque-a no primeiro acesso — ou defina a sua
--     própria em `v_password` antes de executar.
--   * Idempotente: se o e-mail já existir, apenas promove a conta a super-admin.
--
-- Por que SQL e não a coluna direto: o trigger anti-escalação bloqueia mudanças
-- em is_super_admin vindas de requests autenticados (anon/authenticated). Rodando
-- como `postgres`/`service_role` (SQL editor) a promoção é permitida.
-- ============================================================================

DO $$
DECLARE
  v_email    text := 'admin@orientador.local';                          -- << EDITE
  v_name     text := 'Super Admin';
  v_password text := encode(extensions.gen_random_bytes(12), 'base64');  -- aleatória; ou defina a sua
  v_user_id  uuid;
BEGIN
  SELECT id INTO v_user_id FROM auth.users WHERE email = v_email;

  IF v_user_id IS NULL THEN
    v_user_id := gen_random_uuid();

    -- Usuário de autenticação já confirmado (email_confirmed_at = now()).
    -- As colunas de token vão como '' (string vazia): o GoTrue lê esses campos
    -- como string não-anulável e quebra o login se ficarem NULL.
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data,
      confirmation_token, recovery_token,
      email_change, email_change_token_new, email_change_token_current,
      phone_change, phone_change_token, reauthentication_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000', v_user_id, 'authenticated', 'authenticated',
      v_email, extensions.crypt(v_password, extensions.gen_salt('bf')),
      now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name', v_name),
      '', '', '', '', '', '', '', ''
    );

    -- Identidade do provedor de e-mail (necessária para login por senha).
    INSERT INTO auth.identities (
      id, user_id, provider_id, provider, identity_data,
      last_sign_in_at, created_at, updated_at
    ) VALUES (
      gen_random_uuid(), v_user_id, v_email, 'email',
      jsonb_build_object('sub', v_user_id::text, 'email', v_email, 'email_verified', true),
      now(), now(), now()
    );

    RAISE NOTICE '--------------------------------------------------------------';
    RAISE NOTICE 'Super-admin CRIADO.';
    RAISE NOTICE '  E-mail: %', v_email;
    RAISE NOTICE '  Senha : %   (troque após o primeiro acesso)', v_password;
    RAISE NOTICE '--------------------------------------------------------------';
  ELSE
    RAISE NOTICE 'Usuário % já existe — apenas promovendo a super-admin.', v_email;
  END IF;

  -- O trigger handle_new_user já criou o profile; aqui promovemos a super-admin.
  UPDATE public.profiles
     SET is_super_admin = true,
         full_name = COALESCE(NULLIF(full_name, ''), v_name)
   WHERE id = v_user_id;

  RAISE NOTICE 'OK: % agora é super-admin (is_super_admin = true).', v_email;
END $$;
