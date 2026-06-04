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
  stemInsertPos,
} from "./blockMove";

const schema = getEditorSchema();

const uid = (n: number): string =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

/** Build a doc with three paragraph blocks p1/p2/p3. */
const threeParagraphs: CanonicalDocument = {
  schemaVersion: 1,
  blocks: [
    { id: uid(1), type: "paragraph", content: [{ type: "text", text: "p1" }] },
    { id: uid(2), type: "paragraph", content: [{ type: "text", text: "p2" }] },
    { id: uid(3), type: "paragraph", content: [{ type: "text", text: "p3" }] },
  ],
};

function buildDoc(canonical: CanonicalDocument): PMNode {
  return PMNode.fromJSON(schema, canonicalToProseMirror(canonical));
}

/** Position right before the i-th top-level child (the value getPos() yields). */
function posOfChild(doc: PMNode, index: number): number {
  let pos = 0;
  for (let i = 0; i < index; i++) pos += doc.child(i).nodeSize;
  return pos;
}

describe("blockMove pure helpers", () => {
  describe("topLevelIndex", () => {
    it("returns 0/1/2 for the three top-level blocks", () => {
      const doc = buildDoc(threeParagraphs);
      expect(topLevelIndex(doc, posOfChild(doc, 0))).toBe(0);
      expect(topLevelIndex(doc, posOfChild(doc, 1))).toBe(1);
      expect(topLevelIndex(doc, posOfChild(doc, 2))).toBe(2);
    });
  });

  describe("canMoveUp / canMoveDown", () => {
    it("first block cannot move up, can move down", () => {
      const doc = buildDoc(threeParagraphs);
      const pos = posOfChild(doc, 0);
      expect(canMoveUp(doc, pos)).toBe(false);
      expect(canMoveDown(doc, pos)).toBe(true);
    });

    it("middle block can move both ways", () => {
      const doc = buildDoc(threeParagraphs);
      const pos = posOfChild(doc, 1);
      expect(canMoveUp(doc, pos)).toBe(true);
      expect(canMoveDown(doc, pos)).toBe(true);
    });

    it("last block can move up, cannot move down", () => {
      const doc = buildDoc(threeParagraphs);
      const pos = posOfChild(doc, 2);
      expect(canMoveUp(doc, pos)).toBe(true);
      expect(canMoveDown(doc, pos)).toBe(false);
    });
  });

  describe("moveTarget", () => {
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

  describe("stemInsertPos", () => {
    it("returns the position just inside the end of the question node", () => {
      const docWithQuestion: CanonicalDocument = {
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
      const doc = buildDoc(docWithQuestion);
      const pos = posOfChild(doc, 0);
      const question = doc.child(0);
      // end of question content = pos + 1 (open token) + content size
      expect(stemInsertPos(doc, pos)).toBe(pos + question.nodeSize - 1);
    });
  });
});
