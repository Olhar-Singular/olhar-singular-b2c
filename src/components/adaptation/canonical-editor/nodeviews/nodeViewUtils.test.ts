import { describe, it, expect } from "vitest";
import { parsePositiveNumber, captionFromPlain, latexToHtml, inlineLatexToHtml } from "./nodeViewUtils";
import { renderLatexToHtml } from "@/lib/domain/latexRenderer";
import type { RichText } from "@/lib/adaptation/canonical/schema";

describe("parsePositiveNumber", () => {
  it("returns a positive number", () => {
    expect(parsePositiveNumber("3")).toBe(3);
  });
  it("returns null for zero/negative/non-numeric", () => {
    expect(parsePositiveNumber("0")).toBeNull();
    expect(parsePositiveNumber("-2")).toBeNull();
    expect(parsePositiveNumber("abc")).toBeNull();
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
