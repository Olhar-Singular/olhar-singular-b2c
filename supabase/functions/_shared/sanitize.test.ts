import { describe, it, expect } from "vitest";
import { sanitize } from "./sanitize";

describe("sanitize", () => {
  it("removes HTML tags from input", () => {
    expect(sanitize("<script>alert(1)</script>texto")).toBe("alert(1)texto");
  });

  it("strips < > \" ' & characters that remain after tag removal", () => {
    // <b> is removed by the tag regex; remaining chars: a, c, ", d, ', e, &, f
    // Then the second pass strips < > " ' & — leaving: a c d e f
    expect(sanitize("a<b>c\"d'e&f")).toBe("acdef");
  });

  it("trims leading and trailing whitespace", () => {
    expect(sanitize("   hello world   ")).toBe("hello world");
  });

  it("respects maxLength (default 5000)", () => {
    const long = "a".repeat(6000);
    expect(sanitize(long)).toHaveLength(5000);
  });

  it("respects custom maxLength", () => {
    expect(sanitize("abcdefghij", 5)).toBe("abcde");
  });

  it("returns empty string for empty input", () => {
    expect(sanitize("")).toBe("");
  });

  it("removes nested tag combinations", () => {
    expect(sanitize("<p><b>bold</b></p>")).toBe("bold");
  });

  it("preserves unicode characters that are not in the strip list", () => {
    expect(sanitize("açúcar é doce")).toBe("açúcar é doce");
  });
});
