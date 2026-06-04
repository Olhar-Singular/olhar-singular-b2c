import { describe, it, expect } from "vitest";
import {
  questionOrdinal,
  captionFromPlain,
  latexToHtml,
  inlineLatexToHtml,
  type OrdinalDoc,
} from "./nodeViewUtils";
import { renderLatexToHtml } from "@/lib/domain/latexRenderer";
import type { RichText } from "@/lib/adaptation/canonical/schema";

describe("questionOrdinal", () => {
  /** Build a fake doc from a list of [typeName, pos] node descriptors. */
  const docOf = (nodes: Array<[string, number]>): OrdinalDoc => ({
    descendants(fn) {
      for (const [name, pos] of nodes) fn({ type: { name } }, pos);
    },
  });

  it("returns 1 for the first question (no questions before it)", () => {
    const doc = docOf([
      ["paragraph", 0],
      ["question", 1],
      ["question", 10],
    ]);
    expect(questionOrdinal(doc, 1)).toBe(1);
  });

  it("counts only question nodes positioned before the target", () => {
    const doc = docOf([
      ["question", 0],
      ["paragraph", 5],
      ["question", 8],
      ["question", 20],
    ]);
    expect(questionOrdinal(doc, 8)).toBe(2);
    expect(questionOrdinal(doc, 20)).toBe(3);
  });

  it("ignores non-question nodes before the target", () => {
    const doc = docOf([
      ["heading", 0],
      ["paragraph", 2],
      ["question", 6],
    ]);
    expect(questionOrdinal(doc, 6)).toBe(1);
  });
});

describe("captionFromPlain", () => {
  it("returns undefined for empty string (no existing)", () => {
    expect(captionFromPlain(undefined, "")).toBeUndefined();
  });
  it("wraps changed text into a plain RichText", () => {
    expect(captionFromPlain(undefined, "hi")).toEqual([{ type: "text", text: "hi" }]);
  });
  it("preserves the existing RichText (marks/inlineMath) when the plain text is unchanged", () => {
    const existing: RichText = [
      { type: "text", text: "x = ", marks: ["bold"] },
      { type: "inlineMath", latex: "x^2" },
    ];
    // richTextToPlain(existing) === "x = $x^2$"
    expect(captionFromPlain(existing, "x = $x^2$")).toBe(existing);
  });
  it("flattens to a plain run when the visible text actually changed", () => {
    const existing: RichText = [{ type: "text", text: "hi", marks: ["bold"] }];
    expect(captionFromPlain(existing, "bye")).toEqual([{ type: "text", text: "bye" }]);
  });
  it("clears the caption when the existing text is emptied", () => {
    const existing: RichText = [{ type: "text", text: "hi" }];
    expect(captionFromPlain(existing, "")).toBeUndefined();
  });
});

describe("latexToHtml", () => {
  it("renders bare KaTeX in display mode, identical to the read-only renderer", () => {
    // Same engine + displayMode as BlockMathView so editor preview can never
    // diverge from the final render.
    expect(latexToHtml("a+b")).toBe(renderLatexToHtml("a+b", true));
  });
});

describe("inlineLatexToHtml", () => {
  it("renders bare KaTeX inline, identical to the read-only RichTextView", () => {
    expect(inlineLatexToHtml("x^2")).toBe(renderLatexToHtml("x^2", false));
  });
});
