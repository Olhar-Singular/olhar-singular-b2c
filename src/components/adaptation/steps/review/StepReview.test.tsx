import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { StepReview } from "./StepReview";
import { PageBreakMarker } from "@/components/adaptation/canonical-editor/page-break/pageBreakDecoration";
import { OriginalDocExtension } from "@/components/adaptation/canonical-editor/originalDocExtension";
import type { CanonicalDocument } from "@/lib/adaptation/canonical/schema";

// Capture shouldShow so tests can verify it filters node selections.
let capturedShouldShow: ((props: { state: { selection: { empty: boolean } } }) => boolean) | undefined;
// Capture tippyOptions: o bubble precisa ficar adjacente ao editor na ordem do DOM.
let capturedTippyOptions: Record<string, unknown> | undefined;
// Simula o bubble fechado (sem seleção) — o atalho de teclado não pode quebrar aí.
const bubble = { visible: true };

const mockIsTextSelection = vi.fn();
vi.mock("@tiptap/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tiptap/core")>();
  return { ...actual, isTextSelection: (...args: unknown[]) => mockIsTextSelection(...args) };
});

// Mock @tiptap/react so EditorContent + BubbleMenu render deterministic sentinels.
vi.mock("@tiptap/react", () => ({
  EditorContent: ({ editor }: { editor: unknown }) => (
    <div data-testid="editor-content">{String(editor !== null)}</div>
  ),
  BubbleMenu: ({
    editor,
    children,
    shouldShow,
    tippyOptions,
  }: {
    editor: unknown;
    children: React.ReactNode;
    shouldShow?: (props: { state: { selection: { empty: boolean } } }) => boolean;
    tippyOptions?: Record<string, unknown>;
  }) => {
    capturedShouldShow = shouldShow;
    capturedTippyOptions = tippyOptions;
    return (
      <div data-testid="bubble-menu">
        {String(editor !== null)}
        {bubble.visible ? children : null}
      </div>
    );
  },
}));

// Mock useCanonicalEditor to return a truthy editor so PageSheet renders.
const useCanonicalEditor = vi.fn();
vi.mock("@/components/adaptation/canonical-editor/useCanonicalEditor", () => ({
  useCanonicalEditor: (opts: unknown) => useCanonicalEditor(opts),
}));

// Mock BlockInserter (it reads the live editor view; we just need it to render).
vi.mock("@/components/adaptation/canonical-editor/block-inserter/BlockInserter", () => ({
  BlockInserter: () => <div data-testid="block-inserter" />,
}));

beforeEach(() => {
  capturedShouldShow = undefined;
  capturedTippyOptions = undefined;
  bubble.visible = true;
  mockIsTextSelection.mockReset();
});

/**
 * Editor suficiente para o SelectionBubble REAL renderizar (ele lê isActive /
 * getAttributes e dispara comandos por chain). Não é mockado aqui de propósito:
 * o caminho de teclado da caça 0208 atravessa StepReview → SelectionBubble.
 */
const chainStub: Record<string, unknown> = {};
for (const m of ["focus", "setColor", "unsetColor", "setFontSize", "run"]) {
  chainStub[m] = () => chainStub;
}
const fakeEditor = {
  isEditable: true,
  isActive: () => false,
  getAttributes: () => ({}),
  chain: () => chainStub,
} as unknown as import("@tiptap/react").Editor;

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const DOC: CanonicalDocument = {
  schemaVersion: 1,
  blocks: [
    { id: id(1), type: "heading", level: 1, content: [{ type: "text", text: "Prova Adaptada" }] },
    { id: id(2), type: "paragraph", content: [{ type: "text", text: "original" }] },
  ],
};

const METADATA = {
  strategiesApplied: ["Linguagem Direta e Objetiva"],
  implementationTips: ["Leia o enunciado em voz alta."],
  pedagogicalJustification: "Reduz a carga de produção textual.",
};

function setup(over: Partial<React.ComponentProps<typeof StepReview>> = {}) {
  useCanonicalEditor.mockReturnValue({ editor: fakeEditor });
  const props = {
    document: DOC,
    metadata: METADATA,
    onDocumentChange: vi.fn(),
    onRegenerate: vi.fn(),
    onNext: vi.fn(),
    onPrev: vi.fn(),
    ...over,
  };
  render(<StepReview {...props} />);
  return props;
}

describe("StepReview", () => {
  it("renderiza a barra de chrome com o título do documento e a folha", () => {
    setup();
    expect(screen.getByText("Prova Adaptada")).toBeInTheDocument();
    expect(screen.getByTestId("page-sheet")).toBeInTheDocument();
  });

  it("renders the editor content bound to the editor and the block inserter overlay", () => {
    setup();
    expect(screen.getByTestId("editor-content")).toBeInTheDocument();
    expect(screen.getByTestId("block-inserter")).toBeInTheDocument();
  });

  it("monta o BubbleMenu de seleção ligado ao editor principal", () => {
    setup();
    expect(screen.getByTestId("bubble-menu")).toBeInTheDocument();
    expect(screen.getByRole("toolbar")).toBeInTheDocument();
  });

  /**
   * Regressão (caça 0208): o BubbleMenu era montado sem `tippyOptions`, então o
   * tippy o anexava ao `<body>` — 15 elementos focáveis longe do `.ProseMirror`
   * (e o próprio tippy.js loga o aviso de acessibilidade). Além disso não havia
   * atalho algum para levar o foco do editor até a barra, e Tab só destruía a
   * seleção. Sem isso, cor e tamanho de fonte são inalcançáveis sem mouse.
   */
  describe("caminho de teclado até a barra de seleção (caça 0208)", () => {
    it("ancora o bubble ao pai do editor para preservar a ordem do DOM", () => {
      setup();
      expect(capturedTippyOptions).toEqual(expect.objectContaining({ appendTo: "parent" }));
    });

    it("Alt+F10 no editor leva o foco para o primeiro controle da barra", () => {
      setup();
      const first = screen.getByRole("button", { name: "Negrito" });
      expect(document.activeElement).not.toBe(first);
      fireEvent.keyDown(screen.getByTestId("editor-content"), { key: "F10", altKey: true });
      expect(document.activeElement).toBe(first);
    });

    it("não sequestra outras teclas", () => {
      setup();
      const first = screen.getByRole("button", { name: "Negrito" });
      fireEvent.keyDown(screen.getByTestId("editor-content"), { key: "F10" });
      expect(document.activeElement).not.toBe(first);
      fireEvent.keyDown(screen.getByTestId("editor-content"), { key: "F9", altKey: true });
      expect(document.activeElement).not.toBe(first);
    });

    it("com a barra fechada, o atalho não quebra", () => {
      bubble.visible = false;
      setup();
      expect(() =>
        fireEvent.keyDown(screen.getByTestId("editor-content"), { key: "F10", altKey: true }),
      ).not.toThrow();
    });
  });

  it("BubbleMenu shouldShow — só exibe para TextSelection não-vazia", () => {
    setup();
    expect(typeof capturedShouldShow).toBe("function");
    // Texto selecionado (TextSelection, não-vazia) → true
    mockIsTextSelection.mockReturnValue(true);
    expect(capturedShouldShow?.({ state: { selection: { empty: false } } })).toBe(true);
    // Cursor posicionado (TextSelection, vazia) → false
    mockIsTextSelection.mockReturnValue(true);
    expect(capturedShouldShow?.({ state: { selection: { empty: true } } })).toBe(false);
    // NodeSelection (clique em imagem) → false
    mockIsTextSelection.mockReturnValue(false);
    expect(capturedShouldShow?.({ state: { selection: { empty: false } } })).toBe(false);
  });

  it("usa título de fallback quando o documento não tem heading", () => {
    setup({
      document: {
        schemaVersion: 1,
        blocks: [{ id: id(1), type: "paragraph", content: [{ type: "text", text: "x" }] }],
      },
    });
    expect(screen.getByText("Atividade adaptada")).toBeInTheDocument();
  });

  it("usa fallback quando o heading não tem texto (só fórmula inline)", () => {
    setup({
      document: {
        schemaVersion: 1,
        blocks: [
          { id: id(1), type: "heading", level: 1, content: [{ type: "inlineMath", latex: "x^2" }] },
        ],
      },
    });
    expect(screen.getByText("Atividade adaptada")).toBeInTheDocument();
  });

  it("does not render the page sheet when editor is null", () => {
    useCanonicalEditor.mockReturnValue({ editor: null });
    render(
      <StepReview
        document={DOC}
        metadata={METADATA}
        onDocumentChange={vi.fn()}
        onRegenerate={vi.fn()}
        onNext={vi.fn()}
        onPrev={vi.fn()}
      />,
    );
    expect(screen.queryByTestId("page-sheet")).not.toBeInTheDocument();
  });

  it("fires onRegenerate, onPrev and onNext (Exportar) from the controls", () => {
    const props = setup();
    fireEvent.click(screen.getByRole("button", { name: /Regerar/i }));
    fireEvent.click(screen.getByRole("button", { name: /Voltar/i }));
    fireEvent.click(screen.getByRole("button", { name: /Avançar para exportação/i }));
    expect(props.onRegenerate).toHaveBeenCalled();
    expect(props.onPrev).toHaveBeenCalled();
    expect(props.onNext).toHaveBeenCalled();
  });

  it("passes value and onChange to useCanonicalEditor", () => {
    const onDocumentChange = vi.fn();
    setup({ onDocumentChange });
    expect(useCanonicalEditor).toHaveBeenCalledWith(
      expect.objectContaining({ value: DOC, onChange: onDocumentChange }),
    );
  });

  it("monta a extensão de marcador de quebra de página no editor da Revisar", () => {
    setup();
    expect(useCanonicalEditor).toHaveBeenCalledWith(
      expect.objectContaining({ extraExtensions: expect.arrayContaining([PageBreakMarker]) }),
    );
  });

  it("monta OriginalDocExtension para possibilitar Reset de questão", () => {
    setup();
    expect(useCanonicalEditor).toHaveBeenCalledWith(
      expect.objectContaining({ extraExtensions: expect.arrayContaining([OriginalDocExtension]) }),
    );
  });

  it("abre a gaveta 'Sobre esta adaptação' e mostra os metadados", () => {
    setup();
    expect(screen.queryByText("Estratégias aplicadas")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Sobre esta adaptação" }));
    expect(screen.getByText("Estratégias aplicadas")).toBeInTheDocument();
    expect(screen.getByText("Linguagem Direta e Objetiva")).toBeInTheDocument();
    expect(screen.getByText("Leia o enunciado em voz alta.")).toBeInTheDocument();
    expect(screen.getByText("Reduz a carga de produção textual.")).toBeInTheDocument();
  });

  it("abre Formato e emite pageStyle ao alterar o tamanho do texto", () => {
    const onPageStyleChange = vi.fn();
    setup({ onPageStyleChange });
    fireEvent.click(screen.getByRole("button", { name: "Formato" }));
    fireEvent.click(screen.getByRole("button", { name: "Aumentar tamanho do texto" }));
    expect(onPageStyleChange).toHaveBeenCalledWith(expect.objectContaining({ fontSize: 17 * 0.75 }));
  });

  /**
   * Regressão (caça 0010): em 390x844 a barra de chrome ficava mais larga que a
   * viewport e o excedente era clipado ("Sobre esta ad..."), sem scroll horizontal.
   * Em telas estreitas os botões viram só ícone; o rótulo textual só aparece a
   * partir de `sm`, e o nome acessível é preservado por aria-label + title.
   */
  it("barra de chrome: rótulos dos botões só a partir de sm, nome acessível preservado", () => {
    setup();
    for (const name of ["Regerar", "Formato", "Sobre esta adaptação"]) {
      const button = screen.getByRole("button", { name });
      expect(button).toHaveAttribute("aria-label", name);
      expect(button).toHaveAttribute("title", name);
      const label = within(button).getByText(name);
      expect(label).toHaveClass("hidden");
      expect(label).toHaveClass("sm:inline");
    }
  });

  it("não quebra ao alterar a Formato sem onPageStyleChange", () => {
    setup(); // sem onPageStyleChange
    fireEvent.click(screen.getByRole("button", { name: "Formato" }));
    expect(() =>
      fireEvent.click(screen.getByRole("button", { name: "Aumentar tamanho do texto" })),
    ).not.toThrow();
  });
});
