import { describe, it, expect, vi } from "vitest";
import { fireEvent } from "@testing-library/react";
import { Node as PMNode } from "@tiptap/pm/model";
import { EditorState, type Transaction } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { getEditorSchema } from "@/lib/adaptation/tiptap/getEditorSchema";
import { canonicalToProseMirror } from "@/lib/adaptation/tiptap/fromCanonical";
import type { CanonicalDocument, NodeStyle } from "@/lib/adaptation/canonical/schema";
import {
  pageBreakSpecs,
  unsetPageBreakById,
  buildPageBreakDecorations,
  PageBreakMarker,
  PAGE_BREAK_LABEL,
} from "./pageBreakDecoration";

const schema = getEditorSchema();
const uid = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

/** Canonical doc whose i-th block (0-based) optionally carries pageBreakBefore. */
function docWithBreaks(breakOn: number[]): CanonicalDocument {
  return {
    schemaVersion: 1,
    blocks: [0, 1, 2].map((i) => ({
      id: uid(i + 1),
      type: "paragraph" as const,
      content: [{ type: "text" as const, text: `b${i}` }],
      ...(breakOn.includes(i) ? { style: { pageBreakBefore: true } as NodeStyle } : {}),
    })),
  };
}

function stateFor(doc: CanonicalDocument): EditorState {
  return EditorState.create({ doc: PMNode.fromJSON(schema, canonicalToProseMirror(doc)) });
}

/** Start position (pos before the node) of the index-th top-level child. */
function childPos(state: EditorState, index: number): number {
  let pos = 0;
  for (let i = 0; i < index; i++) pos += state.doc.child(i).nodeSize;
  return pos;
}

describe("pageBreakSpecs", () => {
  it("returns pos + id for blocks flagged with pageBreakBefore (except the first)", () => {
    const state = stateFor(docWithBreaks([1, 2]));
    expect(pageBreakSpecs(state.doc)).toEqual([
      { pos: childPos(state, 1), id: uid(2) },
      { pos: childPos(state, 2), id: uid(3) },
    ]);
  });

  it("ignores a pageBreakBefore on the very first block (a break before page 1 is a no-op)", () => {
    const state = stateFor(docWithBreaks([0]));
    expect(pageBreakSpecs(state.doc)).toEqual([]);
  });

  it("returns an empty list when no block is flagged", () => {
    const state = stateFor(docWithBreaks([]));
    expect(pageBreakSpecs(state.doc)).toEqual([]);
  });

  it("ignores a flagged top-level block carrying no id", () => {
    const bare = PMNode.fromJSON(schema, {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "x" }] },
        { type: "paragraph", attrs: { style: { pageBreakBefore: true } }, content: [{ type: "text", text: "y" }] },
      ],
    });
    expect(pageBreakSpecs(bare)).toEqual([]);
  });
});

describe("unsetPageBreakById", () => {
  it("clears pageBreakBefore on the matching block and reports applied", () => {
    const state = stateFor(docWithBreaks([1]));
    const dispatch = vi.fn();
    const applied = unsetPageBreakById(uid(2))(state, dispatch);
    expect(applied).toBe(true);
    expect(dispatch).toHaveBeenCalledTimes(1);
    const next = state.apply(dispatch.mock.calls[0][0] as Transaction);
    expect(next.doc.child(1).attrs.style).toBeNull();
  });

  it("keeps the other style fields when removing only pageBreakBefore", () => {
    const doc: CanonicalDocument = {
      schemaVersion: 1,
      blocks: [
        { id: uid(1), type: "paragraph", content: [{ type: "text", text: "a" }] },
        {
          id: uid(2),
          type: "paragraph",
          content: [{ type: "text", text: "b" }],
          style: { pageBreakBefore: true, align: "center" } as NodeStyle,
        },
      ],
    };
    const state = stateFor(doc);
    const dispatch = vi.fn();
    unsetPageBreakById(uid(2))(state, dispatch);
    const next = state.apply(dispatch.mock.calls[0][0] as Transaction);
    expect(next.doc.child(1).attrs.style).toEqual({ align: "center" });
  });

  it("returns true without dispatching when no dispatch is provided (dry run)", () => {
    const state = stateFor(docWithBreaks([1]));
    expect(unsetPageBreakById(uid(2))(state)).toBe(true);
  });

  it("returns false when the id is not found", () => {
    const state = stateFor(docWithBreaks([1]));
    const dispatch = vi.fn();
    expect(unsetPageBreakById("missing")(state, dispatch)).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("returns false when the block is not flagged", () => {
    const state = stateFor(docWithBreaks([]));
    const dispatch = vi.fn();
    expect(unsetPageBreakById(uid(2))(state, dispatch)).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();
  });
});

describe("buildPageBreakDecorations", () => {
  it("builds one widget decoration per flagged block at its start position", () => {
    const state = stateFor(docWithBreaks([1, 2]));
    const decos = buildPageBreakDecorations(state).find();
    expect(decos).toHaveLength(2);
    expect(decos.map((d) => d.from)).toEqual([childPos(state, 1), childPos(state, 2)]);
  });

  it("returns an empty set when nothing is flagged", () => {
    const state = stateFor(docWithBreaks([]));
    expect(buildPageBreakDecorations(state).find()).toHaveLength(0);
  });

  it("renders a marker with the label and a remove control that clears the break", () => {
    const state = stateFor(docWithBreaks([1]));
    const decos = buildPageBreakDecorations(state).find();
    const dispatch = vi.fn();
    const view = { state, dispatch } as unknown as EditorView;
    const toDOM = (decos[0].type as unknown as { toDOM: (v: EditorView) => HTMLElement }).toDOM;
    const el = toDOM(view);

    expect(el.textContent).toContain(PAGE_BREAK_LABEL);
    const remove = el.querySelector("button");
    expect(remove).not.toBeNull();
    expect(remove!.getAttribute("aria-label")).toBe("Remover quebra de página");

    fireEvent.click(remove!);
    expect(dispatch).toHaveBeenCalledTimes(1);
    const next = state.apply(dispatch.mock.calls[0][0] as Transaction);
    expect(next.doc.child(1).attrs.style).toBeNull();
  });
});

describe("PageBreakMarker extension", () => {
  it("registers a plugin whose decorations prop marks the flagged blocks", () => {
    const ext = PageBreakMarker;
    const plugins = ext.config.addProseMirrorPlugins!.call(ext);
    expect(plugins).toHaveLength(1);
    const state = stateFor(docWithBreaks([1]));
    const decos = plugins[0].props.decorations!.call(plugins[0], state) as ReturnType<
      typeof buildPageBreakDecorations
    >;
    expect(decos.find()).toHaveLength(1);
  });
});
