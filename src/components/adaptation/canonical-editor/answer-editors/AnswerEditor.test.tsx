import { describe, it, expect, vi, beforeEach } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import type { RichText, QuestionAnswer } from "@/lib/adaptation/canonical/schema";
import { AnswerEditor } from "./AnswerEditor";

// Mock RichTextField: render a plain textbox keyed by ariaLabel and expose an
// onChange that emits a single text run, so we can drive the content fields
// without the real ProseMirror editor.
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
    <input
      aria-label={ariaLabel}
      disabled={disabled}
      onChange={(e) => onChange([{ type: "text", text: e.target.value }])}
    />
  ),
}));

const t = (text: string): RichText => [{ type: "text", text }];

beforeEach(() => vi.clearAllMocks());

describe("AnswerEditor — multipleChoice", () => {
  const answer: QuestionAnswer = {
    kind: "multipleChoice",
    alternatives: [
      { id: "11111111-1111-4111-8111-111111111111", content: t("a"), correct: true },
      { id: "22222222-2222-4222-8222-222222222222", content: t("b"), correct: false },
    ],
  };

  it("sets correct via radio, edits content, removes and adds", () => {
    const onChange = vi.fn();
    render(<AnswerEditor answer={answer} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText("Marcar alternativa b como correta"));
    fireEvent.change(screen.getByLabelText("Alternativa a"), { target: { value: "z" } });
    fireEvent.click(screen.getAllByTitle("Remover alternativa")[0]);
    fireEvent.click(screen.getByText("Alternativa"));
    expect(onChange).toHaveBeenCalledTimes(4);
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "multipleChoice",
        alternatives: expect.arrayContaining([
          expect.objectContaining({ content: [{ type: "text", text: "z" }] }),
        ]),
      })
    );
  });

  it("lays the alternative field in a shrinkable flex row (min-w-0 so it wraps)", () => {
    render(<AnswerEditor answer={answer} onChange={vi.fn()} />);
    // The row holds [radio, field, trash]. min-w-0 lets the flex child (field)
    // shrink below content width so long alternatives wrap instead of scrolling.
    const row = screen.getByLabelText("Alternativa a").closest("div") as HTMLElement;
    expect(row.className).toContain("flex");
    expect(row.className).toContain("min-w-0");
  });
});

describe("AnswerEditor — trueFalse", () => {
  const answer: QuestionAnswer = {
    kind: "trueFalse",
    items: [{ id: "33333333-3333-4333-8333-333333333333", content: t("x"), value: false }],
  };

  it("edits content and toggles value", () => {
    const onChange = vi.fn();
    render(<AnswerEditor answer={answer} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Afirmação 1"), { target: { value: "y" } });
    fireEvent.click(screen.getByTitle("Alternar Verdadeiro/Falso"));
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("shows V when value is true", () => {
    const trueAnswer: QuestionAnswer = {
      kind: "trueFalse",
      items: [{ id: "33333333-3333-4333-8333-333333333333", content: t("x"), value: true }],
    };
    render(<AnswerEditor answer={trueAnswer} onChange={vi.fn()} />);
    expect(screen.getByText("V")).toBeInTheDocument();
  });

  // Achado 0805: the toggle lives on the sheet, which never follows the app
  // theme. App tokens (bg-background / bg-primary) turned the "F" into dark
  // paper ink on a dark teal square in dark mode (~1.2:1).
  it.each([false, true])("paints the V/F toggle with the sheet palette (value=%s)", (value) => {
    const a: QuestionAnswer = {
      kind: "trueFalse",
      items: [{ id: "33333333-3333-4333-8333-333333333333", content: t("x"), value }],
    };
    render(<AnswerEditor answer={a} onChange={vi.fn()} />);
    const classes = screen.getByTitle("Alternar Verdadeiro/Falso").className.split(/\s+/);
    expect(classes).not.toContain("bg-background");
    expect(classes).not.toContain("bg-primary");
    expect(classes).not.toContain("text-primary-foreground");
    expect(classes.some((c) => c.startsWith("bg-surface-"))).toBe(true);
    expect(classes.some((c) => c.startsWith("text-surface-") || c === "text-white")).toBe(true);
  });
});

describe("AnswerEditor — checkbox", () => {
  const answer: QuestionAnswer = {
    kind: "checkbox",
    items: [{ id: "55555555-5555-4555-8555-555555555555", content: t("c"), checked: false }],
  };

  it("toggles and edits content", () => {
    const onChange = vi.fn();
    render(<AnswerEditor answer={answer} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText("Marcar opção 1"));
    fireEvent.change(screen.getByLabelText("Opção 1"), { target: { value: "z" } });
    expect(onChange).toHaveBeenCalledTimes(2);
  });
});

describe("AnswerEditor — matching", () => {
  const answer: QuestionAnswer = {
    kind: "matching",
    pairs: [
      { id: "77777777-7777-4777-8777-777777777777", left: t("l"), right: t("r") },
      { id: "88888888-8888-4888-8888-888888888888", left: t("l2"), right: t("r2") },
    ],
  };

  it("edits both sides, adds and removes", () => {
    const onChange = vi.fn();
    render(<AnswerEditor answer={answer} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Coluna A, par 1"), { target: { value: "L" } });
    fireEvent.change(screen.getByLabelText("Coluna B, par 1"), { target: { value: "R" } });
    fireEvent.click(screen.getAllByTitle("Remover par")[0]);
    fireEvent.click(screen.getByText("Par"));
    expect(onChange).toHaveBeenCalledTimes(4);
  });
});

describe("AnswerEditor — ordering", () => {
  const answer: QuestionAnswer = {
    kind: "ordering",
    items: [
      { id: "99999999-9999-4999-8999-999999999999", content: t("o1"), position: 0 },
      { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", content: t("o2"), position: 1 },
    ],
  };

  it("edits content and reorders up/down", () => {
    const onChange = vi.fn();
    render(<AnswerEditor answer={answer} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Item 1"), { target: { value: "x" } });
    fireEvent.click(screen.getAllByTitle("Mover para baixo")[0]);
    fireEvent.click(screen.getAllByTitle("Mover para cima")[1]);
    expect(onChange).toHaveBeenCalledTimes(3);
  });
});

describe("AnswerEditor — fillBlank", () => {
  const answer: Extract<QuestionAnswer, { kind: "fillBlank" }> = {
    kind: "fillBlank",
    gaps: [
      { id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", answer: "g1" },
      { id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", answer: "g2" },
    ],
  };

  it("edits gap (plain text), removes and adds", () => {
    const onChange = vi.fn();
    render(<AnswerEditor answer={answer} onChange={onChange} />);
    fireEvent.change(screen.getAllByPlaceholderText("Resposta")[0], { target: { value: "n" } });
    fireEvent.click(screen.getAllByTitle("Remover lacuna")[0]);
    fireEvent.click(screen.getByText("Lacuna"));
    expect(onChange).toHaveBeenCalledTimes(3);
    // fillBlank gap answers stay plain strings (literal expected answers).
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "fillBlank",
        gaps: expect.arrayContaining([expect.objectContaining({ answer: "n" })]),
      })
    );
  });

  /**
   * Achado 0503: `+ Lacuna` / `Remover lacuna` mexiam só em `gaps[]`, e o `___`
   * impresso no enunciado ficava para trás — gabarito a mais, ou deslocado.
   */
  it("avisa o enunciado ao adicionar e ao remover uma lacuna, com o índice removido", () => {
    const onGapAdded = vi.fn();
    const onGapRemoved = vi.fn();
    render(
      <AnswerEditor answer={answer} onChange={vi.fn()} onGapAdded={onGapAdded} onGapRemoved={onGapRemoved} />
    );
    fireEvent.click(screen.getByText("Lacuna"));
    expect(onGapAdded).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getAllByTitle("Remover lacuna")[1]);
    expect(onGapRemoved).toHaveBeenCalledWith(1);
  });

  /**
   * Achado 0370: depois de "+ Lacuna" o foco ficava onde estava; quem usa
   * teclado tinha de tabular pelo card inteiro até achar o campo criado.
   */
  it("move o foco para o campo Resposta da lacuna criada", () => {
    function Harness() {
      const [value, setValue] = useState<QuestionAnswer>(answer);
      return <AnswerEditor answer={value} onChange={setValue} />;
    }
    render(<Harness />);
    fireEvent.click(screen.getByText("Lacuna"));
    const created = screen.getByLabelText("Lacuna 3");
    expect(created).toHaveFocus();
  });

  it("não rouba o foco se a resposta mudar sem a lacuna criada", () => {
    const { rerender } = render(<AnswerEditor answer={answer} onChange={vi.fn()} />);
    fireEvent.click(screen.getByText("Lacuna"));
    const other: QuestionAnswer = { kind: "fillBlank", gaps: [answer.gaps[0]] };
    rerender(<AnswerEditor answer={other} onChange={vi.fn()} />);
    expect(screen.getByLabelText("Lacuna 1")).not.toHaveFocus();
  });

  it("segue funcionando sem os avisos de enunciado (card fora do editor)", () => {
    const onChange = vi.fn();
    render(<AnswerEditor answer={answer} onChange={onChange} />);
    fireEvent.click(screen.getByText("Lacuna"));
    fireEvent.click(screen.getAllByTitle("Remover lacuna")[0]);
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  /**
   * Achado 0502: a IA gravava `tip` e `alternatives` na lacuna e nenhuma superfície
   * lia — nem a folha, nem o PDF, nem o card. O card passa a ser o leitor/editor.
   */
  it("mostra e edita a dica e as outras respostas aceitas da lacuna", () => {
    const onChange = vi.fn();
    const comExtras: QuestionAnswer = {
      kind: "fillBlank",
      gaps: [{ ...answer.gaps[0], tip: "comeca com E", alternatives: ["evaporação"] }],
    };
    render(<AnswerEditor answer={comExtras} onChange={onChange} />);

    const dica = screen.getByLabelText("Dica da lacuna 1") as HTMLInputElement;
    const outras = screen.getByLabelText("Outras respostas aceitas na lacuna 1, separadas por vírgula") as HTMLInputElement;
    expect(dica.value).toBe("comeca com E");
    expect(outras.value).toBe("evaporação");

    fireEvent.change(dica, { target: { value: "comeca com C" } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        gaps: [expect.objectContaining({ tip: "comeca com C" })],
      })
    );

    fireEvent.change(outras, { target: { value: "evaporação, EVAPORACAO" } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        gaps: [expect.objectContaining({ alternatives: ["evaporação", "EVAPORACAO"] })],
      })
    );
  });

  it("deixa os campos extras vazios quando a lacuna não tem dica nem alternativas", () => {
    render(<AnswerEditor answer={answer} onChange={vi.fn()} />);
    expect((screen.getByLabelText("Dica da lacuna 2") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("Outras respostas aceitas na lacuna 2, separadas por vírgula") as HTMLInputElement).value).toBe("");
  });

  it("deixa remover a última lacuna (buildAnswer nasce com gaps vazio)", () => {
    const onChange = vi.fn();
    const single: QuestionAnswer = { kind: "fillBlank", gaps: [answer.gaps[0]] };
    render(<AnswerEditor answer={single} onChange={onChange} />);
    fireEvent.click(screen.getByTitle("Remover lacuna"));
    expect(onChange).toHaveBeenCalledWith({ kind: "fillBlank", gaps: [] });
  });
});

describe("AnswerEditor — table", () => {
  const answer: QuestionAnswer = {
    kind: "table",
    rows: [[t("a"), t("b")]],
  };

  it("edits a cell", () => {
    const onChange = vi.fn();
    render(<AnswerEditor answer={answer} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Cabeçalho da coluna 1"), { target: { value: "z" } });
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});

describe("AnswerEditor — open", () => {
  it("edits the number of answer lines", () => {
    const answer: QuestionAnswer = { kind: "open", answerLines: 3 };
    const onChange = vi.fn();
    render(<AnswerEditor answer={answer} onChange={onChange} />);
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "5" } });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("defaults to 0 lines when answerLines is undefined", () => {
    const answer: QuestionAnswer = { kind: "open" };
    render(<AnswerEditor answer={answer} onChange={vi.fn()} />);
    expect(screen.getByRole("spinbutton")).toHaveValue(0);
  });

  it("renders disabled inputs when disabled", () => {
    const answer: QuestionAnswer = { kind: "open", answerLines: 3 };
    render(<AnswerEditor answer={answer} onChange={vi.fn()} disabled />);
    expect(screen.getByRole("spinbutton")).toBeDisabled();
  });
});

/**
 * AnswerEditor renders ONLY inside the expanded question card (plano Fase 2),
 * where structure + answer-key controls are ALWAYS available. There is no longer
 * an editor mode that could hide them — these guard against a future regression.
 */
describe("AnswerEditor — structure + answer-key controls stay visible", () => {
  it("multipleChoice: keeps correct radio, remove and add", () => {
    const answer: QuestionAnswer = {
      kind: "multipleChoice",
      alternatives: [{ id: "11111111-1111-4111-8111-111111111111", content: t("a"), correct: true }],
    };
    render(<AnswerEditor answer={answer} onChange={vi.fn()} />);
    expect(screen.getByLabelText("Marcar alternativa a como correta")).toBeInTheDocument();
    expect(screen.getByTitle("Remover alternativa")).toBeInTheDocument();
    expect(screen.getByText("Alternativa")).toBeInTheDocument();
  });

  it("trueFalse: keeps the V/F answer toggle", () => {
    const answer: QuestionAnswer = {
      kind: "trueFalse",
      items: [{ id: "33333333-3333-4333-8333-333333333333", content: t("x"), value: false }],
    };
    render(<AnswerEditor answer={answer} onChange={vi.fn()} />);
    expect(screen.getByTitle("Alternar Verdadeiro/Falso")).toBeInTheDocument();
  });

  it("checkbox: keeps the mark-correct checkbox", () => {
    const answer: QuestionAnswer = {
      kind: "checkbox",
      items: [{ id: "55555555-5555-4555-8555-555555555555", content: t("c"), checked: false }],
    };
    render(<AnswerEditor answer={answer} onChange={vi.fn()} />);
    expect(screen.getByLabelText("Marcar opção 1")).toBeInTheDocument();
  });

  it("matching: keeps remove + add", () => {
    const answer: QuestionAnswer = {
      kind: "matching",
      pairs: [{ id: "77777777-7777-4777-8777-777777777777", left: t("l"), right: t("r") }],
    };
    render(<AnswerEditor answer={answer} onChange={vi.fn()} />);
    expect(screen.getByTitle("Remover par")).toBeInTheDocument();
    expect(screen.getByText("Par")).toBeInTheDocument();
  });

  it("ordering: keeps reorder up/down", () => {
    const answer: QuestionAnswer = {
      kind: "ordering",
      items: [
        { id: "99999999-9999-4999-8999-999999999999", content: t("o1"), position: 0 },
        { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", content: t("o2"), position: 1 },
      ],
    };
    render(<AnswerEditor answer={answer} onChange={vi.fn()} />);
    expect(screen.getAllByTitle("Mover para cima")).toHaveLength(2);
    expect(screen.getAllByTitle("Mover para baixo")).toHaveLength(2);
  });

  it("fillBlank: keeps remove + add and the gap answer stays editable", () => {
    const answer: QuestionAnswer = {
      kind: "fillBlank",
      gaps: [{ id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", answer: "g1" }],
    };
    render(<AnswerEditor answer={answer} onChange={vi.fn()} />);
    expect(screen.getByTitle("Remover lacuna")).toBeInTheDocument();
    expect(screen.getByText("Lacuna")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Resposta")).not.toBeDisabled();
  });

  it("open: keeps the answer-lines config", () => {
    const answer: QuestionAnswer = { kind: "open", answerLines: 3 };
    render(<AnswerEditor answer={answer} onChange={vi.fn()} />);
    expect(screen.getByRole("spinbutton")).toBeInTheDocument();
  });
});

/**
 * Achado 0312: os campos do card de resposta não tinham `id`/`name`, e os
 * rótulos visíveis ("Lacuna N", "Linhas de resposta:") eram `<span>` — clicar
 * neles não focava o campo e o Chrome reportava
 * "A form field element should have an id or name attribute".
 */
describe("AnswerEditor — identidade e rótulo dos campos (achado 0312)", () => {
  it("fillBlank: o ordinal da lacuna é um <label> que aponta para o campo", () => {
    const answer: QuestionAnswer = {
      kind: "fillBlank",
      gaps: [
        { id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", answer: "g1" },
        { id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", answer: "g2" },
      ],
    };
    render(<AnswerEditor answer={answer} onChange={vi.fn()} />);
    const first = screen.getByLabelText("Lacuna 1") as HTMLInputElement;
    const second = screen.getByLabelText("Lacuna 2") as HTMLInputElement;
    expect(first.id).not.toBe("");
    expect(first.id).not.toBe(second.id);
    expect(first.getAttribute("name")).toBe("fillblank-gap");
  });

  it("open: 'Linhas de resposta' é um <label> que aponta para o campo", () => {
    const answer: QuestionAnswer = { kind: "open", answerLines: 3 };
    render(<AnswerEditor answer={answer} onChange={vi.fn()} />);
    const input = screen.getByLabelText(/Linhas de resposta/) as HTMLInputElement;
    expect(input.id).not.toBe("");
    expect(input.getAttribute("name")).toBe("open-answer-lines");
  });
});

/**
 * Achado 0369: o card não deixava adicionar/remover afirmação (V/F), opção
 * (checkbox), item (ordenação) nem linha/coluna (tabela).
 */
describe("AnswerEditor — 0369 add/remove nos tipos com lista", () => {
  const A = "11111111-1111-4111-8111-111111111111";
  const B = "22222222-2222-4222-8222-222222222222";

  it("trueFalse: adds and removes a statement", () => {
    const answer: QuestionAnswer = {
      kind: "trueFalse",
      items: [
        { id: A, content: t("a"), value: true },
        { id: B, content: t("b"), value: false },
      ],
    };
    const onChange = vi.fn();
    render(<AnswerEditor answer={answer} onChange={onChange} />);
    fireEvent.click(screen.getAllByTitle("Remover afirmação")[0]);
    expect(onChange).toHaveBeenLastCalledWith({ kind: "trueFalse", items: [{ id: B, content: t("b"), value: false }] });
    fireEvent.click(screen.getByRole("button", { name: /Afirmação/ }));
    expect(onChange.mock.calls[1][0].items).toHaveLength(3);
  });

  it("checkbox: adds and removes an option", () => {
    const answer: QuestionAnswer = {
      kind: "checkbox",
      items: [
        { id: A, content: t("a"), checked: true },
        { id: B, content: t("b"), checked: false },
      ],
    };
    const onChange = vi.fn();
    render(<AnswerEditor answer={answer} onChange={onChange} />);
    fireEvent.click(screen.getAllByTitle("Remover opção")[1]);
    expect(onChange).toHaveBeenLastCalledWith({ kind: "checkbox", items: [{ id: A, content: t("a"), checked: true }] });
    fireEvent.click(screen.getByRole("button", { name: /Opção/ }));
    expect(onChange.mock.calls[1][0].items).toHaveLength(3);
  });

  it("ordering: adds and removes an item", () => {
    const answer: QuestionAnswer = {
      kind: "ordering",
      items: [
        { id: A, content: t("a"), position: 0 },
        { id: B, content: t("b"), position: 1 },
      ],
    };
    const onChange = vi.fn();
    render(<AnswerEditor answer={answer} onChange={onChange} />);
    fireEvent.click(screen.getAllByTitle("Remover item")[0]);
    expect(onChange).toHaveBeenLastCalledWith({ kind: "ordering", items: [{ id: B, content: t("b"), position: 1 }] });
    fireEvent.click(screen.getByRole("button", { name: /^\s*Item$/ }));
    expect(onChange.mock.calls[1][0].items).toHaveLength(3);
  });

  it("table: adds/removes rows and columns", () => {
    const answer: QuestionAnswer = { kind: "table", rows: [[t("a"), t("b")], [t("c"), t("d")]] };
    const onChange = vi.fn();
    render(<AnswerEditor answer={answer} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /Linha/ }));
    expect(onChange).toHaveBeenLastCalledWith({ kind: "table", rows: [[t("a"), t("b")], [t("c"), t("d")], [[], []]] });
    fireEvent.click(screen.getByRole("button", { name: /Coluna/ }));
    expect(onChange).toHaveBeenLastCalledWith({ kind: "table", rows: [[t("a"), t("b"), []], [t("c"), t("d"), []]] });
    fireEvent.click(screen.getAllByTitle("Remover linha")[1]);
    expect(onChange).toHaveBeenLastCalledWith({ kind: "table", rows: [[t("a"), t("b")]] });
    fireEvent.click(screen.getAllByTitle("Remover coluna")[0]);
    expect(onChange).toHaveBeenLastCalledWith({ kind: "table", rows: [[t("b")], [t("d")]] });
  });
});

/**
 * Achado 0371: dentro do card, todo campo de item tinha o mesmo nome acessível
 * ("Célula" x12, "Alternativa", "Opção"...) e os controles não citavam o item.
 * Os nomes seguem os da folha (AnswerPreview): posição, e linha/coluna na tabela.
 */
describe("AnswerEditor — nomes acessíveis citam a posição do item (0371)", () => {
  const names = () =>
    Array.from(document.querySelectorAll("[aria-label]")).map((e) => e.getAttribute("aria-label"));

  it("multipleChoice: alternativa pela letra da folha, e o radio e a lixeira citam a letra", () => {
    const answer: QuestionAnswer = {
      kind: "multipleChoice",
      alternatives: [
        { id: "11111111-1111-4111-8111-111111111111", content: t("a"), correct: true },
        { id: "22222222-2222-4222-8222-222222222222", content: t("b"), correct: false },
      ],
    };
    render(<AnswerEditor answer={answer} onChange={vi.fn()} />);
    expect(names()).toEqual([
      "Marcar alternativa a como correta", "Alternativa a", "Remover alternativa a",
      "Marcar alternativa b como correta", "Alternativa b", "Remover alternativa b",
    ]);
  });

  it("trueFalse: afirmação numerada, toggle e lixeira citam o número", () => {
    const answer: QuestionAnswer = {
      kind: "trueFalse",
      items: [
        { id: "33333333-3333-4333-8333-333333333333", content: t("x"), value: true },
        { id: "44444444-4444-4444-8444-444444444444", content: t("y"), value: false },
      ],
    };
    render(<AnswerEditor answer={answer} onChange={vi.fn()} />);
    expect(names()).toEqual([
      "Afirmação 1", "Alternar Verdadeiro/Falso da afirmação 1", "Remover afirmação 1",
      "Afirmação 2", "Alternar Verdadeiro/Falso da afirmação 2", "Remover afirmação 2",
    ]);
  });

  it("checkbox: opção numerada, caixa e lixeira citam o número", () => {
    const answer: QuestionAnswer = {
      kind: "checkbox",
      items: [
        { id: "55555555-5555-4555-8555-555555555555", content: t("c"), checked: false },
        { id: "66666666-6666-4666-8666-666666666666", content: t("d"), checked: true },
      ],
    };
    render(<AnswerEditor answer={answer} onChange={vi.fn()} />);
    expect(names()).toEqual([
      "Marcar opção 1", "Opção 1", "Remover opção 1",
      "Marcar opção 2", "Opção 2", "Remover opção 2",
    ]);
  });

  it("matching: coluna e par, e a lixeira cita o par", () => {
    const answer: QuestionAnswer = {
      kind: "matching",
      pairs: [
        { id: "77777777-7777-4777-8777-777777777777", left: t("L"), right: t("R") },
        { id: "88888888-8888-4888-8888-888888888888", left: t("L2"), right: t("R2") },
      ],
    };
    render(<AnswerEditor answer={answer} onChange={vi.fn()} />);
    expect(names()).toEqual([
      "Coluna A, par 1", "Coluna B, par 1", "Remover par 1",
      "Coluna A, par 2", "Coluna B, par 2", "Remover par 2",
    ]);
  });

  it("ordering: item numerado, setas e lixeira citam o número", () => {
    const answer: QuestionAnswer = {
      kind: "ordering",
      items: [
        { id: "99999999-9999-4999-8999-999999999999", content: t("p") },
        { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", content: t("q") },
      ],
    };
    render(<AnswerEditor answer={answer} onChange={vi.fn()} />);
    expect(names()).toEqual([
      "Item 1", "Mover item 1 para cima", "Mover item 1 para baixo", "Remover item 1",
      "Item 2", "Mover item 2 para cima", "Mover item 2 para baixo", "Remover item 2",
    ]);
  });

  it("table: cabeçalho por coluna, célula por coluna e linha, lixeiras citam coluna/linha", () => {
    const answer: QuestionAnswer = {
      kind: "table",
      rows: [
        [t("Nome"), [{ type: "inlineMath", latex: "x" }] as RichText],
        [t("Ana"), t("1")],
        [t("Bia"), t("2")],
      ],
    };
    render(<AnswerEditor answer={answer} onChange={vi.fn()} />);
    expect(names()).toEqual([
      "Remover coluna 1", "Remover coluna 2",
      "Cabeçalho da coluna 1", "Cabeçalho da coluna 2", "Remover linha do cabeçalho",
      "Célula, Nome, linha 1", "Célula linha 1 coluna 2", "Remover linha 1",
      "Célula, Nome, linha 2", "Célula linha 2 coluna 2", "Remover linha 2",
    ]);
  });
});

/**
 * Achado 0372: o `rounded-sm` do projeto vale `calc(0.75rem - 4px)` = 8px, que
 * numa caixa de 16px vira círculo (igual ao rádio da múltipla escolha). E os
 * dois marcadores de gabarito tinham alvo abaixo de 24 x 24 px (WCAG 2.5.8).
 */
describe("AnswerEditor — marcadores de gabarito (0372)", () => {
  const A = "11111111-1111-4111-8111-111111111111";

  it("checkbox: caixa de canto quase reto, distinguível do rádio", () => {
    render(
      <AnswerEditor answer={{ kind: "checkbox", items: [{ id: A, content: t("a"), checked: false }] }} onChange={vi.fn()} />,
    );
    const box = screen.getByLabelText("Marcar opção 1");
    expect(box.className).toContain("rounded-[3px]");
    expect(box.className).not.toMatch(/(^|\s)rounded-sm(\s|$)/);
  });

  it("checkbox: alvo de 24 x 24 px que alterna a opção", () => {
    const onChange = vi.fn();
    render(
      <AnswerEditor answer={{ kind: "checkbox", items: [{ id: A, content: t("a"), checked: false }] }} onChange={onChange} />,
    );
    const target = screen.getByLabelText("Marcar opção 1").parentElement as HTMLElement;
    expect(target.tagName).toBe("LABEL");
    expect(target.className).toMatch(/(^|\s)h-6(\s|$)/);
    expect(target.className).toMatch(/(^|\s)w-6(\s|$)/);
    fireEvent.click(target);
    expect(onChange).toHaveBeenCalledWith({ kind: "checkbox", items: [{ id: A, content: t("a"), checked: true }] });
  });

  it("múltipla escolha: rádio com alvo de 24 x 24 px", () => {
    const onChange = vi.fn();
    render(
      <AnswerEditor
        answer={{ kind: "multipleChoice", alternatives: [{ id: A, content: t("a"), correct: false }] }}
        onChange={onChange}
      />,
    );
    const target = screen.getByLabelText("Marcar alternativa a como correta").parentElement as HTMLElement;
    expect(target.tagName).toBe("LABEL");
    expect(target.className).toMatch(/(^|\s)h-6(\s|$)/);
    expect(target.className).toMatch(/(^|\s)w-6(\s|$)/);
    fireEvent.click(target);
    expect(onChange).toHaveBeenCalled();
  });
});

/**
 * Achado 0375: a 1366px o rótulo "Lacuna 1" quebrava em duas linhas (`w-12` sem
 * `shrink-0` nem `whitespace-nowrap`) e o placeholder longo das respostas aceitas
 * saía cortado em "...(separadas por ví", sumindo justo a regra de formato.
 */
describe("AnswerEditor — layout da linha da lacuna (achado 0375)", () => {
  const answer: QuestionAnswer = {
    kind: "fillBlank",
    gaps: [{ id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", answer: "x" }],
  };

  it("o rótulo 'Lacuna N' não quebra nem encolhe", () => {
    render(<AnswerEditor answer={answer} onChange={vi.fn()} />);
    const label = screen.getByText("Lacuna 1");
    expect(label).toHaveClass("whitespace-nowrap");
    expect(label).toHaveClass("shrink-0");
    expect(label).not.toHaveClass("w-12");
  });

  it("a regra de formato cabe no placeholder curto e está no nome acessível", () => {
    render(<AnswerEditor answer={answer} onChange={vi.fn()} />);
    const outras = screen.getByLabelText(
      "Outras respostas aceitas na lacuna 1, separadas por vírgula"
    ) as HTMLInputElement;
    expect(outras.placeholder).toBe("Outras respostas, separadas por vírgula");
  });
});

/**
 * Achado 0267: linhas e lixeiras da tabela são chaveadas por índice. Removida
 * uma linha/coluna do meio, o botão focado passava a apagar a VIZINHA: um
 * segundo Enter (ou o segundo clique de um duplo clique) apagava outra com
 * dados. E "+ Linha"/"+ Coluna" deixavam o foco no próprio botão.
 */
describe("AnswerEditor — foco depois de mexer na tabela (0267)", () => {
  const start: QuestionAnswer = {
    kind: "table",
    rows: [
      [t("Nome"), t("Estado"), t("Fusão")],
      [t("Água"), t("Líquido"), t("0")],
      [t("Ferro"), t("Sólido"), t("1538")],
      [t("Oxigênio"), t("Gasoso"), t("-218")],
    ],
  };
  function Harness() {
    const [value, setValue] = useState<QuestionAnswer>(start);
    return <AnswerEditor answer={value} onChange={setValue} />;
  }

  it("remover linha leva o foco para o + Linha, não para a lixeira da vizinha", () => {
    render(<Harness />);
    const trash = screen.getByRole("button", { name: "Remover linha 2" });
    trash.focus();
    fireEvent.click(trash);
    expect(screen.getByRole("button", { name: /^\s*Linha$/ })).toHaveFocus();
    expect(screen.getByLabelText("Célula, Nome, linha 2")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Linha 2 removida");
  });

  it("remover coluna leva o foco para o + Coluna", () => {
    render(<Harness />);
    const trash = screen.getByRole("button", { name: "Remover coluna 2" });
    trash.focus();
    fireEvent.click(trash);
    expect(screen.getByRole("button", { name: /^\s*Coluna$/ })).toHaveFocus();
    expect(screen.getByRole("status")).toHaveTextContent("Coluna 2 removida");
  });

  it("o segundo clique de um duplo clique na lixeira não apaga a vizinha", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Remover linha 2" }), { detail: 1 });
    fireEvent.click(screen.getByRole("button", { name: "Remover linha 2" }), { detail: 2 });
    expect(screen.getByLabelText("Célula, Nome, linha 2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remover coluna 1" }), { detail: 1 });
    fireEvent.click(screen.getByRole("button", { name: "Remover coluna 1" }), { detail: 2 });
    expect(screen.getAllByRole("button", { name: /^Remover coluna/ })).toHaveLength(2);
  });

  it("+ Linha leva o foco à primeira célula da linha nova", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: /^\s*Linha$/ }));
    expect(screen.getByLabelText("Célula, Nome, linha 4")).toHaveFocus();
  });

  it("+ Coluna leva o foco ao cabeçalho da coluna nova", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: /^\s*Coluna$/ }));
    expect(screen.getByLabelText("Cabeçalho da coluna 4")).toHaveFocus();
  });

  it("anuncia a remoção da linha do cabeçalho", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Remover linha do cabeçalho" }));
    expect(screen.getByRole("status")).toHaveTextContent("Linha do cabeçalho removida");
  });

  it("lixeira sem efeito (última linha/coluna) não anuncia nem muda nada", () => {
    const onChange = vi.fn();
    render(<AnswerEditor answer={{ kind: "table", rows: [[t("a")]] }} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Remover linha do cabeçalho" }));
    fireEvent.click(screen.getByRole("button", { name: "Remover coluna 1" }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("");
  });

  it("não rouba o foco se a tabela mudar sem a célula criada, nem fora da tabela", () => {
    const { rerender } = render(<AnswerEditor answer={start} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /^\s*Linha$/ }));
    rerender(<AnswerEditor answer={{ ...start }} onChange={vi.fn()} />);
    expect(document.body).toHaveFocus();
    rerender(<AnswerEditor answer={{ kind: "open", answerLines: 1 }} onChange={vi.fn()} />);
    expect(document.body).toHaveFocus();
  });
});
