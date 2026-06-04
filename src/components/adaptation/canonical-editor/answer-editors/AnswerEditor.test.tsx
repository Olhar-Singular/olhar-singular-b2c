import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { QuestionAnswer } from "@/lib/adaptation/canonical/schema";
import { AnswerEditor } from "./AnswerEditor";

const t = (text: string) => [{ type: "text" as const, text }];

beforeEach(() => vi.clearAllMocks());

describe("AnswerEditor — multipleChoice", () => {
  const answer: QuestionAnswer = {
    kind: "multipleChoice",
    alternatives: [
      { id: "11111111-1111-4111-8111-111111111111", content: t("a"), correct: true },
      { id: "22222222-2222-4222-8222-222222222222", content: t("b"), correct: false },
    ],
  };

  it("sets correct via radio, edits text, removes and adds", () => {
    const onChange = vi.fn();
    render(<AnswerEditor answer={answer} onChange={onChange} />);
    fireEvent.click(screen.getAllByLabelText("Marcar como correta")[1]);
    fireEvent.change(screen.getAllByPlaceholderText("Alternativa")[0], { target: { value: "z" } });
    fireEvent.click(screen.getAllByTitle("Remover alternativa")[0]);
    fireEvent.click(screen.getByText("Alternativa"));
    expect(onChange).toHaveBeenCalledTimes(4);
  });
});

describe("AnswerEditor — trueFalse", () => {
  const answer: QuestionAnswer = {
    kind: "trueFalse",
    items: [{ id: "33333333-3333-4333-8333-333333333333", content: t("x"), value: false }],
  };

  it("edits text and toggles value", () => {
    const onChange = vi.fn();
    render(<AnswerEditor answer={answer} onChange={onChange} />);
    fireEvent.change(screen.getByPlaceholderText("Afirmação"), { target: { value: "y" } });
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

  it("toggles and edits text", () => {
    const onChange = vi.fn();
    render(<AnswerEditor answer={answer} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText("Marcar opção"));
    fireEvent.change(screen.getByPlaceholderText("Opção"), { target: { value: "z" } });
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
    fireEvent.change(screen.getAllByPlaceholderText("Coluna A")[0], { target: { value: "L" } });
    fireEvent.change(screen.getAllByPlaceholderText("Coluna B")[0], { target: { value: "R" } });
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

  it("edits text and reorders up/down", () => {
    const onChange = vi.fn();
    render(<AnswerEditor answer={answer} onChange={onChange} />);
    fireEvent.change(screen.getAllByPlaceholderText("Item")[0], { target: { value: "x" } });
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

  it("edits gap, removes and adds", () => {
    const onChange = vi.fn();
    render(<AnswerEditor answer={answer} onChange={onChange} />);
    fireEvent.change(screen.getAllByPlaceholderText("Resposta")[0], { target: { value: "n" } });
    fireEvent.click(screen.getAllByTitle("Remover lacuna")[0]);
    fireEvent.click(screen.getByText("Lacuna"));
    expect(onChange).toHaveBeenCalledTimes(3);
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
    fireEvent.change(screen.getAllByPlaceholderText("Célula")[0], { target: { value: "z" } });
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
