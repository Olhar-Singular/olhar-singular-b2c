-- ============================================================================
-- Cria (ou promove) um SUPER-ADMIN da plataforma.
-- ----------------------------------------------------------------------------
-- Onde rodar:
--   * Supabase Studio  -> SQL Editor (papel `postgres`), OU
--   * psql:  psql "$DATABASE_URL" -f supabase/scripts/create_admin_user.sql
--            (local:  postgresql://postgres:postgres@127.0.0.1:54322/postgres)
--
-- ANTES DE RODAR, edite no bloco DECLARE:
--   * v_email    -> e-mail do super-admin
--   * v_password -> a SENHA que você quer (mínimo 8 caracteres)
--
-- Comportamento:
--   * Se o e-mail NÃO existir: cria a conta (já confirmada) com essa senha.
--   * Se já existir: REDEFINE a senha para v_password e promove a super-admin.
--   Depois é só logar normalmente em /auth com esse e-mail + senha.
--
-- Por que SQL e não mexer na coluna direto: o trigger anti-escalação bloqueia
-- mudanças em is_super_admin vindas de requests autenticados (anon/authenticated).
-- Rodando como `postgres`/`service_role` (SQL editor) a promoção é permitida.
-- ============================================================================

DO $$
DECLARE
  v_email    text := 'admin@orientador.local';   -- << EDITE: e-mail do admin
  v_password text := 'troque-esta-senha';        -- << EDITE: defina a SUA senha (mín. 8 caracteres)
  v_name     text := 'Super Admin';
  v_user_id  uuid;
BEGIN
  -- Trava de segurança: não roda com o placeholder nem com senha curta.
  IF v_password IN ('troque-esta-senha', '') OR length(v_password) < 8 THEN
    RAISE EXCEPTION 'Defina v_password (mínimo 8 caracteres) antes de rodar o script.';
  END IF;

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

    RAISE NOTICE 'Super-admin CRIADO: %  (use a senha que você definiu).', v_email;
  ELSE
    -- Já existe: redefine a senha para a que você escolheu.
    UPDATE auth.users
       SET encrypted_password = extensions.crypt(v_password, extensions.gen_salt('bf')),
           email_confirmed_at  = COALESCE(email_confirmed_at, now()),
           updated_at          = now()
     WHERE id = v_user_id;

    RAISE NOTICE 'Usuário % já existia — senha REDEFINIDA e promovendo a super-admin.', v_email;
  END IF;

  -- O trigger handle_new_user já criou o profile; aqui promovemos a super-admin.
  UPDATE public.profiles
     SET is_super_admin = true,
         full_name = COALESCE(NULLIF(full_name, ''), v_name)
   WHERE id = v_user_id;

  RAISE NOTICE 'OK: % agora é super-admin. Faça login em /auth com esse e-mail e senha.', v_email;
END $$;
