import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
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
  describe("matéria (a pasta)", () => {
    const openMenu = () => fireEvent.click(screen.getByLabelText("Matéria"));

    it("shows the chosen subject", () => {
      setup({ subject: "Geografia" });
      expect(screen.getByLabelText("Matéria")).toHaveTextContent("Geografia");
    });

    it("starts unclassified rather than guessing a subject", () => {
      // NULL, not "Geral" — 'Geral' is a real subject a teacher may pick, so it
      // cannot double as the "never classified" sentinel.
      setup({ subject: null });
      expect(screen.getByLabelText("Matéria")).toHaveTextContent("Sem matéria");
    });

    it("emits the picked subject", async () => {
      const onSubjectChange = vi.fn();
      setup({ subject: null, onSubjectChange });
      openMenu();
      await waitFor(() => screen.getByRole("option", { name: "Matemática" }));
      fireEvent.click(screen.getByRole("option", { name: "Matemática" }));
      expect(onSubjectChange).toHaveBeenCalledWith("Matemática");
    });

    it("emits null when the teacher clears the subject", async () => {
      const onSubjectChange = vi.fn();
      setup({ subject: "Geografia", onSubjectChange });
      openMenu();
      await waitFor(() => screen.getByRole("option", { name: "Sem matéria" }));
      fireEvent.click(screen.getByRole("option", { name: "Sem matéria" }));
      expect(onSubjectChange).toHaveBeenCalledWith(null);
    });

    it("does not break without a handler", async () => {
      setup({ subject: null });
      openMenu();
      await waitFor(() => screen.getByRole("option", { name: "Física" }));
      expect(() => fireEvent.click(screen.getByRole("option", { name: "Física" }))).not.toThrow();
    });
  });

  // A pasta responde "onde guardei" (nome livre); a matéria responde "o que é"
  // (lista fixa, etiqueta e filtro). Campos separados de propósito: uma pasta
  // "6º ano B" costuma ter provas de várias matérias.
  describe("pasta", () => {
    const FOLDERS = [
      { id: "f1", name: "6º ano B" },
      { id: "f2", name: "Recuperação" },
    ];

    it("lists the folders the teacher already has", async () => {
      setup({ folders: FOLDERS });
      fireEvent.click(screen.getByLabelText("Pasta"));
      await waitFor(() => screen.getByRole("option", { name: "6º ano B" }));
      expect(screen.getByRole("option", { name: "Recuperação" })).toBeInTheDocument();
    });

    it("shows the folder it is already filed in", () => {
      setup({ folders: FOLDERS, folderId: "f2" });
      expect(screen.getByLabelText("Pasta")).toHaveTextContent("Recuperação");
    });

    it("starts unfiled", () => {
      setup({ folders: FOLDERS });
      expect(screen.getByLabelText("Pasta")).toHaveTextContent("Sem pasta");
    });

    it("emits the picked folder", async () => {
      const onFolderChange = vi.fn();
      setup({ folders: FOLDERS, onFolderChange });
      fireEvent.click(screen.getByLabelText("Pasta"));
      await waitFor(() => screen.getByRole("option", { name: "6º ano B" }));
      fireEvent.click(screen.getByRole("option", { name: "6º ano B" }));
      expect(onFolderChange).toHaveBeenCalledWith("f1");
    });

    it("emits null when taken out of every folder", async () => {
      const onFolderChange = vi.fn();
      setup({ folders: FOLDERS, folderId: "f1", onFolderChange });
      fireEvent.click(screen.getByLabelText("Pasta"));
      await waitFor(() => screen.getByRole("option", { name: "Sem pasta" }));
      fireEvent.click(screen.getByRole("option", { name: "Sem pasta" }));
      expect(onFolderChange).toHaveBeenCalledWith(null);
    });

    it("opens a field for a brand-new folder name", async () => {
      setup({ folders: FOLDERS });
      fireEvent.click(screen.getByLabelText("Pasta"));
      await waitFor(() => screen.getByRole("option", { name: /Nova pasta/i }));
      fireEvent.click(screen.getByRole("option", { name: /Nova pasta/i }));
      expect(await screen.findByLabelText("Nome da nova pasta")).toBeInTheDocument();
    });

    it("emits the typed name so the folder can be created on save", async () => {
      const onNewFolderChange = vi.fn();
      setup({ folders: FOLDERS, onNewFolderChange });
      fireEvent.click(screen.getByLabelText("Pasta"));
      await waitFor(() => screen.getByRole("option", { name: /Nova pasta/i }));
      fireEvent.click(screen.getByRole("option", { name: /Nova pasta/i }));
      fireEvent.change(await screen.findByLabelText("Nome da nova pasta"), {
        target: { value: "7º ano A" },
      });
      expect(onNewFolderChange).toHaveBeenCalledWith("7º ano A");
    });

    it("does not break without folder handlers", async () => {
      setup({ folders: FOLDERS });
      fireEvent.click(screen.getByLabelText("Pasta"));
      await waitFor(() => screen.getByRole("option", { name: "6º ano B" }));
      expect(() =>
        fireEvent.click(screen.getByRole("option", { name: "6º ano B" })),
      ).not.toThrow();
    });

    it("hides the folder picker when the library has no folders and none is being created", () => {
      // Nothing to choose from yet — the control would be an empty dropdown.
      setup({ folders: [] });
      expect(screen.getByLabelText("Pasta")).toBeInTheDocument();
    });
  });

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
