-- =============================================================================
-- Pastas com nome livre para a biblioteca de adaptações.
--
-- Por que TABELA e não uma coluna de texto (como `adaptations.subject`):
-- o nome é escolhido pelo professor, então renomear "Recuperação 2º bimestre"
-- teria de ser um UPDATE em N linhas, um erro de digitação criaria uma pasta
-- duplicada em silêncio, e não existiria pasta vazia — ela só apareceria depois
-- de já ter conteúdo. Com tabela, renomear é um UPDATE só e a pasta existe
-- antes de receber a primeira adaptação.
--
-- `subject` CONTINUA existindo e não é substituído: pasta é a organização
-- principal (livre: "6º ano B", "Recuperação"), matéria é faceta de filtro. Os
-- dois respondem perguntas diferentes, e a lista fixa de matérias não expressa
-- "6º ano". O tipo (prova/exercício/texto/projeto) já vive em
-- `adaptations.activity_type` — nada novo é necessário para ele.
--
-- Um nível só: sem `parent_id`. Cobre o que foi pedido sem ter de tratar
-- ciclos nem mover subárvores; um parent_id pode ser acrescentado depois sem
-- refazer nada.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.adaptation_folders (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.adaptation_folders IS
  'Pastas nomeadas pelo professor para organizar a biblioteca de adaptações.';

-- Duas pastas com o mesmo nome para o mesmo dono são erro de digitação, não
-- intenção. Case-insensitive: "Geografia" e "geografia" são a mesma pasta.
-- lower() + btrim(): "Geografia", "geografia" e "Geografia " são a mesma pasta.
-- Sem o btrim, um espaço invisível no fim criaria uma segunda pasta idêntica na tela.
CREATE UNIQUE INDEX IF NOT EXISTS idx_adaptation_folders_user_name
  ON public.adaptation_folders (user_id, lower(btrim(name)));

ALTER TABLE public.adaptation_folders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own adaptation_folders"
  ON public.adaptation_folders FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own adaptation_folders"
  ON public.adaptation_folders FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own adaptation_folders"
  ON public.adaptation_folders FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own adaptation_folders"
  ON public.adaptation_folders FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- GRANT explícito: a RLS decide QUAIS linhas, o GRANT decide se o papel pode
-- sequer tentar. Sem ele o Postgres levanta "permission denied for table" antes
-- de avaliar a policy. Este projeto não herda grants (ver 20260622000000).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.adaptation_folders TO authenticated;
-- Explícito, mesmo com o ALTER DEFAULT PRIVILEGES de 20260722000002: é o que
-- credit_reservations fez, e o histórico registra um incidente de service_role
-- sem acesso numa base recém-criada do CI.
GRANT ALL ON public.adaptation_folders TO service_role;

CREATE TRIGGER handle_adaptation_folders_updated_at
  BEFORE UPDATE ON public.adaptation_folders
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ── Vínculo da adaptação com a pasta ─────────────────────────────────────────
--
-- ON DELETE SET NULL: apagar a pasta NÃO apaga as provas dentro dela — elas
-- voltam para "Sem pasta". Perder trabalho pago por excluir uma pasta seria
-- inaceitável. Nullable pela mesma razão de `subject`: o INSERT do servidor
-- (buildAdaptationInsert) roda antes de liquidar o crédito e não passa pasta.
ALTER TABLE public.adaptations
  ADD COLUMN IF NOT EXISTS folder_id uuid
  REFERENCES public.adaptation_folders(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.adaptations.folder_id IS
  'Pasta onde o professor arquivou a adaptação. NULL = sem pasta.';

-- Diferente do índice por `subject` (que foi descartado por ser morto), este se
-- paga: o ON DELETE SET NULL precisa encontrar as adaptações de uma pasta, e
-- sem índice isso é seq scan na tabela inteira a cada exclusão de pasta.
CREATE INDEX IF NOT EXISTS idx_adaptations_folder
  ON public.adaptations (folder_id)
  WHERE folder_id IS NOT NULL;
