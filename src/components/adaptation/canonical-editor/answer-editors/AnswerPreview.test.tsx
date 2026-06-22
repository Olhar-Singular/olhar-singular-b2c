import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { RichText, QuestionAnswer } from "@/lib/adaptation/canonical/schema";
import { AnswerPreview } from "./AnswerPreview";

// Mock RichTextField as a plain textbox keyed by ariaLabel, so we can drive the
// inline content edits without the real ProseMirror editor.
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
    <input aria-label={ariaLabel} disabled={disabled} onChange={(e) => onChange([{ type: "text", text: e.target.value }])} />
  ),
}));

const t = (text: string): RichText => [{ type: "text", text }];

describe("AnswerPreview — multipleChoice", () => {
  const answer: QuestionAnswer = {
    kind: "multipleChoice",
    alternatives: [
      { id: "11111111-1111-4111-8111-111111111111", content: t("a"), correct: true },
      { id: "22222222-2222-4222-8222-222222222222", content: t("b"), correct: false },
    ],
  };

  it("renders one empty round bullet per alternative, editable text, NO answer key", () => {
    render(<AnswerPreview answer={answer} onChange={vi.fn()} />);
    const bullets = screen.getAllByTestId("preview-bullet");
    expect(bullets).toHaveLength(2);
    bullets.forEach((b) => expect(b).toHaveAttribute("data-shape", "round"));
    expect(screen.getAllByLabelText("Alternativa")).toHaveLength(2);
    // the correct alternative must be indistinguishable from the rest (D5)
    expect(screen.queryByLabelText("Marcar como correta")).not.toBeInTheDocument();
    expect(screen.queryByText("✔")).not.toBeInTheDocument();
  });

  it("writes alternative edits back via setAlternativeContent", () => {
    const onChange = vi.fn();
    render(<AnswerPreview answer={answer} onChange={onChange} />);
    fireEvent.change(screen.getAllByLabelText("Alternativa")[1], { target: { value: "z" } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "multipleChoice",
        alternatives: expect.arrayContaining([
          expect.objectContaining({ id: "22222222-2222-4222-8222-222222222222", content: [{ type: "text", text: "z" }] }),
        ]),
      }),
    );
  });

  it("lays alternatives out in a two-column grid", () => {
    render(<AnswerPreview answer={answer} onChange={vi.fn()} />);
    expect(screen.getByTestId("answer-preview-multipleChoice").className).toContain("sm:grid-cols-2");
  });
});

describe("AnswerPreview — checkbox", () => {
  const answer: QuestionAnswer = {
    kind: "checkbox",
    items: [{ id: "55555555-5555-4555-8555-555555555555", content: t("c"), checked: true }],
  };

  it("renders square bullets, editable options, NO checked indicator", () => {
    const onChange = vi.fn();
    render(<AnswerPreview answer={answer} onChange={onChange} />);
    expect(screen.getByTestId("preview-bullet")).toHaveAttribute("data-shape", "square");
    expect(screen.queryByLabelText("Marcar opção")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Opção"), { target: { value: "x" } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ kind: "checkbox" }));
  });
});

describe("AnswerPreview — trueFalse", () => {
  const answer: QuestionAnswer = {
    kind: "trueFalse",
    items: [{ id: "33333333-3333-4333-8333-333333333333", content: t("x"), value: true }],
  };

  it("shows the statement + blank V/F options with NO indication of the authored value", () => {
    const onChange = vi.fn();
    render(<AnswerPreview answer={answer} onChange={onChange} />);
    expect(screen.getByLabelText("Afirmação")).toBeInTheDocument();
    expect(screen.getByText("V")).toBeInTheDocument();
    expect(screen.getByText("F")).toBeInTheDocument();
    expect(screen.queryByTitle("Alternar Verdadeiro/Falso")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Afirmação"), { target: { value: "y" } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ kind: "trueFalse" }));
  });
});

describe("AnswerPreview — ordering", () => {
  const answer: QuestionAnswer = {
    kind: "ordering",
    items: [
      { id: "99999999-9999-4999-8999-999999999999", content: t("o1"), position: 0 },
      { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", content: t("o2"), position: 1 },
    ],
  };

  it("renders an empty order box per item with editable text and no reorder controls", () => {
    const onChange = vi.fn();
    render(<AnswerPreview answer={answer} onChange={onChange} />);
    expect(screen.getAllByTestId("preview-order-box")).toHaveLength(2);
    expect(screen.queryByTitle("Mover para cima")).not.toBeInTheDocument();
    fireEvent.change(screen.getAllByLabelText("Item")[0], { target: { value: "z" } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ kind: "ordering" }));
  });
});

describe("AnswerPreview — matching", () => {
  const answer: QuestionAnswer = {
    kind: "matching",
    pairs: [{ id: "77777777-7777-4777-8777-777777777777", left: t("l"), right: t("r") }],
  };

  it("renders editable columns joined by an arrow, no remove/add", () => {
    const onChange = vi.fn();
    render(<AnswerPreview answer={answer} onChange={onChange} />);
    expect(screen.getByLabelText("Coluna A")).toBeInTheDocument();
    expect(screen.getByLabelText("Coluna B")).toBeInTheDocument();
    expect(screen.getByText("↔")).toBeInTheDocument();
    expect(screen.queryByTitle("Remover par")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Coluna A"), { target: { value: "L" } });
    fireEvent.change(screen.getByLabelText("Coluna B"), { target: { value: "R" } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ kind: "matching" }));
  });
});

describe("AnswerPreview — table", () => {
  const answer: QuestionAnswer = { kind: "table", rows: [[t("a"), t("b")]] };

  it("renders editable cells in a grid", () => {
    const onChange = vi.fn();
    render(<AnswerPreview answer={answer} onChange={onChange} />);
    expect(screen.getAllByLabelText("Célula")).toHaveLength(2);
    fireEvent.change(screen.getAllByLabelText("Célula")[1], { target: { value: "z" } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ kind: "table" }));
  });
});

describe("AnswerPreview — open", () => {
  it("renders a ruled line per answer line and no editable text", () => {
    render(<AnswerPreview answer={{ kind: "open", answerLines: 4 }} onChange={vi.fn()} />);
    expect(screen.getAllByTestId("preview-answer-line")).toHaveLength(4);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("defaults to 3 ruled lines when answerLines is undefined", () => {
    render(<AnswerPreview answer={{ kind: "open" }} onChange={vi.fn()} />);
    expect(screen.getAllByTestId("preview-answer-line")).toHaveLength(3);
  });
});

describe("AnswerPreview — fillBlank", () => {
  it("renders nothing (the gaps live in the stem text)", () => {
    const { container } = render(
      <AnswerPreview
        answer={{ kind: "fillBlank", gaps: [{ id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", answer: "g" }] }}
        onChange={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe("AnswerPreview — disabled", () => {
  it("disables the content fields when disabled", () => {
    render(
      <AnswerPreview
        answer={{ kind: "multipleChoice", alternatives: [{ id: "11111111-1111-4111-8111-111111111111", content: t("a"), correct: true }] }}
        onChange={vi.fn()}
        disabled
      />,
    );
    expect(screen.getByLabelText("Alternativa")).toBeDisabled();
  });
});
