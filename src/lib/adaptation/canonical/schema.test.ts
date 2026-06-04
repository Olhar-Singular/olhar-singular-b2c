import { describe, it, expect } from "vitest";
import { RichText, Inline } from "./schema";
import { ALLOWED_COLORS } from "./colors";

describe("RichText / Inline", () => {
  it("accepts a plain text inline node", () => {
    const result = RichText.safeParse([{ type: "text", text: "hello" }]);
    expect(result.success).toBe(true);
  });

  it("accepts text with marks", () => {
    const result = RichText.safeParse([
      { type: "text", text: "a", marks: ["bold"] },
    ]);
    expect(result.success).toBe(true);
  });

  it("accepts text with multiple marks", () => {
    const result = RichText.safeParse([
      { type: "text", text: "a", marks: ["bold", "italic", "underline", "strike"] },
    ]);
    expect(result.success).toBe(true);
  });

  it("accepts text with an allowed color", () => {
    const result = RichText.safeParse([
      { type: "text", text: "a", color: ALLOWED_COLORS[0] },
    ]);
    expect(result.success).toBe(true);
  });

  it("rejects text with a color outside the allowlist", () => {
    const result = RichText.safeParse([
      { type: "text", text: "a", color: "#000000" },
    ]);
    expect(result.success).toBe(false);
  });

  it("rejects text with an unknown mark", () => {
    const result = RichText.safeParse([
      { type: "text", text: "a", marks: ["superscript"] },
    ]);
    expect(result.success).toBe(false);
  });

  it("accepts an inlineMath node", () => {
    const result = RichText.safeParse([{ type: "inlineMath", latex: "x^2" }]);
    expect(result.success).toBe(true);
  });

  it("accepts inlineMath with optional alt", () => {
    const result = RichText.safeParse([
      { type: "inlineMath", latex: "x^2", alt: "x squared" },
    ]);
    expect(result.success).toBe(true);
  });

  it("rejects inlineMath with empty latex", () => {
    const result = RichText.safeParse([{ type: "inlineMath", latex: "" }]);
    expect(result.success).toBe(false);
  });

  it("accepts a mixed array of inline nodes", () => {
    const result = RichText.safeParse([
      { type: "text", text: "hello " },
      { type: "inlineMath", latex: "x^2" },
    ]);
    expect(result.success).toBe(true);
  });

  it("rejects an inline node with unknown type", () => {
    const result = Inline.safeParse({ type: "unknown", text: "a" });
    expect(result.success).toBe(false);
  });
});
