# Design — Paridade tela↔PDF no Adaptar

**Data:** 2026-07-02
**Área:** `src/components/adaptation/render/pdf/` (agente `pdf-debugger`)
**Status:** desenho aprovado, aguardando revisão do spec

## Problema

Backlog de divergências entre o renderer de tela (fonte da verdade) e o PDF
(`@react-pdf/renderer`), catalogado na validação de 2026-07-02. O renderer de PDF é um
espelho 1:1 do de tela em `render/`; o blast radius é pequeno e bem fatorado.

Itens **em escopo** (escolhidos): polish (#2 + #4 + #3), unidade px→pt (#7), bordas de
tabela (#5). **Fora:** render de math (#1, spec próprio); PdfHeader (#6, não é bug).

## Bundle 1 — Polish

Objetos de estilo isolados, mesma raiz: o PDF usa cinza chapado `#555555` e perde
distinções de peso/tamanho onde a tela usa tokens semânticos.

- **#2 — Nº da questão cinza/sem negrito.**
  [PdfQuestion.tsx:40](../../../src/components/adaptation/render/pdf/PdfQuestion.tsx)
  usa `{ color: "#555555", marginRight: 6 }`, sem `fontWeight`. A tela
  ([QuestionView.tsx:47](../../../src/components/adaptation/render/blocks/QuestionView.tsx))
  usa `font-bold text-foreground`. → adicionar `fontWeight: "bold"` e cor foreground.

- **#4 — Instrução sem text-sm.**
  [PdfQuestion.tsx:51-52](../../../src/components/adaptation/render/pdf/PdfQuestion.tsx)
  renderiza a instrução italic + `#555555`, **sem** `fontSize` → herda o tamanho base.
  A tela ([QuestionView.tsx:62](../../../src/components/adaptation/render/blocks/QuestionView.tsx))
  usa `text-sm`. → adicionar um `fontSize` menor equivalente.
  **Gap conhecido (fora deste bundle):** `pageTokensToPdf`
  ([pageTokens.ts:50-58](../../../src/components/adaptation/render/pageTokens.ts)) **nunca
  lê** `resolved.elementFontSizes`, enquanto `pageTokensToCss` emite
  `--doc-fs-instruction/stem/alternative/caption`. Então o PDF ignora **todos** os
  overrides por-elemento. A versão barata trata só a instrução; stem/alternativa/legenda
  ficam como follow-up (custo médio, cobre tudo).

- **#3 — h2/h3 sempre bold.**
  [PdfLeafBlocks.tsx:41](../../../src/components/adaptation/render/pdf/PdfLeafBlocks.tsx)
  fixa `fontWeight: "bold"` (700) pra **todos** os níveis. A tela
  ([HeadingBlockView.tsx:12-16](../../../src/components/adaptation/render/blocks/HeadingBlockView.tsx))
  usa h1 `font-bold` (700) e **h2/h3 `font-semibold` (600)**.
  **Caveat honesto:** as fontes a11y registradas
  ([registerFonts.ts](../../../src/components/adaptation/render/pdf/registerFonts.ts))
  só têm 400/700 — não há 600. Setar 600 cai pro vizinho registrado e pode **não mudar
  nada** visível. **Decisão:** aceitar a aproximação (setar peso alvo por nível e
  deixar o fallback agir); **não** registrar um semibold agora (sairia do "barato").
  Se ficar idêntico ao bold, #3 é deferido — documentar no PR.

## Bundle 2 — Unidade px→pt (#7)

[style.ts:18](../../../src/components/adaptation/render/style.ts) emite
`fontSize` em **px**; [nodeStyleToPdf.ts:25](../../../src/components/adaptation/render/pdf/nodeStyleToPdf.ts)
passa o número **sem conversão**, e o react-pdf interpreta número cru como **pt** → o
mesmo valor sai ~33% maior no PDF (1pt = 1.333px). Idem `spacingAfter`
([style.ts:20](../../../src/components/adaptation/render/style.ts) px vs
[nodeStyleToPdf.ts:28](../../../src/components/adaptation/render/pdf/nodeStyleToPdf.ts) pt).

`blockSpacing` e largura de imagem **já** convertem px→pt (via `px2pt` em
[AdaptationPdf.tsx:25](../../../src/components/adaptation/render/pdf/AdaptationPdf.tsx) e
[PdfLeafBlocks.tsx:68](../../../src/components/adaptation/render/pdf/PdfLeafBlocks.tsx)),
então `nodeStyleToPdf` é o **outlier**.

**Decisão:** `NodeStyle` em **px é o canônico** (alinha com o resto). Converter
`fontSize` e `spacingAfter` px→pt (×0.75) no `nodeStyleToPdf`. Reconciliar também o
tamanho dos headings (`HEADING_SIZE = {1:22, 2:18, 3:15}` em
[PdfLeafBlocks.tsx:30](../../../src/components/adaptation/render/pdf/PdfLeafBlocks.tsx)),
que hoje saem inflados vs os px da tela — o `pdf-debugger` mede os tamanhos da tela e
ajusta.

Não afetado (já consistente): `fontSize` de run
([richTextMarks.ts:29](../../../src/components/adaptation/render/richTextMarks.ts) vs
[richTextPdf.ts:23](../../../src/components/adaptation/render/pdf/richTextPdf.ts)) e
`pageStyle.fontSize` (pt em ambos).

## Bundle 3 — Bordas de tabela (#5)

[PdfAnswer.tsx:139,150](../../../src/components/adaptation/render/pdf/PdfAnswer.tsx) dá
`borderWidth: 1` nos 4 lados de cada célula; células adjacentes desenham a mesma aresta
→ linhas internas dobradas (Yoga não tem border-collapse). A tela
([TableView.tsx:14](../../../src/components/adaptation/render/blocks/TableView.tsx)) usa
`border-collapse`.

**Decisão:** borda por célula só em topo+esquerda + borda externa no container,
simulando collapse (linha interna única). Contido no case `table`
([PdfAnswer.tsx:132-160](../../../src/components/adaptation/render/pdf/PdfAnswer.tsx)).

## #6 — só verificação (não é bug)

`PdfHeader` ([AdaptationPdf.tsx:33-55](../../../src/components/adaptation/render/pdf/AdaptationPdf.tsx))
**não fixa** `fontFamily` — herda do `<Page style={pageTokensToPdf(resolved)}>` por
cascata, igual ao corpo. Não há hardcode a corrigir. Ação: na validação final,
exportar com `pageStyle.fontFamily` não-default e confirmar que o header muda junto.

## Estratégia de testes (TDD, via pdf-debugger)

Red→Green por item; os testes de PDF já existem e cobrem os pontos:
`nodeStyleToPdf.test`, parity, mappers, `richTextPdf.test`, `AdaptationPdf.test`.

- #2/#4/#3 → asserts nos objetos de estilo (peso/cor/fontSize) via mapper/parity.
- #7 → `nodeStyleToPdf.test`: `fontSize`/`spacingAfter` convertidos px→pt; heading
  parity.
- #5 → estrutura de borda por célula.
- Fecho: **validate-adaptar** exporta um PDF real (math cru é esperado, está fora de
  escopo) e confirma visualmente polish + tamanhos + tabela + cascata do header (#6).

Gate 100% (Vitest) mantido. Área **FRÁGIL** → toda mudança pelo agente `pdf-debugger`.

## Ordem sugerida

Bundle 1 (barato, alto ROI) → Bundle 2 (unidade, determinístico) → Bundle 3 (tabela).
Branch/PR separado do trabalho de imagem fabricada. Nunca push direto em `main`.

## Fora de escopo

- #1 math (KaTeX→imagem): spec próprio, big rock.
- Extensão de #4 pro root (`elementFontSizes` em `pageTokensToPdf`): follow-up.
- Registrar peso semibold (600) nas fontes a11y.

## Doc viva

Se algum caminho/arquivo de `render/pdf/` mudar de forma que o agente `pdf-debugger`
descreve, atualizar a descrição do agente na mesma tarefa.
