import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { StepReview } from "./StepReview";
import { PageBreakMarker } from "@/components/adaptation/canonical-editor/page-break/pageBreakDecoration";
import { OriginalDocExtension } from "@/components/adaptation/canonical-editor/originalDocExtension";
import type { CanonicalDocument } from "@/lib/adaptation/canonical/schema";

// Capture shouldShow so tests can verify it filters node selections.
let capturedShouldShow: ((props: { state: { selection: { empty: boolean } } }) => boolean) | undefined;

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
  }: {
    editor: unknown;
    children: React.ReactNode;
    shouldShow?: (props: { state: { selection: { empty: boolean } } }) => boolean;
  }) => {
    capturedShouldShow = shouldShow;
    return (
      <div data-testid="bubble-menu">
        {String(editor !== null)}
        {children}
      </div>
    );
  },
}));

// Mock SelectionBubble (it reads the editor object; we just need it to render).
vi.mock("@/components/adaptation/canonical-editor/SelectionBubble", () => ({
  SelectionBubble: () => <div data-testid="selection-bubble" />,
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
  mockIsTextSelection.mockReset();
});

const fakeEditor = { isEditable: true } as unknown as import("@tiptap/react").Editor;

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
    expect(screen.getByTestId("selection-bubble")).toBeInTheDocument();
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

  it("não quebra ao alterar a Formato sem onPageStyleChange", () => {
    setup(); // sem onPageStyleChange
    fireEvent.click(screen.getByRole("button", { name: "Formato" }));
    expect(() =>
      fireEvent.click(screen.getByRole("button", { name: "Aumentar tamanho do texto" })),
    ).not.toThrow();
  });
});
