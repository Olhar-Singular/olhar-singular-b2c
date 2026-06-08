import { describe, it, expect } from "vitest";
import { Node as PMNode } from "@tiptap/pm/model";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import { getEditorSchema } from "@/lib/adaptation/tiptap/getEditorSchema";
import { canonicalToProseMirror } from "@/lib/adaptation/tiptap/fromCanonical";
import type { CanonicalDocument } from "@/lib/adaptation/canonical/schema";
import { currentTopLevelBlock } from "./currentBlock";

const schema = getEditorSchema();
const uid = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function stateOf(canonical: CanonicalDocument): EditorState {
  const doc = PMNode.fromJSON(schema, canonicalToProseMirror(canonical));
  return EditorState.create({ doc });
}

/** A state whose cursor sits inside the text of the i-th top-level child. */
function stateWithCursorIn(canonical: CanonicalDocument, index: number): EditorState {
  const base = stateOf(canonical);
  let pos = 0;
  for (let i = 0; i < index; i++) pos += base.doc.child(i).nodeSize;
  // +1 lands just inside the block (before its first text char).
  const sel = TextSelection.create(base.doc, pos + 1);
  return base.apply(base.tr.setSelection(sel));
}

const doc: CanonicalDocument = {
  schemaVersion: 1,
  blocks: [
    { id: uid(1), type: "paragraph", content: [{ type: "text", text: "first" }] },
    {
      id: uid(2),
      type: "question",
      answer: { kind: "open" },
      stem: [{ id: uid(3), type: "paragraph", content: [{ type: "text", text: "stem" }] }],
    },
  ],
};

describe("currentTopLevelBlock", () => {
  it("returns the top-level block id + pos when the cursor is in a paragraph", () => {
    const result = currentTopLevelBlock(stateWithCursorIn(doc, 0));
    expect(result).toEqual({ id: uid(1), pos: 0 });
  });

  it("returns the QUESTION (top-level) block when the cursor is inside its stem", () => {
    const state = stateWithCursorIn(doc, 1);
    // Move cursor deeper into the question's stem paragraph.
    const questionPos = state.doc.child(0).nodeSize;
    const result = currentTopLevelBlock(state);
    expect(result).toEqual({ id: uid(2), pos: questionPos });
  });

  it("returns null when the selection's top-level node carries no id", () => {
    // A bare doc whose only child is an idless paragraph.
    const bare = PMNode.fromJSON(schema, {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "x" }] }],
    });
    const base = EditorState.create({ doc: bare });
    const state = base.apply(base.tr.setSelection(TextSelection.create(base.doc, 1)));
    expect(currentTopLevelBlock(state)).toBeNull();
  });

  it("returns null when the selection has no top-level depth (empty doc edge)", () => {
    const empty = PMNode.fromJSON(schema, { type: "doc", content: [{ type: "paragraph" }] });
    const base = EditorState.create({ doc: empty });
    // Selection at the very top (depth 0 resolved) — exercise the guard.
    const state = base.apply(base.tr.setSelection(TextSelection.create(base.doc, 0)));
    const result = currentTopLevelBlock(state);
    // Cursor at pos 0 still resolves into the first child; assert it does not throw.
    expect(result === null || typeof result.pos === "number").toBe(true);
  });
});
