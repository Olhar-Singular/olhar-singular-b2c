import { describe, it, expect } from "vitest";
import { Node as PMNode } from "@tiptap/pm/model";
import { EditorState } from "@tiptap/pm/state";
import { getEditorSchema } from "@/lib/adaptation/tiptap/getEditorSchema";
import { canonicalToProseMirror } from "@/lib/adaptation/tiptap/fromCanonical";
import { proseMirrorToCanonical } from "@/lib/adaptation/tiptap/toCanonical";
import type { CanonicalDocument } from "@/lib/adaptation/canonical/schema";
import { applyMarkToBlock, applyColorToBlock } from "./blockMarks";

const schema = getEditorSchema();
const uid = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function makeState(canonical: CanonicalDocument): EditorState {
  const doc = PMNode.fromJSON(schema, canonicalToProseMirror(canonical));
  return EditorState.create({ doc });
}

function canonicalAfter(state: EditorState, tr: ReturnType<typeof applyMarkToBlock>): CanonicalDocument {
  return proseMirrorToCanonical(state.apply(tr!).doc.toJSON());
}

function textBlock(blocks: CanonicalDocument["blocks"], id: string) {
  return blocks.find((b) => b.id === id) as Extract<
    CanonicalDocument["blocks"][number],
    { type: "paragraph" | "heading" }
  >;
}

const twoParagraphs: CanonicalDocument = {
  schemaVersion: 1,
  blocks: [
    {
      id: uid(1),
      type: "paragraph",
      content: [
        { type: "text", text: "Hello " },
        { type: "text", text: "world" },
      ],
    },
    { id: uid(2), type: "paragraph", content: [{ type: "text", text: "untouched" }] },
  ],
};

describe("applyMarkToBlock (real schema)", () => {
  it("adds bold to every text run of the target block when none is bold", () => {
    const state = makeState(twoParagraphs);
    const tr = applyMarkToBlock(state, uid(1), "bold");
    expect(tr).not.toBeNull();
    const next = canonicalAfter(state, tr);
    const target = textBlock(next.blocks, uid(1));
    for (const run of target.content) {
      expect((run as { marks?: string[] }).marks).toContain("bold");
    }
    // The other block is untouched.
    const other = textBlock(next.blocks, uid(2));
    expect((other.content[0] as { marks?: string[] }).marks).toBeUndefined();
  });

  it("removes bold from the block when EVERY run is already bold (toggle off)", () => {
    const allBold: CanonicalDocument = {
      schemaVersion: 1,
      blocks: [
        {
          id: uid(1),
          type: "paragraph",
          content: [
            { type: "text", text: "a", marks: ["bold"] },
            { type: "text", text: "b", marks: ["bold"] },
          ],
        },
      ],
    };
    const state = makeState(allBold);
    const next = canonicalAfter(state, applyMarkToBlock(state, uid(1), "bold"));
    const target = textBlock(next.blocks, uid(1));
    for (const run of target.content) {
      expect((run as { marks?: string[] }).marks ?? []).not.toContain("bold");
    }
  });

  it("adds the mark when only SOME runs have it (partial → on)", () => {
    const partial: CanonicalDocument = {
      schemaVersion: 1,
      blocks: [
        {
          id: uid(1),
          type: "paragraph",
          content: [
            { type: "text", text: "a", marks: ["italic"] },
            { type: "text", text: "b" },
          ],
        },
      ],
    };
    const state = makeState(partial);
    const next = canonicalAfter(state, applyMarkToBlock(state, uid(1), "italic"));
    const target = textBlock(next.blocks, uid(1));
    for (const run of target.content) {
      expect((run as { marks?: string[] }).marks).toContain("italic");
    }
  });

  it("toggles italic too", () => {
    const state = makeState(twoParagraphs);
    const next = canonicalAfter(state, applyMarkToBlock(state, uid(1), "italic"));
    expect((textBlock(next.blocks, uid(1)).content[0] as { marks?: string[] }).marks).toContain("italic");
  });

  it("targets a block inside a question stem", () => {
    const withQuestion: CanonicalDocument = {
      schemaVersion: 1,
      blocks: [
        {
          id: uid(9),
          type: "question",
          answer: { kind: "open" },
          stem: [{ id: uid(10), type: "paragraph", content: [{ type: "text", text: "stem" }] }],
        },
      ],
    };
    const state = makeState(withQuestion);
    const next = canonicalAfter(state, applyMarkToBlock(state, uid(10), "bold"));
    const q = next.blocks.find((b) => b.id === uid(9)) as Extract<
      CanonicalDocument["blocks"][number],
      { type: "question" }
    >;
    expect((q.stem[0] as { content: { marks?: string[] }[] }).content[0].marks).toContain("bold");
  });

  it("returns null when the block id is not found", () => {
    const state = makeState(twoParagraphs);
    expect(applyMarkToBlock(state, uid(999), "bold")).toBeNull();
  });

  it("returns null when the target block has no inline text content (atom)", () => {
    const withImage: CanonicalDocument = {
      schemaVersion: 1,
      blocks: [{ id: uid(5), type: "image", src: "https://example.com/x.png", alt: "" }],
    };
    const state = makeState(withImage);
    expect(applyMarkToBlock(state, uid(5), "bold")).toBeNull();
  });
});

describe("applyColorToBlock (real schema)", () => {
  it("sets the color on every text run", () => {
    const state = makeState(twoParagraphs);
    const next = canonicalAfter(state, applyColorToBlock(state, uid(1), "#DC2626"));
    const target = textBlock(next.blocks, uid(1));
    for (const run of target.content) {
      expect((run as { color?: string }).color).toBe("#DC2626");
    }
  });

  it("clears the color when passed null", () => {
    const colored: CanonicalDocument = {
      schemaVersion: 1,
      blocks: [
        { id: uid(1), type: "paragraph", content: [{ type: "text", text: "a", color: "#DC2626" }] },
      ],
    };
    const state = makeState(colored);
    const next = canonicalAfter(state, applyColorToBlock(state, uid(1), null));
    expect((textBlock(next.blocks, uid(1)).content[0] as { color?: string }).color).toBeUndefined();
  });

  it("returns null when the block id is not found", () => {
    const state = makeState(twoParagraphs);
    expect(applyColorToBlock(state, uid(999), "#DC2626")).toBeNull();
  });
});
