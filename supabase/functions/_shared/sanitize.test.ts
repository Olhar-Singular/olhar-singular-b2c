import { describe, it, expect } from "vitest";
import { sanitize } from "./sanitize";

describe("sanitize", () => {
  it("neutralizes script tags (no executable markup survives)", () => {
    const out = sanitize("<script>alert(1)</script>texto");
    expect(out).not.toContain("<script>");
    expect(out).not.toContain("</script>");
    // The literal angle brackets must be escaped, not present as raw tag boundaries.
    expect(out).not.toMatch(/<[a-zA-Z/]/);
    // The visible text content is preserved.
    expect(out).toContain("alert(1)");
    expect(out).toContain("texto");
  });

  it("preserves the meaning of a less-than inequality (x < 5)", () => {
    const out = sanitize("x < 5");
    // The character information survives as an HTML entity, not deleted.
    expect(out).toBe("x &lt; 5");
  });

  it("preserves greater-than in inequalities (x > 5)", () => {
    expect(sanitize("x > 5")).toBe("x &gt; 5");
  });

  it("preserves an ampersand expression (a & b)", () => {
    expect(sanitize("a & b")).toBe("a &amp; b");
  });

  it("preserves ordered pairs / ranges like 2 < x < 5", () => {
    expect(sanitize("2 < x < 5")).toBe("2 &lt; x &lt; 5");
  });

  it("escapes double and single quotes", () => {
    expect(sanitize(`say "hi" it's`)).toBe("say &quot;hi&quot; it&#39;s");
  });

  it("escapes ampersand first so existing escapes are not double-confused", () => {
    // A lone & must become &amp; and angle brackets their own entities.
    expect(sanitize("a < b & c > d")).toBe("a &lt; b &amp; c &gt; d");
  });

  it("trims leading and trailing whitespace", () => {
    expect(sanitize("   hello world   ")).toBe("hello world");
  });

  it("respects maxLength (default 5000), counting escaped output", () => {
    const long = "a".repeat(6000);
    expect(sanitize(long)).toHaveLength(5000);
  });

  it("respects custom maxLength", () => {
    expect(sanitize("abcdefghij", 5)).toBe("abcde");
  });

  it("returns empty string for empty input", () => {
    expect(sanitize("")).toBe("");
  });

  it("preserves unicode characters", () => {
    expect(sanitize("açúcar é doce")).toBe("açúcar é doce");
  });

  it("preserves math text untouched when no special chars", () => {
    expect(sanitize("frac 1 2 plus 1 4")).toBe("frac 1 2 plus 1 4");
  });
});
