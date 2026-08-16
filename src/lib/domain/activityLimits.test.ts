import { describe, it, expect } from "vitest";
import {
  MAX_ACTIVITY_CHARS,
  escapedLength,
  isActivityOverLimit,
} from "./activityLimits";

describe("escapedLength", () => {
  it("counts plain text as-is", () => {
    expect(escapedLength("abc")).toBe(3);
  });

  it("counts what the server will actually store, not the raw length", () => {
    // The server escapes BEFORE truncating, so `<` costs 4 chars, `&` costs 5.
    // Counting raw characters would let a document sail past the UI check and
    // still come back truncated.
    expect(escapedLength("<")).toBe(4); // &lt;
    expect(escapedLength("&")).toBe(5); // &amp;
    expect(escapedLength('"')).toBe(6); // &quot;
    expect(escapedLength("'")).toBe(5); // &#39;
  });

  it("does not double-escape the ampersand it introduces", () => {
    expect(escapedLength("&<")).toBe(5 + 4);
  });

  it("ignores leading/trailing whitespace, like the server's trim", () => {
    expect(escapedLength("  abc  ")).toBe(3);
  });
});

describe("isActivityOverLimit", () => {
  it("is false at exactly the limit", () => {
    expect(isActivityOverLimit("a".repeat(MAX_ACTIVITY_CHARS))).toBe(false);
  });

  it("is true one character past it", () => {
    expect(isActivityOverLimit("a".repeat(MAX_ACTIVITY_CHARS + 1))).toBe(true);
  });

  it("counts escaped length, so entity-heavy text trips earlier", () => {
    // 4000 `<` become 16000 escaped chars — over the limit despite being well
    // under it in raw characters.
    expect(isActivityOverLimit("<".repeat(4000))).toBe(true);
  });
});
