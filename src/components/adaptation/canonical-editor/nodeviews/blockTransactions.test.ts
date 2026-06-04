import { describe, it, expect } from "vitest";
import { Node as PMNode } from "@tiptap/pm/model";
import { EditorState } from "@tiptap/pm/state";
import { getEditorSchema } from "@/lib/adaptation/tiptap/getEditorSchema";
import { canonicalToProseMirror } from "@/lib/adaptation/tiptap/fromCanonical";
import { proseMirrorToCanonical } from "@/lib/adaptation/tiptap/toCanonical";
import type { CanonicalDocument } from "@/lib/adaptation/canonical/schema";
import { buildMoveTransaction, buildStemImageTransaction } from "./blockTransactions";

const schema = getEditorSchema();

const uid = (n: number): string =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function makeState(canonical: CanonicalDocument): EditorState {
  const doc = PMNode.fromJSON(schema, canonicalToProseMirror(canonical));
  return EditorState.create({ doc });
}

/** Position right before the i-th top-level child. */
function posOfChild(doc: PMNode, index: number): number {
  let pos = 0;
  for (let i = 0; i < index; i++) pos += doc.child(i).nodeSize;
  return pos;
}

const threeParagraphs: CanonicalDocument = {
  schemaVersion: 1,
  blocks: [
    { id: uid(1), type: "paragraph", content: [{ type: "text", text: "p1" }] },
    { id: uid(2), type: "paragraph", content: [{ type: "text", text: "p2" }] },
    { id: uid(3), type: "paragraph", content: [{ type: "text", text: "p3" }] },
  ],
};

function order(doc: PMNode): string[] {
  const ids: string[] = [];
  doc.forEach((child) => ids.push(child.attrs.id as string));
  return ids;
}

describe("buildMoveTransaction (real schema)", () => {
  it("moves the middle block up", () => {
    const state = makeState(threeParagraphs);
    const pos = posOfChild(state.doc, 1);
    const tr = buildMoveTransaction(state, pos, "up");
    expect(tr).not.toBeNull();
    const next = state.apply(tr!);
    expect(order(next.doc)).toEqual([uid(2), uid(1), uid(3)]);
  });

  it("moves the middle block down", () => {
    const state = makeState(threeParagraphs);
    const pos = posOfChild(state.doc, 1);
    const tr = buildMoveTransaction(state, pos, "down");
    const next = state.apply(tr!);
    expect(order(next.doc)).toEqual([uid(1), uid(3), uid(2)]);
  });

  it("returns null when the move is impossible (first up)", () => {
    const state = makeState(threeParagraphs);
    expect(buildMoveTransaction(state, posOfChild(state.doc, 0), "up")).toBeNull();
  });
});

describe("buildStemImageTransaction (real schema)", () => {
  const withQuestion: CanonicalDocument = {
    schemaVersion: 1,
    blocks: [
      {
        id: uid(9),
        type: "question",
        answer: { kind: "open" },
        stem: [
          { id: uid(10), type: "paragraph", content: [{ type: "text", text: "stem" }] },
        ],
      },
    ],
  };

  it("inserts the image as the question's last stem child", () => {
    const state = makeState(withQuestion);
    const pos = posOfChild(state.doc, 0);
    const tr = buildStemImageTransaction(state, pos, {
      id: uid(11),
      src: "https://example.com/x.png",
      alt: "",
    });
    const next = state.apply(tr);
    const canonical = proseMirrorToCanonical(next.doc.toJSON());
    const question = canonical.blocks.find((b) => b.id === uid(9));
    expect(question?.type).toBe("question");
    const stem = (question as { stem: { type: string; id: string }[] }).stem;
    const last = stem[stem.length - 1];
    expect(last).toMatchObject({ type: "image", id: uid(11), src: "https://example.com/x.png" });
  });
});
