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

function order(doc: PMNode): string[] {
  const ids: string[] = [];
  doc.forEach((child) => ids.push(child.attrs.id as string));
  return ids;
}

const q = (n: number): CanonicalDocument["blocks"][number] => ({
  id: uid(n),
  type: "question",
  answer: { kind: "open" },
  stem: [{ id: uid(n * 100), type: "paragraph", content: [{ type: "text", text: `Q${n}` }] }],
});

const p = (n: number): CanonicalDocument["blocks"][number] => ({
  id: uid(n),
  type: "paragraph",
  content: [{ type: "text", text: `p${n}` }],
});

const h = (n: number): CanonicalDocument["blocks"][number] => ({
  id: uid(n),
  type: "heading",
  level: 2,
  content: [{ type: "text", text: `H${n}` }],
});

// ---------------------------------------------------------------------------
// buildMoveTransaction — question ↔ question swap
// ---------------------------------------------------------------------------

describe("buildMoveTransaction — question swap", () => {
  it("swaps Q2 with Q1 when moving Q2 up (adjacent questions)", () => {
    const state = makeState({ schemaVersion: 1, blocks: [q(1), q(2), q(3)] });
    const tr = buildMoveTransaction(state, posOfChild(state.doc, 1), "up");
    expect(tr).not.toBeNull();
    const next = state.apply(tr!);
    expect(order(next.doc)).toEqual([uid(2), uid(1), uid(3)]);
  });

  it("swaps Q2 with Q3 when moving Q2 down", () => {
    const state = makeState({ schemaVersion: 1, blocks: [q(1), q(2), q(3)] });
    const tr = buildMoveTransaction(state, posOfChild(state.doc, 1), "down");
    const next = state.apply(tr!);
    expect(order(next.doc)).toEqual([uid(1), uid(3), uid(2)]);
  });

  it("returns null when no adjacent question above (first question moving up)", () => {
    const state = makeState({ schemaVersion: 1, blocks: [q(1), q(2)] });
    expect(buildMoveTransaction(state, posOfChild(state.doc, 0), "up")).toBeNull();
  });

  it("returns null when no adjacent question below (last question moving down)", () => {
    const state = makeState({ schemaVersion: 1, blocks: [q(1), q(2)] });
    expect(buildMoveTransaction(state, posOfChild(state.doc, 1), "down")).toBeNull();
  });

  it("returns null when only one question in doc", () => {
    const state = makeState({ schemaVersion: 1, blocks: [h(1), q(2), p(3)] });
    expect(buildMoveTransaction(state, posOfChild(state.doc, 1), "up")).toBeNull();
    expect(buildMoveTransaction(state, posOfChild(state.doc, 1), "down")).toBeNull();
  });

  it("skips non-question blocks — Q4 swaps with Q2 in [H, Q2, P, Q4]", () => {
    const state = makeState({ schemaVersion: 1, blocks: [h(1), q(2), p(3), q(4)] });
    const tr = buildMoveTransaction(state, posOfChild(state.doc, 3), "up");
    expect(tr).not.toBeNull();
    const next = state.apply(tr!);
    // Q2 and Q4 swapped; H and P stay in place
    expect(order(next.doc)).toEqual([uid(1), uid(4), uid(3), uid(2)]);
  });

  it("non-question blocks between swapped questions stay in place", () => {
    // [H, Q2, P, Q4] → move Q2 down → [H, Q4, P, Q2]
    const state = makeState({ schemaVersion: 1, blocks: [h(1), q(2), p(3), q(4)] });
    const tr = buildMoveTransaction(state, posOfChild(state.doc, 1), "down");
    expect(tr).not.toBeNull();
    const next = state.apply(tr!);
    expect(order(next.doc)).toEqual([uid(1), uid(4), uid(3), uid(2)]);
  });

  it("swap is idempotent — swapping back returns to original order", () => {
    const original: CanonicalDocument = { schemaVersion: 1, blocks: [q(1), q(2), q(3)] };
    const state = makeState(original);
    const pos = posOfChild(state.doc, 1);
    const tr1 = buildMoveTransaction(state, pos, "up")!;
    const after1 = state.apply(tr1);
    const pos2 = posOfChild(after1.doc, 0); // Q2 is now at index 0
    const tr2 = buildMoveTransaction(after1, pos2, "down")!;
    const after2 = after1.apply(tr2);
    expect(order(after2.doc)).toEqual([uid(1), uid(2), uid(3)]);
  });
});

// ---------------------------------------------------------------------------
// buildStemImageTransaction
// ---------------------------------------------------------------------------

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
