# Salvar adaptação como questões no Banco + lidar com readaptação — Design

**Data:** 2026-08-14 · **Status:** aprovado (conversa) · **Escopo:** fluxo Adaptar (Exportar/Atividade) + Banco de Questões

## Objetivo

Hoje, uma adaptação gerada já fica salva na tabela `adaptations` (rascunho → pronta),
mas fica presa como "documento inteiro" — não vira questões individuais
reaproveitáveis no Banco de Questões.

Criar um recurso opcional ("se ele quiser") pra quebrar a adaptação em questões
individuais e salvá-las no Banco de Questões, já adaptadas, com o registro de quais
barreiras/recursos foram usados pra gerar aquela versão. Consequência que precisa ser
tratada: se o professor pegar uma dessas questões já-adaptadas do banco e mandar
adaptar de novo, o sistema deve lidar bem com isso — não é o mesmo caso de uma
questão "crua".

## Decisões (com o usuário)

- **Tipos de resposta:** salva os 8 tipos. Múltipla escolha/aberta ficam com
  `options`/`correct_answer` estruturados (como o banco já suporta hoje); os outros 5
  tipos (V/F, checkbox, associação, ordenação, lacuna, tabela) têm o gabarito
  serializado como texto legível no campo `resolution` — nada se perde, só fica sem
  estrutura pra esses casos.
- **Disciplina:** um diálogo curto pergunta a disciplina 1x antes de salvar,
  aplicada a todas as N questões extraídas daquela adaptação.
- **Readaptação de questão já adaptada:** aviso ao usuário (se as barreiras novas se
  sobrepõem às já aplicadas) E a IA fica sabendo via prompt (não desfaz/duplica
  trabalho já feito).

## Achados de viabilidade

1. O documento canônico já expõe tudo que precisamos: `data.result.document.blocks`
   (array, `Block[]`), filtrando `type === "question"` no nível raiz
   (`src/lib/adaptation/canonical/schema.ts`). Cada questão tem `stem` (rich
   content), `answer` (union de 8 kinds), `instruction`/`enunciado` opcionais.
2. Já existe um serializador canônico→texto pronto pra copiar o padrão:
   `src/lib/adaptation/canonical/plainText.ts` (`richTextToText`, `answerToLines`) —
   cobre os 8 kinds de resposta como linhas de texto. Não precisa reinventar a
   lógica de "resposta como texto".
3. `adaptations` já guarda `barriers_used` (jsonb, `BarrierItem[]`) e
   `barrier_profile_id` — os dados de "quais barreiras foram usadas" já existem
   prontos, só faltam ser levados até o Banco.
4. `question_bank` **não tem** coluna de barreiras nem FK pra `adaptations` — vai
   ser a primeira relação desse tipo no schema. Precisa de migration.
5. `useInsertQuestions` (hook existente) força `source: "ai_extract"` e
   `difficulty: "medio"` — não dá pra reaproveitar direto; a inserção nova segue o
   padrão de `QuestionForm.tsx`/`ManualQuestionEditor.tsx` (insert direto via
   `supabase.from("question_bank")`), que já é o padrão dominante (2 de 3 pontos de
   escrita já fazem assim).
6. `question_bank.source`/`difficulty` são texto livre, sem CHECK constraint — um
   novo valor `source: "adaptation"` é seguro, sem migration de enum.
7. Não existe hoje nenhuma ligação entre um `question_bank.id` selecionado no picker
   e a `adaptations` gerada — o vínculo é hoje "só texto" (`buildActivityText`). Pra
   "readaptação inteligente" funcionar, essa granularidade por questão precisa ser
   preservada até o passo de Barreiras (que hoje só enxerga um blob de texto).
8. Padrões de UX já existentes e reaproveitáveis: badge de aviso não-bloqueante
   ("Duplicada" + "Forçar inclusão" em `QuestionBankPage.tsx`) e diálogo de
   confirmação bloqueante (`AlertDialog` do "Regerar adaptação?" em
   `CanonicalAdaptationWizard.tsx`) — a feature usa os dois, no lugar certo pra cada
   caso.

## Design

### Parte A — "Salvar como questões no Banco"

**Migration nova** (`supabase/migrations/`, revisão via agente `migration-reviewer`
antes do push):
```sql
ALTER TABLE public.question_bank
  ADD COLUMN adapted_barriers jsonb,              -- snapshot de BarrierItem[] ativos usados
  ADD COLUMN source_adaptation_id uuid REFERENCES public.adaptations(id) ON DELETE SET NULL;
```
RLS não muda — a policy `owner_questions` (`FOR ALL USING created_by = auth.uid()`)
já cobre as colunas novas automaticamente. `source_adaptation_id` é a primeira FK
apontando pra `adaptations.id` no schema — `ON DELETE SET NULL` pra não travar a
exclusão de uma adaptação antiga.

**Extração/mapeamento** — novo módulo
`src/lib/adaptation/canonical/toBankQuestions.ts` (+ `.test.ts`):
- `document.blocks.filter(b => b.type === "question")` (nível raiz — questões
  aninhadas em `stem` são sub-partes, não entram como linha própria, mesmo critério
  que `plainText.ts`/`exportDocx.ts` já usam pra numeração).
- Por questão: `text` = `stem` (+ `instruction`/`enunciado`) achatado com o padrão de
  `richTextToText` de `plainText.ts`; `resolution` = gabarito serializado via
  `answerToLines` (mesma função, todos os 8 kinds); `options`/`correct_answer` só
  preenchidos quando `answer.kind === "multipleChoice"` (`alternatives.map(content)`
  / `findIndex(correct)`); `image_url` = primeira `image` block dentro do `stem`, se
  houver.
- `adapted_barriers` = `data.barriers.filter(is_active)` (snapshot);
  `source_adaptation_id` = `draftId`; `source = "adaptation"`;
  `difficulty = "medio"` (mesmo default de hoje).

**Inserção** — novo hook `useSaveAdaptationAsQuestions`
(`src/hooks/useQuestionBank.ts`, ao lado dos outros), insert direto (padrão
`QuestionForm`/`ManualQuestionEditor`, não via `useInsertQuestions`) — aceita o
`subject` escolhido no diálogo + o array já mapeado.

**UI** — novo botão "Salvar no Banco de Questões" em `StepExportCanonical.tsx` (ao
lado do botão "Salvar" existente — mesmo padrão visual dos botões outline do
`ExportPanel`). `StepExportCanonical` ganha as props `barriers`/`barrierProfileId`/
`draftId` (hoje só recebe `result`) pra alimentar o mapeamento.
- Clique abre um diálogo curto (`Dialog`, shadcn) com: contagem de questões
  detectadas + seletor de Disciplina (mesma lista `SUBJECTS` do picker do banco)
  obrigatório → confirma → chama o hook → toast de sucesso ("N questões salvas no
  Banco de Questões").
- Dedup leve (mesmo padrão `normalizeTextForDedup` de `extraction-utils.ts`): se
  alguma questão já existir com texto quase igual no banco, mostra aviso
  não-bloqueante (mesmo "Duplicada"/"Forçar inclusão" de `QuestionBankPage.tsx`) em
  vez de duplicar silenciosamente.

### Parte B — Readaptar questão já adaptada

**Granularidade por questão precisa sobreviver até Barreiras** (hoje se perde em
`buildActivityText`):
- `BankQuestion` (`StepActivityInput.tsx`) e `SelectedQuestion` (`wizardState.ts`)
  ganham um campo opcional `adaptedBarriers?: BarrierItem[]` (lido da nova coluna).
- Badge "Já adaptada (TEA, TDAH)" no card do picker — mesmo padrão de badge
  (`Badge variant="outline"`) já usado pra subject/topic/difficulty/imagem.

**Aviso ao usuário** — no clique de "Adaptar" (fim de `StepBarrierSelection`), se
alguma questão selecionada tem `adaptedBarriers` cujo `dimension` colide com os
`data.barriers` ativos agora escolhidos → `AlertDialog` (mesmo componente/composição
do "Regerar adaptação?" já existente em `CanonicalAdaptationWizard.tsx`): título
"Barreiras já aplicadas nesta questão", descrição explicando a sobreposição, ação
"Adaptar mesmo assim" / "Cancelar".

**IA fica sabendo** — `buildActivityText()` ganha um marcador novo por questão
já-adaptada, no mesmo espírito do `[IMAGEM: url]` existente:
`[JÁ ADAPTADA PARA: tea, tdah]` logo após o texto da questão. `buildSystemPrompt()`
(`adaptationPrompt.ts`) ganha uma instrução nova explicando o marcador: não
desfazer/reverter as adaptações já indicadas, focar nas barreiras NOVAS pedidas
agora. Ambos com testes cobrindo o caso "com marcador" e "sem marcador"
(comportamento de hoje intacto quando ausente).

## Arquivos

**Novos:**
- `supabase/migrations/<timestamp>_question_bank_adaptation_link.sql` (+ pgTAP se a
  suíte já cobre `question_bank`)
- `src/lib/adaptation/canonical/toBankQuestions.ts` (+ `.test.ts`)
- Hook `useSaveAdaptationAsQuestions` em `src/hooks/useQuestionBank.ts` (+ testes)
- Diálogo de confirmação "Salvar no Banco" (componente novo, ou inline em
  `StepExportCanonical.tsx`)

**Modificados:**
- `src/components/adaptation/steps/export/StepExportCanonical.tsx` — novo botão +
  props novas (`barriers`, `barrierProfileId`, `draftId`)
- `src/components/adaptation/CanonicalAdaptationWizard.tsx` — repassa as props
  novas pro Exportar; novo `AlertDialog` de sobreposição de barreiras
- `src/components/adaptation/steps/activity-input/StepActivityInput.tsx` — badge
  "já adaptada", `select()` inclui `adapted_barriers`/`source_adaptation_id`
- `src/lib/adaptation/wizard/wizardState.ts` — `BankQuestion`/`SelectedQuestion`
  ganham `adaptedBarriers?`
- `src/components/adaptation/steps/activity-input/buildActivityText.ts` — marcador
  `[JÁ ADAPTADA PARA: ...]`
- `supabase/functions/_shared/adaptationPrompt.ts` — instrução nova sobre o marcador
- skill `dominio-orientador` — atualizar o mapa (nova coluna, novo fluxo)

**Reaproveitado sem alteração:** `plainText.ts` (padrão de serialização),
`AlertDialog` (mesma composição do "Regerar"), badge pattern de
`StepActivityInput.tsx`, dedup pattern (`normalizeTextForDedup`), RLS existente
(`owner_questions` já cobre as colunas novas).

## Ordem de implementação (TDD)

1. Migration + pgTAP (se aplicável) — `rls-policy-writer`/`migration-reviewer`.
2. `toBankQuestions.ts` + testes (os 8 kinds de resposta, com e sem imagem).
3. `useSaveAdaptationAsQuestions` + testes.
4. UI: botão + diálogo em `StepExportCanonical.tsx`, props novas no wizard.
5. `buildActivityText.ts` + `adaptationPrompt.ts` — marcador de já-adaptada + testes.
6. `StepActivityInput.tsx` — badge + select novo campo.
7. `AlertDialog` de sobreposição de barreiras em
   `CanonicalAdaptationWizard.tsx`/`StepBarrierSelection.tsx`.
8. Validação E2E via skill `validate-adaptar`: gerar adaptação → salvar no banco →
   conferir linhas criadas com barreiras certas → selecionar uma dessas questões de
   novo → escolher barreira sobreposta → conferir aviso → adaptar mesmo assim →
   conferir que o marcador chegou no prompt.
9. Atualizar skill `dominio-orientador`.

## Riscos

- Primeira FK de `question_bank` pra `adaptations` — migration pequena, mas ainda é
  mudança de schema em produção; seguir o processo normal (`migration-reviewer`
  antes de `db-push`).
- "Sobreposição de barreiras" é uma checagem client-side por `dimension` (não por
  `barrier_key` específico) — pode gerar falso-positivo (ex.: professor selecionou
  "tea_sobrecarga_sensorial" antes e agora seleciona "tea_comunicacao_social", mesma
  dimensão `tea` mas barreira diferente) — aceitável como heurística de aviso, não
  bloqueio.
- Texto sem estrutura (os 5 tipos de resposta não-múltipla-escolha) fica em
  `resolution` como texto corrido — legível, mas não editável de forma estruturada
  de volta no Banco (mesma limitação que uma questão dissertativa já tem hoje).

## Verificação

- Vitest: `toBankQuestions.test.ts` cobrindo os 8 kinds; testes do hook novo; testes
  do marcador no prompt (com/sem). Gate 100% mantido.
- pgTAP: nova migration coberta (RLS das colunas novas continua owner-only, herdado
  da policy existente — sem policy nova necessária, mas vale um teste confirmando).
- E2E manual via `validate-adaptar`: fluxo completo descrito no passo 8 da ordem de
  implementação.
