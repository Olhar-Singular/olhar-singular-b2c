import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { StepExportCanonical } from "./StepExportCanonical";
import type { AdaptationResult, CanonicalDocument } from "@/lib/adaptation/canonical/schema";

vi.mock("@/components/adaptation/render/CanonicalRenderer", () => ({
  CanonicalRenderer: ({ document }: { document: CanonicalDocument }) => (
    <div data-testid="renderer">{document.blocks.length}</div>
  ),
}));

vi.mock("@/components/adaptation/export/ExportPanel", () => ({
  ExportPanel: ({ document }: { document: CanonicalDocument }) => (
    <div data-testid="export-panel">{document.blocks.length}</div>
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
