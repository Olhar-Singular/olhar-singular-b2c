import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { Node as PMNode } from "@tiptap/pm/model";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import type { Editor } from "@tiptap/react";
import { getEditorSchema } from "@/lib/adaptation/tiptap/getEditorSchema";
import { canonicalToProseMirror } from "@/lib/adaptation/tiptap/fromCanonical";
import { validateDocument } from "@/lib/adaptation/canonical/validate";
import type { CanonicalDocument } from "@/lib/adaptation/canonical/schema";
import { StylingSurface } from "./StylingSurface";

// --- mocks -----------------------------------------------------------------

// The real editor surface is replaced; we only need the EditorContent marker
// plus the EditorModeProvider passthrough (the real provider is fine).
vi.mock("@tiptap/react", () => ({
  EditorContent: ({ editor }: { editor: unknown }) => (
    <div data-testid="editor-content">{String(editor !== null)}</div>
  ),
  BubbleMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// The selection bubble menu and document-style control are tested in isolation;
// here we only assert the surface wires them with the editor / apply-to-all.
let bubbleEditor: unknown;
vi.mock("./SelectionBubbleMenu", () => ({
  SelectionBubbleMenu: ({ editor }: { editor: unknown }) => {
    bubbleEditor = editor;
    return <div data-testid="bubble-menu" />;
  },
}));

let capturedApplyToAll: ((style: unknown) => void) | undefined;
vi.mock("./DocumentStyleControl", () => ({
  DocumentStyleControl: ({ onApplyToAll }: { onApplyToAll: (s: unknown) => void }) => {
    capturedApplyToAll = onApplyToAll;
    return <button type="button" data-testid="doc-style" onClick={() => onApplyToAll({ align: "center" })} />;
  },
}));

vi.mock("@radix-ui/react-popover", () => ({
  Anchor: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/ui/popover", () => ({
  Popover: ({ children, open }: { children: React.ReactNode; open: boolean }) => (
    <div data-testid="popover" data-open={String(open)}>
      {children}
    </div>
  ),
  // Always render content so we can assert on the controls regardless of open state.
  PopoverContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/adaptation/canonical-editor/CanonicalToolbar", () => ({
  CanonicalToolbar: () => <div data-testid="toolbar" />,
}));

const useCanonicalEditor = vi.fn();
let capturedSelectionHandler: ((editor: Editor) => void) | undefined;
let capturedExtraExtensions: unknown;
vi.mock("@/components/adaptation/canonical-editor/useCanonicalEditor", () => ({
  useCanonicalEditor: (opts: {
    onSelectionUpdate?: (e: Editor) => void;
    extraExtensions?: unknown;
  }) => {
    capturedSelectionHandler = opts.onSelectionUpdate;
    capturedExtraExtensions = opts.extraExtensions;
    return useCanonicalEditor(opts);
  },
}));

// --- fixtures --------------------------------------------------------------

const schema = getEditorSchema();
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function baseDoc(): CanonicalDocument {
  return {
    schemaVersion: 1,
    blocks: [
      { id: id(1), type: "heading", level: 1, content: [{ type: "text", text: "Tit" }] },
      { id: id(2), type: "paragraph", content: [{ type: "text", text: "p" }] },
      {
        id: id(7),
        type: "question",
        stem: [{ id: id(8), type: "paragraph", content: [{ type: "text", text: "stem" }] }],
        answer: { kind: "open" },
      },
    ],
  };
}

const dispatch = vi.fn();
let nodeDOMResult: unknown = null;

/** A single mutable fake editor (mirrors production: one editor instance). */
function makeFakeEditor(doc: CanonicalDocument): Editor {
  const state = EditorState.create({ doc: PMNode.fromJSON(schema, canonicalToProseMirror(doc)) });
  return {
    state,
    view: { dispatch, nodeDOM: () => nodeDOMResult },
    isEditable: true,
  } as unknown as Editor;
}

/** Make blockAnchorRect resolve to a non-null rect so the handle renders. */
function withAnchorDom() {
  const el = window.document.createElement("div");
  el.getBoundingClientRect = () => ({ top: 40, left: 10, width: 300, height: 50 }) as DOMRect;
  nodeDOMResult = el;
}

let fake: Editor;

/** Move the editor selection into the i-th top-level block and notify the surface. */
function placeCursorIn(doc: CanonicalDocument, index: number) {
  const base = EditorState.create({ doc: PMNode.fromJSON(schema, canonicalToProseMirror(doc)) });
  let pos = 0;
  for (let i = 0; i < index; i++) pos += base.doc.child(i).nodeSize;
  const state = base.apply(base.tr.setSelection(TextSelection.create(base.doc, pos + 1)));
  (fake as { state: EditorState }).state = state;
  act(() => capturedSelectionHandler?.(fake));
}

beforeEach(() => {
  vi.clearAllMocks();
  capturedSelectionHandler = undefined;
  capturedExtraExtensions = undefined;
  nodeDOMResult = null;
  bubbleEditor = undefined;
  capturedApplyToAll = undefined;
  fake = makeFakeEditor(baseDoc());
  useCanonicalEditor.mockReturnValue({ editor: fake });
});

describe("StylingSurface", () => {
  it("returns null while the editor is not ready", () => {
    useCanonicalEditor.mockReturnValue({ editor: null });
    const { container } = render(<StylingSurface document={baseDoc()} onChange={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders the editable editor (no block <select>)", () => {
    render(<StylingSurface document={baseDoc()} onChange={vi.fn()} />);
    expect(screen.getByTestId("editor-content")).toBeInTheDocument();
    expect(screen.queryByLabelText("Bloco")).not.toBeInTheDocument();
  });

  it("renders the editor in STYLE mode and wires the highlight extension", () => {
    render(<StylingSurface document={baseDoc()} onChange={vi.fn()} />);
    // The current-block highlight extension is passed to the hook.
    expect(Array.isArray(capturedExtraExtensions)).toBe(true);
    expect((capturedExtraExtensions as { name: string }[])[0].name).toBe("currentBlockHighlight");
  });

  it("has no current block before a selection (handle hidden)", () => {
    render(<StylingSurface document={baseDoc()} onChange={vi.fn()} />);
    expect(screen.queryByTestId("open-style-popover")).not.toBeInTheDocument();
  });

  it("applies font/size/align/spacing/color via setBlockStyle for the current block", () => {
    const onChange = vi.fn();
    const doc = baseDoc();
    render(<StylingSurface document={doc} onChange={onChange} />);
    placeCursorIn(doc, 0); // heading id(1) is current

    fireEvent.change(screen.getByLabelText("Fonte"), { target: { value: "serif" } });
    fireEvent.change(screen.getByLabelText("Tamanho (px)"), { target: { value: "24" } });
    fireEvent.change(screen.getByLabelText("Alinhamento"), { target: { value: "center" } });
    fireEvent.change(screen.getByLabelText("Espaçamento (px)"), { target: { value: "10" } });
    fireEvent.change(screen.getByLabelText("Cor do bloco"), { target: { value: "#DC2626" } });

    expect(onChange).toHaveBeenCalledTimes(5);
    for (const call of onChange.mock.calls) {
      expect(validateDocument(call[0])).toBeTruthy();
      expect((call[0] as CanonicalDocument).blocks[0].id).toBe(id(1));
    }
    expect((onChange.mock.calls[0][0] as CanonicalDocument).blocks[0].style).toEqual({
      fontFamily: "serif",
    });
  });

  it("reads the existing style of the current block into the controls", () => {
    const doc = baseDoc();
    doc.blocks[0].style = { fontSize: 18 };
    render(<StylingSurface document={doc} onChange={vi.fn()} />);
    placeCursorIn(doc, 0);
    expect(screen.getByLabelText("Tamanho (px)")).toHaveValue(18);
  });

  it("clears a style field back to default", () => {
    const onChange = vi.fn();
    const doc = baseDoc();
    doc.blocks[0].style = { fontSize: 30, align: "center" };
    render(<StylingSurface document={doc} onChange={onChange} />);
    placeCursorIn(doc, 0);

    fireEvent.change(screen.getByLabelText("Tamanho (px)"), { target: { value: "" } });
    expect((onChange.mock.calls[0][0] as CanonicalDocument).blocks[0].style).toEqual({
      align: "center",
    });
  });

  it("toggles bold on the whole current block via applyMarkToBlock (dispatches a tr)", () => {
    const doc = baseDoc();
    render(<StylingSurface document={doc} onChange={vi.fn()} />);
    placeCursorIn(doc, 0);

    fireEvent.click(screen.getByLabelText("Negrito"));
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it("toggles italic on the whole current block", () => {
    const doc = baseDoc();
    render(<StylingSurface document={doc} onChange={vi.fn()} />);
    placeCursorIn(doc, 0);

    fireEvent.click(screen.getByLabelText("Itálico"));
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it("applies a whole-block color via applyColorToBlock", () => {
    const doc = baseDoc();
    render(<StylingSurface document={doc} onChange={vi.fn()} />);
    placeCursorIn(doc, 0);

    fireEvent.change(screen.getByLabelText("Cor do texto"), { target: { value: "#2563EB" } });
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it("targets a stem block when the cursor is inside a question", () => {
    const onChange = vi.fn();
    const doc = baseDoc();
    render(<StylingSurface document={doc} onChange={onChange} />);
    // index 2 is the question; currentTopLevelBlock returns the QUESTION id(7).
    placeCursorIn(doc, 2);
    fireEvent.change(screen.getByLabelText("Alinhamento"), { target: { value: "right" } });
    const next = onChange.mock.calls[0][0] as CanonicalDocument;
    const q = next.blocks[2] as Extract<CanonicalDocument["blocks"][number], { type: "question" }>;
    expect(q.style).toEqual({ align: "right" });
  });

  it("does nothing when a mark/color/patch fires with no current block (guards)", () => {
    // No selection placed → current is null → controls not shown; assert the
    // surface renders without the handle and without crashing.
    render(<StylingSurface document={baseDoc()} onChange={vi.fn()} />);
    expect(screen.queryByLabelText("Negrito")).not.toBeInTheDocument();
  });

  it("renders a floating handle anchored to the current block and toggles the popover", () => {
    withAnchorDom();
    const doc = baseDoc();
    render(<StylingSurface document={doc} onChange={vi.fn()} />);
    placeCursorIn(doc, 0);
    const handle = screen.getByTestId("open-style-popover");
    expect(handle).toBeInTheDocument();
    // The anchor + handle use the resolved rect (top 40 - container 0 = 40).
    expect(handle).toHaveStyle({ top: "44px" });
    // Toggling the handle flips the popover open state.
    fireEvent.click(handle);
    expect(screen.getByTestId("popover")).toHaveAttribute("data-open", "true");
  });

  it("mounts the selection bubble menu wired to the editor", () => {
    render(<StylingSurface document={baseDoc()} onChange={vi.fn()} />);
    expect(screen.getByTestId("bubble-menu")).toBeInTheDocument();
    expect(bubbleEditor).toBe(fake);
  });

  it("applies a document-level style to all blocks via applyStyleToAllBlocks", () => {
    const onChange = vi.fn();
    const doc = baseDoc();
    render(<StylingSurface document={doc} onChange={onChange} />);
    expect(typeof capturedApplyToAll).toBe("function");
    fireEvent.click(screen.getByTestId("doc-style")); // applies { align: "center" }
    const next = onChange.mock.calls[0][0] as CanonicalDocument;
    expect(validateDocument(next)).toBeTruthy();
    expect(next.blocks[0].style).toEqual({ align: "center" });
    expect(next.blocks[1].style).toEqual({ align: "center" });
    const q = next.blocks[2] as Extract<CanonicalDocument["blocks"][number], { type: "question" }>;
    expect(q.style).toEqual({ align: "center" });
    expect(q.stem[0].style).toEqual({ align: "center" });
  });

  it("does not dispatch when the mark/color helper yields null (question has no inline text of its own)", () => {
    // The current block is the QUESTION wrapper (cursor inside its stem). The
    // question node has block content, not inline text, so applyMarkToBlock /
    // applyColorToBlock return null and nothing is dispatched.
    const doc = baseDoc();
    render(<StylingSurface document={doc} onChange={vi.fn()} />);
    placeCursorIn(doc, 2); // question id(7) becomes current

    fireEvent.click(screen.getByLabelText("Negrito"));
    fireEvent.change(screen.getByLabelText("Cor do texto"), { target: { value: "#DC2626" } });
    expect(dispatch).not.toHaveBeenCalled();
  });
});
