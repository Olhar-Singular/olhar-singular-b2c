import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { NodeViewProps } from "@tiptap/react";
import type { QuestionAnswer, RichText } from "@/lib/adaptation/canonical/schema";
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

vi.mock("@/lib/adaptation/canonical/ids", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/adaptation/canonical/ids")>();
  return { ...actual, newId: () => "new-id" };
});

// Stub RichTextField (used by preview + card fields) so we can drive inline
// edits without the real ProseMirror editor.
vi.mock("../RichTextField", () => ({
  RichTextField: ({
    onChange,
    ariaLabel,
    placeholder,
    disabled,
  }: {
    onChange: (rt: RichText) => void;
    ariaLabel?: string;
    placeholder?: string;
    disabled?: boolean;
  }) => (
    <input
      aria-label={ariaLabel}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value ? [{ type: "text", text: e.target.value }] : [])}
    />
  ),
}));

function makeProps(
  answer: QuestionAnswer,
  {
    editable = true,
    priorQuestions = 0,
    upable = true,
    downable = true,
    getPosUndefined = false,
    instruction = null,
    id = "q-1",
    editor: sharedEditor,
  }: {
    editable?: boolean;
    priorQuestions?: number;
    upable?: boolean;
    downable?: boolean;
    getPosUndefined?: boolean;
    instruction?: RichText | null;
    id?: string;
    editor?: NodeViewProps["editor"];
  } = {}
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
  const editor = sharedEditor ?? ({ isEditable: editable, state: { doc }, view: { dispatch } } as unknown as NodeViewProps["editor"]);
  const props = {
    node: { attrs: { answer, instruction, id } },
    updateAttributes,
    deleteNode,
    getPos: () => (getPosUndefined ? undefined : pos),
    editor,
  } as unknown as NodeViewProps;
  return { props, updateAttributes, deleteNode, dispatch, editor };
}

const mc: QuestionAnswer = {
  kind: "multipleChoice",
  alternatives: [{ id: "11111111-1111-4111-8111-111111111111", content: [{ type: "text", text: "a" }], correct: true }],
};

const rt = (text: string): RichText => [{ type: "text", text }];

// One seed per answer.kind — the 4 in the data doc (mc/open/fillBlank/matching)
// plus the 4 with no DB seed (trueFalse/checkbox/ordering/table), per Fase 2.
const SEEDS: QuestionAnswer[] = [
  { kind: "open", answerLines: 3 },
  mc,
  {
    kind: "trueFalse",
    items: [
      { id: "33333333-3333-4333-8333-333333333333", content: rt("Afirmação V"), value: true },
      { id: "34333333-3333-4333-8333-333333333333", content: rt("Afirmação F"), value: false },
    ],
  },
  {
    kind: "checkbox",
    items: [
      { id: "55555555-5555-4555-8555-555555555555", content: rt("Opção 1"), checked: true },
      { id: "56555555-5555-4555-8555-555555555555", content: rt("Opção 2"), checked: false },
    ],
  },
  {
    kind: "matching",
    pairs: [{ id: "77777777-7777-4777-8777-777777777777", left: rt("A"), right: rt("1") }],
  },
  {
    kind: "ordering",
    items: [
      { id: "99999999-9999-4999-8999-999999999999", content: rt("Primeiro"), position: 0 },
      { id: "9a999999-9999-4999-8999-999999999999", content: rt("Segundo"), position: 1 },
    ],
  },
  { kind: "fillBlank", gaps: [{ id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", answer: "resposta" }] },
  {
    kind: "table",
    rows: [
      [rt("Cabeçalho A"), rt("Cabeçalho B")],
      [rt("a"), rt("b")],
    ],
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  modalOnConfirm = undefined;
});

describe("QuestionNodeView — preview at rest", () => {
  it("renders the positional ordinal, the stem, and the print-faithful answer (no card)", () => {
    const { props } = makeProps(mc);
    render(<QuestionNodeView {...props} />);
    expect(screen.getByTestId("question-ordinal")).toHaveTextContent("1.");
    expect(screen.getByTestId("node-view-content")).toBeInTheDocument();
    expect(screen.getByTestId("answer-preview-multipleChoice")).toBeInTheDocument();
    expect(screen.queryByTestId("question-card")).not.toBeInTheDocument();
  });

  it("reflects later positions in the ordinal", () => {
    const { props } = makeProps(mc, { priorQuestions: 2 });
    render(<QuestionNodeView {...props} />);
    expect(screen.getByTestId("question-ordinal")).toHaveTextContent("3.");
  });

  it("hides the gabarito in the preview (no correct-answer control)", () => {
    const { props } = makeProps(mc);
    render(<QuestionNodeView {...props} />);
    expect(screen.queryByLabelText("Marcar como correta")).not.toBeInTheDocument();
    expect(screen.queryByTestId("answer-multipleChoice")).not.toBeInTheDocument();
  });

  it("does not render the question node with a card border at rest (flat)", () => {
    const { props } = makeProps(mc);
    const { getByTestId } = render(<QuestionNodeView {...props} />);
    expect(getByTestId("question-node").className).not.toMatch(/border|rounded-xl/);
  });

  it("writes inline alternative edits from the preview", () => {
    const { props, updateAttributes } = makeProps(mc);
    render(<QuestionNodeView {...props} />);
    fireEvent.change(screen.getByLabelText("Alternativa"), { target: { value: "new" } });
    expect(updateAttributes).toHaveBeenCalledWith({ answer: expect.objectContaining({ kind: "multipleChoice" }) });
  });

  it("shows an editable inline instruction when present, and writes edits back", () => {
    const { props, updateAttributes } = makeProps(mc, { instruction: [{ type: "text", text: "Marque." }] });
    render(<QuestionNodeView {...props} />);
    const field = screen.getByLabelText("Instrução da questão");
    expect(field).toBeInTheDocument();
    fireEvent.change(field, { target: { value: "Nova" } });
    expect(updateAttributes).toHaveBeenCalledWith({ instruction: [{ type: "text", text: "Nova" }] });
  });

  it("does not render an inline instruction when absent", () => {
    const { props } = makeProps(mc);
    render(<QuestionNodeView {...props} />);
    expect(screen.queryByLabelText("Instrução da questão")).not.toBeInTheDocument();
  });
});

describe("QuestionNodeView — rail actions", () => {
  it("renders the rail with pt-BR aria-labels (✎ editar first)", () => {
    const { props } = makeProps(mc);
    render(<QuestionNodeView {...props} />);
    expect(screen.getByLabelText("Editar questão")).toBeInTheDocument();
    expect(screen.getByLabelText("Mover questão para cima")).toBeInTheDocument();
    expect(screen.getByLabelText("Mover questão para baixo")).toBeInTheDocument();
    expect(screen.getByLabelText("Adicionar imagem à questão")).toBeInTheDocument();
    expect(screen.getByLabelText("Excluir questão")).toBeInTheDocument();
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

  it("disables up/down at the document ends", () => {
    const { props } = makeProps(mc, { upable: false, downable: false });
    render(<QuestionNodeView {...props} />);
    expect(screen.getByLabelText("Mover questão para cima")).toBeDisabled();
    expect(screen.getByLabelText("Mover questão para baixo")).toBeDisabled();
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

  it("deletes the question via deleteNode", () => {
    const { props, deleteNode } = makeProps(mc);
    render(<QuestionNodeView {...props} />);
    fireEvent.click(screen.getByLabelText("Excluir questão"));
    expect(deleteNode).toHaveBeenCalledTimes(1);
  });

  it("survives a transient undefined getPos() (empty ordinal, move/image guarded, delete works)", () => {
    const { props, dispatch } = makeProps(mc, { getPosUndefined: true });
    expect(() => render(<QuestionNodeView {...props} />)).not.toThrow();
    expect(screen.getByTestId("question-ordinal")).toHaveTextContent("");
    expect(screen.getByLabelText("Mover questão para cima")).toBeDisabled();
    expect(screen.getByLabelText("Mover questão para baixo")).toBeDisabled();
    expect(screen.getByLabelText("Adicionar imagem à questão")).toBeDisabled();
    fireEvent.click(screen.getByLabelText("Excluir questão"));
    expect(props.deleteNode).toHaveBeenCalledTimes(1);
    expect(dispatch).not.toHaveBeenCalled();
  });
});

describe("QuestionNodeView — preview ↔ card", () => {
  it("opens the card via ✎ Editar: AnswerEditor + gabarito + Concluir, preview gone", () => {
    const { props } = makeProps(mc);
    render(<QuestionNodeView {...props} />);
    fireEvent.click(screen.getByLabelText("Editar questão"));
    expect(screen.getByTestId("question-card")).toBeInTheDocument();
    expect(screen.getByTestId("answer-multipleChoice")).toBeInTheDocument();
    expect(screen.getByLabelText("Marcar como correta")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Concluir" })).toBeInTheDocument();
    expect(screen.queryByTestId("answer-preview-multipleChoice")).not.toBeInTheDocument();
  });

  it("returns to the preview via Concluir", () => {
    const { props } = makeProps(mc);
    render(<QuestionNodeView {...props} />);
    fireEvent.click(screen.getByLabelText("Editar questão"));
    fireEvent.click(screen.getByRole("button", { name: "Concluir" }));
    expect(screen.queryByTestId("question-card")).not.toBeInTheDocument();
    expect(screen.getByTestId("answer-preview-multipleChoice")).toBeInTheDocument();
  });

  it("closes the card on Escape", () => {
    const { props } = makeProps(mc);
    render(<QuestionNodeView {...props} />);
    fireEvent.click(screen.getByLabelText("Editar questão"));
    expect(screen.getByTestId("question-card")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByTestId("question-card")).not.toBeInTheDocument();
  });

  it("ignores non-Escape keys while the card is open", () => {
    const { props } = makeProps(mc);
    render(<QuestionNodeView {...props} />);
    fireEvent.click(screen.getByLabelText("Editar questão"));
    fireEvent.keyDown(document, { key: "a" });
    expect(screen.getByTestId("question-card")).toBeInTheDocument();
  });

  it("keeps only one card open at a time on the same editor", () => {
    const editor = { isEditable: true, state: { doc: { descendants() {} } }, view: { dispatch: vi.fn() } } as unknown as NodeViewProps["editor"];
    const { props: pa } = makeProps(mc, { id: "q-a", editor });
    const { props: pb } = makeProps(mc, { id: "q-b", editor });
    render(
      <>
        <QuestionNodeView {...pa} />
        <QuestionNodeView {...pb} />
      </>,
    );
    expect(screen.queryByTestId("question-card")).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByLabelText("Editar questão")[0]);
    expect(screen.getAllByTestId("question-card")).toHaveLength(1);
    // only the still-collapsed question keeps a rail with "Editar questão"
    fireEvent.click(screen.getByLabelText("Editar questão"));
    expect(screen.getAllByTestId("question-card")).toHaveLength(1);
  });
});

describe("QuestionNodeView — not editable", () => {
  it("disables the inline preview fields and the rail", () => {
    const { props } = makeProps(mc, { editable: false });
    render(<QuestionNodeView {...props} />);
    expect(screen.getByLabelText("Alternativa")).toBeDisabled();
    expect(screen.getByLabelText("Excluir questão")).toBeDisabled();
  });
});

describe("QuestionNodeView — all 8 answer kinds render in preview and card", () => {
  it.each(SEEDS.map((answer) => [answer.kind, answer] as const))("%s", (kind, answer) => {
    const { props } = makeProps(answer, { id: `q-${kind}` });
    render(<QuestionNodeView {...props} />);
    // preview: renders without crashing, stem present, no card yet
    expect(screen.getByTestId("question-node")).toBeInTheDocument();
    expect(screen.getByTestId("node-view-content")).toBeInTheDocument();
    expect(screen.queryByTestId("question-card")).not.toBeInTheDocument();
    // fillBlank has no preview answer block (its gaps live in the stem)
    if (kind !== "fillBlank") {
      expect(screen.getByTestId(`answer-preview-${kind}`)).toBeInTheDocument();
    }
    // card: opens with the structural AnswerEditor for this kind
    fireEvent.click(screen.getByLabelText("Editar questão"));
    expect(screen.getByTestId(`answer-${kind}`)).toBeInTheDocument();
  });
});
