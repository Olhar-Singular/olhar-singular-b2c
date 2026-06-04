import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { StepStyling } from "./StepStyling";
import type { CanonicalDocument } from "@/lib/adaptation/canonical/schema";

vi.mock("./StylingSurface", () => ({
  StylingSurface: ({ onChange }: { onChange: (d: CanonicalDocument) => void }) => (
    <button data-testid="surface" onClick={() => onChange({ schemaVersion: 1, blocks: [] } as CanonicalDocument)}>
      surface
    </button>
  ),
}));

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const doc: CanonicalDocument = {
  schemaVersion: 1,
  blocks: [{ id: id(1), type: "paragraph", content: [{ type: "text", text: "p" }] }],
};

describe("StepStyling", () => {
  it("renders the styling surface", () => {
    render(
      <StepStyling
        document={doc}
        onDocumentChange={vi.fn()}
        onRegenerate={vi.fn()}
        onNext={vi.fn()}
        onPrev={vi.fn()}
      />,
    );
    expect(screen.getByTestId("surface")).toBeInTheDocument();
  });

  it("wires surface changes, regenerate and navigation", () => {
    const onDocumentChange = vi.fn();
    const onRegenerate = vi.fn();
    const onNext = vi.fn();
    const onPrev = vi.fn();
    render(
      <StepStyling
        document={doc}
        onDocumentChange={onDocumentChange}
        onRegenerate={onRegenerate}
        onNext={onNext}
        onPrev={onPrev}
      />,
    );
    fireEvent.click(screen.getByTestId("surface"));
    fireEvent.click(screen.getByRole("button", { name: /Regerar/i }));
    fireEvent.click(screen.getByRole("button", { name: /Voltar/i }));
    fireEvent.click(screen.getByRole("button", { name: /Avançar para exportação/i }));
    expect(onDocumentChange).toHaveBeenCalled();
    expect(onRegenerate).toHaveBeenCalled();
    expect(onPrev).toHaveBeenCalled();
    expect(onNext).toHaveBeenCalled();
  });
});
