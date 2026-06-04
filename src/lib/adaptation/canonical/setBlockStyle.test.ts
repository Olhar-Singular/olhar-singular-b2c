import { describe, it, expect } from "vitest";
import { setBlockStyle } from "./style";
import { validateDocument } from "./validate";
import type { CanonicalDocument } from "./schema";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function baseDoc(): CanonicalDocument {
  return {
    schemaVersion: 1,
    blocks: [
      { id: id(1), type: "paragraph", content: [{ type: "text", text: "p1" }] },
      {
        id: id(2),
        type: "question",
        stem: [{ id: id(3), type: "paragraph", content: [{ type: "text", text: "stem" }] }],
        answer: {
          kind: "multipleChoice",
          alternatives: [
            {
              id: id(4),
              content: [{ type: "text", text: "alt" }],
              correct: true,
              nested: [{ id: id(5), type: "paragraph", content: [{ type: "text", text: "nested" }] }],
            },
            { id: id(6), content: [{ type: "text", text: "alt2" }], correct: false },
          ],
        },
      },
    ],
  };
}

describe("setBlockStyle", () => {
  it("sets the style on a top-level block", () => {
    const next = setBlockStyle(baseDoc(), id(1), { align: "center", fontSize: 18 });
    expect(next.blocks[0].style).toEqual({ align: "center", fontSize: 18 });
    expect(validateDocument(next)).toBeTruthy();
  });

  it("does not mutate the original document", () => {
    const doc = baseDoc();
    setBlockStyle(doc, id(1), { align: "right" });
    expect(doc.blocks[0].style).toBeUndefined();
  });

  it("sets the style on a block inside a question stem", () => {
    const next = setBlockStyle(baseDoc(), id(3), { color: "#DC2626" });
    const q = next.blocks[1] as Extract<CanonicalDocument["blocks"][number], { type: "question" }>;
    expect(q.stem[0].style).toEqual({ color: "#DC2626" });
    expect(validateDocument(next)).toBeTruthy();
  });

  it("sets the style on a block nested inside a multipleChoice alternative", () => {
    const next = setBlockStyle(baseDoc(), id(5), { fontSize: 20 });
    const q = next.blocks[1] as Extract<CanonicalDocument["blocks"][number], { type: "question" }>;
    const alt = (q.answer as { alternatives: Array<{ nested?: Array<{ style?: unknown }> }> }).alternatives[0];
    expect(alt.nested?.[0].style).toEqual({ fontSize: 20 });
    expect(validateDocument(next)).toBeTruthy();
  });

  it("removes the style when given an empty object", () => {
    const withStyle = setBlockStyle(baseDoc(), id(1), { align: "center" });
    expect(withStyle.blocks[0].style).toBeDefined();
    const cleared = setBlockStyle(withStyle, id(1), {});
    expect(cleared.blocks[0].style).toBeUndefined();
    expect(validateDocument(cleared)).toBeTruthy();
  });

  it("returns an equivalent document when the id does not match", () => {
    const next = setBlockStyle(baseDoc(), id(99), { align: "left" });
    expect(validateDocument(next)).toBeTruthy();
    expect(next.blocks[0].style).toBeUndefined();
  });

  it("leaves questions without nested alternatives untouched", () => {
    const next = setBlockStyle(baseDoc(), id(2), { spacingAfter: 8 });
    const q = next.blocks[1] as Extract<CanonicalDocument["blocks"][number], { type: "question" }>;
    expect(q.style).toEqual({ spacingAfter: 8 });
    const alt2 = (q.answer as { alternatives: Array<{ nested?: unknown }> }).alternatives[1];
    expect(alt2.nested).toBeUndefined();
  });
});
