import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { StepContent } from "./StepContent";
import type { CanonicalDocument } from "@/lib/adaptation/canonical/schema";

vi.mock("@/components/adaptation/canonical-editor/CanonicalEditor", () => ({
  CanonicalEditor: ({
    value,
    onChange,
  }: {
    value: CanonicalDocument;
    onChange: (d: CanonicalDocument) => void;
  }) => (
    <button
      data-testid="canonical-editor"
      onClick={() =>
        onChange({
          schemaVersion: 1,
          blocks: [{ id: id(2), type: "paragraph", content: [{ type: "text", text: "edited" }] }],
        })
      }
    >
      {(value.blocks[0] as { content: { text: string }[] }).content[0].text}
    </button>
  ),
}));

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const doc: CanonicalDocument = {
  schemaVersion: 1,
  blocks: [{ id: id(1), type: "paragraph", content: [{ type: "text", text: "original" }] }],
};

describe("StepContent", () => {
  it("renders the canonical editor bound to the document", () => {
    render(
      <StepContent
        document={doc}
        onDocumentChange={vi.fn()}
        onRegenerate={vi.fn()}
        onNext={vi.fn()}
        onPrev={vi.fn()}
      />,
    );
    expect(screen.getByTestId("canonical-editor")).toHaveTextContent("original");
  });

  it("propagates editor changes through onDocumentChange", () => {
    const onDocumentChange = vi.fn();
    render(
      <StepContent
        document={doc}
        onDocumentChange={onDocumentChange}
        onRegenerate={vi.fn()}
        onNext={vi.fn()}
        onPrev={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId("canonical-editor"));
    expect(onDocumentChange).toHaveBeenCalledWith(
      expect.objectContaining({
        blocks: [expect.objectContaining({ content: [{ type: "text", text: "edited" }] })],
      }),
    );
  });

  it("fires onRegenerate, onPrev and onNext from the controls", () => {
    const onRegenerate = vi.fn();
    const onPrev = vi.fn();
    const onNext = vi.fn();
    render(
      <StepContent
        document={doc}
        onDocumentChange={vi.fn()}
        onRegenerate={onRegenerate}
        onNext={onNext}
        onPrev={onPrev}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Regerar/i }));
    fireEvent.click(screen.getByRole("button", { name: /Voltar/i }));
    fireEvent.click(screen.getByRole("button", { name: /Avançar para estilo/i }));
    expect(onRegenerate).toHaveBeenCalled();
    expect(onPrev).toHaveBeenCalled();
    expect(onNext).toHaveBeenCalled();
  });
});
