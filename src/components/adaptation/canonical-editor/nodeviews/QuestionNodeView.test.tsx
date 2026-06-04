import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { NodeViewProps } from "@tiptap/react";
import type { QuestionAnswer } from "@/lib/adaptation/canonical/schema";
import { QuestionNodeView } from "./QuestionNodeView";

vi.mock("@tiptap/react", () => ({
  NodeViewWrapper: ({ children, ...rest }: { children: React.ReactNode }) => <div {...rest}>{children}</div>,
  NodeViewContent: () => <div data-testid="node-view-content" />,
}));

function makeProps(answer: QuestionAnswer, attrs: Record<string, unknown> = {}, editable = true) {
  const updateAttributes = vi.fn();
  const props = {
    node: { attrs: { number: null, points: null, difficulty: null, answer, ...attrs } },
    updateAttributes,
    editor: { isEditable: editable },
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

  it("updates number / points via inputs", () => {
    const { props, updateAttributes } = makeProps(mc);
    render(<QuestionNodeView {...props} />);
    fireEvent.change(screen.getByLabelText("Número da questão"), { target: { value: "5" } });
    fireEvent.change(screen.getByLabelText("Pontos da questão"), { target: { value: "2" } });
    expect(updateAttributes).toHaveBeenCalledWith({ number: 5 });
    expect(updateAttributes).toHaveBeenCalledWith({ points: 2 });
  });

  it("toggles difficulty on and off", () => {
    const { props, updateAttributes } = makeProps(mc, { difficulty: "facil" });
    render(<QuestionNodeView {...props} />);
    // facil currently selected -> clicking it clears (null)
    fireEvent.click(screen.getByText("Fácil"));
    expect(updateAttributes).toHaveBeenCalledWith({ difficulty: null });
    // medio not selected -> selects it
    fireEvent.click(screen.getByText("Médio"));
    expect(updateAttributes).toHaveBeenCalledWith({ difficulty: "medio" });
  });

  it("writes back answer edits via updateAttributes({ answer })", () => {
    const { props, updateAttributes } = makeProps(mc);
    render(<QuestionNodeView {...props} />);
    fireEvent.change(screen.getByPlaceholderText("Alternativa"), { target: { value: "new" } });
    expect(updateAttributes).toHaveBeenCalledWith({
      answer: expect.objectContaining({ kind: "multipleChoice" }),
    });
  });

  it("renders disabled inputs when editor is not editable", () => {
    const { props } = makeProps(mc, {}, false);
    render(<QuestionNodeView {...props} />);
    expect(screen.getByLabelText("Número da questão")).toBeDisabled();
  });
});
