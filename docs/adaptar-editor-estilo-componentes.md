# Adaptar — Componentes "Conteúdo" e "Estilo" (estado atual)

> Documento de referência para discussão/melhoria. Descreve **como os dois passos
> de edição da adaptação funcionam hoje** no código (branch `feat/adaptar-canonical-restructure`),
> sem propor mudanças. É a fotografia da implementação atual.

---

## 0. Contexto em uma frase

Depois que a IA gera a atividade adaptada, o usuário a edita num **wizard** que tem
dois passos visuais quase idênticos — **Conteúdo** e **Estilo** — que são, na verdade,
**o mesmo editor Tiptap** renderizado em **dois modos** diferentes. A diferença não é
"telas diferentes": é um único editor sobre um único documento, que liga/desliga
controles conforme o modo.

```
Wizard Adaptar:  Tipo → Atividade → Barreiras → Gerar (IA) → [CONTEÚDO] → [ESTILO] → Exportar PDF
                                                              └──────── mesmo editor ────────┘
```

---

## 1. A fundação compartilhada (o que os dois passos têm em comum)

Antes de descrever cada passo, é preciso entender as 4 peças que **ambos** usam.

### 1.1 Documento canônico (a única fonte da verdade)
Toda a atividade adaptada é **um documento JSON canônico** validado por Zod
(`src/lib/adaptation/canonical/schema.ts`). É uma lista ordenada de **blocos**:

- `heading` (título/seção)
- `paragraph` (texto com marcas inline: bold, italic, underline, strike, cor)
- `blockMath` / inline `inlineMath` (LaTeX como atributo — nó de primeira classe, nunca `$...$`)
- `image` (src, alt, width, alignment, caption)
- `scaffolding` (andaime/apoio)
- `divider` (divisória)
- `question` (questão — ver §1.2)

Cada bloco tem **id estável** e um campo opcional `style` (a formatação visual — ver §3).

### 1.2 O bloco `question`
A questão **não é** "enunciado + alternativas". O schema separa três coisas
(`schema.ts:244`):

```ts
question = {
  stem:        Block[]            // o ENUNCIADO — recursivo: parágrafos, imagens, math…
  instruction: RichText | null   // INSTRUÇÃO opcional ("marque a correta", "complete…")
  answer:      QuestionAnswer     // a INTERAÇÃO tipada (discriminated union — 8 tipos)
}
```

Os **8 tipos de resposta** (`answer.kind`):
`open` (dissertativa) · `multipleChoice` · `trueFalse` · `checkbox` · `matching` (associação) ·
`ordering` (ordenação) · `fillBlank` (lacunas) · `table`.
> Em `multipleChoice`, exatamente **1** alternativa precisa ter `correct: true` (Zod garante).

### 1.3 O editor: `useCanonicalEditor`
`src/components/adaptation/canonical-editor/useCanonicalEditor.ts` — encapsula o Tiptap:

- Semeia o editor a partir do documento canônico (`canonicalToProseMirror`).
- A cada edição, converte o ProseMirror de volta pra canônico e só dispara `onChange`
  **quando o documento realmente muda** (deep-compare) — evita loops.
- Estados transitórios inválidos (imagem com src vazio, math vazia, doc vazio) **não**
  são emitidos: o pai mantém o último documento válido.
- Liga **NodeViews React** aos nós custom: `QuestionNodeView`, `ImageNodeView`,
  `BlockMathNodeView`, `InlineMathNodeView`, `ScaffoldNodeView`.

**Os dois passos usam o mesmo hook.** O Estilo apenas passa `extraExtensions`
(realce do bloco atual) e um `onSelectionUpdate` (rastrear o bloco selecionado).

### 1.4 A moldura visual: `PageSheet`
`src/components/adaptation/PageSheet.tsx` — uma "folha A4" branca (`794px`) sobre uma
mesa cinza, com uma **barra fixa no topo**. A tipografia/margem vêm de `pageTokensToCss()`
(paridade com o PDF). É só apresentação — não conhece o documento. O que muda entre os
passos é **o que vai na barra**: toolbar de inserir (Conteúdo) ou régua de formatação (Estilo).

### 1.5 O interruptor de modo: `EditorMode`
`src/components/adaptation/canonical-editor/EditorMode.tsx` — um React Context com dois
valores: `"content"` | `"style"`.

- O passo **Conteúdo** renderiza o editor **sem provider** → `useEditorMode()` cai no
  default `"content"`.
- O passo **Estilo** envolve o editor em `<EditorModeProvider value="style">`.

Cada NodeView consulta `useEditorMode()` e **mostra ou esconde** controles. É esse único
context que faz os dois passos parecerem diferentes a partir do mesmo editor.

---

## 2. Passo "Conteúdo" (`StepContent`)

**Arquivo:** `src/components/adaptation/steps/content/StepContent.tsx`
**Modo:** `"content"` (sem provider).
**Propósito:** mexer na **estrutura e no texto** — o QUE a atividade diz.

### Layout
- Cabeçalho: ícone + "Conteúdo" + "Edite o texto e as questões da atividade adaptada." +
  botão **Regerar** (dispara a IA de novo).
- `PageSheet` com a **`CanonicalToolbar`** na barra fixa + o editor (`EditorContent`).
- Rodapé: **Voltar** / **Estilo** (avança).

### `CanonicalToolbar` — barra de INSERIR blocos
`src/components/adaptation/canonical-editor/CanonicalToolbar.tsx`. Só botões de inserção
(nada de formatação de texto — isso é do Estilo):

| Botão | Ação |
|---|---|
| **Questão** (dropdown) | Insere questão de um dos 8 tipos: Dissertativa, Múltipla escolha, V/F, Caixas de seleção, Associação, Ordenação, Lacunas, Tabela |
| **Título** (H1) / **Seção** (H2) | Heading |
| **Inserir instrução** (¶) | Parágrafo |
| **Inserir imagem** | Bloco de imagem (vazio) |
| **Inserir fórmula** (Σ) | BlockMath |
| **Inserir andaime** | Scaffolding |
| **Inserir divisória** | Divider |

Cada botão constrói um nó canônico (`commands.ts`) e chama `insertContent`.

### A questão no modo Conteúdo — `QuestionNodeView`
`src/components/adaptation/canonical-editor/nodeviews/QuestionNodeView.tsx`. Estrutura visível:

1. **"Questão N"** — rótulo **read-only**, ordinal automático pela posição no documento
   (não há número/pontos/dificuldade editáveis).
2. **Ações de estrutura** (aparecem no hover, **só no modo Conteúdo**): mover ↑/↓,
   adicionar imagem ao enunciado, excluir questão.
3. **Enunciado (`stem`)** — conteúdo rico editável via `NodeViewContent` (o cursor entra
   ali e digita; aceita parágrafos, imagens, math etc.).
4. **"Instrução"** — caixa rotulada separada, **só aparece se `instruction != null`**;
   editável via `RichTextField`; tem um "×" pra remover (modo Conteúdo).
   → **É exatamente este o campo separado que motivou a discussão de "remover a separação".**
5. **"Resposta"** — renderizada pelo `AnswerEditor`.

### A resposta no modo Conteúdo — `AnswerEditor`
`src/components/adaptation/canonical-editor/answer-editors/AnswerEditor.tsx`. Renderiza UI
por tipo e despacha mutações puras (`answerOps.ts`). No modo Conteúdo aparecem **todos**
os controles estruturais:

- **multipleChoice:** radio "correta" + texto da alternativa + remover + "Alternativa" (add).
- **trueFalse:** texto + botão V/F.
- **checkbox:** checkbox + texto.
- **matching:** Coluna A ↔ Coluna B + remover par + "Par" (add).
- **ordering:** índice + texto + mover ↑/↓.
- **fillBlank:** "Lacuna N" + chave de resposta (input) + remover + "Lacuna" (add).
- **table:** grade de células.
- **open:** "Linhas de resposta" (número).

### O que o passo Conteúdo permite, na prática
- Editar todo o texto, inserir/excluir/reordenar blocos e questões.
- Inserir imagem **em qualquer ponto** (top-level pela toolbar, ou dentro do enunciado
  pela ação da questão) — o `stem` recursivo já suporta isso.
- Trocar conteúdo das respostas e a chave de gabarito.
- **Não** formata aparência (cor, fonte, alinhamento) — isso é o Estilo.

---

## 3. Passo "Estilo" (`StylingSurface`)

**Arquivo:** `src/components/adaptation/steps/styling/StylingSurface.tsx`
**Modo:** `"style"` (envolto em `EditorModeProvider value="style"`).
**Propósito:** formatar a **aparência** — COMO a atividade se parece (a "cara de Word").

### Como funciona
Mesmo editor, mesmo documento. A diferença:

- Envolto em `<EditorModeProvider value="style">` → todos os NodeViews **escondem os
  controles estruturais** (mover/excluir/adicionar/marcar-correta/V-F/chave de lacuna).
  O que sobra são os **campos de conteúdo formatável** (texto das alternativas, células,
  caption de imagem) — você pode selecionar e formatar, mas não reestruturar.
- `extraExtensions: [CurrentBlockHighlight]` realça o bloco onde o cursor está.
- `onSelectionUpdate` rastreia o **bloco atual** (`currentTopLevelBlock`), pra a régua
  refletir/aplicar estilo nele.
- Na barra fixa vai a **`StyleRibbon`** (em vez da `CanonicalToolbar`).

### O alvo da formatação — `styleTarget`
`src/components/adaptation/steps/styling/styleTarget.ts` decide onde a ação cai:

- **Seleção não-vazia** → aplica **marca inline** (bold/italic/cor) no trecho selecionado.
- **Cursor num bloco** (seleção vazia) → aplica **estilo de bloco** (fonte, tamanho,
  alinhamento, espaçamento) no bloco inteiro.
- **Sem alvo editável** → as ações viram no-op.

A formatação é gravada de dois jeitos: marcas inline no texto (via `toggleMark`/`setColor`
do Tiptap) **ou** o campo `style` do bloco canônico (via helpers puros `setBlockStyle` /
`applyMarkToBlock` / `applyColorToBlock`).

### `StyleRibbon` — a "régua tipo Word"
`src/components/adaptation/steps/styling/StyleRibbon.tsx`. Consolida o que antes eram três
superfícies (StyleControls, DocumentStyleControl, SelectionBubbleMenu) numa barra horizontal
única. É **presentational** — recebe o estilo do bloco atual e dispara callbacks. Controles:

| Controle | Campo | Efeito |
|---|---|---|
| **Fonte** (select) | `style.fontFamily` | Família de fonte do bloco |
| **Tamanho (px)** (number) | `style.fontSize` | Tamanho da fonte do bloco |
| **Negrito / Itálico** | marca inline ou bloco | Conforme o alvo (§3) |
| **Cor do texto** (8 swatches + "remover") | marca inline ou bloco | Allowlist de cores |
| **Alinhar** (select) | `style.align` | left / center / right / justify |
| **Espaçamento (px)** (number) | `style.spacingAfter` | Espaço após o bloco |
| **Quebra** (checkbox) | `style.pageBreakBefore` | Força quebra de página antes |
| **Aplicar a tudo** | — | Propaga o estilo do bloco atual a todos os blocos |

### O que o passo Estilo permite, na prática
- Formatar texto (negrito/itálico/cor) por seleção, ou estilizar blocos inteiros
  (fonte/tamanho/alinhamento/espaçamento).
- Controlar quebra de página e propagar um estilo a todos os blocos.
- **Não** mexe na estrutura: não adiciona/remove questões, alternativas, não troca o
  gabarito. (Tudo isso fica escondido pelo modo.)

---

## 4. Resumo da diferença Conteúdo × Estilo

| Aspecto | **Conteúdo** (`"content"`) | **Estilo** (`"style"`) |
|---|---|---|
| Pergunta que responde | O QUE a atividade diz | COMO ela se parece |
| Barra no topo da folha | `CanonicalToolbar` (inserir blocos) | `StyleRibbon` (formatar) |
| Provider de modo | nenhum (default content) | `EditorModeProvider value="style"` |
| Ações de estrutura da questão (mover/excluir/+imagem) | ✅ visíveis | ❌ escondidas |
| Controles de resposta (add/remover/correta/V-F/chave) | ✅ visíveis | ❌ escondidos |
| Texto/células/caption | edição de conteúdo | edição + formatação |
| Formatação (fonte/cor/alinhamento/quebra) | ❌ ausente | ✅ a régua inteira |
| Realce do bloco atual | ❌ | ✅ (`CurrentBlockHighlight`) |
| Editor / documento | **o mesmo** (`useCanonicalEditor`, doc canônico) | **o mesmo** |
| Moldura | `PageSheet` (folha A4) | `PageSheet` (folha A4) |

**A ideia central:** um editor, um documento, dois modos. "Conteúdo" e "Estilo" são a
mesma superfície com um interruptor (`EditorMode`) que mostra/esconde controles. A folha
A4 (`PageSheet`) e a tipografia são idênticas nos dois — o que muda é a barra e quais
controles os NodeViews expõem.

---

## 5. Mapa de arquivos (para referência rápida)

```
src/components/adaptation/
├── PageSheet.tsx                          # moldura A4 compartilhada
├── canonical-editor/
│   ├── useCanonicalEditor.ts              # o editor Tiptap (usado pelos 2 passos)
│   ├── EditorMode.tsx                      # context content|style
│   ├── CanonicalToolbar.tsx                # barra de INSERIR (passo Conteúdo)
│   ├── commands.ts                         # builders de blocos/questões
│   ├── RichTextField.tsx                   # editor inline de 1 parágrafo (alternativas etc.)
│   ├── nodeviews/
│   │   ├── QuestionNodeView.tsx            # card da questão (stem + instrução + resposta)
│   │   ├── ImageNodeView.tsx               # imagem (resize/align/caption/alt)
│   │   ├── BlockMathNodeView.tsx / InlineMathNodeView.tsx
│   │   └── ScaffoldNodeView.tsx
│   └── answer-editors/
│       ├── AnswerEditor.tsx                # UI dos 8 tipos de resposta
│       └── answerOps.ts                     # mutações puras das respostas
└── steps/
    ├── content/StepContent.tsx             # PASSO CONTEÚDO
    └── styling/
        ├── StepStyling.tsx                  # wrapper do passo
        ├── StylingSurface.tsx               # PASSO ESTILO (editor em style mode)
        ├── StyleRibbon.tsx                  # a régua tipo Word
        ├── styleTarget.ts                   # seleção vs bloco
        ├── currentBlock.ts / styleDecoration.ts / findBlockStyle.ts / blockMarks.ts

src/lib/adaptation/
├── canonical/schema.ts                     # documento canônico + question + 8 respostas
└── tiptap/                                 # conversão canônico ↔ ProseMirror (lossless)
```

---

## 6. Pontos que provavelmente entram na discussão de melhoria

Sem propor solução — só sinalizando onde o design atual e o pedido original se tocam:

1. **Separação Instrução × Enunciado.** Hoje a questão tem `stem` (enunciado) **e** um
   campo `instruction` separado, com caixa rotulada própria no `QuestionNodeView`. Esse
   campo está cravado no schema canônico, no contrato da IA (`ai.ts`), no prompt e no PDF.
   Remover/fundir mexe em todas essas camadas (+ migração de adaptações existentes).
2. **"Editor tipo Word / imagens em qualquer lugar"** — já existe: o `stem` é recursivo e
   a toolbar insere blocos em qualquer ponto. O gap é mais de **descoberta/UX** do que de
   capacidade.
3. **"Respostas além de múltipla escolha"** — já existem 8 tipos no schema e no dropdown
   "Questão". Dois sub-temas possíveis: (a) a IA tende a gerar só múltipla escolha; (b)
   trocar o tipo de uma questão existente não tem UI dedicada (hoje insere-se uma nova).
4. **Dois passos vs um.** A separação Conteúdo/Estilo é um modo, não duas telas. Uma
   discussão de "experiência minimalista" pode questionar se faz sentido manter os dois
   passos separados ou fundir num só com formatação contextual.
