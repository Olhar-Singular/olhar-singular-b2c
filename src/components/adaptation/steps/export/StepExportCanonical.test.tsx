import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { StepExportCanonical } from "./StepExportCanonical";
import type {
  AdaptationResult,
  CanonicalDocument,
  DocumentHeader,
  PageStyle,
} from "@/lib/adaptation/canonical/schema";

vi.mock("@/components/adaptation/render/CanonicalRenderer", () => ({
  CanonicalRenderer: ({ document }: { document: CanonicalDocument }) => (
    <div data-testid="renderer">{document.blocks.length}</div>
  ),
}));

vi.mock("@/components/adaptation/export/ExportPanel", () => ({
  ExportPanel: ({
    document,
    pageStyle,
    header,
    onHeaderChange,
  }: {
    document: CanonicalDocument;
    pageStyle?: PageStyle;
    header?: DocumentHeader;
    onHeaderChange?: (h: DocumentHeader) => void;
  }) => (
    <div
      data-testid="export-panel"
      data-page-style={pageStyle?.fontFamily ?? "none"}
      data-header-title={header?.title ?? "none"}
    >
      {document.blocks.length}
      <button onClick={() => onHeaderChange?.({ title: "edited" })}>edit-header</button>
    </div>
  ),
}));

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const result: AdaptationResult = {
  schemaVersion: 1,
  document: {
    schemaVersion: 1,
    blocks: [{ id: id(1), type: "paragraph", content: [{ type: "text", text: "olá mundo" }] }],
  },
  strategies_applied: [],
  pedagogical_justification: "",
  implementation_tips: [],
};

const resultWithPageStyle: AdaptationResult = {
  ...result,
  pageStyle: { fontFamily: "lexend", fontSize: 14 },
};

beforeEach(() => vi.clearAllMocks());

function renderStep(overrides: Partial<React.ComponentProps<typeof StepExportCanonical>> = {}) {
  return render(
    <StepExportCanonical
      result={result}
      canSave
      saving={false}
      onSave={vi.fn()}
      onPrev={vi.fn()}
      onRestart={vi.fn()}
      {...overrides}
    />,
  );
}

describe("StepExportCanonical", () => {
  it("renders the read-only canonical renderer", () => {
    renderStep();
    expect(screen.getByTestId("renderer")).toHaveTextContent("1");
  });

  it("renders the export panel wired to the document", () => {
    renderStep();
    expect(screen.getByTestId("export-panel")).toHaveTextContent("1");
  });

  it("passes pageStyle from result to ExportPanel", () => {
    renderStep({ result: resultWithPageStyle });
    expect(screen.getByTestId("export-panel").dataset.pageStyle).toBe("lexend");
  });

  it("passes undefined pageStyle to ExportPanel when result has none", () => {
    renderStep({ result });
    expect(screen.getByTestId("export-panel").dataset.pageStyle).toBe("none");
  });

  it("passes the result header to ExportPanel", () => {
    renderStep({ result: { ...result, header: { title: "Cabeçalho" } } });
    expect(screen.getByTestId("export-panel").dataset.headerTitle).toBe("Cabeçalho");
  });

  it("forwards onHeaderChange from ExportPanel to the parent", () => {
    const onHeaderChange = vi.fn();
    renderStep({ onHeaderChange });
    fireEvent.click(screen.getByRole("button", { name: "edit-header" }));
    expect(onHeaderChange).toHaveBeenCalledWith({ title: "edited" });
  });

  it("fires onSave when Salvar is clicked", () => {
    const onSave = vi.fn();
    renderStep({ onSave });
    fireEvent.click(screen.getByRole("button", { name: /Salvar/i }));
    expect(onSave).toHaveBeenCalled();
  });

  it("disables Salvar when there is no draft to save", () => {
    renderStep({ canSave: false });
    expect(screen.getByRole("button", { name: /Salvar/i })).toBeDisabled();
  });

  it("disables Salvar and shows a spinner while saving", () => {
    renderStep({ saving: true });
    expect(screen.getByRole("button", { name: /Salvar/i })).toBeDisabled();
  });

  /**
   * Regressão: a prévia do Exportar é a última tela que o professor confere
   * antes de baixar o PDF, e renderizava na fonte/tamanho padrão do app — o
   * `pageStyle` ia só para o ExportPanel (que gera o PDF). Quem aumentava a fonte
   * na Aparência via a folha grande no Revisar, pequena aqui, e grande de novo no
   * PDF. A prévia tem de usar os mesmos page tokens da folha.
   */
  describe("preview parity with the PDF", () => {
    it("renders the preview inside the A4 sheet frame", () => {
      renderStep();
      expect(screen.getByTestId("page-sheet")).toBeInTheDocument();
    });

    it("applies the document font size to the preview sheet", () => {
      renderStep({ result: resultWithPageStyle });
      // 14pt -> 18.67px on screen (px = pt * 96/72), same conversion the folha uses.
      expect(screen.getByTestId("page-sheet")).toHaveStyle({ fontSize: "18.67px" });
    });

    it("falls back to the base tokens when the result has no pageStyle", () => {
      renderStep({ result });
      // 12pt base -> 16px.
      expect(screen.getByTestId("page-sheet")).toHaveStyle({ fontSize: "16px" });
    });

    /**
     * Regressão (achado 0109): os campos Título/Escola/Professor(a)/Data viravam
     * um bloco de cabeçalho no PDF que a prévia nunca mostrava. O professor
     * preenchia, não via mudança nenhuma na folha e só descobria o cabeçalho
     * (e o título duplicado com o H1 do documento) no arquivo baixado.
     */
    it("renders the header block inside the preview sheet when the header has content", () => {
      renderStep({
        result: {
          ...result,
          header: { title: "Prova bimestral", school: "EMEF Teste", teacher: "Prof. Caca", date: "2026-06-04" },
        },
      });
      const sheet = screen.getByTestId("page-sheet");
      expect(sheet).toHaveTextContent("Prova bimestral");
      expect(sheet).toHaveTextContent("EMEF Teste");
      expect(sheet).toHaveTextContent("Professor(a): Prof. Caca");
      expect(sheet).toHaveTextContent("Data: 04/06/2026");
    });

    it("renders no header block in the preview when the result has no header", () => {
      renderStep({ result });
      expect(screen.queryByTestId("preview-header")).not.toBeInTheDocument();
    });
  });

  it("fires onPrev and onRestart", () => {
    const onPrev = vi.fn();
    const onRestart = vi.fn();
    renderStep({ onPrev, onRestart });
    fireEvent.click(screen.getByRole("button", { name: /Voltar/i }));
    fireEvent.click(screen.getByRole("button", { name: /Nova adaptação/i }));
    expect(onPrev).toHaveBeenCalled();
    expect(onRestart).toHaveBeenCalled();
  });
});
