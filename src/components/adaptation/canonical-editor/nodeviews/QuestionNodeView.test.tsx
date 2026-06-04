import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { NodeViewProps } from "@tiptap/react";
import type { QuestionAnswer } from "@/lib/adaptation/canonical/schema";
import { QuestionNodeView } from "./QuestionNodeView";

vi.mock("@tiptap/react", () => ({
  NodeViewWrapper: ({ children, ...rest }: { children: React.ReactNode }) => <div {...rest}>{children}</div>,
  NodeViewContent: () => <div data-testid="node-view-content" />,
}));

/**
 * Build NodeViewProps with a fake editor doc that yields `priorQuestions`
 * question nodes positioned before this node (at pos 100), so the ordinal
 * label resolves to `priorQuestions + 1`.
 */
function makeProps(
  answer: QuestionAnswer,
  { editable = true, priorQuestions = 0 }: { editable?: boolean; priorQuestions?: number } = {}
) {
  const updateAttributes = vi.fn();
  const pos = 100;
  const doc = {
    descendants(fn: (node: { type: { name: string } }, pos: number) => void) {
      for (let i = 0; i < priorQuestions; i++) fn({ type: { name: "question" } }, i);
    },
  };
  const props = {
    node: { attrs: { answer } },
    updateAttributes,
    getPos: () => pos,
    editor: { isEditable: editable, state: { doc } },
  } as unknown as NodeViewProps;
  return { props, updateAttributes };
}

const mc: QuestionAnswer = {
  kind: "multipleChoice",
  alternatives: [{ id: "11111111-1111-4111-8111-111111111111", content: [{ type: "text", text: "a" }], correct: true }],
};

beforeEach(() => vi.clearAllMocks());

describe("QuestionNodeView", () => {
  it("renders the stem NodeViewContent and the answer editor", () => {
    const { props } = makeProps(mc);
    render(<QuestionNodeView {...props} />);
    expect(screen.getByTestId("node-view-content")).toBeInTheDocument();
    expect(screen.getByTestId("answer-multipleChoice")).toBeInTheDocument();
  });

  it("renders a read-only ordinal label from document order", () => {
    const { props } = makeProps(mc, { priorQuestions: 0 });
    render(<QuestionNodeView {...props} />);
    expect(screen.getByTestId("question-ordinal")).toHaveTextContent("Questão 1");
  });

  it("reflects later positions in the ordinal label", () => {
    const { props } = makeProps(mc, { priorQuestions: 2 });
    render(<QuestionNodeView {...props} />);
    expect(screen.getByTestId("question-ordinal")).toHaveTextContent("Questão 3");
  });

  it("writes back answer edits via updateAttributes({ answer })", () => {
    const { props, updateAttributes } = makeProps(mc);
    render(<QuestionNodeView {...props} />);
    fireEvent.change(screen.getByPlaceholderText("Alternativa"), { target: { value: "new" } });
    expect(updateAttributes).toHaveBeenCalledWith({
      answer: expect.objectContaining({ kind: "multipleChoice" }),
    });
  });

  it("passes disabled to the answer editor when not editable", () => {
    const { props } = makeProps(mc, { editable: false });
    render(<QuestionNodeView {...props} />);
    expect(screen.getByPlaceholderText("Alternativa")).toBeDisabled();
  });
});
