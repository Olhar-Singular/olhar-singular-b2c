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

  // Achado 0503: o card é quem sabe da lacuna impressa — ele repassa os avisos
  // de `+ Lacuna` / `Remover lacuna` para quem manda no enunciado.
  it("repassa os avisos de lacuna ao dono do enunciado", () => {
    const onGapAdded = vi.fn();
    const onGapRemoved = vi.fn();
    setup({
      answer: { kind: "fillBlank", gaps: [{ id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", answer: "g1" }] },
      onGapAdded,
      onGapRemoved,
    });
    fireEvent.click(screen.getByText("Lacuna"));
    expect(onGapAdded).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getAllByTitle("Remover lacuna")[0]);
    expect(onGapRemoved).toHaveBeenCalledWith(0);
  });

  it("renders the full AnswerEditor (structure controls visible)", () => {
    setup();
    expect(screen.getByTestId("answer-multipleChoice")).toBeInTheDocument();
    expect(screen.getByLabelText("Marcar alternativa a como correta")).toBeInTheDocument();
  });

  // --- Local state: edits are buffered, not immediately committed ---

  it("commits the updated answer on Concluir (answer edits are buffered locally)", () => {
    const props = setup();
    fireEvent.change(screen.getByLabelText("Alternativa a"), { target: { value: "z" } });
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
  // Achado 0363: o card monta no lugar do rail, e o botão que recebeu o Enter
  // ("Editar questão") é desmontado no mesmo commit. Sem ninguém reivindicar o
  // foco, o navegador devolve ao <body> e o usuário de teclado fica sem
  // indicação nenhuma de onde está.
  it("leva o foco para o primeiro controle do card ao abrir (achado 0363)", () => {
    setup({ num: 2 });
    expect(document.activeElement).toBe(screen.getByLabelText("Número da questão"));
  });

  it("leva o foco para o próprio card quando o número não é editável (achado 0363)", () => {
    setup({ num: 2, disabled: true });
    expect(document.activeElement).toBe(screen.getByTestId("question-card"));
  });

  // Achado 0368: o campo media 32x19px (w-8 sem altura propria, herdando a linha
  // de 13px do <span>), abaixo do minimo de 24px do WCAG 2.5.8, e o unico sinal
  // de foco era um fio de 1px trocando de tom, porque a classe zerava o outline.
  describe("alvo e foco do número da questão (achado 0368)", () => {
    const classesDoCampo = () => {
      setup({ num: 2 });
      return screen.getByLabelText("Número da questão").className.split(/\s+/);
    };

    it("tem altura de alvo de pelo menos 24px", () => {
      const alturaEmPx = (token: string) => {
        const m = /^(?:min-)?h-(\d+(?:\.\d+)?)$/.exec(token);
        if (m) return Number(m[1]) * 4;
        const arbitraria = /^(?:min-)?h-\[(\d+(?:\.\d+)?)(px|rem)\]$/.exec(token);
        if (arbitraria) return Number(arbitraria[1]) * (arbitraria[2] === "rem" ? 16 : 1);
        return 0;
      };
      const maior = Math.max(0, ...classesDoCampo().map(alturaEmPx));
      expect(maior).toBeGreaterThanOrEqual(24);
    });

    it("não zera o outline e pinta um anel de foco de pelo menos 2px", () => {
      const classes = classesDoCampo();
      expect(classes).not.toContain("outline-none");
      expect(classes).toContain("focus-visible:outline");
      expect(classes).toContain("focus-visible:outline-2");
    });
  });
});

/**
 * Achado 0373: o "remover ×" de instrução e enunciado era texto de 11px em
 * `ink-faint` sem padding, com alvo de ~50 x 15 px (WCAG 2.2 SC 2.5.8 pede 24 px)
 * e tinta abaixo de 4,5:1.
 */
describe("QuestionCard — botões de remover campo (0373)", () => {
  const expectTarget = (el: HTMLElement) => {
    expect(el.className).toMatch(/(^|\s)min-h-6(\s|$)/);
    expect(el.className).toMatch(/(^|\s)min-w-6(\s|$)/);
    expect(el.className).toMatch(/(^|\s)px-1\.5(\s|$)/);
    expect(el.className).toMatch(/(^|\s)text-surface-ink-soft(\s|$)/);
    expect(el.className).not.toMatch(/text-surface-ink-faint/);
  };

  it("Remover instrução tem alvo de 24 px e tinta legível", () => {
    setup({ instruction: [{ type: "text", text: "Marque a correta." }] });
    expectTarget(screen.getByLabelText("Remover instrução"));
  });

  it("Remover enunciado (abaixo da imagem) tem alvo de 24 px e tinta legível", () => {
    setup({ enunciado: [{ type: "text", text: "Observe." }], enunciadoPosition: "below" });
    expectTarget(screen.getByLabelText("Remover enunciado"));
  });

  it("Remover enunciado (acima da imagem) tem alvo de 24 px e tinta legível", () => {
    setup({ enunciado: [{ type: "text", text: "Observe." }], enunciadoPosition: "above" });
    expectTarget(screen.getByLabelText("Remover enunciado"));
  });
});

/**
 * Achado 0467: os rótulos de seção do card ("Imagem / Conteúdo", "Instrução",
 * "Enunciado") eram 11,5 px em `ink-faint` sobre o papel branco, 2,45:1 (WCAG
 * 2.2 AA 1.4.3 pede 4,5:1). `ink-soft` mede 5,88:1.
 */
describe("QuestionCard — rótulos de seção legíveis (0467)", () => {
  const expectInk = (text: string) => {
    const el = screen.getByText(text);
    expect(el.className).toMatch(/(^|\s)text-surface-ink-soft(\s|$)/);
    expect(el.className).not.toMatch(/text-surface-ink-faint/);
  };

  it("Imagem / Conteúdo e Instrução usam ink-soft", () => {
    setup({ instruction: [{ type: "text", text: "Marque a correta." }] });
    expectInk("Imagem / Conteúdo");
    expectInk("Instrução");
  });

  it("Enunciado abaixo da imagem usa ink-soft", () => {
    setup({ enunciado: [{ type: "text", text: "Observe." }], enunciadoPosition: "below" });
    expectInk("Enunciado");
  });

  it("Enunciado acima da imagem usa ink-soft", () => {
    setup({ enunciado: [{ type: "text", text: "Observe." }], enunciadoPosition: "above" });
    expectInk("Enunciado");
  });
});
