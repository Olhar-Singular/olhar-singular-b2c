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
    originalDocSnapshots,
  }: {
    editable?: boolean;
    priorQuestions?: number;
    upable?: boolean;
    downable?: boolean;
    getPosUndefined?: boolean;
    instruction?: RichText | null;
    id?: string;
    editor?: NodeViewProps["editor"];
    originalDocSnapshots?: Map<string, unknown>;
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
    // forEach is used by findTopLevelPosById to get the live position. When
    // getPosUndefined is true we simulate "mid-deletion / not yet in doc" by
    // NOT including the question — ensuring pos falls back to null. Otherwise
    // report a non-matching sibling first (covers the false branch), then the
    // question at its mocked position.
    forEach(fn: (node: { attrs: Record<string, unknown> }, offset: number) => void) {
      fn({ attrs: { id: `${id}--sibling` } }, 0);
      if (!getPosUndefined) fn({ attrs: { id } }, pos);
    },
  };
  canMoveUp.mockReturnValue(upable);
  canMoveDown.mockReturnValue(downable);

  // Mock schema + transaction for Cancel/Reset restore operations
  const mockRestoredNode = { type: "question", mock: true };
  const mockTr = { replaceWith: vi.fn().mockReturnThis() };
  const schema = { nodeFromJSON: vi.fn().mockReturnValue(mockRestoredNode) };

  const editor = sharedEditor ?? ({
    isEditable: editable,
    state: { doc, schema, tr: mockTr },
    view: { dispatch },
    storage: {
      originalDoc: {
        snapshots: originalDocSnapshots ?? new Map<string, unknown>(),
      },
    },
  } as unknown as NodeViewProps["editor"]);

  const nodeJSON = { type: "question", attrs: { answer, instruction, enunciado: null, enunciadoPosition: "below", id }, content: [] };
  const props = {
    node: {
      attrs: { answer, instruction, enunciado: null, enunciadoPosition: "below", id },
      nodeSize: 10,
      content: { size: 8 },
      toJSON: vi.fn().mockReturnValue(nodeJSON),
    },
    updateAttributes,
    deleteNode,
    getPos: () => (getPosUndefined ? undefined : pos),
    editor,
  } as unknown as NodeViewProps;
  return { props, updateAttributes, deleteNode, dispatch, editor, schema, mockTr };
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
      { id: "34333333-3333-4333-8333-333333333334", content: rt("Afirmação F"), value: false },
    ],
  },
  {
    kind: "checkbox",
    items: [
      { id: "55555555-5555-4555-8555-555555555555", content: rt("Opção 1"), checked: true },
      { id: "56555555-5555-4555-8555-555555555556", content: rt("Opção 2"), checked: false },
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
      { id: "9a999999-9999-4999-8999-9a9999999999", content: rt("Segundo"), position: 1 },
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
  it("renders the rail with pt-BR aria-labels (✎ editar first, restaurar before excluir)", () => {
    const { props } = makeProps(mc);
    render(<QuestionNodeView {...props} />);
    expect(screen.getByLabelText("Editar questão")).toBeInTheDocument();
    expect(screen.getByLabelText("Mover questão para cima")).toBeInTheDocument();
    expect(screen.getByLabelText("Mover questão para baixo")).toBeInTheDocument();
    expect(screen.getByLabelText("Adicionar imagem à questão")).toBeInTheDocument();
    expect(screen.getByLabelText("Restaurar questão ao original")).toBeInTheDocument();
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

  it("uses live doc position (not stale getPos) for disabled checks — regression: move-down after move-up", () => {
    // Simulate: getPos() is stale (returns old pos 200) but the question actually
    // moved to pos 0 after a move-up transaction.
    const livePos = 0;
    const stalePos = 200;
    // canMoveDown returns true only for the live position (0), false for stale (200).
    canMoveDown.mockImplementation((_doc: unknown, p: number) => p === livePos);
    canMoveUp.mockImplementation((_doc: unknown, p: number) => p > 0);

    const id = "q-live";
    const customDoc = {
      descendants(_fn: unknown) {},
      forEach(fn: (node: { attrs: Record<string, unknown> }, offset: number) => void) {
        fn({ attrs: { id } }, livePos); // question is at the new live position
      },
    };
    const props = {
      node: {
        attrs: { answer: mc, instruction: null, id },
        nodeSize: 10,
        content: { size: 8 },
        toJSON: vi.fn(),
      },
      updateAttributes: vi.fn(),
      deleteNode: vi.fn(),
      getPos: vi.fn().mockReturnValue(stalePos), // stale — but should NOT be used
      editor: {
        isEditable: true,
        state: { doc: customDoc, schema: { nodeFromJSON: vi.fn() }, tr: { replaceWith: vi.fn().mockReturnThis() } },
        view: { dispatch: vi.fn() },
        storage: { originalDoc: { snapshots: new Map() } },
      },
    } as unknown as NodeViewProps;

    render(<QuestionNodeView {...props} />);

    // Down button must be ENABLED because we used livePos (0), not stalePos (200)
    expect(screen.getByLabelText("Mover questão para baixo")).not.toBeDisabled();
    expect(screen.getByLabelText("Mover questão para cima")).toBeDisabled();
    expect(canMoveDown).toHaveBeenCalledWith(customDoc, livePos);
  });

  it("falls back to getPos when the question is not found in doc.forEach", () => {
    // Edge case: findTopLevelPosById returns null (question mid-deletion or
    // not yet in doc) → falls back to rawPosNum from getPos().
    canMoveUp.mockReturnValue(true);
    canMoveDown.mockReturnValue(true);

    const id = "q-notfound";
    const emptyForEachDoc = {
      descendants(_fn: unknown) {},
      forEach(fn: (node: { attrs: Record<string, unknown> }, offset: number) => void) {
        fn({ attrs: { id: "other-block" } }, 0); // only a non-matching node
      },
    };
    const props = {
      node: {
        attrs: { answer: mc, instruction: null, id },
        nodeSize: 10,
        content: { size: 8 },
        toJSON: vi.fn(),
      },
      updateAttributes: vi.fn(),
      deleteNode: vi.fn(),
      getPos: vi.fn().mockReturnValue(100),
      editor: {
        isEditable: true,
        state: { doc: emptyForEachDoc, schema: { nodeFromJSON: vi.fn() }, tr: { replaceWith: vi.fn().mockReturnThis() } },
        view: { dispatch: vi.fn() },
        storage: { originalDoc: { snapshots: new Map() } },
      },
    } as unknown as NodeViewProps;

    render(<QuestionNodeView {...props} />);

    // Falls back to getPos() = 100 → canMoveDown called with 100
    expect(canMoveDown).toHaveBeenCalledWith(emptyForEachDoc, 100);
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

  it("restores the question to the original-doc snapshot via Restaurar", () => {
    const originalJSON = { type: "question", attrs: { id: "q-1" }, content: [] };
    const snapshots = new Map([["q-1", originalJSON]]);
    const { props, dispatch, schema } = makeProps(mc, { originalDocSnapshots: snapshots });
    render(<QuestionNodeView {...props} />);
    fireEvent.click(screen.getByLabelText("Restaurar questão ao original"));
    expect(schema.nodeFromJSON).toHaveBeenCalledWith(originalJSON);
    expect(dispatch).toHaveBeenCalled();
    expect(screen.queryByTestId("question-card")).not.toBeInTheDocument();
  });

  it("no-ops Restaurar when OriginalDocExtension is not mounted (no storage)", () => {
    const { props, dispatch } = makeProps(mc, { originalDocSnapshots: new Map() });
    render(<QuestionNodeView {...props} />);
    fireEvent.click(screen.getByLabelText("Restaurar questão ao original"));
    // No snapshot → nothing dispatched
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("Restaurar is disabled when not editable", () => {
    const { props } = makeProps(mc, { editable: false });
    render(<QuestionNodeView {...props} />);
    expect(screen.getByLabelText("Restaurar questão ao original")).toBeDisabled();
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

describe("QuestionNodeView — card open / commit / cancel", () => {
  it("opens the card via ✎ Editar (saves snapshot): shows AnswerEditor + Cancelar + Concluir", () => {
    const { props } = makeProps(mc);
    render(<QuestionNodeView {...props} />);
    fireEvent.click(screen.getByLabelText("Editar questão"));
    expect(screen.getByTestId("question-card")).toBeInTheDocument();
    expect(screen.getByTestId("answer-multipleChoice")).toBeInTheDocument();
    expect(screen.getByLabelText("Marcar como correta")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Concluir" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancelar edição" })).toBeInTheDocument();
    expect(screen.queryByTestId("answer-preview-multipleChoice")).not.toBeInTheDocument();
    // snapshot is taken from the node
    expect((props.node as unknown as { toJSON: ReturnType<typeof vi.fn> }).toJSON).toHaveBeenCalled();
  });

  it("Concluir writes the local answer + instruction + enunciado to the document via updateAttributes", () => {
    const { props, updateAttributes } = makeProps(mc);
    render(<QuestionNodeView {...props} />);
    fireEvent.click(screen.getByLabelText("Editar questão"));
    fireEvent.click(screen.getByRole("button", { name: "Concluir" }));
    expect(updateAttributes).toHaveBeenCalledWith({
      answer: expect.objectContaining({ kind: "multipleChoice" }),
      instruction: null,
      enunciado: null,
      enunciadoPosition: "below",
    });
    expect(screen.queryByTestId("question-card")).not.toBeInTheDocument();
  });

  it("Cancelar dispatches a restore transaction and closes the card without calling updateAttributes", () => {
    const { props, dispatch, updateAttributes } = makeProps(mc);
    render(<QuestionNodeView {...props} />);
    fireEvent.click(screen.getByLabelText("Editar questão"));
    fireEvent.click(screen.getByRole("button", { name: "Cancelar edição" }));
    // restore transaction was dispatched
    expect(dispatch).toHaveBeenCalled();
    // attrs were NOT committed
    expect(updateAttributes).not.toHaveBeenCalled();
    expect(screen.queryByTestId("question-card")).not.toBeInTheDocument();
  });

  it("returns to the preview via Concluir", () => {
    const { props } = makeProps(mc);
    render(<QuestionNodeView {...props} />);
    fireEvent.click(screen.getByLabelText("Editar questão"));
    fireEvent.click(screen.getByRole("button", { name: "Concluir" }));
    expect(screen.queryByTestId("question-card")).not.toBeInTheDocument();
    expect(screen.getByTestId("answer-preview-multipleChoice")).toBeInTheDocument();
  });

  it("closes the card on Escape via handleCancel (dispatches restore)", () => {
    const { props, dispatch } = makeProps(mc);
    render(<QuestionNodeView {...props} />);
    fireEvent.click(screen.getByLabelText("Editar questão"));
    expect(screen.getByTestId("question-card")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByTestId("question-card")).not.toBeInTheDocument();
    expect(dispatch).toHaveBeenCalled(); // restore transaction
  });

  it("ignores non-Escape keys while the card is open", () => {
    const { props } = makeProps(mc);
    render(<QuestionNodeView {...props} />);
    fireEvent.click(screen.getByLabelText("Editar questão"));
    fireEvent.keyDown(document, { key: "a" });
    expect(screen.getByTestId("question-card")).toBeInTheDocument();
  });

  it("keeps only one card open at a time on the same editor", () => {
    const editor = {
      isEditable: true,
      state: {
        doc: {
          descendants() {},
          forEach(fn: (node: { attrs: Record<string, unknown> }, offset: number) => void) {
            fn({ attrs: { id: "q-a" } }, 0);
            fn({ attrs: { id: "q-b" } }, 100);
          },
        },
        schema: { nodeFromJSON: vi.fn().mockReturnValue({}) },
        tr: { replaceWith: vi.fn().mockReturnThis() },
      },
      view: { dispatch: vi.fn() },
      storage: { originalDoc: { snapshots: new Map() } },
    } as unknown as NodeViewProps["editor"];
    const nodeJSON = { type: "question", attrs: { id: "q-a" }, content: [] };
    const { props: pa } = makeProps(mc, { id: "q-a", editor });
    const { props: pb } = makeProps(mc, { id: "q-b", editor });
    // Override toJSON for both nodes
    (pa.node as unknown as { toJSON: () => unknown }).toJSON = vi.fn().mockReturnValue(nodeJSON);
    (pb.node as unknown as { toJSON: () => unknown }).toJSON = vi.fn().mockReturnValue(nodeJSON);
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

describe("QuestionNodeView — data-question-expanded attribute", () => {
  it("has data-question-expanded=false at rest (preview mode)", () => {
    const { props } = makeProps(mc);
    render(<QuestionNodeView {...props} />);
    expect(screen.getByTestId("question-node")).toHaveAttribute("data-question-expanded", "false");
  });

  it("has data-question-expanded=true when card is open", () => {
    const { props } = makeProps(mc);
    render(<QuestionNodeView {...props} />);
    fireEvent.click(screen.getByLabelText("Editar questão"));
    expect(screen.getByTestId("question-node")).toHaveAttribute("data-question-expanded", "true");
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
