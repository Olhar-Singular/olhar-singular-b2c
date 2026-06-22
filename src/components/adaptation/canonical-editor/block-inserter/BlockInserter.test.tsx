import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Node as PMNode } from "@tiptap/pm/model";
import type { Editor } from "@tiptap/react";
import { getEditorSchema } from "@/lib/adaptation/tiptap/getEditorSchema";
import { canonicalToProseMirror } from "@/lib/adaptation/tiptap/fromCanonical";
import type { CanonicalDocument } from "@/lib/adaptation/canonical/schema";
import { BlockInserter } from "./BlockInserter";
import { runInserterAction } from "./insertAtPos";

vi.mock("./insertAtPos", () => ({ runInserterAction: vi.fn() }));

const schema = getEditorSchema();
const uid = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const doc: CanonicalDocument = {
  schemaVersion: 1,
  blocks: [
    { id: uid(1), type: "paragraph", content: [{ type: "text", text: "a" }] },
    { id: uid(2), type: "paragraph", content: [{ type: "text", text: "b" }] },
  ],
};
const pmDoc = PMNode.fromJSON(schema, canonicalToProseMirror(doc));

function makeEditor() {
  const coordsAtPos = vi.fn(() => ({ top: 10, bottom: 12, left: 0, right: 0 }));
  const on = vi.fn();
  const off = vi.fn();
  const editor = {
    state: { doc: pmDoc },
    view: { coordsAtPos },
    on,
    off,
  } as unknown as Editor;
  return { editor, coordsAtPos, on, off };
}

beforeEach(() => {
  vi.mocked(runInserterAction).mockClear();
});

describe("BlockInserter", () => {
  it("renders one inserter per gap (blocks + 1 trailing)", () => {
    const { editor } = makeEditor();
    render(<BlockInserter editor={editor} />);
    // 2 blocks → 2 leading gaps + 1 trailing = 3
    expect(screen.getAllByRole("button", { name: "Inserir bloco" })).toHaveLength(3);
  });

  it("turns a pick into an editor action at the chosen gap", () => {
    const { editor } = makeEditor();
    render(<BlockInserter editor={editor} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Inserir bloco" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Parágrafo" }));
    expect(runInserterAction).toHaveBeenCalledTimes(1);
    const [calledEditor, gap, action] = vi.mocked(runInserterAction).mock.calls[0];
    expect(calledEditor).toBe(editor);
    expect(gap.index).toBe(0);
    expect(action.type).toBe("insert");
  });

  it("subscribes to editor transactions and cleans up on unmount", () => {
    const { editor, on, off } = makeEditor();
    const { unmount } = render(<BlockInserter editor={editor} />);
    expect(on).toHaveBeenCalledWith("transaction", expect.any(Function));
    unmount();
    expect(off).toHaveBeenCalledWith("transaction", expect.any(Function));
  });

  it("recomputes positions on window resize", () => {
    const { editor, coordsAtPos } = makeEditor();
    render(<BlockInserter editor={editor} />);
    const initial = coordsAtPos.mock.calls.length;
    fireEvent(window, new Event("resize"));
    expect(coordsAtPos.mock.calls.length).toBeGreaterThan(initial);
  });
});
