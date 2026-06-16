# Reestruturação do fluxo "Adaptar" (B2C) — design

> Status: **rascunho para revisão**. Aguardando respostas do usuário às perguntas em aberto (§9).
> Data: 2026-06-03. Referência B2B: `/home/alexandredev/my projects/orientador-digital`.
> Base de evidências: auditoria multi-agente do B2C (107 achados, 97 confirmados) + análise do B2B (96 achados) + pesquisa externa (6 frentes). Transcrições em `…/tasks/wssk3xuc1.output` e `…/tasks/w603iaq3e.output`.

## 1. Contexto e decisão

O fluxo "Adaptar" do B2C sofre de instabilidade crônica: formatação que muda sozinha, edições que revertem, e perda de estado ao navegar. A investigação mostrou que isso **não é uma coleção de bugs pontuais** — é consequência de uma arquitetura frágil herdada do B2B:

- **Editor = `<textarea>` sobre uma string DSL opaca**; toda operação estrutural é um rewrite da string inteira.
- **Round-trip DSL↔estruturado lossy** (`markdownDslToStructured ∘ structuredToMarkdownDsl`) rodando a cada navegação — perde math `$$`, points/difficulty, V/F aninhado, instruções multi-linha, metadados de imagem.
- **Tripla fonte da verdade** (`data.result` JSON / `editorContent*` DSL / histórico vivo) reconciliada à mão.
- **IA retorna strings DSL** tipadas como `StructuredActivity` (mentira de tipo), fatiadas por marcadores sem validação.
- **Save quebrado**: `StepExport` insere colunas que não existem na tabela `adaptations` → todo save falha em runtime.

O B2B é a mesma arquitetura, porém **mais madura** (tem testes de round-trip, reconciliação de ids, e mais features) — mas o próprio usuário confirmou: "o B2B é extremamente frágil". A reconciliação de ids do B2B existe só para reatar identidade perdida no round-trip lossy, e parte dela está morta (tier de hash).

## 2. Estratégia

**Paridade de fluxo/recursos com o B2B + reestruturação dos internos.** O usuário decidiu:

- **Uma versão só** (colapsar `version_universal`/`version_directed` do B2B em um único `document`).
- **Modo manual (sem IA) adiado** — o editor inicialmente só edita o documento gerado pela IA.
- **Internos reestruturados** para um modelo robusto, fundamentado em pesquisa de como as melhores plataformas fazem isso.

A tensão "portar fielmente vs reestruturar" é a **pergunta central** (§9, Q1): a análise recomenda **reestruturar os internos** e **portar o fluxo/contrato de persistência**.

## 3. Arquitetura recomendada

### 3.1 Modelo canônico (uma fonte da verdade)
Um **documento de blocos em JSON ProseMirror/Tiptap** como única representação, validado por **um schema Zod**. Árvore ordenada de nós tipados: `section`, `heading`, `paragraph` (com marcas inline bold/italic/underline/strike/color), `inlineMath`/`blockMath` (LaTeX em atributo — **nó de primeira classe, nunca substring `$...$`**), `image` (src, width, alignment, caption, **alt obrigatório**), `scaffolding`, e `question`.

O nó `question` adota o modelo de interação do **QTI 3.0 / Canvas New Quizzes**: separa (a) conteúdo visível ao aluno, (b) interação tipada `{cardinality: single|multiple|ordered, baseType: identifier|string|number|boolean|pair|directedPair}`, (c) gabarito/pontuação estruturalmente separado. Esse par `{cardinality × baseType}` representa sem perda todos os `QuestionType` atuais (MCQ, múltipla, ordenação, associação, lacuna, V/F, dissertativa, tabela).

**Ids estáveis intrínsecos** em cada nó (Tiptap UniqueID) — eliminam toda a máquina `reconcileQuestionIds`/`inheritIdsByNumber`/`hashQuestionContent` do B2B, que só existe porque o DSL perde a identidade. `schemaVersion` no topo para migração.

### 3.2 Editor
**Tiptap (ProseMirror headless)** operando direto no JSON canônico — escolhido pela história de math de primeira classe (`@tiptap/extension-mathematics`, KaTeX inline+bloco) e `ReactNodeViewRenderer` para nós interativos de questão/imagem/scaffold. Cada edição é uma transação ProseMirror que muta **um nó** (sem rewrite global). Undo a nível de operação (`prosemirror-history`). A stack DSL legada (`activityParser`, `activityDslConverter`, `activityFormatter`, `dsl/types`, `ActivityEditor` textarea, `useActivityContent`) é **deletada, não portada** — com cuidado: `questionParser` é compartilhado com o QuestionBank (ver §8).

### 3.3 Contrato de IA
Reescrever `adapt-activity` para **emitir o JSON canônico via structured outputs do provider** (Gemini `responseSchema`/strict via gateway) + segunda camada **Zod safeParse + reask limitado (~2)**. Substitui o prompt de marcadores `===VERSAO_*===` e o `parseDslResponse`. Retorna **um** `document`. Pré-requisito: corrigir `_shared/sanitize.ts` que hoje **deleta** `& < > " '` da atividade original (corrompe `x < 5`, inequações, math) — trocar por escape-não-deletar.
> ✅ Provider confirmado (2026-06-03): a Lovable **já foi removida**; `_shared/aiConfig.ts` usa `AI_API_KEY` (Google AI Studio) direto em `https://generativelanguage.googleapis.com/v1beta/openai`. Esse endpoint OpenAI-compat do Google **suporta structured outputs** (`response_format: json_schema` / nativo `responseSchema`) — o pilar de saída estruturada é viável já. (Q24 resolvido.) Resíduo: um teste protetor que trava o retorno da Lovable (manter).

### 3.4 Persistência
**Um `jsonb` de documento, upsert REPLACE do documento inteiro** (nunca merge). Blob colapsado: `{ schemaVersion, document, strategies_applied, pedagogical_justification, implementation_tips }` — sem `_universal`/`_directed`, sem sidecar separado (imagens/layout viram atributos de nó). **Autosave** debounced (~1–1,5s, TanStack Query) com indicador de status, espelho de crash em IndexedDB/localStorage, e concorrência otimista via `updated_at` no WHERE. **Sem CRDT** (single-user, online). Read path real ("Minhas Adaptações" hoje é cópia morta).

### 3.5 Renderização
**Um renderer** sobre o JSON canônico para as três superfícies (preview na tela, viewer read-only, PDF) — elimina os 3 pipelines divergentes do B2B (incluindo o pior bug: KaTeX na tela vira LaTeX literal no PDF). PDF via **`@react-pdf/renderer`** com mappers por tipo de nó como **contrato de paridade** com o renderer de tela (snapshot-testados juntos); math pré-rasterizado (KaTeX→PNG). Puppeteer (PDF tagueado) como upgrade documentado se a acessibilidade exigir.

### 3.6 Estado / navegação
Estado do wizard = documento canônico + inputs (tipo, texto, barreiras), em **um lugar e persistido**. Deletar `editorContentUniversal/Directed/Manual`, `useActivityContent`, `buildAIEditorAdvancePatch/Manual` (rodavam o round-trip lossy a cada "Avançar"). Como o documento é autosalvo e keyed por id de rascunho, ir-e-voltar **não perde nem recobra**. O sintoma "formatação muda ao navegar" some na raiz — não há ciclo serialize/parse entre passos.

### 3.7 Validação
Um schema Zod reutilizado em 5 pontos: contrato do LLM (zod-to-json-schema), validador da resposta da edge fn, validador de escrita/leitura da persistência, tipos do renderer React, tipos do mapper de PDF. Constrained decoding garante shape; Zod garante regras de conteúdo (exatamente 1 correta no MCQ, refs de imagem resolvíveis, LaTeX válido, atividade não-vazia). Cores validadas por allowlist (fecha a injeção via `@cor`).

## 4. Mapa de paridade B2B → B2C (resumo)

Sequência do wizard preservada (`activity_type → activity_input → barriers → choice → ai_editor → export`; o B2B insere ainda um passo **Layout** `pdf_preview` antes do export). Toda capacidade visível do B2B é alcançável no novo modelo. **Colapso versão única:** onde o B2B carrega um par `(universal, directed)`, o B2C carrega um `document`; `editorContent*`/abas/`questionImages.version_*`/`editableActivity*`/sidecar duplo → tudo unificado.

**B2C não tem hoje (gap a construir):** persistência funcional (save quebrado), read path ("Minhas Adaptações"), editar-após-salvar, passo de Layout + modelo de PDF, export PDF (`@react-pdf` ausente), export DOCX, compartilhamento, mapa de imagens por questão, e a cobertura de testes (round-trip real, pgTAP de RLS, save não-mockado).

## 5. Plano faseado

- **Fase 0 (primeiro, antes de reestruturar): CONSERTAR O SAVE.** Migration dando a `adaptations` as colunas que o `StepExport` insere (`original_activity` text NOT NULL, `activity_type` text, `barriers_used` jsonb, `adaptation_result` jsonb) + `status`. Trocar o teste mockado por round-trip real contra Supabase. Implementar o read path. Mantém o shape dual-version atual nesta fase. Torna o fluxo durável enquanto a reestruturação prossegue.
- **Fase 1:** schema Zod canônico (blocos/interação QTI/math/imagem/scaffold/ids/schemaVersion) + zod-to-json-schema, com cobertura Vitest. Sem UI.
- **Fase 2:** reescrever `adapt-activity` p/ structured outputs (um documento, safeParse + reask). Corrigir `sanitize.ts`. Fixtures adversariais. **Definir refund** no novo caminho (ver Q-credito).
- **Fase 3:** editor Tiptap no modelo canônico (NodeViews de questão/math/imagem/scaffold, UniqueID, history) + o renderer único. Ligar o wizard ao documento. Deletar a stack DSL e o estado dual. **Reescrever `regenerate-question` em paralelo** p/ não deixar um 2º emissor de DSL vivo (ver Q-regen).
- **Fase 4:** persistência no modelo canônico (blob versão única, autosave + status + espelho + concorrência otimista; re-hidratação por id+updated_at; regenerar explícito/confirmado).
- **Fase 5:** PDF/export no modelo canônico (mappers `@react-pdf` como contrato de paridade; KaTeX→PNG); copy/share. Snapshots de paridade + pgTAP de RLS.
- **Fase 6 (adiado, pós-paridade):** autoria manual do zero, como comandos de inserção de nó no mesmo editor.

## 6. Riscos principais
1. Reestruturação big-bang trava o produto → **mitigação:** Fase 0 torna o save durável primeiro; DSL segue funcionando até a Fase 3 trocar atomicamente; cada fase é entregável e testada (gate 100% Vitest).
2. Limites de structured outputs do gateway → schema raso, discriminated unions, Zod + reask como rede.
3. Fidelidade de math no PDF (react-pdf rejeita SVG cru) → LaTeX canônico + KaTeX→PNG; Puppeteer como swap localizado.
4. Migração de linhas legadas → schemaVersion + safeParse-on-load; volume baixo (B2C novo; save quebrado ⇒ provavelmente 0 linhas reais).
5. Autosave amplifica mismatch de schema em perda contínua → habilitar autosave só após o shape bater (ordem Fase 0/4).
6. Drift renderer tela↔PDF → contrato de paridade por nó com snapshots.

## 7. Recomendação de fundo (port vs restructure)
Reestruturar os **internos** para o modelo canônico; **portar** o fluxo/features e o **contrato de persistência** do B2B; sequenciar a Fase 0 primeiro. Portar a stack DSL fielmente replicaria a classe de bug + os band-aids (reconciliação com tier morto) + os testes cegos (as property tests do B2B excluem justo os eixos lossy, então CI verde mascara a perda) + os 3 renderers divergentes. O colapso versão única (já escolhido) é o que torna reestruturar **mais barato** que portar — remove metade do estado e a razão de existir da reconciliação. Caminho-meio honesto (só se houver prazo curto): Fase 0 + port DSL colapsado p/ paridade rápida, depois reestruturar — mas paga a migração duas vezes e mantém o round-trip lossy.

## 8. Checagens de verificação feitas (2026-06-03)
- **Importadores confinados:** `StructuredActivity`/`AdaptationResult` só aparecem no fluxo adaptar + conversor + types → o colapso é contido.
- **`questionParser` é compartilhado com `QuestionBankPage`** → "deletar a stack DSL" deve **preservar `questionParser`** (ou escopar a deleção). `ActivityPreview`/`ActivityStatusBar`/`ActivityEditor` são do adaptar.
- **`selectedQuestions`** é usado em `AdaptationWizard`, `StepActivityInput`, helpers → precisa de mapeamento explícito no modelo canônico (Q-selected).
- **Refund quebrado confirmado:** `adapt-activity` cobra em :448; `requiredFields` retorna 500 em :628-630 **sem** `refundIfNeeded()` (que só roda nos paths de fetch :551/:576). Bug de dinheiro pré-existente.
- **Gateway OpenAI-compatível** (`/chat/completions`, `google/gemini-2.5-pro` via `resolveModel`) → capacidade de `json_schema strict` a confirmar.

## 9. Perguntas em aberto (para o usuário responder)

Bloqueantes marcadas com 🔴. Recomendação entre parênteses.

**Arquitetura / fundação**
- 🔴 **Q1 (a decisão central):** Portar o B2B fielmente (DSL frágil) ou **reestruturar** os internos pro documento canônico Tiptap/ProseMirror mantendo o fluxo idêntico? *(Recomendado: reestruturar internos, portar fluxo + contrato de persistência; Fase 0 primeiro.)*
- 🔴 **Q5:** Tecnologia do editor: **Tiptap/ProseMirror** vs BlockNote vs Lexical vs Slate. *(Tiptap, pela história de math + NodeViews + UniqueID + static-renderer.)*
- 🔴 **Q6:** Modelo canônico = **um documento de blocos** (colapsando as 2 versões), interação QTI `{cardinality × baseType}`, ids estáveis no modelo. *(Sim.)*
- 🔴 **Q7:** Contrato de IA = structured outputs do provider + Zod safeParse/reask, retornando **um** documento (substitui marker-slice). *(Sim.)*
- ~~**Q24:** Confirmar suporte a `json_schema strict` no gateway.~~ **RESOLVIDO (2026-06-03):** Lovable já removida; provider = Google Gemini direto (`AI_API_KEY`, endpoint OpenAI-compat), que suporta structured outputs. Pilar viável.

**Produto / fluxo**
- 🔴 **Q12:** Tela pós-geração = **uma superfície de edição** (sem abas) editando o documento da IA (texto, alternativas, math, imagens, reordenar/inserir/deletar questões, cor por palavra, redimensionar imagem, scaffolding); painel regerar-questão mantido. *(Sim.)*
- **Q13:** Autoria manual do zero **adiada** (Fase 6)? *(Sim.)*
- **Q14:** Passo de Layout/WYSIWYG separado (como o B2B) vs estilo inline no editor + PDF do documento canônico? *(Sem passo separado; painel mínimo de export p/ cabeçalho/logo/professor/fonte/page-break.)*
- **Q15:** Save implícito/contínuo (autosave); re-entrada de edição por id+updated_at; **regenerar explícito e confirmado** (nunca auto-dispara). *(Sim.)*

**Escopo / fases**
- 🔴 **Q4:** Confirmar **Fase 0 primeiro** (consertar save no shape atual, antes de reestruturar) e a ordem das fases. *(Sim, Fase 0 isolada, mantendo dual-version no blob.)*
- **Q2:** Compartilhamento (link público) — incluir agora ou adiar? *(Adiar pós-paridade; portável depois.)*
- **Q3:** Export DOCX — incluir ou PDF+copiar+salvar bastam? *(PDF+copiar+salvar p/ paridade; DOCX depois.)*

**Dados / persistência**
- 🔴 **Q9:** Shape Fase 0 da tabela `adaptations`: + `original_activity` NOT NULL, `activity_type`, `barriers_used` jsonb, `adaptation_result` jsonb, `status`; dropar colunas multi-tenant do B2B. *(Sim.)*
- 🔴 **Q10:** Blob colapsado `{ schemaVersion, document, strategies_applied, pedagogical_justification, implementation_tips }`, upsert REPLACE. *(Sim.)*
- **Q11:** Autosave debounced + espelho local + concorrência otimista, **sem CRDT**. *(Sim; habilitar só após o shape bater.)*
- **Q19:** Imagens como atributos de nó dentro do documento (id-ancoradas) vs mapa por número. *(Atributos de nó.)*
- **Q20:** Migração de linhas legadas. *(schemaVersion + safeParse-on-load; descartar legadas se não houver dados reais — confirmar contagem no Supabase.)*
- **Q22:** Gabarito/points/difficulty/scaffolding/hints/tags como campos irmãos de primeira classe (nunca marcadores in-band tipo `*`/`$...$`). *(Sim.)*
- **Q23:** Cores por allowlist + marcas inline tipadas. *(Sim.)*
- **Q-selected (novo):** Como `selectedQuestions` (modo "adaptar só questões selecionadas do banco") mapeia no modelo canônico e sobrevive ao colapso? *(Definir na Fase 1.)*

**IA / créditos**
- **Q8:** Corrigir `sanitize.ts` p/ escapar-não-deletar. *(Sim, cedo na Fase 2.)*
- 🔴 **Q-credito (novo):** No novo caminho (Zod rejeita / reask falha / "fail to editable draft"), **quem refunda**? Reask gasta tokens extras — quem paga? E corrigir o bug atual (validação falha sem refund). *(Definir explicitamente; é lógica sensível a dinheiro exigida pelo CLAUDE.md.)*
- **Q-regen (novo):** `regenerate-question` (cobra `REGENERATE_COST` à parte, emite a mesma DSL) — reescrever pro schema canônico junto (Fase 2/3)? *(Sim, senão fica um 2º emissor de DSL vivo re-introduzindo o round-trip.)*

**Math / PDF / testes**
- **Q16:** PDF via `@react-pdf/renderer` + KaTeX→PNG; Puppeteer como upgrade. *(Sim.)*
- **Q17:** Um renderer compartilhado (tela/viewer/PDF), contrato de paridade por nó. *(Sim.)*
- **Q18:** Math: LaTeX como fonte canônica + KaTeX `htmlAndMathml` (MathML+aria) + alt por fórmula. *(Sim — produto é focado em acessibilidade.)*
- **Q21:** Estratégia de testes em camadas (Vitest + round-trip real Supabase + pgTAP). *(Sim.)*
- **Q-cobertura (novo):** O gate de 100% Vitest vs NodeViews ProseMirror interativos (notoriamente difíceis em jsdom) — empurrar lógica p/ reducers puros e adicionar UI à lista de exclusão legítima do CLAUDE.md? *(Definir política antes da Fase 3.)*

## 10. Análise de fontes únicas da verdade (SSOT)

O princípio que organiza toda a reestruturação: **cada fato deve ter UMA representação canônica.** A fragilidade do "adaptar" (B2C e B2B) é, na essência, uma coleção de **verdades duplicadas** — o mesmo dado existe em 2+ lugares reconciliados à mão, que **divergem** e produzem os sintomas (edita-e-volta, formatação muda, some). Abaixo, cada verdade duplicada hoje, o drift que ela causa, e como o modelo canônico a colapsa em uma.

| # | A "verdade" | Onde vive hoje (N lugares) | Drift / sintoma | Colapso no redesign |
|---|---|---|---|---|
| T1 | **Conteúdo do editor** | `data.result` (JSON) · `editorContent{Universal,Directed,Manual}` (DSL+registry) · histórico vivo `useActivityContent`/`useHistory` · string no `<textarea>` | Export lê de `result`, editor lê de `editorContent` → divergem quando o round-trip não é idempotente (**edita-e-volta**) | **Um documento JSON canônico**; editor muta direto; sem snapshot DSL, sem `result` à parte |
| T2 | **Representação da atividade** | string DSL ⇄ `StructuredActivity` (ponte lossy) | parse∘serialize perde math/points/V-F/etc. (**formatação muda / some**) | Só o documento JSON; DSL some (no máx. import/export) |
| T3 | **Cabeçalho da questão** | `q.statement` vs `content[0]` (1º bloco texto) | serializer prefere `content`, descarta `statement` | header = `content[0]`; um lugar |
| T4 | **Scaffolding (apoio)** | `q.scaffolding` (flat) vs bloco em `content`/`trailing` | bloco vence; edição no campo flat **reverte** | scaffolding é nó; um lugar |
| T5 | **Tipo da questão** | campo `type` autoritativo vs `detectType` re-derivado no render | render ignora `type` e re-deriva por heurística → discordam; correta inferida por `*` | render consome o `type` do modelo |
| T6 | **Identidade da imagem** | URL vs `[img:placeholder]` + registry paralelo; **3 registries** (universal/directed/manual) | placeholder vira ponteiro morto; mesma imagem em 2-3 cópias/data-URIs | nó de imagem com ref de storage; **image store único deduplicado** |
| T7 | **Identidade dos nós (ids)** | só em content blocks, **regenerados a cada parse**; questões/seções/alternativas sem id → B2B re-deriva por hash (morto) e por número | identidade computada de 2 formas que discordam no reorder → updates mal-direcionados | **id estável intrínseco** em cada nó; mata `reconcileQuestionIds`/`inheritIdsByNumber` |
| T8 | **Custo de crédito** | `calcAdaptationCost` em `AdaptationWizard` E `StepBarrierSelection`; tabelas `BARRIER_COMPLEXITY`/`ADAPTATION_CREDITS` **divergentes** entre `adapt-activity` e `regenerate-question` | dimensão desconhecida → cobra errado; as duas functions discordam do custo | **tabela única em `_shared/`**, testável; cálculo num lugar |
| T9 | **Shape do resultado da IA** | tipo declara `StructuredActivity`, runtime é **string DSL** (mentira de tipo) | guards `isStructuredActivity?…:String(v)` espalhados; painel de regenerar some | IA emite JSON validado por Zod; **tipo = runtime** |
| T10 | **As duas versões** | `version_universal/directed` + `editorContent*` + `questionImages.version_*` + `editableActivity*` + `pdfHistory*` + 2 `useHistory` + flag "versão ativa" | "versão ativa" rastreada em vários flags; metade do estado existe em dobro | **decisão do usuário: versão única** colapsa tudo em um |
| T11 | **Como a atividade aparece (render)** | 3 pipelines (B2B): `AdaptedContentRenderer` (regex/DSL) · `StructuredContentRenderer` · `PreviewPdfDocument` | PDF diverge da tela; **KaTeX na tela vira LaTeX literal no PDF** | **um renderer** sobre o canônico; contrato de paridade por nó (snapshot) |
| T12 | **Shape da persistência** | writer (`StepExport`) vs schema da tabela vs `content jsonb` opaco | **save quebrado** (colunas-fantasma); drift TS↔blob silencioso | blob tipado por Zod = fonte; validado no write/read; sem `as any` |
| T13 | **Layout** | sidecar `editable_activity_*` paralelo ao documento de conteúdo (B2B) | precisa reconciliar layout com conteúdo a cada edição | layout = **atributos por nó** no documento; sem sidecar |
| T14 | **Leitura do histórico** | (B2B) `MyAdaptations` vs `AdaptationHistory` com mapeamento/invalidação duplicados | os dois caminhos driftam | **um hook de leitura** centralizado |

**Síntese.** Há ~14 verdades duplicadas. A maioria (T1-T9, T11-T13) decorre de **dois pecados-mãe**: (a) o conteúdo vive como *string DSL E como estrutura*, com uma ponte lossy; (b) a *identidade* (ids) é re-derivada do texto em vez de intrínseca. O redesign elimina (a) tornando o documento JSON a única representação, e (b) dando id estável a cada nó. T8 (custo) e T14 (leitura) são duplicações independentes, resolvidas por extrair p/ um módulo único. T10 (duas versões) é colapsada pela decisão de versão única — e é o que torna a reestruturação **mais barata** que o port, pois remove a razão de existir de metade da reconciliação. **Toda fonte única estabelecida aqui é uma classe inteira de bug que deixa de poder acontecer**, não um bug consertado.
