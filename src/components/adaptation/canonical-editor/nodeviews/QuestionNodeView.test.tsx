import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { NodeViewProps } from "@tiptap/react";
import type { QuestionAnswer } from "@/lib/adaptation/canonical/schema";
import type { ImageItem } from "@/components/editor/imageManagerUtils";
import { QuestionNodeView } from "./QuestionNodeView";

vi.mock("@tiptap/react", () => ({
  NodeViewWrapper: ({ children, ...rest }: { children: React.ReactNode }) => <div {...rest}>{children}</div>,
  NodeViewContent: () => <div data-testid="node-view-content" />,
}));

let modalOnConfirm: ((images: ImageItem[]) => void) | undefined;
vi.mock("@/components/editor/ImageManagerModal", () => ({
  default: ({ open, onConfirm, onClose }: { open: boolean; onConfirm: (images: ImageItem[]) => void; onClose: () => void }) => {
    modalOnConfirm = onConfirm;
    return open ? <button data-testid="image-modal" onClick={onClose}>modal</button> : null;
  },
}));

const buildMoveTransaction = vi.fn();
const buildStemImageTransaction = vi.fn();
vi.mock("./blockTransactions", () => ({
  buildMoveTransaction: (...args: unknown[]) => buildMoveTransaction(...args),
  buildStemImageTransaction: (...args: unknown[]) => buildStemImageTransaction(...args),
}));

const canMoveUp = vi.fn();
const canMoveDown = vi.fn();
vi.mock("./blockMove", () => ({
  canMoveUp: (...args: unknown[]) => canMoveUp(...args),
  canMoveDown: (...args: unknown[]) => canMoveDown(...args),
}));

vi.mock("@/lib/adaptation/canonical/ids", () => ({ newId: () => "new-id" }));

/**
 * Build NodeViewProps with a fake editor doc that yields `priorQuestions`
 * question nodes positioned before this node (at pos 100), so the ordinal
 * label resolves to `priorQuestions + 1`.
 */
function makeProps(
  answer: QuestionAnswer,
  {
    editable = true,
    priorQuestions = 0,
    upable = true,
    downable = true,
  }: { editable?: boolean; priorQuestions?: number; upable?: boolean; downable?: boolean } = {}
) {
  const updateAttributes = vi.fn();
  const deleteNode = vi.fn();
  const dispatch = vi.fn();
  const pos = 100;
  const doc = {
    descendants(fn: (node: { type: { name: string } }, pos: number) => void) {
      for (let i = 0; i < priorQuestions; i++) fn({ type: { name: "question" } }, i);
    },
  };
  canMoveUp.mockReturnValue(upable);
  canMoveDown.mockReturnValue(downable);
  const props = {
    node: { attrs: { answer } },
    updateAttributes,
    deleteNode,
    getPos: () => pos,
    editor: { isEditable: editable, state: { doc }, view: { dispatch } },
  } as unknown as NodeViewProps;
  return { props, updateAttributes, deleteNode, dispatch };
}

const mc: QuestionAnswer = {
  kind: "multipleChoice",
  alternatives: [{ id: "11111111-1111-4111-8111-111111111111", content: [{ type: "text", text: "a" }], correct: true }],
};

beforeEach(() => {
  vi.clearAllMocks();
  modalOnConfirm = undefined;
});

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

  it("renders the action buttons with pt-BR aria-labels", () => {
    const { props } = makeProps(mc);
    render(<QuestionNodeView {...props} />);
    expect(screen.getByLabelText("Mover questão para cima")).toBeInTheDocument();
    expect(screen.getByLabelText("Mover questão para baixo")).toBeInTheDocument();
    expect(screen.getByLabelText("Adicionar imagem à questão")).toBeInTheDocument();
    expect(screen.getByLabelText("Excluir questão")).toBeInTheDocument();
  });

  it("deletes the question via deleteNode", () => {
    const { props, deleteNode } = makeProps(mc);
    render(<QuestionNodeView {...props} />);
    fireEvent.click(screen.getByLabelText("Excluir questão"));
    expect(deleteNode).toHaveBeenCalledTimes(1);
  });

  it("disables up/down at the document ends", () => {
    const { props } = makeProps(mc, { upable: false, downable: false });
    render(<QuestionNodeView {...props} />);
    expect(screen.getByLabelText("Mover questão para cima")).toBeDisabled();
    expect(screen.getByLabelText("Mover questão para baixo")).toBeDisabled();
  });

  it("dispatches the move transaction when moving up", () => {
    const tr = { isMove: true };
    buildMoveTransaction.mockReturnValue(tr);
    const { props, dispatch } = makeProps(mc);
    render(<QuestionNodeView {...props} />);
    fireEvent.click(screen.getByLabelText("Mover questão para cima"));
    expect(buildMoveTransaction).toHaveBeenCalledWith(props.editor.state, 100, "up");
    expect(dispatch).toHaveBeenCalledWith(tr);
  });

  it("dispatches the move transaction when moving down", () => {
    const tr = { isMove: true };
    buildMoveTransaction.mockReturnValue(tr);
    const { props, dispatch } = makeProps(mc);
    render(<QuestionNodeView {...props} />);
    fireEvent.click(screen.getByLabelText("Mover questão para baixo"));
    expect(buildMoveTransaction).toHaveBeenCalledWith(props.editor.state, 100, "down");
    expect(dispatch).toHaveBeenCalledWith(tr);
  });

  it("does not dispatch when the move transaction is null", () => {
    buildMoveTransaction.mockReturnValue(null);
    const { props, dispatch } = makeProps(mc);
    render(<QuestionNodeView {...props} />);
    fireEvent.click(screen.getByLabelText("Mover questão para cima"));
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("opens the image modal and inserts the picked image into the stem", () => {
    const tr = { isImage: true };
    buildStemImageTransaction.mockReturnValue(tr);
    const { props, dispatch } = makeProps(mc);
    render(<QuestionNodeView {...props} />);

    expect(screen.queryByTestId("image-modal")).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Adicionar imagem à questão"));
    expect(screen.getByTestId("image-modal")).toBeInTheDocument();

    modalOnConfirm?.([{ id: "x", src: "https://example.com/a.png", align: "center" }]);
    expect(buildStemImageTransaction).toHaveBeenCalledWith(props.editor.state, 100, {
      id: "new-id",
      src: "https://example.com/a.png",
      alt: "",
    });
    expect(dispatch).toHaveBeenCalledWith(tr);
  });

  it("ignores image confirm with no images", () => {
    const { props, dispatch } = makeProps(mc);
    render(<QuestionNodeView {...props} />);
    fireEvent.click(screen.getByLabelText("Adicionar imagem à questão"));
    modalOnConfirm?.([]);
    expect(buildStemImageTransaction).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("closes the image modal via onClose", () => {
    const { props } = makeProps(mc);
    render(<QuestionNodeView {...props} />);
    fireEvent.click(screen.getByLabelText("Adicionar imagem à questão"));
    fireEvent.click(screen.getByTestId("image-modal"));
    expect(screen.queryByTestId("image-modal")).not.toBeInTheDocument();
  });
});
