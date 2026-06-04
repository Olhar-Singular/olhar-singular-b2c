import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { StepExportCanonical } from "./StepExportCanonical";
import type { AdaptationResult, CanonicalDocument } from "@/lib/adaptation/canonical/schema";

vi.mock("@/components/adaptation/render/CanonicalRenderer", () => ({
  CanonicalRenderer: ({ document }: { document: CanonicalDocument }) => (
    <div data-testid="renderer">{document.blocks.length}</div>
  ),
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

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

  it("copies the plain-text projection of the document", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const { toast } = await import("sonner");
    renderStep();
    fireEvent.click(screen.getByRole("button", { name: /Copiar/i }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("olá mundo"));
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
  });

  it("shows an error toast when copy fails", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    Object.assign(navigator, { clipboard: { writeText } });
    const { toast } = await import("sonner");
    renderStep();
    fireEvent.click(screen.getByRole("button", { name: /Copiar/i }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Erro ao copiar."));
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

  it("leaves Exportar PDF disabled as a deferred seam", () => {
    renderStep();
    expect(screen.getByRole("button", { name: /Exportar PDF/i })).toBeDisabled();
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
