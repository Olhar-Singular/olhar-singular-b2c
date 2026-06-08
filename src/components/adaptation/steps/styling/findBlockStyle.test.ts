import { describe, it, expect } from "vitest";
import type { CanonicalDocument } from "@/lib/adaptation/canonical/schema";
import { findBlockStyle } from "./findBlockStyle";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const doc: CanonicalDocument = {
  schemaVersion: 1,
  blocks: [
    { id: id(1), type: "paragraph", content: [{ type: "text", text: "p" }], style: { fontSize: 20 } },
    { id: id(2), type: "paragraph", content: [{ type: "text", text: "q" }] },
    {
      id: id(3),
      type: "question",
      answer: { kind: "open" },
      stem: [
        { id: id(4), type: "paragraph", content: [{ type: "text", text: "s" }], style: { align: "center" } },
        { id: id(5), type: "paragraph", content: [{ type: "text", text: "t" }] },
      ],
    },
  ],
};

describe("findBlockStyle", () => {
  it("returns the style of a top-level block", () => {
    expect(findBlockStyle(doc, id(1))).toEqual({ fontSize: 20 });
  });

  it("returns {} for a top-level block with no style", () => {
    expect(findBlockStyle(doc, id(2))).toEqual({});
  });

  it("returns the style of a stem block", () => {
    expect(findBlockStyle(doc, id(4))).toEqual({ align: "center" });
  });

  it("returns {} for a stem block with no style", () => {
    expect(findBlockStyle(doc, id(5))).toEqual({});
  });

  it("returns {} when the block id is not found", () => {
    expect(findBlockStyle(doc, id(999))).toEqual({});
  });
});
