import { describe, it, expect } from "vitest";
import {
  RichTextSchema,
  InlineSchema,
  isSafeImageSrc,
  CanonicalDocumentSchema,
  PageStyleSchema,
  DocumentHeaderSchema,
  AdaptationResultSchema,
  SCHEMA_VERSION,
} from "./schema";
import { ALLOWED_COLORS } from "./colors";

const uuid = (n: number): string =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const baseResult = () => ({
  schemaVersion: SCHEMA_VERSION,
  document: {
    schemaVersion: SCHEMA_VERSION,
    blocks: [{ id: uuid(1), type: "paragraph", content: [{ type: "text", text: "oi" }] }],
  },
  strategies_applied: [],
  pedagogical_justification: "",
  implementation_tips: [],
});

function imageDoc(src: string) {
  return {
    schemaVersion: 1,
    blocks: [{ id: uuid(1), type: "image", src, alt: "" }],
  };
}

describe("isSafeImageSrc", () => {
  it("accepts https URLs", () => {
    expect(isSafeImageSrc("https://example.com/a.png")).toBe(true);
  });

  it("accepts http URLs", () => {
    expect(isSafeImageSrc("http://example.com/a.png")).toBe(true);
  });

  it("accepts data:image URLs", () => {
    expect(isSafeImageSrc("data:image/png;base64,AAAA")).toBe(true);
  });

  it("is case-insensitive and trims surrounding whitespace", () => {
    expect(isSafeImageSrc("  HTTPS://Example.com/A.PNG  ")).toBe(true);
    expect(isSafeImageSrc("DATA:IMAGE/PNG;base64,AAAA")).toBe(true);
  });

  it("rejects javascript: URLs", () => {
    expect(isSafeImageSrc("javascript:alert(1)")).toBe(false);
  });

  it("rejects vbscript: URLs", () => {
    expect(isSafeImageSrc("vbscript:msgbox(1)")).toBe(false);
  });

  it("rejects non-image data: URLs", () => {
    expect(isSafeImageSrc("data:text/html,<script>alert(1)</script>")).toBe(false);
  });

  it("rejects a bare/relative path", () => {
    expect(isSafeImageSrc("not-a-url")).toBe(false);
  });
});

describe("image block src allowlist (schema)", () => {
  it("accepts an https image src", () => {
    expect(CanonicalDocumentSchema.safeParse(imageDoc("https://x.com/a.png")).success).toBe(true);
  });

  it("accepts a data:image src", () => {
    expect(CanonicalDocumentSchema.safeParse(imageDoc("data:image/png;base64,AAAA")).success).toBe(
      true,
    );
  });

  it("rejects a javascript: image src", () => {
    expect(CanonicalDocumentSchema.safeParse(imageDoc("javascript:alert(1)")).success).toBe(false);
  });

  it("rejects a data:text image src", () => {
    expect(CanonicalDocumentSchema.safeParse(imageDoc("data:text/html,x")).success).toBe(false);
  });
});

describe("RichText / Inline", () => {
  it("accepts a plain text inline node", () => {
    const result = RichTextSchema.safeParse([{ type: "text", text: "hello" }]);
    expect(result.success).toBe(true);
  });

  it("accepts text with marks", () => {
    const result = RichTextSchema.safeParse([
      { type: "text", text: "a", marks: ["bold"] },
    ]);
    expect(result.success).toBe(true);
  });

  it("accepts text with multiple marks", () => {
    const result = RichTextSchema.safeParse([
      { type: "text", text: "a", marks: ["bold", "italic", "underline", "strike"] },
    ]);
    expect(result.success).toBe(true);
  });

  it("accepts text with an allowed color", () => {
    const result = RichTextSchema.safeParse([
      { type: "text", text: "a", color: ALLOWED_COLORS[0] },
    ]);
    expect(result.success).toBe(true);
  });

  it("rejects text with a color outside the allowlist", () => {
    const result = RichTextSchema.safeParse([
      { type: "text", text: "a", color: "#000000" },
    ]);
    expect(result.success).toBe(false);
  });

  it("rejects text with an unknown mark", () => {
    const result = RichTextSchema.safeParse([
      { type: "text", text: "a", marks: ["superscript"] },
    ]);
    expect(result.success).toBe(false);
  });

  it("accepts an inlineMath node", () => {
    const result = RichTextSchema.safeParse([{ type: "inlineMath", latex: "x^2" }]);
    expect(result.success).toBe(true);
  });

  it("accepts inlineMath with optional alt", () => {
    const result = RichTextSchema.safeParse([
      { type: "inlineMath", latex: "x^2", alt: "x squared" },
    ]);
    expect(result.success).toBe(true);
  });

  it("rejects inlineMath with empty latex", () => {
    const result = RichTextSchema.safeParse([{ type: "inlineMath", latex: "" }]);
    expect(result.success).toBe(false);
  });

  it("accepts a mixed array of inline nodes", () => {
    const result = RichTextSchema.safeParse([
      { type: "text", text: "hello " },
      { type: "inlineMath", latex: "x^2" },
    ]);
    expect(result.success).toBe(true);
  });

  it("rejects an inline node with unknown type", () => {
    const result = InlineSchema.safeParse({ type: "unknown", text: "a" });
    expect(result.success).toBe(false);
  });
});

describe("PageStyleSchema", () => {
  it("accepts a fully specified page style", () => {
    const result = PageStyleSchema.safeParse({
      fontFamily: "lexend",
      fontSize: 13,
      blockSpacing: 20,
    });
    expect(result.success).toBe(true);
  });

  it("accepts an empty object (all fields optional)", () => {
    expect(PageStyleSchema.safeParse({}).success).toBe(true);
  });

  it("rejects unknown keys (strict)", () => {
    expect(PageStyleSchema.safeParse({ color: "#fff" }).success).toBe(false);
  });

  it("rejects a non-positive fontSize", () => {
    expect(PageStyleSchema.safeParse({ fontSize: 0 }).success).toBe(false);
  });

  it("rejects a negative blockSpacing", () => {
    expect(PageStyleSchema.safeParse({ blockSpacing: -1 }).success).toBe(false);
  });

  it("accepts elementFontSizes with all four keys", () => {
    const result = PageStyleSchema.safeParse({
      elementFontSizes: { stem: 14, instruction: 10, alternative: 12, caption: 9 },
    });
    expect(result.success).toBe(true);
  });

  it("accepts elementFontSizes with a subset of keys", () => {
    expect(PageStyleSchema.safeParse({ elementFontSizes: { stem: 13 } }).success).toBe(true);
  });

  it("rejects elementFontSizes with unknown keys (strict)", () => {
    expect(PageStyleSchema.safeParse({ elementFontSizes: { unknown: 12 } }).success).toBe(false);
  });

  it("rejects elementFontSizes.stem that is not positive", () => {
    expect(PageStyleSchema.safeParse({ elementFontSizes: { stem: 0 } }).success).toBe(false);
  });
});

describe("DocumentHeaderSchema", () => {
  it("accepts a fully specified header", () => {
    const result = DocumentHeaderSchema.safeParse({
      title: "Prova de Matemática",
      school: "Escola Singular",
      teacher: "Ana",
      date: "2026-06-27",
    });
    expect(result.success).toBe(true);
  });

  it("accepts an empty object (all fields optional)", () => {
    expect(DocumentHeaderSchema.safeParse({}).success).toBe(true);
  });

  it("rejects unknown keys (strict)", () => {
    expect(DocumentHeaderSchema.safeParse({ subtitle: "x" }).success).toBe(false);
  });

  it("rejects a non-string field", () => {
    expect(DocumentHeaderSchema.safeParse({ title: 42 }).success).toBe(false);
  });
});

describe("AdaptationResultSchema — header (additive, optional)", () => {
  it("accepts a result WITHOUT header (back-compat)", () => {
    expect(AdaptationResultSchema.safeParse(baseResult()).success).toBe(true);
  });

  it("does not inject a header default (round-trip identity)", () => {
    const input = baseResult();
    const parsed = AdaptationResultSchema.parse(input);
    expect("header" in parsed).toBe(false);
  });

  it("accepts a result WITH a header sibling", () => {
    const input = {
      ...baseResult(),
      header: { title: "Prova", school: "Escola", teacher: "Ana", date: "2026-06-27" },
    };
    const parsed = AdaptationResultSchema.parse(input);
    expect(parsed.header).toEqual({
      title: "Prova",
      school: "Escola",
      teacher: "Ana",
      date: "2026-06-27",
    });
  });
});

describe("AdaptationResultSchema — pageStyle (additive, optional)", () => {
  it("accepts a result WITHOUT pageStyle (back-compat)", () => {
    expect(AdaptationResultSchema.safeParse(baseResult()).success).toBe(true);
  });

  it("does not inject a pageStyle default (round-trip identity)", () => {
    const input = baseResult();
    const parsed = AdaptationResultSchema.parse(input);
    expect(parsed).toEqual(input);
    expect("pageStyle" in parsed).toBe(false);
  });

  it("accepts a result WITH a pageStyle sibling", () => {
    const input = { ...baseResult(), pageStyle: { fontFamily: "atkinson", fontSize: 14, blockSpacing: 24 } };
    const parsed = AdaptationResultSchema.parse(input);
    expect(parsed.pageStyle).toEqual({ fontFamily: "atkinson", fontSize: 14, blockSpacing: 24 });
  });
});
