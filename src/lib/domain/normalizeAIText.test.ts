import { describe, it, expect } from "vitest";
import { normalizeAIText } from "./normalizeAIText";

describe("normalizeAIText", () => {
  it("returns plain text unchanged", () => {
    expect(normalizeAIText("Hello world")).toBe("Hello world");
  });

  it("strips zero-width space (U+200B)", () => {
    expect(normalizeAIText("foo​bar")).toBe("foobar");
  });

  it("strips zero-width non-joiner (U+200C) and joiner (U+200D)", () => {
    expect(normalizeAIText("a‌b‍c")).toBe("abc");
  });

  it("strips BOM / ZERO WIDTH NO-BREAK SPACE (U+FEFF)", () => {
    expect(normalizeAIText("﻿start")).toBe("start");
  });

  it("strips form feed (\\f / 0x0C)", () => {
    expect(normalizeAIText("page1\fpage2")).toBe("page1page2");
  });

  it("normalizes CRLF line endings to LF", () => {
    expect(normalizeAIText("line1\r\nline2\r\nline3")).toBe("line1\nline2\nline3");
  });

  it("normalizes lone CR to LF", () => {
    expect(normalizeAIText("line1\rline2")).toBe("line1\nline2");
  });

  it("preserves existing LF line endings", () => {
    expect(normalizeAIText("a\nb\nc")).toBe("a\nb\nc");
  });

  it("handles mixed special characters in a single pass", () => {
    const input = "﻿foo​\r\nbar\fbaz\r";
    expect(normalizeAIText(input)).toBe("foo\nbarbaz\n");
  });

  it("returns empty string for empty input", () => {
    expect(normalizeAIText("")).toBe("");
  });
});
