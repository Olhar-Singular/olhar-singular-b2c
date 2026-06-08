# Passos "Conteúdo" e "Estilo" como folha tipo Word (WYSIWYG) — design

> Status: **aprovado para escrita do plano** (decisões fechadas com o usuário em 2026-06-08).
> Data: 2026-06-08. Sub-design de [2026-06-03-adaptar-restructure-design.md](2026-06-03-adaptar-restructure-design.md) — refina a apresentação dos passos do editor (Fase 3/5, §3.5 paridade de render, Q14 estilo inline + painel mínimo).
> Mockup validado no browser: [../mockups/2026-06-08-estilo-step-mockup.html](../mockups/2026-06-08-estilo-step-mockup.html) (dados reais: `adaptations/bb9f01a9` "Combatendo a Dengue" + `54d9157d` math).

## 1. Problema

Hoje os passos **Conteúdo** e **Estilo** renderizam o editor Tiptap "cru": cards de questão com borda, formulários de alternativa em caixas, badges, toolbar sempre visível, e — no Estilo — formatação espalhada em **três** superfícies flutuantes (popover por bloco [`StyleControls`], botão "Estilo do documento" [`DocumentStyleControl`], e o `SelectionBubbleMenu`). O resultado parece "ferramenta de editor", não a folha que o PDF gera. O usuário quer **simplificar o uso** e fazer a tela **se parecer com o Word / com o PDF final**, sem perder nenhuma função.

## 2. Decisões fechadas (com o usuário)

1. **Sem lib nova.** Nada de Tiptap Pages/pagination-plus, SuperDoc, CKEditor ou editor DOCX. Uma lib Word/DOCX completa descartaria o modelo canônico estruturado (questões tipadas, gabarito, math acessível) — exatamente a fragilidade que a reestruturação está eliminando (§10 do design pai). O "cara de Word" vem de **CSS + uma régua sobre o editor Tiptap que já temos** (o mesmo motor ProseMirror que editores Word-like usam por baixo).
2. **Visualização aproximada, não o PDF real.** A folha **se parece** com a página final (margens/fonte/tipografia), mas não roda o `@react-pdf` na tela. A fidelidade vem de **tokens de página compartilhados** entre a tela e o PDF.
3. **Manter todas as funções atuais** (documento + bloco + inline). Como formatar um trecho selecionado exige o modelo de seleção do editor, a superfície **continua sendo o editor Tiptap real** — muda só a apresentação.
4. **Mexer nos dois passos** (Conteúdo e Estilo), com visual consistente.
5. **Dois passos separados** no wizard (Conteúdo → Estilo), **não** uma superfície única com toggle. A folha A4 é o visual compartilhado; cada passo tem sua própria barra.
6. **Barra fixa no topo** (sem scroll). A barra do passo (inserir no Conteúdo, régua no Estilo) fica **presa no topo da área de edição**; apenas a folha (a "mesa") rola. O usuário nunca perde os controles de vista, por mais longo que seja o documento.

## 3. Arquitetura

Três peças novas/alteradas, todas de **apresentação** — o modelo canônico, os helpers de estilo (`setBlockStyle`, `applyMarkToBlock`, `applyColorToBlock`, `applyStyleToAllBlocks`, `currentTopLevelBlock`) e o contrato de persistência **não mudam**.

### 3.1 Tokens de página compartilhados (contrato de paridade)
Hoje os valores-base da página vivem hardcoded no PDF ([AdaptationPdf.tsx:52](../../src/components/adaptation/render/pdf/AdaptationPdf.tsx) — `padding: 40`, `fontSize: 12`, `lineHeight: 1.4`). Extrair para **um módulo** `src/components/adaptation/render/pageTokens.ts`:

- Constantes canônicas em **pt**: `PAGE_MARGIN_PT = 40`, `BASE_FONT_PT = 12`, `BASE_LINE_HEIGHT = 1.4`, e o tamanho A4.
- `pageTokensToPdf()` → objeto de estilo do `<Page>` (pt, como hoje).
- `pageTokensToCss()` → `CSSProperties`/variáveis para a `PageSheet` (px, via fator pt→px de 96/72).

`AdaptationPdf` passa a consumir `pageTokensToPdf()`. Mexeu num lugar → tela e PDF acompanham. É o "contrato de paridade por nó" do §3.5 estendido ao nível da página.

### 3.2 `PageSheet` — a moldura A4 (compartilhada pelos dois passos)
Novo componente `src/components/adaptation/PageSheet.tsx`: fundo "mesa" cinza, folha branca centralizada na largura A4 (≈794px @96dpi) com sombra, `padding` e tipografia base de `pageTokensToCss()`. Recebe `children` (o `EditorContent`). Usado por **StepContent** e **StepStyling** — é o que faz os dois lerem como a página final. Puramente presentational; sem estado de documento.

### 3.3 NodeViews achatados (os dois modos)
Estender o que os commits recentes começaram (hoje só no modo estilo) para **ambos os modos**: questão/alternativas/imagem renderizam **planas** como no PDF — sem borda de card, sem fundo, sem badge; questões numeradas; correta em verde (preview do professor). A diferença entre os modos não é mais a borda do card, e sim **qual chrome de edição aparece** (§3.4/§3.5).

### 3.4 Passo Conteúdo — chrome de edição estrutural
Mantém a barra de inserir ([`CanonicalToolbar`]: Questão · Imagem · Fórmula · Andaime · Divisória), restilizada para a régua. Editar **o que** o documento diz:
- **Trilho de ações por bloco** (↑ mover, ↓ mover, ⧉ duplicar, 🗑 excluir), ancorado no canto do bloco ativo/hover — substitui as ações hoje embutidas no `QuestionNodeView`.
- **Alternativas**: marcar-correta (radio), remover (✕), "＋ Adicionar alternativa".
- Fórmula visível; controles de formatação de texto **ocultos** (já é a regra do modo `content`).

### 3.5 Passo Estilo — régua tipo Word (consolida 3 superfícies em 1)
Novo `src/components/adaptation/steps/styling/StyleRibbon.tsx`: uma régua fixa no topo da folha com fonte, tamanho, **N / I / S / T**, cor (allowlist), alinhamento, espaçamento, quebra de página e "aplicar a tudo". Regra de alvo via **função pura testável** `styleTarget(state) → { kind: "selection" | "block" | "none", blockId? }`:
- seleção de texto não-vazia → marca **inline** no trecho (comando do editor);
- sem seleção → **bloco** atual (`currentTopLevelBlock`) via `setBlockStyle`/`applyMarkToBlock`/`applyColorToBlock`;
- "aplicar a tudo" → documento via `applyStyleToAllBlocks`.

**Removidos** (consolidados na régua): o popover flutuante `StyleControls` + o handle "Estilo", o `DocumentStyleControl` e o `SelectionBubbleMenu`. Toda a chrome estrutural (trilho/alternativas) fica **oculta** no modo estilo.

## 4. Componentes e arquivos

| Arquivo | Ação |
|---|---|
| `render/pageTokens.ts` | **novo** — tokens de página + `pageTokensToPdf/Css` |
| `render/pdf/AdaptationPdf.tsx` | consome `pageTokensToPdf()` (remove hardcode) |
| `PageSheet.tsx` | **novo** — moldura A4 compartilhada |
| `steps/content/StepContent.tsx` | envolve o editor em `PageSheet`; mantém chrome de conteúdo |
| `steps/styling/StepStyling.tsx` / `StylingSurface.tsx` | envolve em `PageSheet`; usa `StyleRibbon`; remove popover/bubble/DocumentStyleControl |
| `steps/styling/StyleRibbon.tsx` | **novo** — régua tipo Word |
| `steps/styling/styleTarget.ts` | **novo** — função pura de alvo (seleção/bloco/nenhum) |
| `canonical-editor/nodeviews/QuestionNodeView.tsx`, `ImageNodeView.tsx`, answer forms | achatar card chrome nos dois modos; ações de estrutura viram trilho |
| **removidos** | `StyleControls.tsx`, `DocumentStyleControl.tsx`, `SelectionBubbleMenu.tsx` (e helpers órfãos) |

## 5. Fluxo de dados

Nenhuma mudança no fluxo de persistência. Toda mutação continua passando pelos helpers puros testados e pelo `onChange(doc)` do editor → estado do wizard → autosave. A régua e os trilhos são **apresentação** que chama os mesmos helpers. `pageTokens` e `PageSheet` não tocam o documento.

## 6. Testes (gate 100% Vitest)

- `pageTokens`: unit do mapeamento pt→css e do shape do `<Page>` do PDF.
- `styleTarget`: unit cobrindo seleção não-vazia / colapsada / sem bloco.
- `PageSheet`: render test (aplica tokens; renderiza children).
- `StyleRibbon`: comportamento via `styleTarget` + chamadas aos helpers (mockados no nível de callback, como hoje em `StyleControls`).
- NodeViews achatados: assert de ausência de chrome por modo; lógica de estrutura empurrada para reducers puros (política Q-cobertura do design pai) — UI interativa na lista de exclusão legítima do CLAUDE.md.
- Paridade: snapshot da tela vs base do PDF compartilhando `pageTokens` (não pode divergir silenciosamente).

## 7. Rigidez da formatação (validado em POC no editor real — 2026-06-08)

Preocupação do usuário: "o que garante que a formatação é rígida? Um caractere solto não pode quebrar e virar `**teste**` literal?". Resposta: **não pode**, e foi provado no editor Tiptap real do projeto (`/adaptar/editar/:id` com o documento `bb9f01a9`):

- **Negrito é uma marca tipada, fora do texto** — renderiza como `<strong>`; o texto-fonte do documento **não contém nenhum asterisco** (`textHadAsterisks: false`). Formatação nunca é representada por caracteres in-band.
- **Digitar ` **teste**`** no enunciado → ficou **literal** e **nenhum negrito foi criado** (`newStrongCreatedFromAsterisks: false`). Não há input rule de markdown; `**` é só texto.
- **O JSON canônico é a fonte da verdade**: a inserção solta foi **reconciliada de volta** a partir do documento, não persistiu, e o banco ficou **limpo** (sem `teste`).

Garantias de design que sustentam isso: marcas tipadas no JSON (não markdown); **não habilitar input rules de markdown** + sanitizar paste para texto/marcas conhecidas; IA devolve JSON validado por **Zod** (não markdown); math é nó de primeira classe (LaTeX em atributo, nunca `$...$`); cores por **allowlist**; botões disparam **transações ProseMirror / helpers puros testados** (zero `execCommand`); cada edição muta **um nó** com undo por operação. É a eliminação da classe T2/T9 do design pai (§10).

## 8. Não-objetivos (YAGNI)

- Paginação real multi-página dentro do editor (fluxo entre páginas) — adiado; se um dia necessário, `tiptap-pagination-plus` (grátis) assenta sobre o editor atual sem trocar o modelo.
- Edição/exportação DOCX.
- Gerar o PDF de verdade dentro dos passos Conteúdo/Estilo (continua no passo Exportar).

## 8. Riscos

1. **Achatar card chrome no modo conteúdo pode reduzir affordância de edição** → mitigado pelo trilho de ações no hover/bloco ativo + controles inline de alternativa; validar no browser (skill `validate-adaptar`).
2. **Drift tela↔PDF** → fechado pelos `pageTokens` compartilhados + snapshot de paridade.
3. **Cobertura de NodeViews interativos em jsdom** → empurrar lógica para funções puras; UI na exclusão legítima.
