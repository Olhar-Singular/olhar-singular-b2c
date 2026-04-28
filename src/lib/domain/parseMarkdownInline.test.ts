import { describe, it, expect } from "vitest";
import { parseMarkdownInline } from "./parseMarkdownInline";

describe("parseMarkdownInline", () => {
  it("returns undefined when there are no markdown markers", () => {
    expect(parseMarkdownInline("just plain text")).toBeUndefined();
  });

  it("returns undefined when no asterisks are present", () => {
    expect(parseMarkdownInline("nothing fancy here")).toBeUndefined();
  });

  it("parses bold (**text**)", () => {
    const runs = parseMarkdownInline("hello **world**");
    expect(runs).toEqual([
      { text: "hello " },
      { text: "world", bold: true },
    ]);
  });

  it("parses italic (*text*)", () => {
    const runs = parseMarkdownInline("plain *italic* end");
    expect(runs).toEqual([
      { text: "plain " },
      { text: "italic", italic: true },
      { text: " end" },
    ]);
  });

  it("parses bold-italic (***text***)", () => {
    const runs = parseMarkdownInline("***strong-em***");
    expect(runs).toEqual([{ text: "strong-em", bold: true, italic: true }]);
  });

  it("does not treat italic markers inside bold spans as separate spans", () => {
    const runs = parseMarkdownInline("**hello** *world*");
    expect(runs).toEqual([
      { text: "hello", bold: true },
      { text: " " },
      { text: "world", italic: true },
    ]);
  });

  it("parses multiple bold spans on the same line", () => {
    const runs = parseMarkdownInline("**a** y **b**");
    expect(runs).toEqual([
      { text: "a", bold: true },
      { text: " y " },
      { text: "b", bold: true },
    ]);
  });

  it("returns undefined when no spans contain bold or italic", () => {
    expect(parseMarkdownInline("only * lonely asterisks")).toBeUndefined();
  });

  it("handles text with no leading plain content", () => {
    const runs = parseMarkdownInline("**bold** rest");
    expect(runs?.[0]).toEqual({ text: "bold", bold: true });
  });

  it("handles trailing plain content after a span", () => {
    const runs = parseMarkdownInline("**bold** trailing");
    expect(runs?.[runs.length - 1]).toEqual({ text: " trailing" });
  });
});
