import { describe, it, expect } from "vitest";
import {
  CanonicalDocumentSchema,
  AdaptationResultSchema,
  SCHEMA_VERSION,
} from "./schema";
import type {
  CanonicalDocument,
  AdaptationResult,
  Block,
  RichText,
  Inline,
  QuestionAnswer,
  Alternative,
  NodeStyle,
} from "./schema";
import { newId } from "./ids";

const id = () => newId();
const textContent: RichText = [{ type: "text", text: "hello" }];

const validParagraph: Block = {
  id: id(),
  type: "paragraph",
  content: textContent,
};

const validDocument: CanonicalDocument = {
  schemaVersion: SCHEMA_VERSION,
  blocks: [validParagraph],
};

const validResult: AdaptationResult = {
  schemaVersion: SCHEMA_VERSION,
  document: validDocument,
  strategies_applied: ["chunking", "visual cues"],
  pedagogical_justification: "Reduces cognitive load.",
  implementation_tips: ["Use colored highlights"],
};

describe("CanonicalDocumentSchema", () => {
  it("accepts a valid document with at least one block", () => {
    expect(CanonicalDocumentSchema.safeParse(validDocument).success).toBe(true);
  });

  it("rejects a document with zero blocks", () => {
    expect(
      CanonicalDocumentSchema.safeParse({
        schemaVersion: SCHEMA_VERSION,
        blocks: [],
      }).success
    ).toBe(false);
  });

  it("rejects wrong schemaVersion", () => {
    expect(
      CanonicalDocumentSchema.safeParse({
        schemaVersion: 2,
        blocks: [validParagraph],
      }).success
    ).toBe(false);
  });

  it("rejects missing schemaVersion", () => {
    expect(
      CanonicalDocumentSchema.safeParse({ blocks: [validParagraph] }).success
    ).toBe(false);
  });

  it("rejects missing blocks", () => {
    expect(
      CanonicalDocumentSchema.safeParse({ schemaVersion: SCHEMA_VERSION }).success
    ).toBe(false);
  });
});

describe("AdaptationResultSchema", () => {
  it("accepts a valid AdaptationResult", () => {
    expect(AdaptationResultSchema.safeParse(validResult).success).toBe(true);
  });

  it("rejects wrong schemaVersion", () => {
    expect(
      AdaptationResultSchema.safeParse({ ...validResult, schemaVersion: 0 }).success
    ).toBe(false);
  });

  it("rejects when document is missing", () => {
    const { document: _, ...rest } = validResult;
    expect(AdaptationResultSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects when strategies_applied is missing", () => {
    const { strategies_applied: _, ...rest } = validResult;
    expect(AdaptationResultSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects when pedagogical_justification is missing", () => {
    const { pedagogical_justification: _, ...rest } = validResult;
    expect(AdaptationResultSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects when implementation_tips is missing", () => {
    const { implementation_tips: _, ...rest } = validResult;
    expect(AdaptationResultSchema.safeParse(rest).success).toBe(false);
  });
});

describe("Exported TypeScript types", () => {
  it("CanonicalDocument type is assignable", () => {
    const doc: CanonicalDocument = validDocument;
    expect(doc.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it("AdaptationResult type is assignable", () => {
    const result: AdaptationResult = validResult;
    expect(result.strategies_applied).toHaveLength(2);
  });

  it("Block type is assignable", () => {
    const block: Block = validParagraph;
    expect(block.type).toBe("paragraph");
  });

  it("RichText type is assignable", () => {
    const rt: RichText = textContent;
    expect(rt).toHaveLength(1);
  });

  it("Inline type is assignable", () => {
    const inline: Inline = { type: "text", text: "test" };
    expect(inline.type).toBe("text");
  });

  it("QuestionAnswer type is assignable", () => {
    const answer: QuestionAnswer = { kind: "open" };
    expect(answer.kind).toBe("open");
  });

  it("Alternative type is assignable", () => {
    const alt: Alternative = {
      id: id(),
      content: textContent,
      correct: true,
    };
    expect(alt.correct).toBe(true);
  });

  it("NodeStyle type is assignable", () => {
    const style: NodeStyle = { fontSize: 14, align: "left" };
    expect(style.fontSize).toBe(14);
  });
});
