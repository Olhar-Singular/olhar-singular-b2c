import { describe, it, expect } from "vitest";
import type { RichText } from "@/lib/adaptation/canonical/schema";
import { docFromRichText, richTextFromDoc, richTextEqual } from "./richTextFieldMapping";

const t = (text: string): RichText => [{ type: "text", text }];

describe("docFromRichText", () => {
  it("wraps the value in a single paragraph", () => {
    expect(docFromRichText(t("hi"))).toEqual({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "hi" }] }],
    });
  });

  it("maps marks + inline math into PM inline content", () => {
    expect(
      docFromRichText([
        { type: "text", text: "x", marks: ["bold"] },
        { type: "inlineMath", latex: "y^2" },
      ])
    ).toEqual({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "x", marks: [{ type: "bold" }] },
            { type: "inlineMath", attrs: { latex: "y^2" } },
          ],
        },
      ],
    });
  });
});

describe("richTextFromDoc", () => {
  it("reads the single paragraph's inline content", () => {
    const doc = docFromRichText([{ type: "text", text: "x", marks: ["bold"] }]);
    expect(richTextFromDoc(doc)).toEqual([{ type: "text", text: "x", marks: ["bold"] }]);
  });

  it("returns [] for an empty doc (no content array)", () => {
    expect(richTextFromDoc({ type: "doc" })).toEqual([]);
  });

  it("round-trips RichText -> doc -> RichText losslessly", () => {
    const value: RichText = [
      { type: "text", text: "a = ", marks: ["bold", "italic"], color: "#DC2626" },
      { type: "inlineMath", latex: "\\pi", alt: "pi" },
    ];
    expect(richTextFromDoc(docFromRichText(value))).toEqual(value);
  });
});

describe("richTextEqual", () => {
  it("is true for structurally equal RichText", () => {
    expect(richTextEqual(t("a"), [{ type: "text", text: "a" }])).toBe(true);
  });

  it("is false when they differ", () => {
    expect(richTextEqual(t("a"), t("b"))).toBe(false);
  });
});
