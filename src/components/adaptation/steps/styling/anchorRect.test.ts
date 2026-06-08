import { describe, it, expect, vi } from "vitest";
import type { Editor } from "@tiptap/react";
import { blockAnchorRect } from "./anchorRect";

function makeEditor(opts: {
  docSize?: number;
  nodeDOM?: unknown;
  throws?: boolean;
}): Editor {
  return {
    state: { doc: { content: { size: opts.docSize ?? 100 } } },
    view: {
      nodeDOM: () => {
        if (opts.throws) throw new Error("boom");
        return opts.nodeDOM ?? null;
      },
    },
  } as unknown as Editor;
}

function makeEl(rect: Partial<DOMRect>): HTMLElement {
  const el = document.createElement("div");
  el.getBoundingClientRect = () =>
    ({ top: 0, left: 0, width: 0, height: 0, ...rect }) as DOMRect;
  return el;
}

describe("blockAnchorRect", () => {
  const container = makeEl({ top: 10, left: 20 });

  it("returns null when the editor is null", () => {
    expect(blockAnchorRect(null, 0, container)).toBeNull();
  });

  it("returns null when the editor has no resolved state/doc size (mid-mount)", () => {
    const partial = {} as unknown as Editor;
    expect(blockAnchorRect(partial, 0, container)).toBeNull();
  });

  it("returns null when pos is not a number", () => {
    expect(blockAnchorRect(makeEditor({}), null, container)).toBeNull();
    expect(blockAnchorRect(makeEditor({}), undefined, container)).toBeNull();
  });

  it("returns null when the container is null", () => {
    expect(blockAnchorRect(makeEditor({}), 0, null)).toBeNull();
  });

  it("returns null for an out-of-range position", () => {
    expect(blockAnchorRect(makeEditor({ docSize: 10 }), 10, container)).toBeNull();
    expect(blockAnchorRect(makeEditor({ docSize: 10 }), -1, container)).toBeNull();
  });

  it("returns null when nodeDOM throws (defensive)", () => {
    expect(blockAnchorRect(makeEditor({ throws: true }), 0, container)).toBeNull();
  });

  it("returns null when nodeDOM is not an HTMLElement", () => {
    expect(blockAnchorRect(makeEditor({ nodeDOM: {} }), 0, container)).toBeNull();
  });

  it("computes the rect relative to the container", () => {
    const node = makeEl({ top: 60, left: 30, width: 200, height: 40 });
    const editor = makeEditor({ nodeDOM: node });
    expect(blockAnchorRect(editor, 0, container)).toEqual({
      top: 50,
      left: 10,
      width: 200,
      height: 40,
    });
  });

  it("does not call console (clean) and tolerates a spy", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    blockAnchorRect(makeEditor({ throws: true }), 0, container);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
