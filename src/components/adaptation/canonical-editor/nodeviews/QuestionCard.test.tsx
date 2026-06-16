import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { RichText, QuestionAnswer } from "@/lib/adaptation/canonical/schema";
import { QuestionCard } from "./QuestionCard";

// AnswerEditor (real) and the card both render RichTextField — stub it so we can
// drive the inline fields without the real ProseMirror editor.
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
  alternatives: [{ id: "11111111-1111-4111-8111-111111111111", content: [{ type: "text", text: "a" }], correct: true }],
};

function setup(overrides: Partial<Parameters<typeof QuestionCard>[0]> = {}) {
  const props = {
    num: 2,
    answer: mc,
    instruction: null as RichText | null,
    disabled: false,
    onAnswerChange: vi.fn(),
    onInstructionChange: vi.fn(),
    onDone: vi.fn(),
    stem: <div data-testid="stem-slot" />,
    ...overrides,
  };
  render(<QuestionCard {...props} />);
  return props;
}

describe("QuestionCard", () => {
  it("renders the accent card shell with the 'Questão N' bar", () => {
    setup({ num: 3 });
    const card = screen.getByTestId("question-card");
    expect(card.className).toMatch(/border/);
    expect(screen.getByText("Questão 3")).toBeInTheDocument();
  });

  it("renders the stem slot under an Enunciado label", () => {
    setup();
    expect(screen.getByTestId("stem-slot")).toBeInTheDocument();
    expect(screen.getByText("Enunciado")).toBeInTheDocument();
  });

  it("renders the full AnswerEditor (structure controls visible)", () => {
    setup();
    expect(screen.getByTestId("answer-multipleChoice")).toBeInTheDocument();
    expect(screen.getByLabelText("Marcar como correta")).toBeInTheDocument();
  });

  it("forwards answer edits", () => {
    const props = setup();
    fireEvent.change(screen.getByLabelText("Alternativa"), { target: { value: "z" } });
    expect(props.onAnswerChange).toHaveBeenCalled();
  });

  it("offers 'Adicionar instrução' when there is no instruction", () => {
    setup({ instruction: null });
    expect(screen.getByText("Adicionar instrução")).toBeInTheDocument();
    expect(screen.queryByLabelText("Instrução da questão")).not.toBeInTheDocument();
  });

  it("reveals the instruction field locally when 'Adicionar instrução' is clicked", () => {
    setup({ instruction: null });
    fireEvent.click(screen.getByText("Adicionar instrução"));
    expect(screen.getByLabelText("Instrução da questão")).toBeInTheDocument();
    expect(screen.getByLabelText("Remover instrução")).toBeInTheDocument();
  });

  it("shows the named instruction field + remove when an instruction exists", () => {
    setup({ instruction: [{ type: "text", text: "Marque a correta." }] });
    expect(screen.getByLabelText("Instrução da questão")).toBeInTheDocument();
    expect(screen.getByLabelText("Remover instrução")).toBeInTheDocument();
    expect(screen.queryByText("Adicionar instrução")).not.toBeInTheDocument();
  });

  it("writes an edited instruction back (non-empty)", () => {
    const props = setup({ instruction: [{ type: "text", text: "old" }] });
    fireEvent.change(screen.getByLabelText("Instrução da questão"), { target: { value: "new" } });
    expect(props.onInstructionChange).toHaveBeenCalledWith([{ type: "text", text: "new" }]);
  });

  it("clearing the instruction text writes null (never an empty array)", () => {
    const props = setup({ instruction: [{ type: "text", text: "x" }] });
    const field = screen.getByLabelText("Instrução da questão");
    // type then clear → the field emits [] → the card writes null.
    fireEvent.change(field, { target: { value: "y" } });
    fireEvent.change(field, { target: { value: "" } });
    expect(props.onInstructionChange).toHaveBeenLastCalledWith(null);
  });

  it("removing the instruction writes null", () => {
    const props = setup({ instruction: [{ type: "text", text: "x" }] });
    fireEvent.click(screen.getByLabelText("Remover instrução"));
    expect(props.onInstructionChange).toHaveBeenCalledWith(null);
  });

  it("closes via Concluir", () => {
    const props = setup();
    fireEvent.click(screen.getByRole("button", { name: "Concluir" }));
    expect(props.onDone).toHaveBeenCalledTimes(1);
  });

  it("disables the inline fields when disabled", () => {
    setup({ instruction: [{ type: "text", text: "x" }], disabled: true });
    expect(screen.getByLabelText("Instrução da questão")).toBeDisabled();
  });

  // Tipo dropdown (plano §6.3 / D8 — troca de tipo) -------------------------

  it("shows the current answer type in the Tipo dropdown", () => {
    setup(); // multipleChoice
    expect(screen.getByTestId("question-type-trigger")).toHaveTextContent("Múltipla escolha");
  });

  it("lets the teacher change the question type, converting the answer in place", async () => {
    const props = setup(); // multipleChoice
    fireEvent.click(screen.getByTestId("question-type-trigger"));
    await waitFor(() => screen.getByRole("option", { name: "Verdadeiro/Falso" }));
    fireEvent.click(screen.getByRole("option", { name: "Verdadeiro/Falso" }));
    expect(props.onAnswerChange).toHaveBeenCalledTimes(1);
    expect(props.onAnswerChange.mock.calls[0][0]).toMatchObject({ kind: "trueFalse" });
  });

  it("disables the Tipo dropdown when disabled", () => {
    setup({ disabled: true });
    expect(screen.getByTestId("question-type-trigger")).toBeDisabled();
  });
});
