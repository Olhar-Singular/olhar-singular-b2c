import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { renderWithProviders } from "@/test/helpers";
import CanonicalAdaptationWizard from "./CanonicalAdaptationWizard";
import type { AdaptationResult, CanonicalDocument } from "@/lib/adaptation/canonical/schema";
import { validateDocument } from "@/lib/adaptation/canonical/validate";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function makeResult(): AdaptationResult {
  return {
    schemaVersion: 1,
    document: {
      schemaVersion: 1,
      blocks: [{ id: id(1), type: "paragraph", content: [{ type: "text", text: "gerado" }] }],
    },
    strategies_applied: [],
    pedagogical_justification: "",
    implementation_tips: [],
  };
}

// --- Input steps stubbed to drive the wizard quickly ------------------------

vi.mock("./steps/activity-type/StepActivityType", () => ({
  StepActivityType: ({ onSelect }: { onSelect: (t: string) => void }) => (
    <button data-testid="pick-type" onClick={() => onSelect("exercício")}>type</button>
  ),
}));

vi.mock("./steps/activity-input/StepActivityInput", () => ({
  StepActivityInput: ({ onNext }: { onNext: () => void }) => (
    <button data-testid="input-next" onClick={onNext}>input</button>
  ),
}));

vi.mock("./steps/barriers/StepBarrierSelection", () => ({
  StepBarrierSelection: ({ onNext }: { onNext: () => void }) => (
    <button data-testid="barriers-next" onClick={onNext}>barriers</button>
  ),
}));

vi.mock("./steps/generate/StepGenerate", () => ({
  StepGenerate: ({
    onResult,
    onNext,
  }: {
    onResult: (r: AdaptationResult) => void;
    onNext: () => void;
  }) => (
    <button
      data-testid="do-generate"
      onClick={() => {
        onResult(makeResult());
        onNext();
      }}
    >
      generate
    </button>
  ),
}));

// CanonicalEditor (used by StepContent) — edits the first block's text.
vi.mock("./canonical-editor/CanonicalEditor", () => ({
  CanonicalEditor: ({
    value,
    onChange,
  }: {
    value: CanonicalDocument;
    onChange: (d: CanonicalDocument) => void;
  }) => (
    <button
      data-testid="edit-content"
      onClick={() =>
        onChange({
          ...value,
          blocks: [{ id: id(1), type: "paragraph", content: [{ type: "text", text: "EDITADO" }] }],
        })
      }
    >
      {(value.blocks[0] as { content: { text: string }[] }).content[0].text}
    </button>
  ),
}));

// CanonicalRenderer (used by StepStyling + export) — exposes the doc as JSON.
vi.mock("./render/CanonicalRenderer", () => ({
  CanonicalRenderer: ({ document }: { document: CanonicalDocument }) => (
    <pre data-testid="render-doc">{JSON.stringify(document)}</pre>
  ),
}));

// --- helpers ----------------------------------------------------------------

function advanceToContent() {
  fireEvent.click(screen.getByTestId("pick-type"));
  fireEvent.click(screen.getByTestId("input-next"));
  fireEvent.click(screen.getByTestId("barriers-next"));
  fireEvent.click(screen.getByTestId("do-generate"));
}

beforeEach(() => vi.clearAllMocks());

describe("CanonicalAdaptationWizard", () => {
  it("walks the input steps and renders the content step after generation", () => {
    renderWithProviders(<CanonicalAdaptationWizard />);
    advanceToContent();
    expect(screen.getByTestId("edit-content")).toHaveTextContent("gerado");
  });

  it("generation sets a valid canonical document", () => {
    renderWithProviders(<CanonicalAdaptationWizard />);
    advanceToContent();
    // Move to styling to read the document out of the renderer.
    fireEvent.click(screen.getByRole("button", { name: /Avançar para estilo/i }));
    const doc = JSON.parse(screen.getByTestId("render-doc").textContent!);
    expect(validateDocument(doc)).toBeTruthy();
  });

  it("content edits propagate into the single document", () => {
    renderWithProviders(<CanonicalAdaptationWizard />);
    advanceToContent();
    fireEvent.click(screen.getByTestId("edit-content"));
    expect(screen.getByTestId("edit-content")).toHaveTextContent("EDITADO");
  });

  it("styling edits propagate to the same document", () => {
    renderWithProviders(<CanonicalAdaptationWizard />);
    advanceToContent();
    fireEvent.click(screen.getByRole("button", { name: /Avançar para estilo/i }));
    fireEvent.change(screen.getByLabelText("Alinhamento"), { target: { value: "center" } });
    const doc = JSON.parse(screen.getByTestId("render-doc").textContent!) as CanonicalDocument;
    expect(doc.blocks[0].style).toEqual({ align: "center" });
  });

  it("SSOT: content edit + style edit both survive navigating content ↔ styling", () => {
    renderWithProviders(<CanonicalAdaptationWizard />);
    advanceToContent();

    // 1) edit content
    fireEvent.click(screen.getByTestId("edit-content"));

    // 2) go to styling, edit a style
    fireEvent.click(screen.getByRole("button", { name: /Avançar para estilo/i }));
    fireEvent.change(screen.getByLabelText("Cor"), { target: { value: "#2563EB" } });

    // 3) go back to content — content edit must still be there
    fireEvent.click(screen.getByRole("button", { name: /Voltar/i }));
    expect(screen.getByTestId("edit-content")).toHaveTextContent("EDITADO");

    // 4) forward to styling again — both edits present in the one document
    fireEvent.click(screen.getByRole("button", { name: /Avançar para estilo/i }));
    const doc = JSON.parse(screen.getByTestId("render-doc").textContent!) as CanonicalDocument;
    expect((doc.blocks[0] as { content: { text: string }[] }).content[0].text).toBe("EDITADO");
    expect(doc.blocks[0].style).toEqual({ color: "#2563EB" });
  });

  it("the step indicator navigates back to a visited step", () => {
    renderWithProviders(<CanonicalAdaptationWizard />);
    advanceToContent();
    fireEvent.click(screen.getByRole("button", { name: /1.*Tipo/i }));
    expect(screen.getByTestId("pick-type")).toBeInTheDocument();
  });

  it("regenerate is confirmed and replaces the document via the generate step", () => {
    renderWithProviders(<CanonicalAdaptationWizard />);
    advanceToContent();

    // edit content first so we can prove the replacement
    fireEvent.click(screen.getByTestId("edit-content"));
    expect(screen.getByTestId("edit-content")).toHaveTextContent("EDITADO");

    fireEvent.click(screen.getByRole("button", { name: /Regerar/i }));
    const dialog = screen.getByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /^Regerar$/i }));

    // back on the generate step
    fireEvent.click(screen.getByTestId("do-generate"));
    // fresh document (content reset to "gerado")
    expect(screen.getByTestId("edit-content")).toHaveTextContent("gerado");
  });

  it("regenerate can also be triggered from the styling step", () => {
    renderWithProviders(<CanonicalAdaptationWizard />);
    advanceToContent();
    fireEvent.click(screen.getByRole("button", { name: /Avançar para estilo/i }));
    fireEvent.click(screen.getByRole("button", { name: /Regerar/i }));
    const dialog = screen.getByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /^Regerar$/i }));
    // lands back on the generate step
    expect(screen.getByTestId("do-generate")).toBeInTheDocument();
  });

  it("cancelling the regenerate dialog keeps the current document", () => {
    renderWithProviders(<CanonicalAdaptationWizard />);
    advanceToContent();
    fireEvent.click(screen.getByTestId("edit-content"));
    fireEvent.click(screen.getByRole("button", { name: /Regerar/i }));
    const dialog = screen.getByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /Cancelar/i }));
    expect(screen.getByTestId("edit-content")).toHaveTextContent("EDITADO");
  });

  it("export step copies and restarts back to the first step", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    renderWithProviders(<CanonicalAdaptationWizard />);
    advanceToContent();
    fireEvent.click(screen.getByRole("button", { name: /Avançar para estilo/i }));
    fireEvent.click(screen.getByRole("button", { name: /Avançar para exportação/i }));

    fireEvent.click(screen.getByRole("button", { name: /Copiar/i }));
    expect(writeText).toHaveBeenCalledWith("gerado");

    fireEvent.click(screen.getByRole("button", { name: /Nova adaptação/i }));
    expect(screen.getByTestId("pick-type")).toBeInTheDocument();
  });

  it("export step navigates back to styling with Voltar", () => {
    renderWithProviders(<CanonicalAdaptationWizard />);
    advanceToContent();
    fireEvent.click(screen.getByRole("button", { name: /Avançar para estilo/i }));
    fireEvent.click(screen.getByRole("button", { name: /Avançar para exportação/i }));
    fireEvent.click(screen.getByRole("button", { name: /Voltar/i }));
    expect(screen.getByLabelText("Alinhamento")).toBeInTheDocument();
  });
});
