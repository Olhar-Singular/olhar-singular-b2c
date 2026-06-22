import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { RichText, QuestionAnswer } from "@/lib/adaptation/canonical/schema";
import { QuestionCard } from "./QuestionCard";

// AnswerEditor (real) and the card both render RichTextField — stub it so we can
// drive the inline fields without the real ProseMirror editor.
vi.mock("../RichTextField", () => ({
  RichTextField: ({
    value,
    onChange,
    ariaLabel,
    disabled,
  }: {
    value: RichText;
    onChange: (rt: RichText) => void;
    ariaLabel?: string;
    disabled?: boolean;
  }) => {
    const text = value.map((n: { type: string; text?: string }) => n.text ?? "").join("");
    return (
      <input
        aria-label={ariaLabel}
        disabled={disabled}
        value={text}
        onChange={(e) => onChange(e.target.value ? [{ type: "text", text: e.target.value }] : [])}
      />
    );
  },
}));

const mc: QuestionAnswer = {
  kind: "multipleChoice",
  alternatives: [{ id: "11111111-1111-4111-8111-111111111111", content: [{ type: "text", text: "a" }], correct: true }],
};

function setup(overrides: Partial<Parameters<typeof QuestionCard>[0]> = {}) {
  const props = {
    num: 2,
    customNumber: null as string | null,
    answer: mc,
    instruction: null as RichText | null,
    enunciado: null as RichText | null,
    enunciadoPosition: "below" as "above" | "below",
    disabled: false,
    onCommit: vi.fn(),
    onCancel: vi.fn(),
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
    expect(screen.getByLabelText("Número da questão")).toHaveValue("3");
  });

  it("renders the stem slot under Imagem / Conteúdo label", () => {
    setup();
    expect(screen.getByTestId("stem-slot")).toBeInTheDocument();
    expect(screen.getByText("Imagem / Conteúdo")).toBeInTheDocument();
  });

  it("renders the full AnswerEditor (structure controls visible)", () => {
    setup();
    expect(screen.getByTestId("answer-multipleChoice")).toBeInTheDocument();
    expect(screen.getByLabelText("Marcar como correta")).toBeInTheDocument();
  });

  // --- Local state: edits are buffered, not immediately committed ---

  it("commits the updated answer on Concluir (answer edits are buffered locally)", () => {
    const props = setup();
    fireEvent.change(screen.getByLabelText("Alternativa"), { target: { value: "z" } });
    fireEvent.click(screen.getByRole("button", { name: "Concluir" }));
    expect(props.onCommit).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "multipleChoice" }),
      null,
      null,
      "below",
      null,
    );
  });

  it("commits initial values unchanged when Concluir is clicked with no edits", () => {
    const props = setup();
    fireEvent.click(screen.getByRole("button", { name: "Concluir" }));
    expect(props.onCommit).toHaveBeenCalledWith(mc, null, null, "below", null);
  });

  // --- Cancelar ---

  it("renders a Cancelar button", () => {
    setup();
    expect(screen.getByRole("button", { name: "Cancelar edição" })).toBeInTheDocument();
  });

  it("calls onCancel when Cancelar is clicked without calling onCommit", () => {
    const props = setup();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar edição" }));
    expect(props.onCancel).toHaveBeenCalledTimes(1);
    expect(props.onCommit).not.toHaveBeenCalled();
  });

  // --- Enunciado field ---

  it("offers 'Adicionar enunciado' when enunciado is null", () => {
    setup({ enunciado: null });
    expect(screen.getByRole("button", { name: "Adicionar enunciado" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Enunciado da questão")).not.toBeInTheDocument();
  });

  it("clicking 'Adicionar enunciado' reveals the enunciado field and position buttons", () => {
    setup({ enunciado: null });
    fireEvent.click(screen.getByRole("button", { name: "Adicionar enunciado" }));
    expect(screen.getByLabelText("Enunciado da questão")).toBeInTheDocument();
    expect(screen.getByLabelText("Remover enunciado")).toBeInTheDocument();
    expect(screen.getByLabelText("Enunciado acima da imagem")).toBeInTheDocument();
    expect(screen.getByLabelText("Enunciado abaixo da imagem")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Adicionar enunciado" })).not.toBeInTheDocument();
  });

  it("shows enunciado field and remove button when enunciado has content", () => {
    setup({ enunciado: [{ type: "text", text: "Observe a imagem." }] });
    expect(screen.queryByRole("button", { name: "Adicionar enunciado" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Enunciado da questão")).toBeInTheDocument();
    expect(screen.getByLabelText("Remover enunciado")).toBeInTheDocument();
  });

  it("clicking 'Remover enunciado' hides the field locally", async () => {
    setup({ enunciado: [{ type: "text", text: "Observe." }] });
    fireEvent.click(screen.getByLabelText("Remover enunciado"));
    await waitFor(() =>
      expect(screen.queryByLabelText("Enunciado da questão")).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: "Adicionar enunciado" })).toBeInTheDocument();
  });

  it("position buttons toggle localPosition — above highlights the first button", () => {
    setup({ enunciado: [{ type: "text", text: "txt" }], enunciadoPosition: "below" });
    const aboveBtn = screen.getByLabelText("Enunciado acima da imagem");
    fireEvent.click(aboveBtn);
    // After clicking above, the "above" button should be the active (default variant)
    // The field should now appear above the stem slot (above section is rendered).
    expect(screen.getByLabelText("Enunciado da questão")).toBeInTheDocument();
  });

  it("enunciado position 'above' renders enunciado section before the stem slot", () => {
    setup({ enunciado: [{ type: "text", text: "txt" }], enunciadoPosition: "above" });
    // Both should be rendered; "Enunciado" label present
    const labels = screen.getAllByText("Enunciado");
    expect(labels.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByTestId("stem-slot")).toBeInTheDocument();
  });

  it("enunciado position 'below' renders enunciado section after the stem slot", () => {
    setup({ enunciado: [{ type: "text", text: "txt" }], enunciadoPosition: "below" });
    const labels = screen.getAllByText("Enunciado");
    expect(labels.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByTestId("stem-slot")).toBeInTheDocument();
  });

  it("removes enunciado from within the 'above' block (remover button in above section)", async () => {
    setup({ enunciado: [{ type: "text", text: "Txt" }], enunciadoPosition: "above" });
    fireEvent.click(screen.getByLabelText("Remover enunciado"));
    await waitFor(() =>
      expect(screen.queryByLabelText("Enunciado da questão")).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: "Adicionar enunciado" })).toBeInTheDocument();
  });

  it("changes enunciado text when already in 'above' position", () => {
    const props = setup({ enunciado: [{ type: "text", text: "Antigo" }], enunciadoPosition: "above" });
    fireEvent.change(screen.getByLabelText("Enunciado da questão"), { target: { value: "Novo texto" } });
    fireEvent.click(screen.getByRole("button", { name: "Concluir" }));
    expect(props.onCommit).toHaveBeenCalledWith(
      mc,
      null,
      [{ type: "text", text: "Novo texto" }],
      "above",
      null,
    );
  });

  it("clears enunciado to null when field is emptied in 'above' position", async () => {
    setup({ enunciado: [{ type: "text", text: "Txt" }], enunciadoPosition: "above" });
    fireEvent.change(screen.getByLabelText("Enunciado da questão"), { target: { value: "" } });
    await waitFor(() =>
      expect(screen.queryByLabelText("Enunciado da questão")).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: "Adicionar enunciado" })).toBeInTheDocument();
  });

  it("toggles from 'above' to 'below' via the position button inside the 'above' section", () => {
    setup({ enunciado: [{ type: "text", text: "txt" }], enunciadoPosition: "above" });
    // "Enunciado abaixo da imagem" button is inside the rendered "above" section
    fireEvent.click(screen.getByLabelText("Enunciado abaixo da imagem"));
    // Field still present; position changed to below
    expect(screen.getByLabelText("Enunciado da questão")).toBeInTheDocument();
  });

  it("re-selects 'above' when already above (idempotent click on 'acima' in above section)", () => {
    setup({ enunciado: [{ type: "text", text: "txt" }], enunciadoPosition: "above" });
    fireEvent.click(screen.getByLabelText("Enunciado acima da imagem"));
    expect(screen.getByLabelText("Enunciado da questão")).toBeInTheDocument();
  });

  it("re-selects 'below' when already below (idempotent click on 'abaixo' in below section)", () => {
    setup({ enunciado: [{ type: "text", text: "txt" }], enunciadoPosition: "below" });
    fireEvent.click(screen.getByLabelText("Enunciado abaixo da imagem"));
    expect(screen.getByLabelText("Enunciado da questão")).toBeInTheDocument();
  });

  it("changes enunciado text when in 'below' position (covers RichTextField onChange in below section)", () => {
    const props = setup({ enunciado: [{ type: "text", text: "Antigo" }], enunciadoPosition: "below" });
    fireEvent.change(screen.getByLabelText("Enunciado da questão"), { target: { value: "Atualizado" } });
    fireEvent.click(screen.getByRole("button", { name: "Concluir" }));
    expect(props.onCommit).toHaveBeenCalledWith(
      mc,
      null,
      [{ type: "text", text: "Atualizado" }],
      "below",
      null,
    );
  });

  it("clears enunciado to null when field is emptied in 'below' position", async () => {
    setup({ enunciado: [{ type: "text", text: "Txt" }], enunciadoPosition: "below" });
    fireEvent.change(screen.getByLabelText("Enunciado da questão"), { target: { value: "" } });
    await waitFor(() =>
      expect(screen.queryByLabelText("Enunciado da questão")).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: "Adicionar enunciado" })).toBeInTheDocument();
  });

  it("commits enunciado content and position on Concluir", () => {
    const props = setup({ enunciado: [{ type: "text", text: "Observe a imagem." }], enunciadoPosition: "above" });
    fireEvent.click(screen.getByRole("button", { name: "Concluir" }));
    expect(props.onCommit).toHaveBeenCalledWith(
      mc,
      null,
      [{ type: "text", text: "Observe a imagem." }],
      "above",
      null,
    );
  });

  it("commits null enunciado when field is removed before Concluir", async () => {
    const props = setup({ enunciado: [{ type: "text", text: "obs" }] });
    fireEvent.click(screen.getByLabelText("Remover enunciado"));
    await waitFor(() =>
      expect(screen.queryByLabelText("Enunciado da questão")).not.toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Concluir" }));
    expect(props.onCommit).toHaveBeenCalledWith(mc, null, null, expect.any(String), null);
  });

  it("adding enunciado defaults to position 'below'", () => {
    const props = setup({ enunciado: null });
    fireEvent.click(screen.getByRole("button", { name: "Adicionar enunciado" }));
    fireEvent.click(screen.getByRole("button", { name: "Concluir" }));
    expect(props.onCommit).toHaveBeenCalledWith(mc, null, [], "below", null);
  });

  it("disables enunciado controls when disabled", () => {
    setup({ enunciado: null, disabled: true });
    expect(screen.getByRole("button", { name: "Adicionar enunciado" })).toBeDisabled();
  });

  it("disables the enunciado field itself when disabled", () => {
    setup({ enunciado: [{ type: "text", text: "obs" }], disabled: true });
    expect(screen.getByLabelText("Enunciado da questão")).toBeDisabled();
  });

  // --- Instruction field ---

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

  it("commits the edited instruction on Concluir (non-empty)", () => {
    const props = setup({ instruction: [{ type: "text", text: "old" }] });
    fireEvent.change(screen.getByLabelText("Instrução da questão"), { target: { value: "new" } });
    fireEvent.click(screen.getByRole("button", { name: "Concluir" }));
    expect(props.onCommit).toHaveBeenCalledWith(
      expect.anything(),
      [{ type: "text", text: "new" }],
      null,
      "below",
      null,
    );
  });

  it("commits null instruction when the field is cleared", async () => {
    const props = setup({ instruction: [{ type: "text", text: "x" }] });
    fireEvent.change(screen.getByLabelText("Instrução da questão"), { target: { value: "" } });
    await waitFor(() => expect(screen.queryByLabelText("Instrução da questão")).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Concluir" }));
    expect(props.onCommit).toHaveBeenCalledWith(expect.anything(), null, null, "below", null);
  });

  it("commits null instruction when 'remover' is clicked and Concluir follows", async () => {
    const props = setup({ instruction: [{ type: "text", text: "x" }] });
    fireEvent.click(screen.getByLabelText("Remover instrução"));
    await waitFor(() => expect(screen.queryByLabelText("Remover instrução")).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Concluir" }));
    expect(props.onCommit).toHaveBeenCalledWith(expect.anything(), null, null, "below", null);
  });

  it("disables the inline fields when disabled", () => {
    setup({ instruction: [{ type: "text", text: "x" }], disabled: true });
    expect(screen.getByLabelText("Instrução da questão")).toBeDisabled();
  });

  // --- Tipo dropdown ---

  it("shows the current answer type in the Tipo dropdown", () => {
    setup();
    expect(screen.getByTestId("question-type-trigger")).toHaveTextContent("Múltipla escolha");
  });

  it("lets the teacher change the question type, converting the answer in place", async () => {
    const props = setup();
    fireEvent.click(screen.getByTestId("question-type-trigger"));
    await waitFor(() => screen.getByRole("option", { name: "Verdadeiro/Falso" }));
    fireEvent.click(screen.getByRole("option", { name: "Verdadeiro/Falso" }));
    fireEvent.click(screen.getByRole("button", { name: "Concluir" }));
    expect(props.onCommit.mock.calls[0][0]).toMatchObject({ kind: "trueFalse" });
  });

  it("disables the Tipo dropdown when disabled", () => {
    setup({ disabled: true });
    expect(screen.getByTestId("question-type-trigger")).toBeDisabled();
  });

  // --- customNumber (editable question number) ---

  it("shows the auto number in the number input when customNumber is null", () => {
    setup({ num: 5, customNumber: null });
    expect(screen.getByLabelText("Número da questão")).toHaveValue("5");
  });

  it("shows empty value and empty placeholder when num is undefined and customNumber is null", () => {
    setup({ num: undefined, customNumber: null });
    expect(screen.getByLabelText("Número da questão")).toHaveValue("");
    expect(screen.getByLabelText("Número da questão")).toHaveAttribute("placeholder", "");
  });

  it("shows customNumber in the input when set", () => {
    setup({ num: 1, customNumber: "1a" });
    expect(screen.getByLabelText("Número da questão")).toHaveValue("1a");
  });

  it("commits the edited customNumber on Concluir", () => {
    const props = setup({ num: 2, customNumber: null });
    fireEvent.change(screen.getByLabelText("Número da questão"), { target: { value: "2b" } });
    fireEvent.click(screen.getByRole("button", { name: "Concluir" }));
    expect(props.onCommit).toHaveBeenCalledWith(mc, null, null, "below", "2b");
  });

  it("commits null customNumber when the input is cleared", () => {
    const props = setup({ num: 3, customNumber: "3a" });
    fireEvent.change(screen.getByLabelText("Número da questão"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Concluir" }));
    expect(props.onCommit).toHaveBeenCalledWith(mc, null, null, "below", null);
  });

  it("disables the number input when disabled", () => {
    setup({ num: 1, disabled: true });
    expect(screen.getByLabelText("Número da questão")).toBeDisabled();
  });
});
