import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { RichText, QuestionAnswer } from "@/lib/adaptation/canonical/schema";
import { QuestionPreview } from "./QuestionPreview";

// Stub RichTextField (used by the inline instruction AND, via AnswerPreview, by
// the editable answer fields) so we can drive edits without ProseMirror.
vi.mock("../RichTextField", () => ({
  RichTextField: ({
    onChange,
    ariaLabel,
    disabled,
  }: {
    value: RichText;
    onChange: (rt: RichText) => void;
    ariaLabel?: string;
    disabled?: boolean;
  }) => (
    <input aria-label={ariaLabel} disabled={disabled} onChange={(e) => onChange(e.target.value ? [{ type: "text", text: e.target.value }] : [])} />
  ),
}));

const mc: QuestionAnswer = {
  kind: "multipleChoice",
  alternatives: [
    { id: "11111111-1111-4111-8111-111111111111", content: [{ type: "text", text: "a" }], correct: true },
    { id: "22222222-2222-4222-8222-222222222222", content: [{ type: "text", text: "b" }], correct: false },
  ],
};

function setup(overrides: Partial<Parameters<typeof QuestionPreview>[0]> = {}) {
  const props = {
    num: 3 as number | undefined,
    answer: mc,
    instruction: null as RichText | null,
    disabled: false,
    onAnswerChange: vi.fn(),
    onInstructionChange: vi.fn(),
    stem: <div data-testid="stem-slot" />,
    rail: <div data-testid="rail-slot" />,
    ...overrides,
  };
  render(<QuestionPreview {...props} />);
  return props;
}

describe("QuestionPreview", () => {
  it("renders the positional ordinal as 'N.'", () => {
    setup({ num: 3 });
    expect(screen.getByTestId("question-ordinal")).toHaveTextContent("3.");
  });

  it("renders an empty ordinal when the position is unknown (transient)", () => {
    setup({ num: undefined });
    expect(screen.getByTestId("question-ordinal")).toHaveTextContent("");
  });

  it("renders the stem slot and the rail slot", () => {
    setup();
    expect(screen.getByTestId("stem-slot")).toBeInTheDocument();
    expect(screen.getByTestId("rail-slot")).toBeInTheDocument();
  });

  it("renders the print-faithful AnswerPreview, not the structural AnswerEditor", () => {
    setup();
    expect(screen.getByTestId("answer-preview-multipleChoice")).toBeInTheDocument();
    expect(screen.queryByTestId("answer-multipleChoice")).not.toBeInTheDocument();
    // gabarito hidden: no correct-answer control on the folha (D5)
    expect(screen.queryByLabelText("Marcar como correta")).not.toBeInTheDocument();
  });

  it("forwards inline alternative edits", () => {
    const props = setup();
    fireEvent.change(screen.getAllByLabelText("Alternativa")[1], { target: { value: "z" } });
    expect(props.onAnswerChange).toHaveBeenCalledWith(expect.objectContaining({ kind: "multipleChoice" }));
  });

  it("does not render an instruction when there is none", () => {
    setup({ instruction: null });
    expect(screen.queryByLabelText("Instrução da questão")).not.toBeInTheDocument();
  });

  it("does not render an empty instruction", () => {
    setup({ instruction: [] });
    expect(screen.queryByLabelText("Instrução da questão")).not.toBeInTheDocument();
  });

  it("renders an editable inline instruction when present", () => {
    const props = setup({ instruction: [{ type: "text", text: "Marque a correta." }] });
    const field = screen.getByLabelText("Instrução da questão");
    expect(field).toBeInTheDocument();
    fireEvent.change(field, { target: { value: "novo" } });
    expect(props.onInstructionChange).toHaveBeenCalledWith([{ type: "text", text: "novo" }]);
  });

  it("clearing the inline instruction writes null", () => {
    const props = setup({ instruction: [{ type: "text", text: "x" }] });
    const field = screen.getByLabelText("Instrução da questão");
    fireEvent.change(field, { target: { value: "y" } });
    fireEvent.change(field, { target: { value: "" } });
    expect(props.onInstructionChange).toHaveBeenLastCalledWith(null);
  });

  it("disables the editable fields when disabled", () => {
    setup({ disabled: true });
    expect(screen.getAllByLabelText("Alternativa")[0]).toBeDisabled();
  });
});
