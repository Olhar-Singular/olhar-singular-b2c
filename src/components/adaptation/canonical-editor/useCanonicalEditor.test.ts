import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import type { CanonicalDocument } from "@/lib/adaptation/canonical/schema";
import { canonicalToProseMirror } from "@/lib/adaptation/tiptap/fromCanonical";
import { docsEqual, useCanonicalEditor, buildCanonicalEditorExtensions } from "./useCanonicalEditor";

// Mock @tiptap/react so no real ProseMirror/DOM is involved.
vi.mock("@tiptap/react", () => ({
  useEditor: vi.fn(),
  ReactNodeViewRenderer: vi.fn(() => ({ __nodeView: true })),
}));

import { useEditor, ReactNodeViewRenderer } from "@tiptap/react";

const para = (text: string) => ({ type: "text" as const, text });

const docA: CanonicalDocument = {
  schemaVersion: 1,
  blocks: [
    { id: "11111111-1111-4111-8111-111111111111", type: "paragraph", content: [para("hello")] },
  ],
};

const docB: CanonicalDocument = {
  schemaVersion: 1,
  blocks: [
    { id: "11111111-1111-4111-8111-111111111111", type: "paragraph", content: [para("changed")] },
  ],
};

describe("docsEqual", () => {
  it("returns true for deeply equal docs", () => {
    expect(docsEqual(docA, structuredClone(docA))).toBe(true);
  });

  it("returns false for different docs", () => {
    expect(docsEqual(docA, docB)).toBe(false);
  });
});

describe("buildCanonicalEditorExtensions", () => {
  it("wires a NodeView onto each custom node and appends UniqueId", () => {
    const exts = buildCanonicalEditorExtensions();
    // ReactNodeViewRenderer is invoked once per custom node (question, image,
    // blockMath, inlineMath, scaffolding).
    expect(vi.mocked(ReactNodeViewRenderer)).toHaveBeenCalledTimes(5);
    expect(exts.some((e) => e.name === "uniqueId")).toBe(true);

    // Each custom node exposes an addNodeView factory returning the renderer.
    const customNames = ["question", "image", "blockMath", "inlineMath", "scaffolding"];
    const customized = exts.filter((e) => customNames.includes(e.name));
    expect(customized).toHaveLength(5);
    for (const ext of customized) {
      const addNodeView = (ext.config as { addNodeView?: () => unknown }).addNodeView;
      expect(addNodeView?.()).toEqual({ __nodeView: true });
    }
  });
});

describe("useCanonicalEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useEditor).mockReturnValue({ getJSON: () => ({}) } as never);
  });

  it("passes canonicalToProseMirror(value) as initial content", () => {
    let cfg: { content?: unknown } | undefined;
    vi.mocked(useEditor).mockImplementation((c: unknown) => {
      cfg = c as { content?: unknown };
      return { getJSON: () => ({}) } as never;
    });
    renderHook(() => useCanonicalEditor({ value: docA, onChange: vi.fn() }));
    expect(cfg?.content).toEqual(canonicalToProseMirror(docA));
  });

  it("sets editable based on disabled", () => {
    let cfg: { editable?: boolean } | undefined;
    vi.mocked(useEditor).mockImplementation((c: unknown) => {
      cfg = c as { editable?: boolean };
      return { getJSON: () => ({}) } as never;
    });
    renderHook(() => useCanonicalEditor({ value: docA, onChange: vi.fn(), disabled: true }));
    expect(cfg?.editable).toBe(false);
  });

  it("emits onChange with a valid canonical doc when the editor content changed", () => {
    const onChange = vi.fn();
    let onUpdate: ((args: { editor: { getJSON: () => unknown } }) => void) | undefined;
    vi.mocked(useEditor).mockImplementation((c: unknown) => {
      onUpdate = (c as { onUpdate: typeof onUpdate }).onUpdate;
      return { getJSON: () => canonicalToProseMirror(docA) } as never;
    });
    renderHook(() => useCanonicalEditor({ value: docA, onChange }));
    // Editor now reports docB.
    onUpdate?.({ editor: { getJSON: () => canonicalToProseMirror(docB) } });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toEqual(docB);
  });

  it("does NOT emit when the canonical doc is unchanged (guard against loops)", () => {
    const onChange = vi.fn();
    let onUpdate: ((args: { editor: { getJSON: () => unknown } }) => void) | undefined;
    vi.mocked(useEditor).mockImplementation((c: unknown) => {
      onUpdate = (c as { onUpdate: typeof onUpdate }).onUpdate;
      return { getJSON: () => canonicalToProseMirror(docA) } as never;
    });
    renderHook(() => useCanonicalEditor({ value: docA, onChange }));
    // Editor reports the same doc as `value`.
    onUpdate?.({ editor: { getJSON: () => canonicalToProseMirror(docA) } });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("does NOT throw and does NOT emit when the update yields an invalid doc", () => {
    const onChange = vi.fn();
    let onUpdate: ((args: { editor: { getJSON: () => unknown } }) => void) | undefined;
    vi.mocked(useEditor).mockImplementation((c: unknown) => {
      onUpdate = (c as { onUpdate: typeof onUpdate }).onUpdate;
      return { getJSON: () => canonicalToProseMirror(docA) } as never;
    });
    renderHook(() => useCanonicalEditor({ value: docA, onChange }));
    // A transient-invalid state: an image with an empty src.
    const invalidDoc = {
      type: "doc",
      content: [
        { type: "image", attrs: { id: "11111111-1111-4111-8111-111111111111", src: "", alt: "" } },
      ],
    };
    expect(() => onUpdate?.({ editor: { getJSON: () => invalidDoc } })).not.toThrow();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("returns the editor instance", () => {
    const editor = { getJSON: () => ({}) };
    vi.mocked(useEditor).mockReturnValue(editor as never);
    const { result } = renderHook(() => useCanonicalEditor({ value: docA, onChange: vi.fn() }));
    expect(result.current.editor).toBe(editor);
  });
});
