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
    readOnly,
    value,
  }: {
    value: RichText;
    onChange: (rt: RichText) => void;
    ariaLabel?: string;
    disabled?: boolean;
    readOnly?: boolean;
  }) => {
    const text = value.map((n: { type: string; text?: string }) => n.text ?? "").join("");
    return (
      <input
        aria-label={ariaLabel}
        disabled={disabled}
        readOnly={readOnly}
        defaultValue={text}
        onChange={(e) => onChange(e.target.value ? [{ type: "text", text: e.target.value }] : [])}
      />
    );
  },
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
    enunciado: null as RichText | null,
    enunciadoPosition: "below" as "above" | "below",
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

  it("reserva espaço no topo quando o rail aparece, para não cobrir o enunciado (achado 0205)", () => {
    setup();
    const preview = screen.getByTestId("question-preview");
    // O rail é um overlay opaco ancorado em top-0; sem reserva ele cobre a
    // primeira linha do enunciado em telas estreitas. A reserva usa os mesmos
    // gatilhos de visibilidade do rail (group-hover / group-focus-within).
    expect(preview.className).toMatch(/group-hover:pt-9/);
    expect(preview.className).toMatch(/group-focus-within:pt-9/);
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
    fireEvent.change(screen.getByLabelText("Alternativa b"), { target: { value: "z" } });
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
    expect(screen.getByLabelText("Alternativa a")).toBeDisabled();
  });

  it("renders a remove-instruction button when instruction is present", () => {
    setup({ instruction: [{ type: "text", text: "Siga os passos." }] });
    expect(screen.getByLabelText("Remover instrução")).toBeInTheDocument();
  });

  it("remove-instruction button calls onInstructionChange(null)", () => {
    const props = setup({ instruction: [{ type: "text", text: "x" }] });
    fireEvent.click(screen.getByLabelText("Remover instrução"));
    expect(props.onInstructionChange).toHaveBeenCalledWith(null);
  });

  it("disables the remove-instruction button when not editable", () => {
    setup({ disabled: true, instruction: [{ type: "text", text: "x" }] });
    expect(screen.getByLabelText("Remover instrução")).toBeDisabled();
  });

  it("remove-instruction button has a target of at least 24x24 (WCAG 2.5.8)", () => {
    setup({ instruction: [{ type: "text", text: "x" }] });
    const btn = screen.getByLabelText("Remover instrução");
    expect(btn.className).toContain("h-7");
    expect(btn.className).toContain("w-7");
    expect(btn.className).not.toContain("h-5");
    expect(btn.className).not.toContain("w-5");
  });

  it("remove-instruction button is chrome gated by hover/focus, not printed on the folha", () => {
    setup({ instruction: [{ type: "text", text: "x" }] });
    const row = screen.getByTestId("question-instruction");
    expect(row.className).toContain("group/instruction");
    const btn = screen.getByLabelText("Remover instrução");
    expect(btn.className).toContain("opacity-0");
    expect(btn.className).toContain("group-hover/instruction:opacity-100");
    expect(btn.className).toContain("group-focus-within/instruction:opacity-100");
  });

  it("remove-instruction button sits next to the instruction text, not pushed to the right edge", () => {
    setup({ instruction: [{ type: "text", text: "x" }] });
    const row = screen.getByTestId("question-instruction");
    // the text wrapper must not stretch (flex-1 would push the x to the column edge)
    const textWrapper = screen.getByLabelText("Instrução da questão").parentElement!;
    expect(textWrapper.className).not.toContain("flex-1");
    // and the row itself must not stretch the gap between text and button
    expect(row.className).not.toContain("justify-between");
  });

  it("does not render a remove-instruction button when there is no instruction", () => {
    setup({ instruction: null });
    expect(screen.queryByLabelText("Remover instrução")).not.toBeInTheDocument();
  });

  // --- Enunciado (read-only in preview) ---

  it("does not render enunciado when enunciado is null", () => {
    setup({ enunciado: null });
    expect(screen.queryByTestId("question-enunciado")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Enunciado da questão")).not.toBeInTheDocument();
  });

  it("does not render enunciado when enunciado is an empty array", () => {
    setup({ enunciado: [] });
    expect(screen.queryByTestId("question-enunciado")).not.toBeInTheDocument();
  });

  it("renders enunciado read-only (not disabled, no opacity) when content is present", () => {
    setup({ enunciado: [{ type: "text", text: "Observe a imagem." }] });
    expect(screen.getByTestId("question-enunciado")).toBeInTheDocument();
    const field = screen.getByLabelText("Enunciado da questão");
    expect(field).toBeInTheDocument();
    expect(field).toHaveAttribute("readonly");
    expect(field).not.toBeDisabled();
  });

  it("enunciado above renders the enunciado node before the stem slot", () => {
    setup({
      enunciado: [{ type: "text", text: "Observe." }],
      enunciadoPosition: "above",
    });
    const enunciadoNode = screen.getByTestId("question-enunciado");
    const stemSlot = screen.getByTestId("stem-slot");
    // both exist; enunciadoNode appears before stem-slot in DOM order
    expect(enunciadoNode).toBeInTheDocument();
    expect(stemSlot).toBeInTheDocument();
    const allNodes = document.body.querySelectorAll("[data-testid]");
    const ids = Array.from(allNodes).map((el) => el.getAttribute("data-testid"));
    const enunciadoIdx = ids.indexOf("question-enunciado");
    const stemIdx = ids.indexOf("stem-slot");
    expect(enunciadoIdx).toBeLessThan(stemIdx);
  });

  it("enunciado below renders the enunciado node after the stem slot", () => {
    setup({
      enunciado: [{ type: "text", text: "Observe." }],
      enunciadoPosition: "below",
    });
    const allNodes = document.body.querySelectorAll("[data-testid]");
    const ids = Array.from(allNodes).map((el) => el.getAttribute("data-testid"));
    const enunciadoIdx = ids.indexOf("question-enunciado");
    const stemIdx = ids.indexOf("stem-slot");
    expect(stemIdx).toBeLessThan(enunciadoIdx);
  });

  it("enunciado onChange is a no-op (field is read-only, does not throw)", () => {
    setup({ enunciado: [{ type: "text", text: "Observe." }] });
    const field = screen.getByLabelText("Enunciado da questão");
    // onChange={() => {}} is intentionally inert; firing it should not throw
    expect(() => fireEvent.change(field, { target: { value: "x" } })).not.toThrow();
  });

  /**
   * Regressão (achado 0102): a folha do Revisar precisa reproduzir o espaçamento
   * vertical do impresso. `render/blocks/QuestionView` usa gap-2 / space-y-2 (8px)
   * entre ordinal, enunciado, instrução e resposta; a prévia usava gap-2.5 e mt-3,
   * somando altura que não existe no PDF.
   */
  it("uses the same vertical spacing as the printed QuestionView (gap-2, mt-2)", () => {
    setup();
    const row = screen.getByTestId("question-ordinal").parentElement as HTMLElement;
    expect(row.className).toContain("gap-2");
    expect(row.className).not.toContain("gap-2.5");

    const stemColumn = screen.getByTestId("stem-slot").parentElement?.parentElement as HTMLElement;
    expect(stemColumn.className).toContain("gap-2");
    expect(stemColumn.className).not.toContain("gap-2.5");

    const answerWrapper = screen.getByTestId("answer-preview-multipleChoice")
      .parentElement as HTMLElement;
    expect(answerWrapper.className).toContain("mt-2");
    expect(answerWrapper.className).not.toContain("mt-3");
  });

  /**
   * Regressão (achado 0103): a instrução ficava DENTRO da coluna do enunciado,
   * portanto recuada pela largura do ordinal + gap (32px), enquanto o read-only
   * (`render/blocks/QuestionView`) e o PDF a imprimem no nível do bloco, colada à
   * margem. Duas das três superfícies concordam: quem muda é o Revisar.
   */
  it("renders the instruction at block level, not indented inside the stem column", () => {
    setup({ instruction: [{ type: "text", text: "Marque a alternativa correta." }] });
    const instruction = screen.getByTestId("question-instruction");
    const ordinalRow = screen.getByTestId("question-ordinal").parentElement as HTMLElement;
    // fora da linha do ordinal (senão herda o recuo do ordinal shrink-0 + gap)
    expect(ordinalRow.contains(instruction)).toBe(false);
    // e irmã dessa linha, no mesmo container do bloco
    expect(instruction.parentElement).toBe(ordinalRow.parentElement);
  });

  it("keeps the instruction between the ordinal row and the answer, spaced like the printed view", () => {
    setup({ instruction: [{ type: "text", text: "Marque a alternativa correta." }] });
    const instruction = screen.getByTestId("question-instruction");
    expect(instruction.className).toContain("mt-2");
    const answerWrapper = screen.getByTestId("answer-preview-multipleChoice")
      .parentElement as HTMLElement;
    expect(instruction.compareDocumentPosition(answerWrapper)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
  });

  // --- customNumber ---

  it("uses customNumber as the ordinal when set", () => {
    setup({ num: 1, customNumber: "1a" });
    expect(screen.getByTestId("question-ordinal")).toHaveTextContent("1a.");
  });

  it("falls back to auto-number when customNumber is null", () => {
    setup({ num: 7, customNumber: null });
    expect(screen.getByTestId("question-ordinal")).toHaveTextContent("7.");
  });

  it("renders empty ordinal when both num is undefined and customNumber is null", () => {
    setup({ num: undefined, customNumber: null });
    expect(screen.getByTestId("question-ordinal")).toHaveTextContent("");
  });
});
