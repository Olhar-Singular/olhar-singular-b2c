# Reestruturação do "Adaptar" para modelo canônico — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development` (recomendado) ou `superpowers:executing-plans` para implementar tarefa-a-tarefa. Steps usam checkbox (`- [ ]`).
> **Spec de referência:** [docs/superpowers/specs/2026-06-03-adaptar-restructure-design.md](../specs/2026-06-03-adaptar-restructure-design.md) (inclui §10 análise SSOT e §9 perguntas).

**Goal:** Substituir a arquitetura textarea-sobre-DSL do fluxo "Adaptar" por um **documento canônico único** (JSON ProseMirror/Tiptap validado por Zod) como fonte única da verdade — matando as ~14 verdades duplicadas (SSOT) que causam edita-e-volta / formatação muda / perda de estado.

**Architecture:** Um schema Zod define o documento canônico (blocos + interação de questão estilo QTI `{cardinality × baseType}` + math/imagem/scaffold como nós de 1ª classe, ids estáveis intrínsecos). A edge function de IA emite esse JSON via structured outputs do Google Gemini + validação Zod (cobra crédito só no sucesso). O editor Tiptap muta o documento direto; **um** renderer projeta o mesmo JSON para preview/viewer/PDF. Persistência = um `jsonb` com autosave em **duas superfícies** (edição de texto e estilização), sem perda de dados entre elas. DSL deletado.

**Tech Stack:** React 18 + TS + Vite · Tiptap/ProseMirror (`@tiptap/*` já instalado) · Zod (instalado) + `zod-to-json-schema` (adicionar) · KaTeX (instalado) · `@react-pdf/renderer` (adicionar) · Supabase (edge functions Deno + Postgres/RLS) · Google Gemini (`AI_API_KEY`, endpoint OpenAI-compat — structured outputs nativo) · Vitest + pgTAP.

---

## Decisões travadas (respostas do usuário, 2026-06-03)

| Ref | Decisão |
|-----|---------|
| Q1 | **Reestruturar** os internos (não portar DSL). |
| Q5/Q6 | Editor **Tiptap**; **documento canônico único** (interação QTI, ids estáveis). |
| Q7 | IA emite **structured outputs + Zod**; retorna **um** documento. |
| Q12 | **Duas superfícies**: edição de conteúdo ↔ estilização/preview; navegar entre elas **sem perder dados**. |
| Q13 | Modo manual **adiado** (mesmo fluxo, sem IA, depois). |
| Q14 | **Painel de export** (não WYSIWYG completo separado). |
| Q15 | **Regenerar completo** obrigatório (regenera a atividade inteira, confirmado). |
| Q4 | **Tudo de uma vez** — sem Fase 0 isolada; milestones são ordem de build, uma entrega coesa. |
| Q3 / persist. | **Salvar antes da tela de export**; **persistir todos os dados a cada etapa** das duas superfícies (texto + estilo), só dessas duas. |
| Q-crédito | **Falhou → não cobra crédito**; cobra só se retornou e processou tudo certo. |
| Q8 | Corrigir `sanitize.ts` (escapar, não deletar). |
| Q24 | Resolvido: provider = Google Gemini direto (suporta structured outputs). |

**Confirmações finais (2026-06-03):** **estilização v1 = TODOS os atributos** por nó (fonte, tamanho, cor, alinhamento, espaçamento, quebra-de-página) — entram já no schema M1; **regenerar = só atividade inteira** (dropar `regenerate-question` + painel + hook); **DOCX e compartilhamento = depois**; **cobertura = 100% mantida** (sem exclusão geral p/ NodeViews — lógica em funções puras testadas + glue fino + `/* v8 ignore */` só para paths genuinamente inalcançáveis em jsdom, como o codebase já faz).

**Outros defaults (confirmar se divergir):** Q2/Q3 adiados; Q9/Q10 tabela+blob conforme spec; Q11 autosave sem CRDT; Q16/Q17 `@react-pdf` + um renderer; Q18 LaTeX+MathML/aria; Q19 imagem como atributo de nó; Q20 descartar linhas legadas (save quebrado ⇒ ~0 dados); Q22 gabarito/points first-class; Q23 cor por allowlist; Q-selected mapear `selectedQuestions` no input.

---

## Estrutura de arquivos (criar / modificar / deletar)

**Criar** (`src/lib/adaptation/canonical/`):
- `schema.ts` — Zod do documento canônico + tipos TS inferidos + `SCHEMA_VERSION`.
- `jsonSchema.ts` — `zod-to-json-schema` para o contrato da IA.
- `ids.ts` — geração de id estável (`crypto.randomUUID`) + helpers.
- `colors.ts` — allowlist de cores + validador.
- `validate.ts` — `validateDocument` / `safeParseDocument` + erros legíveis.
- `migrate.ts` — `migrateByVersion` (forward por `schemaVersion`).

**Criar** (`src/lib/adaptation/tiptap/`):
- `extensions.ts` — extensões/nós Tiptap (question, blockMath, inlineMath, image, scaffolding, uniqueId).
- `nodeviews/` — NodeViews React por tipo (`QuestionNodeView.tsx`, `ImageNodeView.tsx`, `MathNodeView.tsx`, `ScaffoldNodeView.tsx`).
- `toCanonical.ts` / `fromCanonical.ts` — ProseMirror doc ⇄ documento canônico (se não usar PM JSON direto).

**Criar** (`src/components/adaptation/`):
- `canonical-editor/CanonicalEditor.tsx` — superfície de **edição de conteúdo**.
- `styling/StylingSurface.tsx` — superfície de **estilização + preview**.
- `render/CanonicalRenderer.tsx` — **um** renderer (tela/viewer).
- `render/pdf/` — mappers `@react-pdf` por nó + `AdaptationPdf.tsx`.
- `steps/styling/`, `steps/export/` (reescrito).

**Criar** (persistência/histórico):
- `src/hooks/useAdaptationDraft.ts` — autosave debounced + concorrência otimista + espelho IndexedDB.
- `src/hooks/useAdaptations.ts` — leitura do histórico (centralizado).
- `src/pages/MyAdaptationsPage.tsx`, `src/pages/EditAdaptationPage.tsx`.
- `supabase/migrations/<ts>_adaptations_canonical.sql` — tabela canônica + RLS + trigger.
- `supabase/tests/database/adaptations_rls.test.sql` — pgTAP.

**Modificar:**
- `supabase/functions/adapt-activity/index.ts` — structured outputs + Zod + crédito-no-sucesso.
- `supabase/functions/_shared/sanitize.ts` — escapar, não deletar.
- `supabase/functions/_shared/adaptationCost.ts` (novo, extraído) — tabela de custo única (corrige T8); importada pelas duas functions.
- `src/components/adaptation/AdaptationWizard.tsx` — segurar o documento canônico; deletar estado dual; nova sequência de steps.
- `src/lib/domain/barriers.ts` — remover duplicação de custo (usar o módulo único).
- `src/App.tsx` — rotas `/historico` e `/adaptar/editar/:id`.
- `src/types/adaptation.ts` — substituir pelo tipo canônico (re-export do schema).

**Deletar** (a stack DSL — fósseis da arquitetura frágil): `src/components/editor/ActivityEditor.tsx`, `ActivityPreview.tsx`, `ActivityStatusBar.tsx`, `EditorToolbar.tsx` (+ testes); `src/lib/domain/activityDslConverter.ts`, `activityParser.ts`, `activityFormatter.ts`, `parseMarkdownInline.ts`, `normalizeAIText.ts` (+ testes); `src/lib/dsl/types.ts`; `src/hooks/useActivityContent.ts`; `src/lib/domain/adaptationWizardHelpers.ts` (reescrito como helpers do canônico); **`supabase/functions/regenerate-question/` (edge function inteira)**, `src/components/adaptation/steps/ai-editor/QuestionRegeneratePanel.tsx`, `src/hooks/useRegenerateQuestion.ts` (decisão: só regenerar atividade inteira).
**PRESERVAR:** `src/lib/domain/questionParser.ts` (usado pelo QuestionBank), `latexRenderer.ts` (KaTeX), `barriers.ts` (custo), `ImageManagerModal`/`ImageResizer`/`imageManagerUtils` (reusar no NodeView de imagem).

> ⚠️ Antes de deletar qualquer arquivo da stack DSL: `grep -rn "<arquivo>" src/` para confirmar zero importadores fora do adaptar (a §8 do spec mostra que `questionParser` é compartilhado com QuestionBank). tsconfig é não-estrito ⇒ quebras de import podem passar silenciosas; rodar `make typecheck` após cada deleção.

---

## Milestones (ordem de dependência)

- **M1 — Schema canônico (Zod).** A fundação. *(bite-sized abaixo.)*
- **M2 — Edge function de IA** (structured outputs, crédito-no-sucesso, sanitize, custo único, regenerate).
- **M3 — Editor Tiptap** sobre o canônico (nós custom, ids, history).
- **M4 — Renderer único** (tela/viewer; math KaTeX htmlAndMathml).
- **M5 — Wizard + duas superfícies** (conteúdo ↔ estilização/preview, SSOT, regenerar completo; deletar DSL).
- **M6 — Persistência** (migration canônica, autosave nas 2 superfícies, draft, concorrência otimista, espelho, histórico, editar-após-salvar, pgTAP, round-trip real).
- **M7 — Export** (PDF `@react-pdf` paridade-com-tela, copiar, painel de export).
- **M8 — Limpeza** (deletar DSL + testes mortos; gate de cobertura).

> Cada milestone (exceto M1) será **expandido para tarefas bite-sized TDD quando começarmos a executá-lo** — este documento trava arquitetura, arquivos, interfaces e ordem; o detalhamento fino de M2-M8 entra na execução para não escrever código que vai mudar ao aprender de M1.

---

## M1 — Schema canônico (Zod) — tarefas bite-sized

**Files:**
- Create: `src/lib/adaptation/canonical/ids.ts`, `colors.ts`, `schema.ts`, `jsonSchema.ts`, `validate.ts`
- Test: co-localizados `*.test.ts`

### Task 1.1: Geração de id estável

- [ ] **Step 1 — teste que falha** (`src/lib/adaptation/canonical/ids.test.ts`):

```ts
import { describe, it, expect } from "vitest";
import { newId, isId } from "./ids";

describe("ids", () => {
  it("gera ids únicos no formato uuid", () => {
    const a = newId(); const b = newId();
    expect(a).not.toBe(b);
    expect(isId(a)).toBe(true);
  });
  it("rejeita não-uuid", () => {
    expect(isId("")).toBe(false);
    expect(isId("abc")).toBe(false);
  });
});
```

- [ ] **Step 2 — rodar e ver falhar:** `make test` (ou `npx vitest run src/lib/adaptation/canonical/ids.test.ts`). Esperado: FAIL ("Cannot find module './ids'").
- [ ] **Step 3 — implementar mínimo** (`ids.ts`):

```ts
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function newId(): string { return crypto.randomUUID(); }
export function isId(v: unknown): v is string { return typeof v === "string" && UUID_RE.test(v); }
```

- [ ] **Step 4 — rodar e ver passar.** Esperado: PASS.
- [ ] **Step 5 — commit:** `git add src/lib/adaptation/canonical/ids.* && git commit -m "feat(adaptation): stable node id generation"`

### Task 1.2: Allowlist de cores

- [ ] **Step 1 — teste** (`colors.test.ts`):

```ts
import { describe, it, expect } from "vitest";
import { isAllowedColor, ALLOWED_COLORS } from "./colors";
describe("colors", () => {
  it("aceita cores da allowlist", () => { expect(isAllowedColor(ALLOWED_COLORS[0])).toBe(true); });
  it("rejeita injeção / valores fora", () => {
    expect(isAllowedColor("red; background:url(x)")).toBe(false);
    expect(isAllowedColor("#000000")).toBe(ALLOWED_COLORS.includes("#000000"));
  });
});
```

- [ ] **Step 2 — rodar/falhar.**
- [ ] **Step 3 — implementar** (`colors.ts`): exportar `ALLOWED_COLORS` (as cores de `QuestionRichEditor`: TEXT_COLORS + HIGHLIGHT_COLORS hex) e `isAllowedColor(v): boolean` (set lookup). Fecha a injeção `@cor` (SSOT T-segurança).
- [ ] **Step 4 — passar. Step 5 — commit** `feat(adaptation): color allowlist`.

### Task 1.3: Inline (texto + math) + RichText

- [ ] **Step 1 — teste** (`schema.test.ts`): valida `RichText` = array de `{type:"text",text,marks?,color?}` | `{type:"inlineMath",latex,alt?}`; rejeita cor fora da allowlist; rejeita mark desconhecida.
- [ ] **Step 2 — falhar. Step 3 — implementar** em `schema.ts`:

```ts
import { z } from "zod";
import { isAllowedColor } from "./colors";
export const SCHEMA_VERSION = 1;
const Color = z.string().refine(isAllowedColor, "cor não permitida");
const Mark = z.enum(["bold","italic","underline","strike"]);
const InlineText = z.object({ type: z.literal("text"), text: z.string(), marks: z.array(Mark).optional(), color: Color.optional() });
const InlineMath = z.object({ type: z.literal("inlineMath"), latex: z.string().min(1), alt: z.string().optional() });
export const Inline = z.discriminatedUnion("type", [InlineText, InlineMath]);
export const RichText = z.array(Inline);
```

- [ ] **Step 4 — passar. Step 5 — commit** `feat(adaptation): inline rich-text + inline math schema`.

### Task 1.4: Interação de questão (QTI cardinality × baseType)

- [ ] **Step 1 — teste:** um `multipleChoice` exige `alternatives` com **exatamente uma** `correct`; `trueFalse`, `ordering`, `matching`, `fillBlank`, `open`, `table` validam seus payloads; payload trocado é rejeitado.
- [ ] **Step 2 — falhar. Step 3 — implementar:** `QuestionAnswer` como `z.discriminatedUnion("kind", [...])` com `kind: open|multipleChoice|trueFalse|checkbox|matching|ordering|fillBlank|table`. `Alternative = { id, content: RichText, correct: boolean, nested?: Block[] }`. Regra "exatamente 1 correta" via `.superRefine`. (Mapa QTI no spec §3.1.)
- [ ] **Step 4 — passar. Step 5 — commit** `feat(adaptation): question interaction schema (QTI cardinality×baseType)`.

### Task 1.5: Blocos (heading, paragraph, math, image, scaffolding, divider, question)

- [ ] **Step 1 — teste:** `Block` aceita cada tipo; `image` exige `alt` e `src` (ref de storage), `width`/`alignment`/`caption?` opcionais; `blockMath` exige `latex`; todo bloco exige `id` válido (`isId`).
- [ ] **Step 2 — falhar. Step 3 — implementar:** `Block = z.discriminatedUnion("type", [Heading, Paragraph, BlockMath, ImageBlock, Scaffolding, Divider, Question])`; cada um com `id: z.string().refine(isId)`. `Question = { id, type:"question", number?, points?, difficulty?, stem: Block[], instruction?: RichText, answer: QuestionAnswer }`.
- [ ] **Step 4 — passar. Step 5 — commit** `feat(adaptation): block schema`.

### Task 1.5b: Atributos de estilo por nó (estilização v1 = todos)

- [ ] **Step 1 — teste:** todo bloco aceita um `style?` opcional com `fontFamily?`, `fontSize?`, `align? (left|center|right|justify)`, `color?` (allowlist), `spacingAfter? (number)`, `pageBreakBefore? (boolean)`; valores inválidos (cor fora da allowlist, align desconhecido, fontSize negativo) são rejeitados.
- [ ] **Step 2 — falhar. Step 3 — implementar** em `schema.ts`: `const NodeStyle = z.object({ fontFamily: z.string().optional(), fontSize: z.number().positive().optional(), align: z.enum(["left","center","right","justify"]).optional(), color: Color.optional(), spacingAfter: z.number().nonnegative().optional(), pageBreakBefore: z.boolean().optional() }).strict()`; adicionar `style: NodeStyle.optional()` a cada bloco. (Estilização vive **no documento**, sem sidecar — mata T13; a `StylingSurface` só edita esses atributos.)
- [ ] **Step 4 — passar. Step 5 — commit** `feat(adaptation): per-node style attributes`.

### Task 1.6: Documento + envelope (versão única)

- [ ] **Step 1 — teste:** `CanonicalDocument = { schemaVersion, blocks: Block[] }`; `AdaptationResult = { schemaVersion, document, strategies_applied, pedagogical_justification, implementation_tips }`; rejeita `schemaVersion` errado; rejeita documento vazio (≥1 bloco).
- [ ] **Step 2 — falhar. Step 3 — implementar** em `schema.ts` + exportar tipos `export type CanonicalDocument = z.infer<...>` etc. **Sem** `version_universal/directed` (colapso T10).
- [ ] **Step 4 — passar. Step 5 — commit** `feat(adaptation): canonical document + single-version result envelope`.

### Task 1.7: validate / safeParse com erros legíveis

- [ ] **Step 1 — teste** (`validate.test.ts`): `safeParseDocument(bad)` retorna `{ ok:false, errors:[...] }` com caminho do nó; `validateDocument(good)` retorna o doc tipado.
- [ ] **Step 2 — falhar. Step 3 — implementar** (`validate.ts`): wrappers sobre `schema.safeParse` formatando `z.ZodError` em mensagens por caminho (usado na fronteira da IA e da persistência).
- [ ] **Step 4 — passar. Step 5 — commit** `feat(adaptation): document validation with readable errors`.

### Task 1.8: JSON Schema para o contrato da IA

- [ ] **Step 1 — adicionar dep:** `npm i zod-to-json-schema` (+ commit do lockfile).
- [ ] **Step 2 — teste** (`jsonSchema.test.ts`): `documentJsonSchema()` produz um JSON Schema com `additionalProperties:false`, sem `$ref` cíclico problemático, enums ≤50, shallow (regras grammar-friendly do spec §3.3).
- [ ] **Step 3 — falhar. Step 4 — implementar** (`jsonSchema.ts`): `zodToJsonSchema(ResultSchema, { target: "openApi3" })` + ajustes p/ Gemini (`response_format` json_schema). 
- [ ] **Step 5 — passar. Step 6 — commit** `feat(adaptation): json-schema export for AI structured outputs`.

### Task 1.9: migração por versão (stub)

- [ ] **Step 1 — teste** (`migrate.test.ts`): `migrateByVersion(blob)` com `schemaVersion:1` retorna igual; `schemaVersion` ausente/desconhecido ⇒ `{ ok:false }` (surface, não crash — Q20/safeParse-on-load).
- [ ] **Step 2 — falhar. Step 3 — implementar** (`migrate.ts`): switch por `schemaVersion`; hoje só v1. **Step 4 — passar. Step 5 — commit** `feat(adaptation): schemaVersion migration guard`.

> **Saída de M1:** o contrato do qual tudo depende — tipos, validação, json-schema. Cobertura Vitest 100% (lógica pura, fácil). Nenhuma mudança de UI ainda.

---

## M2 — Edge function de IA (detalhe p/ expandir na execução)

**Files:** `supabase/functions/adapt-activity/index.ts` (mod), `_shared/sanitize.ts` (mod), `_shared/adaptationCost.ts` (novo), `supabase/functions/regenerate-question/index.ts` (mod), fixtures em `_shared/__fixtures__/`.

Tarefas-chave (cada uma vira bite-sized TDD com `deno test`/Vitest conforme camada):
1. **`sanitize.ts` escapar-não-deletar** (Q8): teste com `x < 5`, `a & b`, `<2,3>` sobrevivendo; trocar `.replace(/[<>"'&]/g,"")` por escape HTML por-nó/ou strip só em fronteira de tag.
2. **`adaptationCost.ts` único** (corrige T8): extrair `BARRIER_COMPLEXITY`/`ADAPTATION_CREDITS`/`REGENERATE_COST` p/ `_shared/`, com testes; importar nas duas functions; deletar as tabelas divergentes inline.
3. **Prompt + structured outputs:** trocar prompt de marcadores `===VERSAO_*===` por `response_format: { type:"json_schema", json_schema:{ schema: documentJsonSchema(), strict:true } }` no POST ao endpoint OpenAI-compat do Gemini; retornar **um** `document`. Remover `parseDslResponse`.
4. **Validação Zod + reask limitado:** `safeParseDocument` na resposta; se falhar regra de conteúdo (1 correta, refs de imagem, LaTeX), **reask ≤2** anexando o erro exato; se ainda falhar → resposta de erro **sem cobrar** (ver 5).
5. **Crédito-no-sucesso (Q-crédito):** mover `deduct_credits` para **depois** da validação OK (ou: deduzir no início e `refundIfNeeded()` em **todos** os paths de falha — incluindo o `requiredFields`/Zod-fail que hoje retorna 500 sem refund, linha ~628). Teste: falha de validação/reask/timeout ⇒ saldo inalterado; sucesso ⇒ debita 1×. Cobrir o bug atual com teste de regressão.
6. **Dropar `regenerate-question` (decisão: só atividade inteira):** deletar a edge function `regenerate-question`, o `QuestionRegeneratePanel` e o hook `useRegenerateQuestion`. O único "regenerar" é **completo** — re-chama `adapt-activity` e substitui o `document` (botão confirmado em M5). Remover `REGENERATE_COST` se ficar sem uso.
7. **Fixtures adversariais:** golden de outputs malformados → erros de validação esperados.

---

## M3 — Editor Tiptap sobre o canônico (detalhe p/ expandir)

**Files:** `src/lib/adaptation/tiptap/extensions.ts`, `nodeviews/*`, `toCanonical.ts`/`fromCanonical.ts`, `src/components/adaptation/canonical-editor/CanonicalEditor.tsx`.

Decisão de representação: **documento canônico = JSON ProseMirror** (os nós custom correspondem 1:1 ao schema Zod), evitando uma camada de mapeamento; `toCanonical`/`fromCanonical` só validam/normalizam com Zod na fronteira. Tarefas:
1. Definir nós Tiptap: `question`, `blockMath`, `inlineMath`, `image`, `scaffolding` (extends Node), + `paragraph/heading/text/marks` do StarterKit (reusar config de `QuestionRichEditor`). Marks: bold/italic/underline/strike/color (allowlist).
2. **Ids estáveis:** extensão de UniqueID — como `@tiptap-pro/extension-unique-id` é Pro, implementar uma extensão custom mínima que injeta `id: newId()` em nós sem id no `appendTransaction` (testável por unidade). Garante T7.
3. **NodeViews React** (`ReactNodeViewRenderer`): `QuestionNodeView` (alternativas/correta/points/difficulty editáveis), `ImageNodeView` (reusar `ImageManagerModal`/`ImageResizer`; atributos src/width/alignment/caption/alt), `MathNodeView` (KaTeX via `latexRenderer`), `ScaffoldNodeView`.
4. `getJSON()` → `validateDocument` (Zod) no save/blur; edição = transação ProseMirror (um nó), undo via `prosemirror-history`. Mata T1/T2/RC-8.
5. `CanonicalEditor.tsx` = a superfície de **edição de conteúdo**; props `{ value: CanonicalDocument, onChange }`.

> **Cobertura 100% mantida (decisão Q-cobertura = 100%):** toda lógica vai para funções puras testadas (transforms de transação, normalização, mapeamento canônico↔PM, geração de id); testes de componente mockam `@tiptap/react` como `QuestionRichEditor.test.tsx` já faz; paths genuinamente inalcançáveis em jsdom usam `/* v8 ignore */` pontual (prática já presente no codebase). **Sem** exclusão geral de NodeViews.

---

## M4 — Renderer único (detalhe p/ expandir)

**Files:** `src/components/adaptation/render/CanonicalRenderer.tsx` + sub-renderers por tipo de nó.

1. `CanonicalRenderer({ document })` percorre `blocks` e despacha um componente por tipo (mesmos componentes-base usados pelo preview e pelo viewer read-only). **Um** caminho (mata T11).
2. Math via KaTeX `renderToString` com `output:"htmlAndMathml"` (MathML+aria, Q18) + alt por fórmula.
3. Cada tipo de questão renderiza do `answer` tipado (correta autoritativa — mata T5). Testes de snapshot por tipo.

---

## M5 — Wizard + duas superfícies (detalhe p/ expandir)

**Files:** `AdaptationWizard.tsx` (mod), `steps/styling/StylingSurface.tsx` (novo), `steps/export/StepExport.tsx` (reescrito), deletar `steps/editor/` (manual adiado) e a stack DSL.

Nova sequência (modo IA; manual adiado, Q13): `activity_type → activity_input → barriers → ai_generate → **edição de conteúdo** → **estilização/preview** → export`. (O passo "choice" só reaparece quando o manual voltar.)
1. `AdaptationWizard` segura **um** `document: CanonicalDocument` + inputs (tipo/texto/barreiras/`selectedQuestions`). Deletar `editorContent*`, `useActivityContent`, `result` dual, `activeTab`, `buildAIEditorAdvancePatch/Manual`. **Fonte única** (mata T1/T10).
2. **Superfície de conteúdo** (`CanonicalEditor`) e **superfície de estilização** (`StylingSurface` = estilo por-nó + preview via `CanonicalRenderer`) mutam **o mesmo `document`** → navegar entre elas **não perde dados** por construção (Q12, SSOT). Ambas autosave (M6).
3. **Regenerar completo** (Q15): botão explícito **confirmado** (AlertDialog) que re-chama `adapt-activity` e substitui o `document`; nunca auto-dispara em modo edição.
4. Estilização v1 = **todos** os atributos por nó no documento (sem sidecar — mata T13): fonte/tamanho/alinhamento/cor/espaçamento/quebra-de-página. Já definidos no schema M1 (Task 1.5b); a `StylingSurface` apenas os edita e pré-visualiza via `CanonicalRenderer`.

---

## M6 — Persistência, autosave, histórico, editar-após-salvar (detalhe p/ expandir)

**Files:** migration nova, `useAdaptationDraft.ts`, `useAdaptations.ts`, `MyAdaptationsPage.tsx`, `EditAdaptationPage.tsx`, `App.tsx` (rotas), pgTAP.

1. **Migration** `adaptations` canônica: colunas `user_id`, `original_activity text NOT NULL`, `activity_type text`, `barriers_used jsonb NOT NULL DEFAULT '[]'`, `adaptation_result jsonb NOT NULL DEFAULT '{}'`, `status text NOT NULL DEFAULT 'draft'` (draft|ready), `title`, `credits_spent`, `barrier_profile_id`, `created_at`, `updated_at`; RLS owner (`auth.uid()=user_id`, 4 policies USING+WITH CHECK), trigger `handle_updated_at` (reusar). `NOT NULL` em `original_activity` fecha RC-4. (Save quebrado morre porque o writer passa a bater com o schema — mata T12.)
2. **`useAdaptationDraft`**: autosave debounced ~1–1,5s (TanStack mutation) **nas duas superfícies** (Q-persist: "a cada etapa de texto e estilo"), indicador de status, espelho IndexedDB c/ restore, **concorrência otimista** via `updated_at` no WHERE (0 linhas → avisar+recarregar). Salvar **antes** da tela de export (Q3). Validar o blob com Zod no write **e** no read.
3. **Leitura** `useAdaptations` (centralizado — mata T14) + `MyAdaptationsPage` (rota `/historico`).
4. **Editar-após-salvar**: rota `/adaptar/editar/:id`, re-hidratar `document` do blob keyed por `id+updated_at` (sem o `staleTime:0` frágil do B2B).
5. **Testes:** round-trip **real** (não-mockado) Supabase — `document` sobrevive save→reload `toEqual`, full-replace (não merge), integridade unicode/math/emoji; **pgTAP** isolamento RLS. (Mata RC-7.)

---

## M7 — Export: PDF + copiar + painel (detalhe p/ expandir)

**Files:** `render/pdf/*`, `steps/export/StepExport.tsx`.

1. `npm i @react-pdf/renderer`. Mappers por tipo de nó (`render/pdf/`) como **contrato de paridade** com `CanonicalRenderer` (snapshot juntos — mata T11/drift). Math: KaTeX→SVG→PNG embed (react-pdf rejeita SVG cru).
2. **Painel de export** (Q14): cabeçalho/logo/professor/fonte/quebra-de-página (concerns de documento) + ações **Exportar PDF** e **Copiar** (do mesmo `document`). Save já ocorreu (Q3).
3. DOCX e compartilhamento: **adiados** (defaults). Deixar pontos de extensão.

---

## M8 — Limpeza & gate (detalhe p/ expandir)

1. Deletar a stack DSL (lista em "Estrutura de arquivos") + seus testes, **um arquivo por vez** com `grep` de importadores + `make typecheck` + `make test` após cada um. **Não** tocar `questionParser`.
2. Garantir gate 100% Vitest (mover lógica p/ reducers puros; UI ProseMirror na exclusão legítima se acordado — Q-cobertura). `make lint` + `make typecheck` limpos.
3. Atualizar `src/types/adaptation.ts` para re-exportar do schema canônico; remover `StructuredActivity`/`AdaptationResult` antigos após confirmar zero consumidores (grep da §8 do spec).

---

## Self-review (cobertura do spec)

- SSOT T1-T14 (spec §10): T1/T2/T10 → M1+M5; T3/T4 → M1 (header=content[0], scaffolding=nó); T5 → M4; T6 → M3 (ImageNodeView)+M1; T7 → M3 (UniqueID); T8 → M2 (adaptationCost único); T9 → M2 (Zod); T11 → M4+M7 (um renderer/paridade); T12 → M6 (migration+Zod boundary); T13 → M5 (estilo por-nó); T14 → M6 (useAdaptations). ✔
- Sintomas: edita-e-volta/some/formatação-muda → SSOT único (M1/M5) + autosave (M6). ✔
- Decisões Q1-Q15/Q-crédito/Q8 → mapeadas nos milestones. ✔
- Crédito sensível a dinheiro → M2 task 5 com teste de regressão (CLAUDE.md). ✔
- Perguntas em aberto (Q2/Q3-DOCX/Q-regen detalhes/Q-cobertura) → defaults registrados no topo; confirmar antes de M2/M7.

## Confirmações finais (2026-06-03 — todas resolvidas)
1. ✅ Estilização v1 = **todos** os atributos por nó → no schema M1 (Task 1.5b).
2. ✅ Regenerar = **só atividade inteira** → dropar `regenerate-question`/painel/hook (M2 task 6, M8).
3. ✅ DOCX e compartilhamento = **depois** (não nesta entrega).
4. ✅ Cobertura = **100%** mantida, sem exclusão geral de NodeViews (M3).
