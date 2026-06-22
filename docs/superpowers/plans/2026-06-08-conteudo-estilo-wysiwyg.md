# Folha tipo Word para os passos Conteúdo + Estilo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer os passos Conteúdo e Estilo do Adaptar lerem como a folha final (A4 estilo Word) mantendo todas as funções, consolidando a formatação numa régua fixa no topo.

**Architecture:** Mudança só de apresentação sobre o editor Tiptap canônico existente. Três peças novas: tokens de página compartilhados com o `@react-pdf` (`render/pageTokens.ts`), uma moldura A4 (`PageSheet.tsx`) usada pelos dois passos, e uma régua tipo Word para o Estilo (`StyleRibbon.tsx` + `styleTarget.ts`). NodeViews ficam achatados; a barra de cada passo fica presa no topo e só a folha rola. Modelo canônico, helpers de estilo e persistência **não mudam**.

**Tech Stack:** React 18 + TypeScript, Tiptap/ProseMirror, @react-pdf/renderer, Tailwind, Vitest + Testing Library. Gate de cobertura 100%.

**Spec:** [docs/superpowers/specs/2026-06-08-conteudo-estilo-wysiwyg-design.md](../specs/2026-06-08-conteudo-estilo-wysiwyg-design.md)

---

## File Structure

**Novos:**
- `src/components/adaptation/render/pageTokens.ts` — constantes da página (margem/fonte/entrelinha A4) + `pageTokensToPdf()` / `pageTokensToCss()`. Fonte única de paridade tela↔PDF.
- `src/components/adaptation/PageSheet.tsx` — moldura: barra fixa no topo + "mesa" cinza rolável com a folha A4 branca.
- `src/components/adaptation/steps/styling/styleTarget.ts` — função pura: dado o estado do editor, decide se a formatação vai para a seleção, para o bloco atual, ou nada.
- `src/components/adaptation/steps/styling/StyleRibbon.tsx` — régua tipo Word (fonte, tamanho, N/I/S/T, cor, alinhamento, espaço, quebra, aplicar a tudo).

**Modificados:**
- `src/components/adaptation/render/pdf/AdaptationPdf.tsx` — consome `pageTokensToPdf()` (tira hardcode).
- `src/components/adaptation/steps/content/StepContent.tsx` — usa `useCanonicalEditor` + `PageSheet` com `CanonicalToolbar` na barra.
- `src/components/adaptation/steps/styling/StylingSurface.tsx` — usa `PageSheet` + `StyleRibbon`; remove popover/handle/bubble.
- `src/components/adaptation/canonical-editor/nodeviews/QuestionNodeView.tsx` — achata o card (sem borda/box); ações de estrutura viram trilho no hover/ativo.
- `src/components/adaptation/canonical-editor/nodeviews/ImageNodeView.tsx` — achata o container.

**Removidos (consolidados na régua):**
- `src/components/adaptation/steps/styling/StyleControls.tsx` (+ `.test.tsx`)
- `src/components/adaptation/steps/styling/DocumentStyleControl.tsx` (+ `.test.tsx`)
- `src/components/adaptation/steps/styling/SelectionBubbleMenu.tsx` (+ `.test.tsx`)
- `src/components/adaptation/steps/styling/anchorRect.ts` (+ `.test.ts`) — geometria do handle flutuante, sem uso.

**Preservados (a régua reusa):** `blockMarks.ts` (`applyMarkToBlock`/`applyColorToBlock`), `findBlockStyle.ts`, `currentBlock.ts` (`currentTopLevelBlock`), `styleDecoration.ts` (`CurrentBlockHighlight`), `style.ts` (`setBlockStyle`), `applyStyleToAll.ts`.

---

## Fase A — Fundação: tokens de página + PageSheet

### Task A1: Tokens de página compartilhados

**Files:**
- Create: `src/components/adaptation/render/pageTokens.ts`
- Test: `src/components/adaptation/render/pageTokens.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

```ts
import { describe, it, expect } from "vitest";
import { PAGE_MARGIN_PT, BASE_FONT_PT, BASE_LINE_HEIGHT, pageTokensToPdf, pageTokensToCss } from "./pageTokens";

describe("pageTokens", () => {
  it("expõe as constantes canônicas da página (espelham o PDF atual)", () => {
    expect(PAGE_MARGIN_PT).toBe(40);
    expect(BASE_FONT_PT).toBe(12);
    expect(BASE_LINE_HEIGHT).toBe(1.4);
  });

  it("pageTokensToPdf devolve o estilo base do <Page> em pt", () => {
    expect(pageTokensToPdf()).toEqual({
      flexDirection: "column",
      padding: 40,
      fontSize: 12,
      lineHeight: 1.4,
    });
  });

  it("pageTokensToCss converte pt->px (96/72) para a folha da tela", () => {
    const css = pageTokensToCss();
    expect(css.padding).toBe("53.33px"); // 40 * 96/72
    expect(css.fontSize).toBe("16px"); // 12 * 96/72
    expect(css.lineHeight).toBe(1.4);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `NODE_OPTIONS='--max-old-space-size=19456' npx vitest run src/components/adaptation/render/pageTokens.test.ts`
Expected: FAIL — "Failed to resolve import './pageTokens'".

- [ ] **Step 3: Implementar**

```ts
/**
 * pageTokens — fonte única dos valores-base da PÁGINA, compartilhada entre o
 * PDF (@react-pdf, em pt) e a folha da tela (CSS, em px). Mexer aqui move as
 * duas superfícies juntas: é o contrato de paridade do design (§3.1).
 */
import type { CSSProperties } from "react";

/** Margem da página A4, em pontos (1pt = 1/72in) — igual ao PDF atual. */
export const PAGE_MARGIN_PT = 40;
/** Tamanho de fonte base, em pontos. */
export const BASE_FONT_PT = 12;
/** Entrelinha base (multiplicador). */
export const BASE_LINE_HEIGHT = 1.4;

/** pt -> px na tela (CSS px = pt * 96/72). */
const PT_TO_PX = 96 / 72;
const px = (pt: number) => `${Math.round(pt * PT_TO_PX * 100) / 100}px`;

/** Estilo base do <Page> do react-pdf (em pt). */
export function pageTokensToPdf() {
  return {
    flexDirection: "column" as const,
    padding: PAGE_MARGIN_PT,
    fontSize: BASE_FONT_PT,
    lineHeight: BASE_LINE_HEIGHT,
  };
}

/** Estilo base da folha da tela (em px). */
export function pageTokensToCss(): CSSProperties {
  return {
    padding: px(PAGE_MARGIN_PT),
    fontSize: px(BASE_FONT_PT),
    lineHeight: BASE_LINE_HEIGHT,
  };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `NODE_OPTIONS='--max-old-space-size=19456' npx vitest run src/components/adaptation/render/pageTokens.test.ts`
Expected: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
git add src/components/adaptation/render/pageTokens.ts src/components/adaptation/render/pageTokens.test.ts
git commit -m "feat(adaptar): tokens de página compartilhados tela/PDF"
```

### Task A2: AdaptationPdf consome os tokens

**Files:**
- Modify: `src/components/adaptation/render/pdf/AdaptationPdf.tsx:50-53`
- Test: `src/components/adaptation/render/pdf/AdaptationPdf.test.tsx` (já existe — ajustar/garantir)

- [ ] **Step 1: Ajustar o teste para fixar a paridade**

Adicionar ao teste existente (ou criar se necessário) um caso que garante que o `<Page>` usa os tokens:

```tsx
import { pageTokensToPdf } from "../pageTokens";
// ... dentro do describe existente:
it("aplica os tokens de página compartilhados no <Page>", () => {
  // O <Page> base deve herdar padding/fontSize/lineHeight de pageTokensToPdf();
  // só o fontFamily vem das settings.
  const base = pageTokensToPdf();
  expect(base.padding).toBe(40);
  expect(base.fontSize).toBe(12);
});
```

> Nota: `@react-pdf/renderer` não monta DOM em jsdom; os testes deste arquivo já validam o shape via os builders. Mantenha o estilo do `<Page>` derivado de `pageTokensToPdf()` para a asserção fazer sentido.

- [ ] **Step 2: Rodar e ver o estado atual**

Run: `NODE_OPTIONS='--max-old-space-size=19456' npx vitest run src/components/adaptation/render/pdf/AdaptationPdf.test.tsx`
Expected: o novo caso pode passar trivialmente; o objetivo é a refatoração do Step 3 não quebrar nada.

- [ ] **Step 3: Refatorar o `<Page>`**

Em `AdaptationPdf.tsx`, importar e usar os tokens:

```tsx
import { pageTokensToPdf } from "../pageTokens";
```

Trocar:

```tsx
<Page
  size="A4"
  style={{ flexDirection: "column", padding: 40, fontFamily: settings.fontFamily, fontSize: 12, lineHeight: 1.4 }}
>
```

por:

```tsx
<Page size="A4" style={{ ...pageTokensToPdf(), fontFamily: settings.fontFamily }}>
```

- [ ] **Step 4: Rodar a suíte do PDF**

Run: `NODE_OPTIONS='--max-old-space-size=19456' npx vitest run src/components/adaptation/render/pdf`
Expected: PASS (sem regressão).

- [ ] **Step 5: Commit**

```bash
git add src/components/adaptation/render/pdf/AdaptationPdf.tsx src/components/adaptation/render/pdf/AdaptationPdf.test.tsx
git commit -m "refactor(adaptar): PDF usa tokens de página compartilhados"
```

### Task A3: Componente PageSheet (moldura A4 + barra fixa)

**Files:**
- Create: `src/components/adaptation/PageSheet.tsx`
- Test: `src/components/adaptation/PageSheet.test.tsx`

- [ ] **Step 1: Escrever o teste que falha**

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PageSheet } from "./PageSheet";

describe("PageSheet", () => {
  it("renderiza a barra fixa e a folha com o conteúdo", () => {
    render(
      <PageSheet toolbar={<div>BARRA</div>}>
        <p>conteúdo da folha</p>
      </PageSheet>,
    );
    expect(screen.getByText("BARRA")).toBeInTheDocument();
    expect(screen.getByText("conteúdo da folha")).toBeInTheDocument();
    expect(screen.getByTestId("page-sheet")).toBeInTheDocument();
  });

  it("aplica os tokens de página na folha (fonte base 16px)", () => {
    render(<PageSheet toolbar={null}><span>x</span></PageSheet>);
    const sheet = screen.getByTestId("page-sheet");
    expect(sheet.style.fontSize).toBe("16px");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `NODE_OPTIONS='--max-old-space-size=19456' npx vitest run src/components/adaptation/PageSheet.test.tsx`
Expected: FAIL — "Failed to resolve import './PageSheet'".

- [ ] **Step 3: Implementar**

```tsx
/**
 * PageSheet — moldura visual compartilhada pelos passos Conteúdo e Estilo.
 *
 * A barra (`toolbar`) fica PRESA no topo; só a "mesa" cinza rola, com a folha
 * A4 branca centralizada. A tipografia/margem da folha vêm de `pageTokensToCss`
 * (paridade com o PDF). É só apresentação — não conhece o documento.
 */
import type { ReactNode } from "react";
import { pageTokensToCss } from "./render/pageTokens";

interface PageSheetProps {
  /** Barra fixa no topo (régua do Estilo ou toolbar de inserir do Conteúdo). */
  toolbar: ReactNode;
  children: ReactNode;
}

export function PageSheet({ toolbar, children }: PageSheetProps) {
  return (
    <div className="flex flex-col rounded-md border border-input overflow-hidden">
      <div className="shrink-0 bg-background">{toolbar}</div>
      <div className="flex-1 overflow-auto bg-muted/40 p-6 max-h-[calc(100vh-280px)]">
        <div
          data-testid="page-sheet"
          className="mx-auto w-[794px] max-w-full bg-white text-foreground shadow-lg"
          style={pageTokensToCss()}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

export default PageSheet;
```

- [ ] **Step 4: Rodar e ver passar**

Run: `NODE_OPTIONS='--max-old-space-size=19456' npx vitest run src/components/adaptation/PageSheet.test.tsx`
Expected: PASS (2 testes).

- [ ] **Step 5: Commit**

```bash
git add src/components/adaptation/PageSheet.tsx src/components/adaptation/PageSheet.test.tsx
git commit -m "feat(adaptar): PageSheet — moldura A4 com barra fixa"
```

---

## Fase B — Estilo: régua tipo Word

### Task B1: styleTarget (função pura de alvo)

**Files:**
- Create: `src/components/adaptation/steps/styling/styleTarget.ts`
- Test: `src/components/adaptation/steps/styling/styleTarget.test.ts`

> Reusa `currentTopLevelBlock(state)` de `./currentBlock` (já testado), que devolve `{ id, pos } | null`.

- [ ] **Step 1: Escrever o teste que falha**

```ts
import { describe, it, expect } from "vitest";
import { styleTarget } from "./styleTarget";

// EditorState mínimo: só o que styleTarget lê (selection.empty) + currentTopLevelBlock.
function fakeState(opts: { empty: boolean; block: { id: string; pos: number } | null }) {
  return {
    selection: { empty: opts.empty },
    // currentTopLevelBlock lê doc/selection; aqui injetamos via stub no módulo.
    __block: opts.block,
  } as never;
}

// Mockamos currentTopLevelBlock para isolar a decisão.
vi.mock("./currentBlock", () => ({
  currentTopLevelBlock: (s: { __block: unknown }) => s.__block,
}));

describe("styleTarget", () => {
  it("seleção não-vazia -> selection", () => {
    expect(styleTarget(fakeState({ empty: false, block: { id: "b1", pos: 0 } }))).toEqual({ kind: "selection" });
  });
  it("seleção vazia com bloco -> block + id", () => {
    expect(styleTarget(fakeState({ empty: true, block: { id: "b1", pos: 3 } }))).toEqual({ kind: "block", blockId: "b1" });
  });
  it("seleção vazia sem bloco -> none", () => {
    expect(styleTarget(fakeState({ empty: true, block: null }))).toEqual({ kind: "none" });
  });
});
```

> Adicione `import { vi } from "vitest";` no topo.

- [ ] **Step 2: Rodar e ver falhar**

Run: `NODE_OPTIONS='--max-old-space-size=19456' npx vitest run src/components/adaptation/steps/styling/styleTarget.test.ts`
Expected: FAIL — "Failed to resolve import './styleTarget'".

- [ ] **Step 3: Implementar**

```ts
/**
 * styleTarget — decide para ONDE a régua de estilo aplica uma mudança:
 *  - seleção de texto não-vazia -> "selection" (marca inline naquele trecho);
 *  - sem seleção, cursor num bloco -> "block" (o bloco inteiro);
 *  - nada selecionável -> "none".
 * Pura e testável: a régua (UI) só lê o resultado e despacha.
 */
import type { EditorState } from "@tiptap/pm/state";
import { currentTopLevelBlock } from "./currentBlock";

export type StyleTarget =
  | { kind: "selection" }
  | { kind: "block"; blockId: string }
  | { kind: "none" };

export function styleTarget(state: EditorState): StyleTarget {
  if (!state.selection.empty) return { kind: "selection" };
  const block = currentTopLevelBlock(state);
  if (block) return { kind: "block", blockId: block.id };
  return { kind: "none" };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `NODE_OPTIONS='--max-old-space-size=19456' npx vitest run src/components/adaptation/steps/styling/styleTarget.test.ts`
Expected: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
git add src/components/adaptation/steps/styling/styleTarget.ts src/components/adaptation/steps/styling/styleTarget.test.ts
git commit -m "feat(adaptar): styleTarget — alvo da formatação (seleção/bloco)"
```

### Task B2: StyleRibbon (régua tipo Word)

**Files:**
- Create: `src/components/adaptation/steps/styling/StyleRibbon.tsx`
- Test: `src/components/adaptation/steps/styling/StyleRibbon.test.tsx`

A régua é presentational: recebe o `style` do bloco atual e callbacks (a `StylingSurface` liga aos helpers). Reusa as mesmas props que `StyleControls`/`DocumentStyleControl` ofereciam, num layout horizontal único.

- [ ] **Step 1: Escrever o teste que falha**

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { StyleRibbon } from "./StyleRibbon";

const noop = () => {};

function setup(over: Partial<React.ComponentProps<typeof StyleRibbon>> = {}) {
  const props = {
    style: {},
    onPatch: vi.fn(),
    onToggleMark: vi.fn(),
    onColorBlock: vi.fn(),
    onApplyToAll: vi.fn(),
    ...over,
  };
  render(<StyleRibbon {...props} />);
  return props;
}

describe("StyleRibbon", () => {
  it("mostra os controles de fonte, tamanho, marcas e alinhamento", () => {
    setup();
    expect(screen.getByLabelText("Fonte")).toBeInTheDocument();
    expect(screen.getByLabelText("Tamanho (px)")).toBeInTheDocument();
    expect(screen.getByLabelText("Negrito")).toBeInTheDocument();
    expect(screen.getByLabelText("Aplicar a tudo")).toBeInTheDocument();
  });

  it("Negrito chama onToggleMark('bold')", () => {
    const p = setup();
    fireEvent.click(screen.getByLabelText("Negrito"));
    expect(p.onToggleMark).toHaveBeenCalledWith("bold");
  });

  it("mudar a fonte chama onPatch", () => {
    const p = setup();
    fireEvent.change(screen.getByLabelText("Fonte"), { target: { value: "serif" } });
    expect(p.onPatch).toHaveBeenCalledWith({ fontFamily: "serif" });
  });

  it("Aplicar a tudo chama onApplyToAll com o style atual", () => {
    const p = setup({ style: { fontFamily: "serif" } });
    fireEvent.click(screen.getByLabelText("Aplicar a tudo"));
    expect(p.onApplyToAll).toHaveBeenCalledWith({ fontFamily: "serif" });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `NODE_OPTIONS='--max-old-space-size=19456' npx vitest run src/components/adaptation/steps/styling/StyleRibbon.test.tsx`
Expected: FAIL — "Failed to resolve import './StyleRibbon'".

- [ ] **Step 3: Implementar**

```tsx
/**
 * StyleRibbon — a régua tipo Word do passo Estilo (fixa no topo da PageSheet).
 *
 * Consolida o que antes eram três superfícies (StyleControls / DocumentStyleControl
 * / SelectionBubbleMenu) numa só barra horizontal. É presentational: aplica ao
 * "alvo atual" (seleção ou bloco) via callbacks que a StylingSurface liga aos
 * helpers puros (setBlockStyle / applyMarkToBlock / applyColorToBlock /
 * applyStyleToAllBlocks).
 */
import { Bold, Italic } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ALLOWED_COLORS } from "@/lib/adaptation/canonical/colors";
import { FONT_FAMILY_OPTIONS } from "@/lib/adaptation/canonical/fontFamily";
import type { NodeStyle } from "@/lib/adaptation/canonical/schema";

const ALIGNMENTS: { value: NonNullable<NodeStyle["align"]>; label: string }[] = [
  { value: "left", label: "Esquerda" },
  { value: "center", label: "Centro" },
  { value: "right", label: "Direita" },
  { value: "justify", label: "Justificado" },
];

export interface StyleRibbonProps {
  /** Style do bloco atual (para refletir os valores nos selects). */
  style: NodeStyle;
  onPatch: (partial: Partial<NodeStyle>) => void;
  onToggleMark: (mark: "bold" | "italic") => void;
  onColorBlock: (color: string | null) => void;
  onApplyToAll: (style: NodeStyle) => void;
}

const selectCls = "h-8 rounded-md border border-input bg-background px-2 text-sm";

export function StyleRibbon({ style, onPatch, onToggleMark, onColorBlock, onApplyToAll }: StyleRibbonProps) {
  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-border bg-muted/30 px-2 py-1.5">
      <select
        aria-label="Fonte"
        className={selectCls}
        value={style.fontFamily ?? ""}
        onChange={(e) => onPatch({ fontFamily: e.target.value || undefined })}
      >
        <option value="">Fonte</option>
        {FONT_FAMILY_OPTIONS.map((f) => (
          <option key={f.value} value={f.value}>{f.label}</option>
        ))}
      </select>

      <input
        type="number"
        min={1}
        aria-label="Tamanho (px)"
        className="h-8 w-16 rounded-md border border-input bg-background px-2 text-sm"
        value={style.fontSize ?? ""}
        onChange={(e) => onPatch({ fontSize: e.target.value === "" ? undefined : Number(e.target.value) })}
      />

      <div className="mx-1 h-6 w-px bg-border" />

      <Button type="button" variant="outline" size="icon" className="h-8 w-8" aria-label="Negrito" onClick={() => onToggleMark("bold")}>
        <Bold className="h-4 w-4" />
      </Button>
      <Button type="button" variant="outline" size="icon" className="h-8 w-8" aria-label="Itálico" onClick={() => onToggleMark("italic")}>
        <Italic className="h-4 w-4" />
      </Button>

      <select
        aria-label="Cor do texto"
        className={selectCls}
        value=""
        onChange={(e) => onColorBlock(e.target.value === "__none__" ? null : e.target.value)}
      >
        <option value="" disabled>Cor…</option>
        <option value="__none__">Remover cor</option>
        {ALLOWED_COLORS.map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>

      <div className="mx-1 h-6 w-px bg-border" />

      <select
        aria-label="Alinhamento"
        className={selectCls}
        value={style.align ?? ""}
        onChange={(e) => onPatch({ align: (e.target.value || undefined) as NodeStyle["align"] })}
      >
        <option value="">Alinhar</option>
        {ALIGNMENTS.map((a) => (
          <option key={a.value} value={a.value}>{a.label}</option>
        ))}
      </select>

      <input
        type="number"
        min={0}
        aria-label="Espaçamento (px)"
        className="h-8 w-20 rounded-md border border-input bg-background px-2 text-sm"
        value={style.spacingAfter ?? ""}
        onChange={(e) => onPatch({ spacingAfter: e.target.value === "" ? undefined : Number(e.target.value) })}
      />

      <label className="ml-1 flex items-center gap-1 text-xs text-muted-foreground">
        <input
          type="checkbox"
          aria-label="Quebra de página"
          checked={style.pageBreakBefore ?? false}
          onChange={(e) => onPatch({ pageBreakBefore: e.target.checked || undefined })}
        />
        Quebra
      </label>

      <Button
        type="button"
        size="sm"
        variant="outline"
        className="ml-auto"
        aria-label="Aplicar a tudo"
        onClick={() => onApplyToAll(style)}
      >
        Aplicar a tudo
      </Button>
    </div>
  );
}

export default StyleRibbon;
```

- [ ] **Step 4: Rodar e ver passar**

Run: `NODE_OPTIONS='--max-old-space-size=19456' npx vitest run src/components/adaptation/steps/styling/StyleRibbon.test.tsx`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add src/components/adaptation/steps/styling/StyleRibbon.tsx src/components/adaptation/steps/styling/StyleRibbon.test.tsx
git commit -m "feat(adaptar): StyleRibbon — régua de estilo tipo Word"
```

### Task B3: Religar StylingSurface (PageSheet + StyleRibbon) e remover as 3 superfícies

**Files:**
- Modify: `src/components/adaptation/steps/styling/StylingSurface.tsx`
- Modify: `src/components/adaptation/steps/styling/StylingSurface.test.tsx`
- Delete: `StyleControls.tsx`(+test), `DocumentStyleControl.tsx`(+test), `SelectionBubbleMenu.tsx`(+test), `anchorRect.ts`(+test)

- [ ] **Step 1: Reescrever a StylingSurface**

Substituir o corpo por: hook do editor + seleção do bloco atual + régua na barra da PageSheet. A régua aplica via `styleTarget`: seleção → marca inline pelo editor; bloco → helpers.

```tsx
/**
 * StylingSurface — o passo Estilo: a folha A4 (PageSheet) com o editor canônico
 * em STYLE mode e a régua tipo Word presa no topo. Formatar: selecione um trecho
 * (marca inline) ou clique num bloco (formata o bloco). Tudo via helpers puros.
 */
import { useCallback, useMemo, useRef, useState } from "react";
import { EditorContent, type Editor } from "@tiptap/react";
import { useCanonicalEditor } from "@/components/adaptation/canonical-editor/useCanonicalEditor";
import { EditorModeProvider } from "@/components/adaptation/canonical-editor/EditorMode";
import { PageSheet } from "@/components/adaptation/PageSheet";
import { setBlockStyle } from "@/lib/adaptation/canonical/style";
import { applyStyleToAllBlocks } from "@/lib/adaptation/canonical/applyStyleToAll";
import type { CanonicalDocument, NodeStyle } from "@/lib/adaptation/canonical/schema";
import "katex/dist/katex.min.css";
import { currentTopLevelBlock, type CurrentBlock } from "./currentBlock";
import { CurrentBlockHighlight } from "./styleDecoration";
import { applyMarkToBlock, applyColorToBlock, type BlockToggleMark } from "./blockMarks";
import { findBlockStyle } from "./findBlockStyle";
import { styleTarget } from "./styleTarget";
import { StyleRibbon } from "./StyleRibbon";

type Props = { document: CanonicalDocument; onChange: (doc: CanonicalDocument) => void };

export function StylingSurface({ document, onChange }: Props) {
  const [current, setCurrent] = useState<CurrentBlock | null>(null);
  const editorRef = useRef<Editor | null>(null);

  const handleSelection = useCallback((editor: Editor) => {
    editorRef.current = editor;
    setCurrent(currentTopLevelBlock(editor.state));
  }, []);

  const { editor } = useCanonicalEditor({
    value: document,
    onChange,
    extraExtensions: [CurrentBlockHighlight],
    onSelectionUpdate: handleSelection,
  });
  if (editor) editorRef.current = editor;

  const style: NodeStyle = useMemo(
    () => (current ? findBlockStyle(document, current.id) : {}),
    [current, document],
  );

  const patch = useCallback(
    (partial: Partial<NodeStyle>) => {
      /* v8 ignore next -- a régua sempre renderiza, mas só aplica com um alvo */
      if (!current) return;
      const next: NodeStyle = { ...style, ...partial };
      for (const key of Object.keys(next) as (keyof NodeStyle)[]) {
        if (next[key] === undefined) delete next[key];
      }
      onChange(setBlockStyle(document, current.id, next));
    },
    [current, style, document, onChange],
  );

  const toggleMark = useCallback((mark: BlockToggleMark) => {
    const ed = editorRef.current;
    /* v8 ignore next -- defensivo: precisa de editor + bloco */
    if (!ed) return;
    const t = styleTarget(ed.state);
    if (t.kind === "selection") {
      ed.chain().focus().toggleMark(mark).run();
    } else if (t.kind === "block") {
      const tr = applyMarkToBlock(ed.state, t.blockId, mark);
      if (tr) ed.view.dispatch(tr);
    }
  }, []);

  const colorBlock = useCallback((color: string | null) => {
    const ed = editorRef.current;
    /* v8 ignore next -- defensivo */
    if (!ed) return;
    const t = styleTarget(ed.state);
    if (t.kind === "selection") {
      const chain = ed.chain().focus();
      (color === null ? chain.unsetColor() : chain.setColor(color)).run();
    } else if (t.kind === "block") {
      const tr = applyColorToBlock(ed.state, t.blockId, color);
      if (tr) ed.view.dispatch(tr);
    }
  }, []);

  const applyToAll = useCallback(
    (s: NodeStyle) => onChange(applyStyleToAllBlocks(document, s)),
    [document, onChange],
  );

  if (!editor) return null;

  return (
    <EditorModeProvider value="style">
      <PageSheet
        toolbar={
          <StyleRibbon
            style={style}
            onPatch={patch}
            onToggleMark={toggleMark}
            onColorBlock={colorBlock}
            onApplyToAll={applyToAll}
          />
        }
      >
        <EditorContent editor={editor} className="text-base" />
      </PageSheet>
    </EditorModeProvider>
  );
}

export default StylingSurface;
```

> Nota: `toggleMark`/`colorBlock` agora também tratam o alvo "selection" via `ed.chain()` — é o que substitui o `SelectionBubbleMenu`. `BlockToggleMark` (de `blockMarks`) é `"bold" | "italic"`; o `toggleMark(mark)` do Tiptap aceita esses nomes de marca.

- [ ] **Step 2: Atualizar StylingSurface.test.tsx**

Remover asserções sobre o popover/handle (`open-style-popover`, `Abrir estilo do bloco`) e sobre `DocumentStyleControl`/bubble. Garantir o smoke novo:

```tsx
// substituir o corpo do describe por algo como:
it("renderiza a folha com a régua de estilo", () => {
  render(<StylingSurface document={DOC} onChange={() => {}} />);
  expect(screen.getByTestId("page-sheet")).toBeInTheDocument();
  expect(screen.getByLabelText("Aplicar a tudo")).toBeInTheDocument();
});
```

> Use o mesmo `DOC` fixture já presente no arquivo. `@tiptap/react` é mockado no projeto; mantenha o padrão dos outros testes do diretório (ver `StylingSurface.test.tsx` atual para o mock).

- [ ] **Step 3: Deletar os arquivos consolidados**

```bash
git rm src/components/adaptation/steps/styling/StyleControls.tsx src/components/adaptation/steps/styling/StyleControls.test.tsx \
       src/components/adaptation/steps/styling/DocumentStyleControl.tsx src/components/adaptation/steps/styling/DocumentStyleControl.test.tsx \
       src/components/adaptation/steps/styling/SelectionBubbleMenu.tsx src/components/adaptation/steps/styling/SelectionBubbleMenu.test.tsx \
       src/components/adaptation/steps/styling/anchorRect.ts src/components/adaptation/steps/styling/anchorRect.test.ts
```

- [ ] **Step 4: Rodar a suíte do styling + typecheck**

Run: `NODE_OPTIONS='--max-old-space-size=19456' npx vitest run src/components/adaptation/steps/styling && npx tsc --noEmit`
Expected: PASS; sem erros de tipo nem imports órfãos.

- [ ] **Step 5: Commit**

```bash
git add -A src/components/adaptation/steps/styling
git commit -m "refactor(adaptar): Estilo usa PageSheet + StyleRibbon; remove popover/bubble/doc-control"
```

---

## Fase C — Conteúdo: folha + NodeViews achatados

### Task C1: StepContent na PageSheet com a toolbar fixa

**Files:**
- Modify: `src/components/adaptation/steps/content/StepContent.tsx`
- Modify: `src/components/adaptation/steps/content/StepContent.test.tsx`

- [ ] **Step 1: Reescrever StepContent para usar o hook + PageSheet**

```tsx
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, RefreshCw, FileEdit } from "lucide-react";
import { EditorContent } from "@tiptap/react";
import { useCanonicalEditor } from "@/components/adaptation/canonical-editor/useCanonicalEditor";
import { CanonicalToolbar } from "@/components/adaptation/canonical-editor/CanonicalToolbar";
import { PageSheet } from "@/components/adaptation/PageSheet";
import "katex/dist/katex.min.css";
import type { CanonicalDocument } from "@/lib/adaptation/canonical/schema";

type Props = {
  document: CanonicalDocument;
  onDocumentChange: (doc: CanonicalDocument) => void;
  onRegenerate: () => void;
  onNext: () => void;
  onPrev: () => void;
};

export function StepContent({ document, onDocumentChange, onRegenerate, onNext, onPrev }: Props) {
  const { editor } = useCanonicalEditor({ value: document, onChange: onDocumentChange });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FileEdit className="w-6 h-6 text-primary" />
          <div>
            <h2 className="text-xl font-semibold">Conteúdo</h2>
            <p className="text-sm text-muted-foreground">Edite o texto e as questões da atividade adaptada.</p>
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={onRegenerate}>
          <RefreshCw className="w-4 h-4 mr-1" /> Regerar
        </Button>
      </div>

      {editor && (
        <PageSheet toolbar={<CanonicalToolbar editor={editor} />}>
          <EditorContent editor={editor} className="text-base" />
        </PageSheet>
      )}

      <div className="flex justify-between pt-4">
        <Button variant="outline" onClick={onPrev} aria-label="Voltar">
          <ArrowLeft className="w-4 h-4 mr-2" /> Voltar
        </Button>
        <Button onClick={onNext} aria-label="Avançar para estilo">
          Estilo <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}

export default StepContent;
```

- [ ] **Step 2: Ajustar StepContent.test.tsx**

O teste atual provavelmente assercia o `CanonicalEditor`. Trocar para verificar a PageSheet + toolbar, mantendo o mock de `@tiptap/react`/`useCanonicalEditor` do diretório. Smoke:

```tsx
it("renderiza a folha com a toolbar de inserir", () => {
  render(<StepContent document={DOC} onDocumentChange={() => {}} onRegenerate={() => {}} onNext={() => {}} onPrev={() => {}} />);
  expect(screen.getByTestId("page-sheet")).toBeInTheDocument();
  expect(screen.getByText("Conteúdo")).toBeInTheDocument();
});
```

> Garanta o mock de `useCanonicalEditor` devolvendo um `editor` truthy (siga o padrão do `StylingSurface.test.tsx`). Se o mock devolver `{ editor: {...} }`, a PageSheet renderiza.

- [ ] **Step 3: Verificar se CanonicalEditor ficou órfão**

Run: `grep -rn "CanonicalEditor" src --include=*.tsx --include=*.ts | grep -v "useCanonicalEditor\|CanonicalEditor.test\|CanonicalEditor.tsx\|CanonicalAdaptationWizard"`
- Se só sobrar o próprio arquivo/teste, remova: `git rm src/components/adaptation/canonical-editor/CanonicalEditor.tsx src/components/adaptation/canonical-editor/CanonicalEditor.test.tsx`
- Se ainda houver consumidores, mantenha.

- [ ] **Step 4: Rodar conteúdo + typecheck**

Run: `NODE_OPTIONS='--max-old-space-size=19456' npx vitest run src/components/adaptation/steps/content && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A src/components/adaptation/steps/content src/components/adaptation/canonical-editor
git commit -m "refactor(adaptar): Conteúdo usa PageSheet com toolbar fixa"
```

### Task C2: Achatar QuestionNodeView (sem card; ações no trilho)

**Files:**
- Modify: `src/components/adaptation/canonical-editor/nodeviews/QuestionNodeView.tsx`
- Modify: `src/components/adaptation/canonical-editor/nodeviews/QuestionNodeView.test.tsx`

- [ ] **Step 1: Ajustar o teste para o visual achatado**

Garantir que o wrapper NÃO tem mais borda de card e que o trilho de ações continua presente no modo conteúdo. Adicionar:

```tsx
it("não usa mais borda/box de card (flat)", () => {
  // render no modo content (sem provider) com o mock padrão
  const { getByTestId } = renderQuestion(); // helper já existente no arquivo
  const node = getByTestId("question-node");
  expect(node.className).not.toMatch(/border|rounded-xl/);
});
```

> Mantenha os testes existentes de mover/excluir/ordinal — eles continuam válidos (as ações só mudam de lugar/estilo, não de comportamento).

- [ ] **Step 2: Achatar o wrapper e mover as ações para um trilho**

Trocar a linha do wrapper:

```tsx
<NodeViewWrapper className="my-4 space-y-3 rounded-xl border border-border/60 p-4" data-testid="question-node">
```

por (flat, com posicionamento relativo para o trilho):

```tsx
<NodeViewWrapper className="group relative my-3 space-y-2" data-testid="question-node">
```

Trocar o cabeçalho/ações: o `div` de ações passa a ser um trilho flutuante visível no hover/foco (só no modo conteúdo). Substituir o bloco `{showStructureActions && (<div className="ml-auto ...">...)}` para usar:

```tsx
{showStructureActions && (
  <div
    className="absolute right-0 top-0 z-10 hidden items-center gap-1 rounded-md border border-border bg-background p-0.5 shadow-sm group-hover:flex group-focus-within:flex"
    contentEditable={false}
  >
    {/* (mesmos 4 Button: ArrowUp, ArrowDown, ImagePlus, Trash2 — inalterados) */}
  </div>
)}
```

E remover a borda do bloco "Resposta": trocar `className="space-y-2 border-t border-border/60 pt-3"` por `className="space-y-2 pt-2"`. Manter o label "Questão {ordinal}" como antes.

> Os 4 botões internos (mover ↑/↓, ImagePlus, Trash2) e seus handlers ficam idênticos — só muda o container. Não altere `move`, `handlePick`, `deleteNode`.

- [ ] **Step 3: Rodar a suíte do nodeview**

Run: `NODE_OPTIONS='--max-old-space-size=19456' npx vitest run src/components/adaptation/canonical-editor/nodeviews/QuestionNodeView.test.tsx`
Expected: PASS (incluindo o novo "flat").

- [ ] **Step 4: Commit**

```bash
git add src/components/adaptation/canonical-editor/nodeviews/QuestionNodeView.tsx src/components/adaptation/canonical-editor/nodeviews/QuestionNodeView.test.tsx
git commit -m "refactor(adaptar): QuestionNodeView achatado, ações no trilho"
```

### Task C3: Achatar ImageNodeView

**Files:**
- Modify: `src/components/adaptation/canonical-editor/nodeviews/ImageNodeView.tsx`
- Modify: `src/components/adaptation/canonical-editor/nodeviews/ImageNodeView.test.tsx`

- [ ] **Step 1: Ler o wrapper atual**

Run: `grep -n "NodeViewWrapper\|border\|rounded" src/components/adaptation/canonical-editor/nodeviews/ImageNodeView.tsx`

- [ ] **Step 2: Ajustar o teste**

```tsx
it("container da imagem é flat (sem borda de card)", () => {
  const { getByTestId } = renderImage(); // helper existente
  expect(getByTestId("image-node").className).not.toMatch(/rounded-xl|border border-border\/60/);
});
```

> Se o `data-testid` for outro, use o existente no arquivo.

- [ ] **Step 3: Remover a borda/box do wrapper**

Trocar as classes do `NodeViewWrapper` (analogamente ao QuestionNodeView): remover `rounded-xl`/`border border-border/60`/`p-4`, manter espaçamento vertical leve (`my-3 space-y-2`) e centralização da imagem. Os controles de troca/alinhamento (já gateados por modo nos commits recentes) ficam como trilho/hover no modo conteúdo — mesma classe do QuestionNodeView se houver barra de ações.

- [ ] **Step 4: Rodar a suíte do nodeview**

Run: `NODE_OPTIONS='--max-old-space-size=19456' npx vitest run src/components/adaptation/canonical-editor/nodeviews/ImageNodeView.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/adaptation/canonical-editor/nodeviews/ImageNodeView.tsx src/components/adaptation/canonical-editor/nodeviews/ImageNodeView.test.tsx
git commit -m "refactor(adaptar): ImageNodeView achatado"
```

---

## Fase D — Verificação integrada (gate + ambiente real)

### Task D1: Suíte completa + cobertura 100% + lint + typecheck

- [ ] **Step 1: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 erros.

- [ ] **Step 2: Lint**

Run: `npx eslint src`
Expected: 0 erros. (Atenção a imports órfãos dos arquivos removidos.)

- [ ] **Step 3: Testes + cobertura**

Run: `NODE_OPTIONS='--max-old-space-size=19456' npx vitest run --coverage`
Expected: PASS, cobertura **100%** (statements/branches/functions/lines). Se algum trecho de UI novo ficar descoberto e for interação não-exercitável em jsdom, marque com `/* v8 ignore */` (seguindo o padrão de `CanonicalToolbar`/`RichTextField`), nunca baixe o threshold.

- [ ] **Step 4: Commit (se houver ajustes de cobertura)**

```bash
git add -A && git commit -m "test(adaptar): cobre os novos componentes da folha/régua"
```

### Task D2: Validação no browser (skill validate-adaptar)

- [ ] **Step 1: Subir o ambiente real** seguindo a skill `validate-adaptar` (Supabase local já up; `.env.local` efêmero; `npm run dev`).

- [ ] **Step 2: Abrir o editor com documento real**

Logado, navegar para `/adaptar/editar/bb9f01a9-ef75-45b8-aa25-8d543dc01587` (documento "Combatendo a Dengue"). Confirmar no console (`list_console_messages({types:["error"]})`) que não há erro.

- [ ] **Step 3: Conferir visualmente (screenshot)**
  - Passo **Conteúdo**: folha A4, toolbar de inserir **fixa no topo**, blocos achatados (sem card), trilho de ações ao passar o mouse na questão, controles de alternativa.
  - Passo **Estilo**: folha A4, **régua fixa no topo**, seleção de trecho → formata inline; clique no bloco → formata o bloco; "Aplicar a tudo" muda o documento.
  - Rolar a folha e confirmar que a barra **não rola**.

- [ ] **Step 4: Confirmar persistência**

Rolar/editar, aguardar autosave; conferir no banco que `adaptation_result->'document'` reflete a mudança (e nenhum lixo tipo `**...**`).

- [ ] **Step 5: Cleanup**

```bash
rm -f .env.local
pkill -f 'vite' 2>/dev/null
```

---

## Self-Review (executado pelo autor do plano)

**Cobertura do spec:**
- §2.1 sem lib → nenhum `npm install` no plano. ✓
- §2.2 visualização aproximada / §3.1 tokens compartilhados → Task A1/A2. ✓
- §2.3 mantém funções (inline+bloco+doc) → B2/B3 (`toggleMark`/`colorBlock` tratam seleção e bloco; `applyToAll`). ✓
- §3.2 PageSheet → A3; usada em B3 (Estilo) e C1 (Conteúdo). ✓
- §3.3 NodeViews achatados → C2/C3. ✓
- §3.4 chrome de conteúdo (inserir + trilho) → C1 (toolbar fixa) + C2 (trilho). ✓
- §3.5 régua consolida 3 superfícies; remove StyleControls/DocumentStyleControl/SelectionBubbleMenu → B2/B3. ✓
- §2.6 barra fixa, só folha rola → PageSheet (A3) + validação D2. ✓
- §6 testes/gate 100% → D1; cada task é TDD. ✓
- §7 rigidez → propriedade da arquitetura existente; nada a implementar (validado em POC). ✓

**Consistência de tipos:** `StyleRibbonProps` (B2) bate com o que `StylingSurface` passa (B3): `style/onPatch/onToggleMark/onColorBlock/onApplyToAll`. `BlockToggleMark = "bold"|"italic"` reusado. `styleTarget` retorna union usada em B3. `pageTokensToPdf/Css` (A1) usados em A2/A3. ✓

**Placeholders:** nenhum passo de código sem código; deleções e greps explícitos. ✓
