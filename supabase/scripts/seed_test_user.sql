-- =============================================================================
-- Seed: usuário de teste (professor)
-- =============================================================================
-- Cria um usuário professor padrão para testes locais.
--
-- Email:    teste@teste.com
-- Senha:    123123
-- Role:     professor (default em public.profiles)
--
-- Idempotente: se o usuário já existe, não faz nada e apenas reporta.
-- NÃO fica no fluxo de migrations — rodar manualmente via `make db-seed-test-user`
-- ou psql direto. Não roda em `supabase db reset`.
-- =============================================================================

DO $$
DECLARE
  v_user_id uuid;
  v_email   text := 'teste@teste.com';
  v_pass    text := '123123';
  v_name    text := 'Professor Teste';
BEGIN
  -- Short-circuit se o usuário já existe
  SELECT id INTO v_user_id FROM auth.users WHERE email = v_email;

  IF v_user_id IS NOT NULL THEN
    RAISE NOTICE 'Usuário já existe: % (id: %) — nada a fazer', v_email, v_user_id;
    RETURN;
  END IF;

  v_user_id := gen_random_uuid();

  -- auth.users — bcrypt via pgcrypto (extensão já instalada pelo Supabase)
  INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    created_at,
    updated_at,
    raw_app_meta_data,
    raw_user_meta_data,
    is_super_admin,
    confirmation_token,
    email_change,
    email_change_token_new,
    recovery_token
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    v_user_id,
    'authenticated',
    'authenticated',
    v_email,
    crypt(v_pass, gen_salt('bf')),
    now(),
    now(),
    now(),
    jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
    jsonb_build_object('name', v_name),
    false,
    '',
    '',
    '',
    ''
  );

  -- auth.identities — obrigatório para auth via email/senha
  -- provider_id = user_id é o padrão do Supabase para provider 'email'
  INSERT INTO auth.identities (
    id,
    user_id,
    provider_id,
    provider,
    identity_data,
    last_sign_in_at,
    created_at,
    updated_at
  ) VALUES (
    gen_random_uuid(),
    v_user_id,
    v_user_id::text,
    'email',
    jsonb_build_object(
      'sub', v_user_id::text,
      'email', v_email,
      'email_verified', true,
      'phone_verified', false
    ),
    now(),
    now(),
    now()
  );

  -- Observação: public.profiles é criado automaticamente pelo trigger
  -- `on_auth_user_created` que chama `handle_new_user()`.
  -- O role default em profiles já é 'professor'.

  RAISE NOTICE '✓ Usuário criado: % (id: %)', v_email, v_user_id;
  RAISE NOTICE '  Senha: %', v_pass;
  RAISE NOTICE '  Role:  professor';
END $$;
