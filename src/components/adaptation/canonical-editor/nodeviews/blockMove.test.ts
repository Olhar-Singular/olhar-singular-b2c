import { describe, it, expect } from "vitest";
import { Node as PMNode } from "@tiptap/pm/model";
import { getEditorSchema } from "@/lib/adaptation/tiptap/getEditorSchema";
import { canonicalToProseMirror } from "@/lib/adaptation/tiptap/fromCanonical";
import type { CanonicalDocument } from "@/lib/adaptation/canonical/schema";
import {
  topLevelIndex,
  canMoveUp,
  canMoveDown,
  moveTarget,
  questionSwapTarget,
  stemInsertPos,
} from "./blockMove";

const schema = getEditorSchema();

const uid = (n: number): string =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function buildDoc(canonical: CanonicalDocument): PMNode {
  return PMNode.fromJSON(schema, canonicalToProseMirror(canonical));
}

/** Position right before the i-th top-level child. */
function posOfChild(doc: PMNode, index: number): number {
  let pos = 0;
  for (let i = 0; i < index; i++) pos += doc.child(i).nodeSize;
  return pos;
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
  content: [{ type: "text", text: `heading${n}` }],
});

/** [Q1, Q2, Q3] — all questions, no non-question blocks. */
const threeQuestions: CanonicalDocument = {
  schemaVersion: 1,
  blocks: [q(1), q(2), q(3)],
};

/** [H, Q1, P, Q2] — mixed: heading, question, paragraph, question. */
const mixedDoc: CanonicalDocument = {
  schemaVersion: 1,
  blocks: [h(1), q(2), p(3), q(4)],
};

/** [H, Q1, H] — question surrounded by non-question blocks. */
const singleQuestion: CanonicalDocument = {
  schemaVersion: 1,
  blocks: [h(1), q(2), h(3)],
};

/** [Q1, P, Q2, H, Q3] — questions with non-question blocks in between. */
const spreadQuestions: CanonicalDocument = {
  schemaVersion: 1,
  blocks: [q(1), p(2), q(3), h(4), q(5)],
};

/** Three plain paragraphs — used for the general `moveTarget` utility tests. */
const threeParagraphs: CanonicalDocument = {
  schemaVersion: 1,
  blocks: [
    { id: uid(11), type: "paragraph", content: [{ type: "text", text: "p1" }] },
    { id: uid(12), type: "paragraph", content: [{ type: "text", text: "p2" }] },
    { id: uid(13), type: "paragraph", content: [{ type: "text", text: "p3" }] },
  ],
};

describe("topLevelIndex", () => {
  it("returns 0/1/2 for the three top-level blocks", () => {
    const doc = buildDoc(threeQuestions);
    expect(topLevelIndex(doc, posOfChild(doc, 0))).toBe(0);
    expect(topLevelIndex(doc, posOfChild(doc, 1))).toBe(1);
    expect(topLevelIndex(doc, posOfChild(doc, 2))).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// canMoveUp / canMoveDown — question-aware
// ---------------------------------------------------------------------------

describe("canMoveUp — question-aware", () => {
  it("first question (no question above) → false", () => {
    const doc = buildDoc(threeQuestions);
    expect(canMoveUp(doc, posOfChild(doc, 0))).toBe(false);
  });

  it("middle question (question above) → true", () => {
    const doc = buildDoc(threeQuestions);
    expect(canMoveUp(doc, posOfChild(doc, 1))).toBe(true);
  });

  it("last question (question above) → true", () => {
    const doc = buildDoc(threeQuestions);
    expect(canMoveUp(doc, posOfChild(doc, 2))).toBe(true);
  });

  it("question with only non-question blocks above → false", () => {
    // mixedDoc = [H, Q1, P, Q2] — Q1 at index 1, no question above
    const doc = buildDoc(mixedDoc);
    expect(canMoveUp(doc, posOfChild(doc, 1))).toBe(false);
  });

  it("question with a question above (non-questions in between) → true", () => {
    // mixedDoc = [H, Q1, P, Q2] — Q2 at index 3, Q1 is above
    const doc = buildDoc(mixedDoc);
    expect(canMoveUp(doc, posOfChild(doc, 3))).toBe(true);
  });

  it("only question in doc (surrounded by headings) → false", () => {
    const doc = buildDoc(singleQuestion);
    expect(canMoveUp(doc, posOfChild(doc, 1))).toBe(false);
  });
});

describe("canMoveDown — question-aware", () => {
  it("last question (no question below) → false", () => {
    const doc = buildDoc(threeQuestions);
    expect(canMoveDown(doc, posOfChild(doc, 2))).toBe(false);
  });

  it("middle question (question below) → true", () => {
    const doc = buildDoc(threeQuestions);
    expect(canMoveDown(doc, posOfChild(doc, 1))).toBe(true);
  });

  it("first question (question below) → true", () => {
    const doc = buildDoc(threeQuestions);
    expect(canMoveDown(doc, posOfChild(doc, 0))).toBe(true);
  });

  it("question with only non-question blocks below → false", () => {
    // mixedDoc = [H, Q1, P, Q2] — Q2 at index 3, only heading below (none actually)
    // Actually Q2 IS the last block, so false
    const doc = buildDoc(mixedDoc);
    expect(canMoveDown(doc, posOfChild(doc, 3))).toBe(false);
  });

  it("question with a question below (non-questions in between) → true", () => {
    // mixedDoc = [H, Q1, P, Q2] — Q1 at index 1, Q2 is below
    const doc = buildDoc(mixedDoc);
    expect(canMoveDown(doc, posOfChild(doc, 1))).toBe(true);
  });

  it("only question in doc (surrounded by headings) → false", () => {
    const doc = buildDoc(singleQuestion);
    expect(canMoveDown(doc, posOfChild(doc, 1))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// questionSwapTarget — finds the two nodes to swap
// ---------------------------------------------------------------------------

describe("questionSwapTarget", () => {
  it("returns null when moving up from the first question", () => {
    const doc = buildDoc(threeQuestions);
    expect(questionSwapTarget(doc, posOfChild(doc, 0), "up")).toBeNull();
  });

  it("returns null when moving down from the last question", () => {
    const doc = buildDoc(threeQuestions);
    expect(questionSwapTarget(doc, posOfChild(doc, 2), "down")).toBeNull();
  });

  it("moving Q2 up → target pairs Q1 (posFirst) and Q2 (posSecond)", () => {
    const doc = buildDoc(threeQuestions);
    const t = questionSwapTarget(doc, posOfChild(doc, 1), "up");
    expect(t).not.toBeNull();
    expect(t!.posFirst).toBe(posOfChild(doc, 0));
    expect(t!.nodeFirst.attrs.id).toBe(uid(1));  // Q1
    expect(t!.posSecond).toBe(posOfChild(doc, 1));
    expect(t!.nodeSecond.attrs.id).toBe(uid(2)); // Q2
  });

  it("moving Q2 down → target pairs Q2 (posFirst) and Q3 (posSecond)", () => {
    const doc = buildDoc(threeQuestions);
    const t = questionSwapTarget(doc, posOfChild(doc, 1), "down");
    expect(t).not.toBeNull();
    expect(t!.posFirst).toBe(posOfChild(doc, 1));
    expect(t!.nodeFirst.attrs.id).toBe(uid(2));  // Q2
    expect(t!.posSecond).toBe(posOfChild(doc, 2));
    expect(t!.nodeSecond.attrs.id).toBe(uid(3)); // Q3
  });

  it("skips non-question blocks — Q4 moving up in [H, Q2, P, Q4]", () => {
    // mixedDoc = [H(1), Q(2), P(3), Q(4)]
    const doc = buildDoc(mixedDoc);
    const t = questionSwapTarget(doc, posOfChild(doc, 3), "up");
    expect(t).not.toBeNull();
    expect(t!.nodeFirst.attrs.id).toBe(uid(2));  // Q2 is the nearest question above Q4
    expect(t!.nodeSecond.attrs.id).toBe(uid(4)); // Q4 is the current question
  });

  it("skips multiple non-question blocks in spread doc", () => {
    // spreadQuestions = [Q1, P, Q3, H, Q5]
    const doc = buildDoc(spreadQuestions);
    // Q5 (index 4) moving up → nearest question above is Q3 (index 2)
    const t = questionSwapTarget(doc, posOfChild(doc, 4), "up");
    expect(t).not.toBeNull();
    expect(t!.nodeFirst.attrs.id).toBe(uid(3));  // Q3
    expect(t!.nodeSecond.attrs.id).toBe(uid(5)); // Q5
  });

  it("always returns posFirst < posSecond regardless of direction", () => {
    const doc = buildDoc(threeQuestions);
    const up = questionSwapTarget(doc, posOfChild(doc, 2), "up");
    const down = questionSwapTarget(doc, posOfChild(doc, 0), "down");
    expect(up!.posFirst).toBeLessThan(up!.posSecond);
    expect(down!.posFirst).toBeLessThan(down!.posSecond);
  });
});

// ---------------------------------------------------------------------------
// moveTarget — general adjacent-block utility (unchanged semantics)
// ---------------------------------------------------------------------------

describe("moveTarget (general adjacent-block utility)", () => {
  it("moving up returns the node range and the previous sibling's start", () => {
    const doc = buildDoc(threeParagraphs);
    const pos = posOfChild(doc, 1);
    const node = doc.child(1);
    const t = moveTarget(doc, pos, "up");
    expect(t).toEqual({ from: pos, to: pos + node.nodeSize, insert: posOfChild(doc, 0) });
  });

  it("moving down returns the node range and the position after the next sibling", () => {
    const doc = buildDoc(threeParagraphs);
    const pos = posOfChild(doc, 1);
    const node = doc.child(1);
    const next = doc.child(2);
    const t = moveTarget(doc, pos, "down");
    expect(t).toEqual({
      from: pos,
      to: pos + node.nodeSize,
      insert: pos + node.nodeSize + next.nodeSize,
    });
  });

  it("returns null when the move is not possible (first up / last down)", () => {
    const doc = buildDoc(threeParagraphs);
    expect(moveTarget(doc, posOfChild(doc, 0), "up")).toBeNull();
    expect(moveTarget(doc, posOfChild(doc, 2), "down")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// stemInsertPos
// ---------------------------------------------------------------------------

describe("stemInsertPos", () => {
  it("returns the position just inside the end of the question node", () => {
    const doc = buildDoc(threeQuestions);
    const pos = posOfChild(doc, 0);
    const question = doc.child(0);
    expect(stemInsertPos(doc, pos)).toBe(pos + question.nodeSize - 1);
  });
});
