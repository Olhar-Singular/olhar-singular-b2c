import { describe, it, expect } from "vitest";
import { Node as PMNode } from "@tiptap/pm/model";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import { getEditorSchema } from "@/lib/adaptation/tiptap/getEditorSchema";
import { canonicalToProseMirror } from "@/lib/adaptation/tiptap/fromCanonical";
import type { CanonicalDocument } from "@/lib/adaptation/canonical/schema";
import {
  currentBlockDecorationSpec,
  buildCurrentBlockDecorations,
  CurrentBlockHighlight,
  CURRENT_BLOCK_CLASS,
} from "./styleDecoration";

const schema = getEditorSchema();
const uid = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const doc: CanonicalDocument = {
  schemaVersion: 1,
  blocks: [
    { id: uid(1), type: "paragraph", content: [{ type: "text", text: "first" }] },
    { id: uid(2), type: "paragraph", content: [{ type: "text", text: "second" }] },
  ],
};

function stateWithCursorIn(index: number): EditorState {
  const base = EditorState.create({ doc: PMNode.fromJSON(schema, canonicalToProseMirror(doc)) });
  let pos = 0;
  for (let i = 0; i < index; i++) pos += base.doc.child(i).nodeSize;
  return base.apply(base.tr.setSelection(TextSelection.create(base.doc, pos + 1)));
}

describe("currentBlockDecorationSpec", () => {
  it("returns the from/to/class for the top-level node holding the selection", () => {
    const state = stateWithCursorIn(1);
    const spec = currentBlockDecorationSpec(state);
    const expectedFrom = state.doc.child(0).nodeSize;
    expect(spec).toEqual({
      from: expectedFrom,
      to: expectedFrom + state.doc.child(1).nodeSize,
      class: CURRENT_BLOCK_CLASS,
    });
  });

  it("returns null when the selection's top-level node carries no id", () => {
    const bare = PMNode.fromJSON(schema, {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "x" }] }],
    });
    const base = EditorState.create({ doc: bare });
    const state = base.apply(base.tr.setSelection(TextSelection.create(base.doc, 1)));
    expect(currentBlockDecorationSpec(state)).toBeNull();
  });
});

describe("buildCurrentBlockDecorations", () => {
  it("builds a DecorationSet containing one node decoration", () => {
    const state = stateWithCursorIn(0);
    const set = buildCurrentBlockDecorations(state);
    const decos = set.find();
    expect(decos).toHaveLength(1);
    expect(decos[0].from).toBe(0);
  });

  it("builds an empty DecorationSet when there is no current block", () => {
    const bare = PMNode.fromJSON(schema, {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "x" }] }],
    });
    const base = EditorState.create({ doc: bare });
    const state = base.apply(base.tr.setSelection(TextSelection.create(base.doc, 1)));
    expect(buildCurrentBlockDecorations(state).find()).toHaveLength(0);
  });
});

describe("CurrentBlockHighlight extension", () => {
  it("registers a plugin whose decorations prop highlights the current block", () => {
    const ext = CurrentBlockHighlight;
    const plugins = ext.config.addProseMirrorPlugins!.call(ext);
    expect(plugins).toHaveLength(1);
    const state = stateWithCursorIn(0);
    const decos = plugins[0].props.decorations!.call(plugins[0], state) as ReturnType<
      typeof buildCurrentBlockDecorations
    >;
    expect(decos.find()).toHaveLength(1);
  });
});
