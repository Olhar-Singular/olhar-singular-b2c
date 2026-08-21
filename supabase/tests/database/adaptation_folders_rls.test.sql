-- =============================================================================
-- adaptation_folders — RLS e a propriedade que não pode falhar nunca:
-- excluir uma pasta NÃO apaga as adaptações que estavam nela.
--
-- Uma adaptação é trabalho pago (a linha é escrita pela edge function antes de
-- liquidar a reserva de crédito). Se o FK fosse ON DELETE CASCADE, um clique em
-- "excluir pasta" apagaria provas compradas. É o teste 9 aqui que prova que não.
-- =============================================================================
BEGIN;
SELECT plan(11);

INSERT INTO auth.users (id, email) VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'dona@test.com'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'estranha@test.com');

INSERT INTO public.adaptation_folders (id, user_id, name) VALUES
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '6º ano B'),
  ('22222222-2222-4222-8222-222222222222', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Recuperação');

SELECT is(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.adaptation_folders'::regclass),
  true, 'RLS está ligada em adaptation_folders');

-- ═══════════════════════════════════════════════════════════════════════════
-- Isolamento entre donos
-- ═══════════════════════════════════════════════════════════════════════════
SELECT set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}', true);
SET LOCAL role authenticated;

SELECT is((SELECT count(*)::int FROM public.adaptation_folders), 1,
  'a dona enxerga só a própria pasta');

WITH u AS (
  UPDATE public.adaptation_folders SET name = 'invadida'
  WHERE id = '22222222-2222-4222-8222-222222222222' RETURNING 1)
SELECT is((SELECT count(*)::int FROM u), 0,
  'não dá para renomear a pasta de outra pessoa');

WITH d AS (
  DELETE FROM public.adaptation_folders
  WHERE id = '22222222-2222-4222-8222-222222222222' RETURNING 1)
SELECT is((SELECT count(*)::int FROM d), 0,
  'não dá para excluir a pasta de outra pessoa');

SELECT throws_ok(
  $$ INSERT INTO public.adaptation_folders (user_id, name)
     VALUES ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'forjada') $$,
  '42501', NULL, 'não dá para criar pasta no nome de outra pessoa');

-- ═══════════════════════════════════════════════════════════════════════════
-- Nome duplicado é erro de digitação, não intenção
-- ═══════════════════════════════════════════════════════════════════════════
SELECT throws_ok(
  $$ INSERT INTO public.adaptation_folders (user_id, name)
     VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '6º ANO B') $$,
  '23505', NULL, 'pasta repetida com outra caixa é recusada');

SELECT throws_ok(
  $$ INSERT INTO public.adaptation_folders (user_id, name)
     VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '  6º ano B  ') $$,
  '23505', NULL, 'pasta repetida com espaço nas pontas é recusada');

SELECT lives_ok(
  $$ INSERT INTO public.adaptation_folders (user_id, name)
     VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Recuperação') $$,
  'o mesmo nome pode existir para donos diferentes');

-- ═══════════════════════════════════════════════════════════════════════════
-- Excluir a pasta NÃO apaga a adaptação (trabalho pago)
-- ═══════════════════════════════════════════════════════════════════════════
INSERT INTO public.adaptations (id, user_id, title, original_activity, adaptation_result, folder_id)
VALUES ('33333333-3333-4333-8333-333333333333',
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Prova de Geografia', 'atividade',
        '{}'::jsonb, '11111111-1111-4111-8111-111111111111');

DELETE FROM public.adaptation_folders WHERE id = '11111111-1111-4111-8111-111111111111';

SELECT is((SELECT count(*)::int FROM public.adaptations
  WHERE id = '33333333-3333-4333-8333-333333333333'), 1,
  'excluir a pasta NÃO apaga a adaptação que estava nela');

SELECT is((SELECT folder_id FROM public.adaptations
  WHERE id = '33333333-3333-4333-8333-333333333333'), NULL,
  'a adaptação órfã volta para "sem pasta" (ON DELETE SET NULL)');

RESET role;

-- ═══════════════════════════════════════════════════════════════════════════
-- O servidor continua enxergando tudo
-- ═══════════════════════════════════════════════════════════════════════════
SET LOCAL role service_role;
SELECT is((SELECT count(*)::int FROM public.adaptation_folders), 2,
  'service_role lê as pastas de todos (RLS não se aplica)');
RESET role;

SELECT * FROM finish();
ROLLBACK;
