import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { RichText, QuestionAnswer } from "@/lib/adaptation/canonical/schema";
import { AnswerEditor } from "./AnswerEditor";
import { EditorModeProvider } from "../EditorMode";

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
    fireEvent.click(screen.getAllByLabelText("Marcar como correta")[1]);
    fireEvent.change(screen.getAllByLabelText("Alternativa")[0], { target: { value: "z" } });
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
    const row = screen.getAllByLabelText("Alternativa")[0].closest("div") as HTMLElement;
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
    fireEvent.change(screen.getByLabelText("Afirmação"), { target: { value: "y" } });
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
});

describe("AnswerEditor — checkbox", () => {
  const answer: QuestionAnswer = {
    kind: "checkbox",
    items: [{ id: "55555555-5555-4555-8555-555555555555", content: t("c"), checked: false }],
  };

  it("toggles and edits content", () => {
    const onChange = vi.fn();
    render(<AnswerEditor answer={answer} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText("Marcar opção"));
    fireEvent.change(screen.getByLabelText("Opção"), { target: { value: "z" } });
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
    fireEvent.change(screen.getAllByLabelText("Coluna A")[0], { target: { value: "L" } });
    fireEvent.change(screen.getAllByLabelText("Coluna B")[0], { target: { value: "R" } });
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
    fireEvent.change(screen.getAllByLabelText("Item")[0], { target: { value: "x" } });
    fireEvent.click(screen.getAllByTitle("Mover para baixo")[0]);
    fireEvent.click(screen.getAllByTitle("Mover para cima")[1]);
    expect(onChange).toHaveBeenCalledTimes(3);
  });
});

describe("AnswerEditor — fillBlank", () => {
  const answer: QuestionAnswer = {
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
});

describe("AnswerEditor — table", () => {
  const answer: QuestionAnswer = {
    kind: "table",
    rows: [[t("a"), t("b")]],
  };

  it("edits a cell", () => {
    const onChange = vi.fn();
    render(<AnswerEditor answer={answer} onChange={onChange} />);
    fireEvent.change(screen.getAllByLabelText("Célula")[0], { target: { value: "z" } });
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
 * In the Estilo (style) step the user FORMATS content; structural add/remove and
 * answer-key controls are hidden. Content fields stay visible so their text can
 * be selected/formatted. Mirrors QuestionNodeView's style-mode gating.
 */
function renderStyle(ui: Parameters<typeof render>[0]) {
  return render(<EditorModeProvider value="style">{ui}</EditorModeProvider>);
}

describe("AnswerEditor — style mode hides structural / answer-key controls", () => {
  it("multipleChoice: hides correct radio, remove, and add; keeps the content field", () => {
    const answer: QuestionAnswer = {
      kind: "multipleChoice",
      alternatives: [{ id: "11111111-1111-4111-8111-111111111111", content: t("a"), correct: true }],
    };
    renderStyle(<AnswerEditor answer={answer} onChange={vi.fn()} />);
    expect(screen.queryByLabelText("Marcar como correta")).not.toBeInTheDocument();
    expect(screen.queryByTitle("Remover alternativa")).not.toBeInTheDocument();
    expect(screen.queryByText("Alternativa")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Alternativa")).toBeInTheDocument();
  });

  it("trueFalse: hides the V/F answer toggle; keeps the affirmation field", () => {
    const answer: QuestionAnswer = {
      kind: "trueFalse",
      items: [{ id: "33333333-3333-4333-8333-333333333333", content: t("x"), value: false }],
    };
    renderStyle(<AnswerEditor answer={answer} onChange={vi.fn()} />);
    expect(screen.queryByTitle("Alternar Verdadeiro/Falso")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Afirmação")).toBeInTheDocument();
  });

  it("checkbox: hides the mark-correct checkbox; keeps the option field", () => {
    const answer: QuestionAnswer = {
      kind: "checkbox",
      items: [{ id: "55555555-5555-4555-8555-555555555555", content: t("c"), checked: false }],
    };
    renderStyle(<AnswerEditor answer={answer} onChange={vi.fn()} />);
    expect(screen.queryByLabelText("Marcar opção")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Opção")).toBeInTheDocument();
  });

  it("matching: hides remove + add; keeps both side fields", () => {
    const answer: QuestionAnswer = {
      kind: "matching",
      pairs: [{ id: "77777777-7777-4777-8777-777777777777", left: t("l"), right: t("r") }],
    };
    renderStyle(<AnswerEditor answer={answer} onChange={vi.fn()} />);
    expect(screen.queryByTitle("Remover par")).not.toBeInTheDocument();
    expect(screen.queryByText("Par")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Coluna A")).toBeInTheDocument();
    expect(screen.getByLabelText("Coluna B")).toBeInTheDocument();
  });

  it("ordering: hides reorder up/down; keeps the item field", () => {
    const answer: QuestionAnswer = {
      kind: "ordering",
      items: [
        { id: "99999999-9999-4999-8999-999999999999", content: t("o1"), position: 0 },
        { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", content: t("o2"), position: 1 },
      ],
    };
    renderStyle(<AnswerEditor answer={answer} onChange={vi.fn()} />);
    expect(screen.queryByTitle("Mover para cima")).not.toBeInTheDocument();
    expect(screen.queryByTitle("Mover para baixo")).not.toBeInTheDocument();
    expect(screen.getAllByLabelText("Item")).toHaveLength(2);
  });

  it("fillBlank: hides remove + add; keeps the gap answer visible but read-only", () => {
    const answer: QuestionAnswer = {
      kind: "fillBlank",
      gaps: [{ id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", answer: "g1" }],
    };
    renderStyle(<AnswerEditor answer={answer} onChange={vi.fn()} />);
    expect(screen.queryByTitle("Remover lacuna")).not.toBeInTheDocument();
    expect(screen.queryByText("Lacuna")).not.toBeInTheDocument();
    // The gap answer is an answer key (plain text, not formattable): visible but disabled.
    expect(screen.getByPlaceholderText("Resposta")).toBeDisabled();
  });

  it("open: hides the answer-lines config (answer key, not formattable text)", () => {
    const answer: QuestionAnswer = { kind: "open", answerLines: 3 };
    renderStyle(<AnswerEditor answer={answer} onChange={vi.fn()} />);
    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
  });

  it("table: keeps cell fields editable (cells are formattable content)", () => {
    const answer: QuestionAnswer = { kind: "table", rows: [[t("a"), t("b")]] };
    renderStyle(<AnswerEditor answer={answer} onChange={vi.fn()} />);
    expect(screen.getAllByLabelText("Célula")).toHaveLength(2);
  });
});
