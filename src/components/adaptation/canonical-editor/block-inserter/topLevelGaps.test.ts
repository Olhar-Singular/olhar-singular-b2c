import { describe, it, expect } from "vitest";
import { Node as PMNode } from "@tiptap/pm/model";
import { getEditorSchema } from "@/lib/adaptation/tiptap/getEditorSchema";
import { canonicalToProseMirror } from "@/lib/adaptation/tiptap/fromCanonical";
import type { CanonicalDocument } from "@/lib/adaptation/canonical/schema";
import { topLevelGaps } from "./topLevelGaps";

const schema = getEditorSchema();

const uid = (n: number): string =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function buildDoc(canonical: CanonicalDocument): PMNode {
  return PMNode.fromJSON(schema, canonicalToProseMirror(canonical));
}

/** Position right before the i-th top-level child (the value getPos() yields). */
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

describe("topLevelGaps", () => {
  it("returns one gap before each block plus a trailing gap", () => {
    const doc = buildDoc(threeParagraphs);
    const gaps = topLevelGaps(doc);
    expect(gaps).toHaveLength(4); // 3 blocks → 3 leading gaps + 1 trailing
    expect(gaps.map((g) => g.index)).toEqual([0, 1, 2, 3]);
  });

  it("each leading gap points at the position before its following block", () => {
    const doc = buildDoc(threeParagraphs);
    const gaps = topLevelGaps(doc);
    expect(gaps[0]).toEqual({ index: 0, pos: posOfChild(doc, 0), followingPos: posOfChild(doc, 0) });
    expect(gaps[1]).toEqual({ index: 1, pos: posOfChild(doc, 1), followingPos: posOfChild(doc, 1) });
    expect(gaps[2]).toEqual({ index: 2, pos: posOfChild(doc, 2), followingPos: posOfChild(doc, 2) });
  });

  it("the trailing gap sits at the end of the doc content with no following block", () => {
    const doc = buildDoc(threeParagraphs);
    const gaps = topLevelGaps(doc);
    const trailing = gaps[gaps.length - 1];
    expect(trailing).toEqual({ index: 3, pos: doc.content.size, followingPos: null });
  });

  it("a single-block doc yields a leading and a trailing gap", () => {
    const doc = buildDoc({
      schemaVersion: 1,
      blocks: [{ id: uid(5), type: "paragraph", content: [{ type: "text", text: "x" }] }],
    });
    const gaps = topLevelGaps(doc);
    expect(gaps).toHaveLength(2);
    expect(gaps[0]).toEqual({ index: 0, pos: 0, followingPos: 0 });
    expect(gaps[1]).toMatchObject({ index: 1, followingPos: null });
  });
});
