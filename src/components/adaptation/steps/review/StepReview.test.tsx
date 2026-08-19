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
    // The derived heading is the name field's PLACEHOLDER now: it is what an
    // unnamed adaptation shows, without being stored as a chosen name.
    expect(screen.getByLabelText("Nome da adaptação")).toHaveAttribute(
      "placeholder",
      "Prova Adaptada",
    );
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
    expect(screen.getByLabelText("Nome da adaptação")).toHaveAttribute(
      "placeholder",
      "Atividade adaptada",
    );
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
    expect(screen.getByLabelText("Nome da adaptação")).toHaveAttribute(
      "placeholder",
      "Atividade adaptada",
    );
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

  // The auto-derived title comes from the first line of the ORIGINAL activity,
  // so saved adaptations were landing in the library named things like
  // "1) QUESTÃO 1\nNa tirinha, o humor está n". Naming belongs where the
  // teacher is already looking at the sheet.
  describe("nome da adaptação", () => {
    it("shows the given name in the editable field", () => {
      setup({ title: "Prova de Geografia — 6º ano" });
      expect(screen.getByLabelText("Nome da adaptação")).toHaveValue(
        "Prova de Geografia — 6º ano",
      );
    });

    it("falls back to the document heading as a placeholder, without storing it", () => {
      setup({ title: "" });
      const field = screen.getByLabelText("Nome da adaptação");
      expect(field).toHaveValue("");
      expect(field).toHaveAttribute("placeholder", "Prova Adaptada");
    });

    it("emits the typed name", () => {
      const onTitleChange = vi.fn();
      setup({ title: "", onTitleChange });
      fireEvent.change(screen.getByLabelText("Nome da adaptação"), {
        target: { value: "Recuperação de Geografia" },
      });
      expect(onTitleChange).toHaveBeenCalledWith("Recuperação de Geografia");
    });

    it("does not break when no handler is wired", () => {
      setup({ title: "" });
      expect(() =>
        fireEvent.change(screen.getByLabelText("Nome da adaptação"), { target: { value: "x" } }),
      ).not.toThrow();
    });
  });

  // Saving lived only on the Exportar step, at the very end of the flow. A
  // teacher who finished editing and left never filed the adaptation — which
  // is why every row in the database sat at `draft`.
  describe("salvar a adaptação", () => {
    it("offers Salvar once there is a draft to save", () => {
      const onSave = vi.fn();
      setup({ canSave: true, onSave });
      fireEvent.click(screen.getByRole("button", { name: /Salvar adaptação/i }));
      expect(onSave).toHaveBeenCalled();
    });

    it("disables Salvar while there is no draft row yet", () => {
      setup({ canSave: false });
      expect(screen.getByRole("button", { name: /Salvar adaptação/i })).toBeDisabled();
    });

    it("disables Salvar while a save is in flight", () => {
      setup({ canSave: true, saving: true });
      expect(screen.getByRole("button", { name: /Salvar adaptação/i })).toBeDisabled();
    });

    it("does not break when no save handler is wired", () => {
      setup({ canSave: true });
      expect(() =>
        fireEvent.click(screen.getByRole("button", { name: /Salvar adaptação/i })),
      ).not.toThrow();
    });
  });

  describe("originalExam (Adaptar direto do arquivo)", () => {
    it("does not show 'Ver prova original' when there is no original file (Banco de Questões)", () => {
      setup();
      expect(screen.queryByRole("button", { name: /Ver prova original/i })).not.toBeInTheDocument();
    });

    it("shows and opens 'Ver prova original' when an original file is present", () => {
      setup({
        originalExam: { file: new File(["x"], "prova.pdf"), pageImages: ["data:image/png;base64,P1"], userId: "user-1" },
      });
      expect(screen.queryByText("Prova original")).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: /Ver prova original/i }));
      expect(screen.getByText("Prova original")).toBeInTheDocument();
      expect(screen.getByRole("img")).toHaveAttribute("src", "data:image/png;base64,P1");
    });

    it("configures UploadedExamExtension with the file, pages and userId when present", () => {
      const file = new File(["x"], "prova.pdf");
      setup({ originalExam: { file, pageImages: ["data:image/png;base64,P1"], userId: "user-1" } });
      const call = useCanonicalEditor.mock.calls.at(-1)?.[0];
      const ext = call.extraExtensions.find((e: { name: string }) => e.name === "uploadedExam");
      expect(ext).toBeDefined();
      expect(ext.options).toEqual({ file, pageImages: ["data:image/png;base64,P1"], userId: "user-1" });
    });

    it("configures UploadedExamExtension with null/empty when there is no original file", () => {
      setup();
      const call = useCanonicalEditor.mock.calls.at(-1)?.[0];
      const ext = call.extraExtensions.find((e: { name: string }) => e.name === "uploadedExam");
      expect(ext.options).toEqual({ file: null, pageImages: [], userId: null });
    });
  });
});
