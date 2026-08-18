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

// ImageNodeView (wired below via buildCanonicalEditorExtensions) statically
// imports PdfPreviewModal for "Recortar do original", which pulls in
// pdfjs-dist — that references DOMMatrix, undefined under jsdom. Mocking
// @tiptap/react above stops the NodeViews from ever rendering, but not this
// module-load-time import, so it needs breaking here too.
vi.mock("@/components/forms/PdfPreviewModal", () => ({ default: () => null }));

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

  // --- B8 · Frente B: a freeze must never be silent -------------------------
  //
  // Not emitting is correct — the parent must keep its last VALID document.
  // Saying nothing is not: the wizard went on showing "Salvo" while every
  // keystroke was being dropped, so the user kept typing into a sheet that was
  // no longer being persisted. The hook has to announce that it stopped
  // capturing, and announce again when it recovers.
  describe("reports when it stops capturing edits", () => {
    /** An image with an empty src — unrepresentable in the canonical model. */
    const invalidDoc = {
      type: "doc",
      content: [
        { type: "image", attrs: { id: "11111111-1111-4111-8111-111111111111", src: "", alt: "" } },
      ],
    };

    function mountWithUpdates() {
      let onUpdate: ((args: { editor: { getJSON: () => unknown } }) => void) | undefined;
      vi.mocked(useEditor).mockImplementation((c: unknown) => {
        onUpdate = (c as { onUpdate: typeof onUpdate }).onUpdate;
        return { getJSON: () => canonicalToProseMirror(docA) } as never;
      });
      const onChange = vi.fn();
      const onCaptureFailure = vi.fn();
      renderHook(() => useCanonicalEditor({ value: docA, onChange, onCaptureFailure }));
      return { onUpdate, onChange, onCaptureFailure };
    }

    it("calls onCaptureFailure with a reason when the edit cannot be captured", () => {
      const { onUpdate, onCaptureFailure } = mountWithUpdates();

      onUpdate?.({ editor: { getJSON: () => invalidDoc } });

      expect(onCaptureFailure).toHaveBeenCalledTimes(1);
      const reason = onCaptureFailure.mock.calls[0][0] as string;
      expect(reason).toBeTruthy();
      // The reason must point at the actual problem, not just "invalid".
      expect(reason).toContain("src");
    });

    it("clears the failure once the document converts again", () => {
      const { onUpdate, onChange, onCaptureFailure } = mountWithUpdates();

      onUpdate?.({ editor: { getJSON: () => invalidDoc } });
      onUpdate?.({ editor: { getJSON: () => canonicalToProseMirror(docB) } });

      expect(onCaptureFailure).toHaveBeenLastCalledWith(null);
      expect(onChange).toHaveBeenCalledWith(docB);
    });

    it("does not re-notify on every keystroke while the state stays the same", () => {
      const { onUpdate, onCaptureFailure } = mountWithUpdates();

      onUpdate?.({ editor: { getJSON: () => invalidDoc } });
      onUpdate?.({ editor: { getJSON: () => invalidDoc } });
      onUpdate?.({ editor: { getJSON: () => invalidDoc } });

      expect(onCaptureFailure).toHaveBeenCalledTimes(1);
    });

    it("warns in the console so the cause is visible while developing", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const { onUpdate } = mountWithUpdates();

      onUpdate?.({ editor: { getJSON: () => invalidDoc } });

      expect(warn).toHaveBeenCalled();
      expect(String(warn.mock.calls[0].join(" "))).toContain("src");
      warn.mockRestore();
    });

    it("works when no onCaptureFailure is provided (optional callback)", () => {
      let onUpdate: ((args: { editor: { getJSON: () => unknown } }) => void) | undefined;
      vi.mocked(useEditor).mockImplementation((c: unknown) => {
        onUpdate = (c as { onUpdate: typeof onUpdate }).onUpdate;
        return { getJSON: () => canonicalToProseMirror(docA) } as never;
      });
      renderHook(() => useCanonicalEditor({ value: docA, onChange: vi.fn() }));

      expect(() => onUpdate?.({ editor: { getJSON: () => invalidDoc } })).not.toThrow();
    });
  });

  // --- B14: the sheet must follow a document replaced from outside -----------

  function editorStub(json: unknown) {
    return {
      getJSON: () => json,
      commands: { setContent: vi.fn() },
    };
  }

  it("re-seeds the editor when the document is replaced externally (restore)", () => {
    // "Recuperar alterações não salvas" swaps the document in wizard state. A
    // seed-once editor keeps showing the OLD document, and the first keystroke
    // re-emits it — so the autosave overwrites the recovered version with the
    // one the user just chose to discard.
    const editor = editorStub(canonicalToProseMirror(docA));
    vi.mocked(useEditor).mockReturnValue(editor as never);
    const { rerender } = renderHook(
      (props: { value: CanonicalDocument }) =>
        useCanonicalEditor({ value: props.value, onChange: vi.fn() }),
      { initialProps: { value: docA } },
    );
    expect(editor.commands.setContent).not.toHaveBeenCalled();

    rerender({ value: docB });

    expect(editor.commands.setContent).toHaveBeenCalledWith(
      canonicalToProseMirror(docB),
      false,
    );
  });

  it("does NOT re-seed when the incoming value is the doc it just emitted (no loop)", () => {
    const onChange = vi.fn();
    let onUpdate: ((args: { editor: { getJSON: () => unknown } }) => void) | undefined;
    const editor = editorStub(canonicalToProseMirror(docA));
    vi.mocked(useEditor).mockImplementation((c: unknown) => {
      onUpdate = (c as { onUpdate: typeof onUpdate }).onUpdate;
      return editor as never;
    });
    const { rerender } = renderHook(
      (props: { value: CanonicalDocument }) =>
        useCanonicalEditor({ value: props.value, onChange }),
      { initialProps: { value: docA } },
    );
    // The user types: the editor emits docB upward…
    onUpdate?.({ editor: { getJSON: () => canonicalToProseMirror(docB) } });
    expect(onChange).toHaveBeenCalledTimes(1);
    // …and the parent hands the very same doc back as the new value.
    rerender({ value: docB });
    expect(editor.commands.setContent).not.toHaveBeenCalled();
  });

  it("does not re-seed before the editor exists", () => {
    vi.mocked(useEditor).mockReturnValue(null as never);
    const { rerender } = renderHook(
      (props: { value: CanonicalDocument }) =>
        useCanonicalEditor({ value: props.value, onChange: vi.fn() }),
      { initialProps: { value: docA } },
    );
    expect(() => rerender({ value: docB })).not.toThrow();
  });

  it("returns the editor instance", () => {
    const editor = { getJSON: () => ({}) };
    vi.mocked(useEditor).mockReturnValue(editor as never);
    const { result } = renderHook(() => useCanonicalEditor({ value: docA, onChange: vi.fn() }));
    expect(result.current.editor).toBe(editor);
  });

  it("appends extraExtensions after the canonical set", () => {
    let cfg: { extensions?: { name: string }[] } | undefined;
    vi.mocked(useEditor).mockImplementation((c: unknown) => {
      cfg = c as { extensions?: { name: string }[] };
      return { getJSON: () => ({}) } as never;
    });
    const extra = { name: "extra-ext" } as never;
    renderHook(() => useCanonicalEditor({ value: docA, onChange: vi.fn(), extraExtensions: [extra] }));
    expect(cfg?.extensions?.[cfg.extensions.length - 1]).toBe(extra);
  });

  it("forwards selection updates to onSelectionUpdate", () => {
    const onSelectionUpdate = vi.fn();
    let onSel: ((args: { editor: unknown }) => void) | undefined;
    vi.mocked(useEditor).mockImplementation((c: unknown) => {
      onSel = (c as { onSelectionUpdate: typeof onSel }).onSelectionUpdate;
      return { getJSON: () => ({}) } as never;
    });
    const editor = { id: "ed" };
    renderHook(() => useCanonicalEditor({ value: docA, onChange: vi.fn(), onSelectionUpdate }));
    onSel?.({ editor });
    expect(onSelectionUpdate).toHaveBeenCalledWith(editor);
  });

  it("is a no-op selection handler when onSelectionUpdate is omitted", () => {
    let onSel: ((args: { editor: unknown }) => void) | undefined;
    vi.mocked(useEditor).mockImplementation((c: unknown) => {
      onSel = (c as { onSelectionUpdate: typeof onSel }).onSelectionUpdate;
      return { getJSON: () => ({}) } as never;
    });
    renderHook(() => useCanonicalEditor({ value: docA, onChange: vi.fn() }));
    expect(() => onSel?.({ editor: {} })).not.toThrow();
  });
});
