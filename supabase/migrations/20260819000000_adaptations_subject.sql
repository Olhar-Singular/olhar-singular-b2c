-- =============================================================================
-- Pastas por matéria em `adaptations`.
--
-- Coluna, não tabela de pastas: as 12 matérias já são uma lista fixa do domínio
-- (`src/lib/utils/constants.ts` → SUBJECTS + normalizeSubject) e o
-- `question_bank` já resolve o mesmo problema com `subject text` puro. Uma
-- tabela só se pagaria se o professor pudesse criar pasta com nome livre.
--
-- NULLABLE de propósito. 'Geral' é um valor REAL de SUBJECTS, então não serve
-- de sentinela para "não classificada" — com DEFAULT 'Geral' perde-se a
-- distinção entre "escolheu Geral" e "nunca classificou". NULL = sem pasta.
--
-- NUNCA NOT NULL: `buildAdaptationInsert`
-- (supabase/functions/_shared/adaptationPersistence.ts) não passa subject, e
-- esse INSERT acontece ANTES de liquidar a reserva de crédito. Quebrá-lo
-- transformaria toda geração paga em estorno.
--
-- Sem CHECK constraint: a lista canônica vive no domínio TypeScript, mesma
-- decisão já tomada para question_bank.subject. Um CHECK aqui obrigaria uma
-- migration a cada matéria nova.
--
-- Aditiva: só a coluna. As policies de `adaptations` são row-level sobre
-- user_id e o GRANT é table-wide, então elas cobrem a coluna nova
-- automaticamente — nenhuma policy nova é necessária.
--
-- SEM índice, de propósito. A listagem busca todas as adaptações do usuário e
-- agrupa por matéria no cliente; não há nenhuma query com `where subject = ?`.
-- Um btree (user_id, subject, updated_at DESC) não ajudaria nem a ordenação:
-- com `subject` sem filtro no meio, o Postgres não consegue extrair a ordem já
-- pronta e cai em Sort do mesmo jeito. O `idx_adaptations_user_updated`
-- (20260604000000) já serve a listagem. Índice a mais aqui seria só custo de
-- escrita. Quando existir uma query real que filtre por pasta, o índice certo
-- é (user_id, subject) WHERE subject IS NOT NULL — e aí ele se paga.
--
-- Depois de aplicar: `make gen-types`.
-- =============================================================================

ALTER TABLE public.adaptations
  ADD COLUMN IF NOT EXISTS subject text;

COMMENT ON COLUMN public.adaptations.subject IS
  'Matéria escolhida pelo professor — a "pasta" na lista de adaptações. '
  'NULL = não classificada. Valores canônicos em src/lib/utils/constants.ts.';
