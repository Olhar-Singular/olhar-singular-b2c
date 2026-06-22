import { describe, it, expect, vi } from "vitest";
import { OriginalDocExtension } from "./originalDocExtension";

describe("OriginalDocExtension", () => {
  it("has the correct name", () => {
    expect(OriginalDocExtension.name).toBe("originalDoc");
  });

  it("initialises storage with an empty Map", () => {
    // Access the default storage via the extension's config
    const ext = OriginalDocExtension.extend({});
    // Tiptap extensions expose addStorage via their config
    const storage = (ext as { config: { addStorage?: () => unknown } }).config.addStorage?.();
    expect(storage).toEqual({ snapshots: expect.any(Map) });
    expect((storage as { snapshots: Map<string, unknown> }).snapshots.size).toBe(0);
  });

  it("is a Tiptap Extension (has an extend method)", () => {
    expect(typeof OriginalDocExtension.extend).toBe("function");
  });

  it("builds snapshots from question nodes via onCreate", () => {
    const snapshots = new Map<string, unknown>();
    const questionNode = {
      type: { name: "question" },
      attrs: { id: "q-1" },
      toJSON: vi.fn().mockReturnValue({ type: "question", attrs: { id: "q-1" } }),
    };
    const nonQuestionNode = {
      type: { name: "paragraph" },
      attrs: {},
      toJSON: vi.fn(),
    };

    const mockEditor = {
      state: {
        doc: {
          descendants(fn: (node: unknown) => void) {
            fn(questionNode);
            fn(nonQuestionNode);
          },
        },
      },
    };

    // Simulate onCreate
    const onCreateFn = (OriginalDocExtension as { config: { onCreate?: () => void } }).config.onCreate;
    if (onCreateFn) {
      onCreateFn.call({ editor: mockEditor, storage: { snapshots } });
    }

    expect(snapshots.has("q-1")).toBe(true);
    expect(questionNode.toJSON).toHaveBeenCalledTimes(1);
    expect(nonQuestionNode.toJSON).not.toHaveBeenCalled();
  });

  it("does not overwrite an existing snapshot if onCreate is called again", () => {
    const snapshots = new Map<string, unknown>([["q-1", { original: true }]]);
    const questionNode = {
      type: { name: "question" },
      attrs: { id: "q-1" },
      toJSON: vi.fn().mockReturnValue({ type: "question", attrs: { id: "q-1" } }),
    };

    const mockEditor = {
      state: {
        doc: {
          descendants(fn: (node: unknown) => void) {
            fn(questionNode);
          },
        },
      },
    };

    const onCreateFn = (OriginalDocExtension as { config: { onCreate?: () => void } }).config.onCreate;
    if (onCreateFn) {
      onCreateFn.call({ editor: mockEditor, storage: { snapshots } });
    }

    // The original snapshot is preserved
    expect(snapshots.get("q-1")).toEqual({ original: true });
    expect(questionNode.toJSON).not.toHaveBeenCalled();
  });
});
