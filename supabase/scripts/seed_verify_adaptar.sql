-- =============================================================================
-- Seed: perfil de barreira para validar o fluxo "Adaptar" (verify-adaptar)
-- =============================================================================
-- Garante 1 perfil de barreira COM barreiras reais para o usuário de teste
-- (teste@teste.com, criado por seed_test_user.sql). Idempotente.
--
-- Por que barreiras reais: o passo "Barreiras" do wizard TRAVA com um perfil
-- vazio ("O perfil selecionado não possui barreiras"). A coluna `barriers` é
-- text[] com as CHAVES PLANAS do catálogo BARRIER_DIMENSIONS
-- (src/lib/domain/barriers.ts) — ex.: tea_abstracao, tea_comunicacao_social.
--
-- Rodar via `make verify-adaptar` (depois de seed_test_user.sql). NÃO fica no
-- fluxo de migrations; NÃO roda em `supabase db reset`.
-- =============================================================================

DO $$
DECLARE
  v_user_id uuid;
  v_email   text := 'teste@teste.com';
  v_name    text := 'Aluno Teste (verify)';
BEGIN
  SELECT id INTO v_user_id FROM auth.users WHERE email = v_email;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuário % não existe — rode seed_test_user.sql antes.', v_email;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.barrier_profiles
    WHERE user_id = v_user_id AND name = v_name
  ) THEN
    RAISE NOTICE 'Perfil de barreira "%" já existe para % — nada a fazer', v_name, v_email;
    RETURN;
  END IF;

  INSERT INTO public.barrier_profiles (user_id, name, barriers, observation)
  VALUES (
    v_user_id,
    v_name,
    ARRAY['tea_abstracao', 'tea_comunicacao_social'],
    'Perfil seed para validar o fluxo Adaptar (verify-adaptar).'
  );

  RAISE NOTICE '✓ Perfil "%" criado para % (barreiras: tea_abstracao, tea_comunicacao_social)', v_name, v_email;
END $$;
