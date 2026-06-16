# Mais tipos de questão no Banco de Questões + Extração + Adaptar

**Data:** 2026-06-08
**Status:** Design aprovado (escopo), aguardando revisão do spec

## Objetivo

Hoje o Banco de Questões só modela 2 tipos (dissertativa = sem `options`; objetiva =
`options[]` + `correct_answer`). O Adaptar suporta 8 tipos canônicos. Adicionar ao banco,
à extração por IA, ao "Nova Questão" (manual) e ao fluxo Adaptar os **3 tipos comuns que
faltam**, com paridade de nomes com o canônico:

- `trueFalse` — Verdadeiro/Falso (lista de afirmações, cada uma V ou F)
- `checkbox` — Múltipla seleção (várias corretas)
- `fillBlank` — Completar lacunas

Tipos já existentes (mantidos): `open` (dissertativa) e `multipleChoice` (objetiva).

**Fora de escopo:** `matching`, `ordering`, `table` (raros em provas, edição complexa);
RichText/Tiptap no banco (o banco continua com strings simples); `answerLines`.

## Decisões (do brainstorming)

- **5 tipos:** open, multipleChoice, trueFalse, checkbox, fillBlank.
- **Modelo de dados:** coluna `question_type` (nomes iguais ao canônico) + `type_data` jsonb,
  strings simples — NÃO reusar o `answer` canônico (evita RichText/UUID no banco).
- **Superfícies:** extração (revisão inline) **e** "Nova Questão" (`QuestionForm` manual).
- **Conversão banco → Adaptar:** entra agora (via `buildActivityText`, não via mapper canônico).

## Modelo de dados

Migration nova em `supabase/migrations/` adiciona a `question_bank`:

- `question_type text NOT NULL DEFAULT 'open'` com `CHECK (question_type IN
  ('open','multipleChoice','trueFalse','checkbox','fillBlank'))`.
- `type_data jsonb` (nullable) — payload específico por tipo.
- **Backfill:** `UPDATE question_bank SET question_type = CASE WHEN options IS NOT NULL
  THEN 'multipleChoice' ELSE 'open' END;`
- RLS inalterada (owner-based; nenhuma tabela nova). `make gen-types` após aplicar.
- Revisar com o agente `migration-reviewer` antes de `db-push`.

Shapes por tipo (o que vive onde):

| Tipo | `text` | `options` | `correct_answer` | `type_data` |
|------|--------|-----------|------------------|-------------|
| `open` | enunciado | null | null | null |
| `multipleChoice` | enunciado | string[] (2–5) | int 0-based ou null/-1 | null |
| `checkbox` | enunciado | string[] (2–5) | null | `{ correct: number[] }` (índices, ≥1) |
| `trueFalse` | enunciado | null | null | `{ items: [{ statement: string, value: boolean }] }` (≥1) |
| `fillBlank` | enunciado com lacunas `___` | null | null | `{ gaps: [{ answer: string, alternatives?: string[] }] }` (≥1) |

Reusar `options` para `multipleChoice`/`checkbox` mantém o render e o `OptionsEditor`
existentes; o que muda em checkbox é só o conjunto de corretas (em `type_data`).

## Camadas e unidades

### 1. Domínio — `src/lib/domain/`
- `questionType.ts` (novo): `QuestionType` (union) + `QUESTION_TYPES` (lista com label pt-BR
  para os selects) + helpers (`isObjective`, etc.).
- `questionParser.ts`: `ExtractedQuestion` ganha `question_type` + `type_data` tipado;
  `validateExtractedQuestions` valida por tipo:
  - `multipleChoice`: options 2–5; `correct_answer` em range ou -1/null (regra atual mantida).
  - `checkbox`: options 2–5; `correct` = índices válidos, dedup, ≥1; índices fora de range
    são removidos com warning; se sobrar 0 → descarta com warning.
  - `trueFalse`: ≥1 item; cada `statement` não-vazio; `value` boolean.
  - `fillBlank`: ≥1 gap; cada `answer` não-vazio; `alternatives` opcional (strings não-vazias).
  - `open`: sem campos extra.
  - Sem `question_type` no input → infere (`options` presente → multipleChoice; senão open),
    pra back-compat com payloads antigos.

### 2. Componentes de edição compartilhados — `src/components/forms/`
Reusados por `QuestionForm` (manual) **e** pela revisão da extração:
- `QuestionTypeSelect.tsx` — escolhe entre os 5 tipos (labels pt-BR).
- `TrueFalseEditor.tsx` — lista de afirmações: add/remover/editar + toggle V/F.
- `CheckboxOptionsEditor.tsx` — alternativas com **múltiplas** corretas (ou estender
  `OptionsEditor` com modo `multiple`; decisão de implementação no plano).
- `FillBlankEditor.tsx` — lista de lacunas (`answer` + `alternatives?`), com dica de usar
  `___` no enunciado.
- `QuestionTypeFields.tsx` — dispatcher que, dado `question_type`, renderiza o editor certo
  e emite `(question_type, options, correct_answer, type_data)`.
- `multipleChoice` continua usando o `OptionsEditor` já existente (1 correta).

### 3. Exibição read-only — `src/components/forms/QuestionView.tsx` (novo)
Renderiza cada tipo (afirmações V/F, alternativas com múltiplas corretas, frase com lacunas).
Usado na aba **Questões** (`QuestionBankPage`) e nos cards de revisão fora de edição,
substituindo o bloco inline atual de options.

### 4. QuestionForm (manual)
Adicionar `QuestionTypeSelect` + `QuestionTypeFields`; salvar `question_type` + `type_data`
no insert/update. Manter o comportamento atual de MC/dissertativa.

### 5. Extração (IA) — `supabase/functions/extract-questions/index.ts`
- Schema `save_questions`: adicionar `question_type` (enum) + campos por tipo
  (`tf_items`, `checkbox_correct`, `fill_gaps`) — mantendo `options`/`correct_answer` p/ MC.
- Prompt: instruir a **classificar** o tipo e preencher a estrutura certa (o multi-formato
  textual já foi adicionado; agora vira dado estruturado).
- `handleExtract` (QuestionBankPage): mapear a saída da IA → `ExtractedQuestion`
  (question_type + type_data), aplicando `stripOptionMarker` nas alternativas como hoje.

### 6. Conversão banco → Adaptar
- `StepActivityInput.tsx`: query passa a selecionar `question_type, type_data`;
  `BankQuestion`/`SelectedQuestion` ganham esses campos.
- `buildActivityText.ts`: estender a serialização por tipo, pra a IA do `adapt-activity`
  reconstruir o canônico fielmente:
  - `trueFalse`: lista "( ) V ( ) F" por afirmação.
  - `checkbox`: alternativas com marcação "[ ]" (múltipla seleção).
  - `fillBlank`: enunciado preservando as lacunas `___`.
  - `multipleChoice`/`open`: como hoje.
- Sem mudança no `adapt-activity` (a IA já suporta esses tipos no `AiActivitySchema`).

### 7. Testes (TDD, cobertura 100%)
- `questionParser` por tipo; cada editor; `QuestionView`; `QuestionForm`; `QuestionBankPage`
  (extração + edição + display); `buildActivityText` por tipo.
- `index.ts` da edge function é excluído de cobertura (sem teste Vitest).
- Migration revisada pelo `migration-reviewer` antes do push.

## Ordem de implementação (lotes TDD)

1. Migration + domínio (`questionType`, validação) + `gen-types`.
2. Editores compartilhados + `QuestionView`.
3. `QuestionForm` (manual).
4. Extração: schema/prompt + `handleExtract` + validação.
5. Revisão: fiar editores/`QuestionView` no card.
6. `buildActivityText` + `StepActivityInput`/`SelectedQuestion`.
7. Suíte completa + lint + typecheck + revisão da migration.

## Riscos / atenção

- **Cobertura 100%:** cada branch novo (por tipo) precisa de teste; é o maior custo.
- **Back-compat:** questões antigas sem `question_type` (default `open`) e MC antigas
  (backfill) devem continuar abrindo/editando/listando normalmente.
- **fillBlank:** contagem de `___` no enunciado idealmente bate com nº de gaps — validar com
  warning, não bloquear (a IA pode errar).
- **Edge function não deployada automaticamente** — mudança de prompt/schema só vale em prod
  após deploy (`make fn-deploy fn=extract-questions`).
