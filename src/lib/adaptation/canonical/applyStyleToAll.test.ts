import { describe, it, expect } from "vitest";
import type { CanonicalDocument, NodeStyle } from "./schema";
import { applyStyleToAllBlocks } from "./applyStyleToAll";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function baseDoc(): CanonicalDocument {
  return {
    schemaVersion: 1,
    blocks: [
      { id: id(1), type: "heading", level: 1, content: [{ type: "text", text: "T" }] },
      { id: id(2), type: "paragraph", content: [{ type: "text", text: "p" }] },
      {
        id: id(3),
        type: "question",
        stem: [{ id: id(4), type: "paragraph", content: [{ type: "text", text: "stem" }] }],
        answer: { kind: "open" },
      },
    ],
  };
}

describe("applyStyleToAllBlocks", () => {
  it("merges the style into every top-level block", () => {
    const style: NodeStyle = { align: "center" };
    const next = applyStyleToAllBlocks(baseDoc(), style);
    expect(next.blocks[0].style).toEqual({ align: "center" });
    expect(next.blocks[1].style).toEqual({ align: "center" });
    expect(next.blocks[2].style).toEqual({ align: "center" });
  });

  it("merges the style into question stem blocks too", () => {
    const next = applyStyleToAllBlocks(baseDoc(), { fontFamily: "serif" });
    const q = next.blocks[2] as Extract<CanonicalDocument["blocks"][number], { type: "question" }>;
    expect(q.stem[0].style).toEqual({ fontFamily: "serif" });
  });

  it("overrides only the provided keys, preserving other existing style keys", () => {
    const doc = baseDoc();
    doc.blocks[0].style = { fontSize: 12, align: "left" };
    const next = applyStyleToAllBlocks(doc, { align: "right" });
    expect(next.blocks[0].style).toEqual({ fontSize: 12, align: "right" });
  });

  it("merges into existing stem styles, preserving untouched keys", () => {
    const doc = baseDoc();
    const q = doc.blocks[2] as Extract<CanonicalDocument["blocks"][number], { type: "question" }>;
    q.stem[0].style = { color: "#DC2626" };
    const next = applyStyleToAllBlocks(doc, { fontSize: 20 });
    const nq = next.blocks[2] as Extract<CanonicalDocument["blocks"][number], { type: "question" }>;
    expect(nq.stem[0].style).toEqual({ color: "#DC2626", fontSize: 20 });
  });

  it("drops keys whose provided value is undefined (clearing a style)", () => {
    const doc = baseDoc();
    doc.blocks[0].style = { align: "center", fontSize: 14 };
    const next = applyStyleToAllBlocks(doc, { align: undefined });
    expect(next.blocks[0].style).toEqual({ fontSize: 14 });
  });

  it("removes the style object entirely when it becomes empty", () => {
    const doc = baseDoc();
    doc.blocks[0].style = { align: "center" };
    const next = applyStyleToAllBlocks(doc, { align: undefined });
    expect("style" in next.blocks[0]).toBe(false);
  });

  it("is idempotent in shape when applied twice", () => {
    const style: NodeStyle = { fontSize: 18 };
    const once = applyStyleToAllBlocks(baseDoc(), style);
    const twice = applyStyleToAllBlocks(once, style);
    expect(twice).toEqual(once);
  });

  it("does not mutate the input document", () => {
    const doc = baseDoc();
    const snapshot = JSON.stringify(doc);
    applyStyleToAllBlocks(doc, { align: "center" });
    expect(JSON.stringify(doc)).toBe(snapshot);
  });
});
