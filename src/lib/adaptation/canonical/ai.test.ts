/**
 * Tests for the AI-output schema + normalizer (ai.ts).
 *
 * TDD: these tests were written BEFORE the implementation.
 * All tests must pass with 100% coverage on ai.ts.
 */

import { describe, it, expect, vi, afterEach } from "vitest";

import {
  AiActivitySchema,
  AiContentBlockSchema,
  aiActivityJsonSchema,
  normalizeAiActivity,
  buildAdaptationResult,
  parseAiActivity,
} from "./ai";

import { validateDocument } from "./validate";
import { isId } from "./ids";
import { SCHEMA_VERSION } from "./schema";

import {
  validRichActivity,
  validMinimalActivity,
  validScaffoldingActivity,
  validAllAnswerTypesActivity,
  adversarialZeroCorrect,
  adversarialTwoCorrect,
  adversarialMissingJustification,
  adversarialNestedQuestion,
  adversarialUnknownBlockType,
  adversarialNonArrayBlocks,
} from "./__fixtures__/aiActivity";

// ---------------------------------------------------------------------------
// aiActivityJsonSchema()
// ---------------------------------------------------------------------------

describe("aiActivityJsonSchema", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns a plain object without throwing", () => {
    expect(() => aiActivityJsonSchema()).not.toThrow();
    const schema = aiActivityJsonSchema();
    expect(typeof schema).toBe("object");
    expect(schema).not.toBeNull();
  });

  it("root type is 'object'", () => {
    const schema = aiActivityJsonSchema() as Record<string, unknown>;
    expect(schema.type).toBe("object");
  });

  it("does NOT emit console.warn (no recursive-reference warning)", () => {
    const warnSpy = vi.spyOn(console, "warn");
    aiActivityJsonSchema();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("does NOT contain degraded empty items ({}) in the serialized schema", () => {
    const serialized = JSON.stringify(aiActivityJsonSchema());
    expect(serialized).not.toContain('"items":{}');
  });

  it("returns a new object each call (pure function)", () => {
    const s1 = aiActivityJsonSchema();
    const s2 = aiActivityJsonSchema();
    expect(s1).not.toBe(s2);
    expect(JSON.stringify(s1)).toBe(JSON.stringify(s2));
  });

  it("contains expected top-level properties", () => {
    const schema = aiActivityJsonSchema() as Record<string, unknown>;
    const props = schema.properties as Record<string, unknown>;
    expect(props).toBeDefined();
    expect(props.blocks).toBeDefined();
    expect(props.strategies_applied).toBeDefined();
    expect(props.pedagogical_justification).toBeDefined();
    expect(props.implementation_tips).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// AiActivitySchema — direct Zod parse
// ---------------------------------------------------------------------------

describe("AiActivitySchema — valid inputs", () => {
  it("accepts the rich valid fixture", () => {
    const result = AiActivitySchema.safeParse(validRichActivity);
    expect(result.success).toBe(true);
  });

  it("accepts the minimal valid fixture", () => {
    const result = AiActivitySchema.safeParse(validMinimalActivity);
    expect(result.success).toBe(true);
  });

  it("accepts the scaffolding fixture", () => {
    const result = AiActivitySchema.safeParse(validScaffoldingActivity);
    expect(result.success).toBe(true);
  });

  it("accepts the all-answer-types fixture", () => {
    const result = AiActivitySchema.safeParse(validAllAnswerTypesActivity);
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// normalizeAiActivity — round-trip guarantee
// ---------------------------------------------------------------------------

describe("normalizeAiActivity — round-trip", () => {
  it("produces a document that validateDocument() accepts (rich fixture)", () => {
    const doc = normalizeAiActivity(validRichActivity);
    // Must not throw
    expect(() => validateDocument(doc)).not.toThrow();
  });

  it("produces a document that validateDocument() accepts (minimal fixture)", () => {
    const doc = normalizeAiActivity(validMinimalActivity);
    expect(() => validateDocument(doc)).not.toThrow();
  });

  it("produces a document that validateDocument() accepts (scaffolding fixture)", () => {
    const doc = normalizeAiActivity(validScaffoldingActivity);
    expect(() => validateDocument(doc)).not.toThrow();
  });

  it("produces a document that validateDocument() accepts (all-answer-types fixture)", () => {
    const doc = normalizeAiActivity(validAllAnswerTypesActivity);
    expect(() => validateDocument(doc)).not.toThrow();
  });

  it("injects ids — every top-level block has a valid UUID id", () => {
    const doc = normalizeAiActivity(validRichActivity);
    for (const block of doc.blocks) {
      expect(isId(block.id)).toBe(true);
    }
  });

  it("injects ids — question block has id", () => {
    const doc = normalizeAiActivity(validMinimalActivity);
    const q = doc.blocks[0];
    expect(isId(q.id)).toBe(true);
  });

  it("injects ids into multipleChoice alternatives", () => {
    const doc = normalizeAiActivity(validRichActivity);
    // block index 3 is the multipleChoice question
    const q = doc.blocks[3] as Extract<(typeof doc.blocks)[number], { type: "question" }>;
    expect(q.type).toBe("question");
    if (q.answer.kind === "multipleChoice") {
      for (const alt of q.answer.alternatives) {
        expect(isId(alt.id)).toBe(true);
      }
    }
  });

  it("injects ids into trueFalse items", () => {
    const doc = normalizeAiActivity(validRichActivity);
    // block index 4 is the trueFalse question
    const q = doc.blocks[4] as Extract<(typeof doc.blocks)[number], { type: "question" }>;
    expect(q.type).toBe("question");
    if (q.answer.kind === "trueFalse") {
      for (const item of q.answer.items) {
        expect(isId(item.id)).toBe(true);
      }
    }
  });

  it("injects ids into fillBlank gaps", () => {
    const doc = normalizeAiActivity(validRichActivity);
    // block index 5 is the fillBlank question
    const q = doc.blocks[5] as Extract<(typeof doc.blocks)[number], { type: "question" }>;
    expect(q.type).toBe("question");
    if (q.answer.kind === "fillBlank") {
      for (const gap of q.answer.gaps) {
        expect(isId(gap.id)).toBe(true);
      }
    }
  });

  it("injects ids into stem blocks inside questions", () => {
    const doc = normalizeAiActivity(validRichActivity);
    for (const block of doc.blocks) {
      if (block.type === "question") {
        for (const stemBlock of block.stem) {
          expect(isId(stemBlock.id)).toBe(true);
        }
      }
    }
  });

  it("all injected ids are unique across the entire document", () => {
    const doc = normalizeAiActivity(validRichActivity);
    const ids: string[] = [];
    for (const block of doc.blocks) {
      ids.push(block.id);
      if (block.type === "question") {
        for (const stemBlock of block.stem) {
          ids.push(stemBlock.id);
        }
        if (block.answer.kind === "multipleChoice") {
          for (const alt of block.answer.alternatives) ids.push(alt.id);
        } else if (block.answer.kind === "trueFalse") {
          for (const item of block.answer.items) ids.push(item.id);
        } else if (block.answer.kind === "fillBlank") {
          for (const gap of block.answer.gaps) ids.push(gap.id);
        }
      }
    }
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it("injects ids into checkbox items", () => {
    const doc = normalizeAiActivity(validAllAnswerTypesActivity);
    const q = doc.blocks[0] as Extract<(typeof doc.blocks)[number], { type: "question" }>;
    if (q.answer.kind === "checkbox") {
      for (const item of q.answer.items) expect(isId(item.id)).toBe(true);
    }
  });

  it("injects ids into matching pairs", () => {
    const doc = normalizeAiActivity(validAllAnswerTypesActivity);
    const q = doc.blocks[1] as Extract<(typeof doc.blocks)[number], { type: "question" }>;
    if (q.answer.kind === "matching") {
      for (const pair of q.answer.pairs) expect(isId(pair.id)).toBe(true);
    }
  });

  it("injects ids into ordering items", () => {
    const doc = normalizeAiActivity(validAllAnswerTypesActivity);
    const q = doc.blocks[2] as Extract<(typeof doc.blocks)[number], { type: "question" }>;
    if (q.answer.kind === "ordering") {
      for (const item of q.answer.items) expect(isId(item.id)).toBe(true);
    }
  });

  it("sets schemaVersion to SCHEMA_VERSION", () => {
    const doc = normalizeAiActivity(validRichActivity);
    expect(doc.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it("preserves enunciado and enunciadoPosition from the AI output when present", () => {
    const activityWithEnunciado = {
      ...validMinimalActivity,
      blocks: [
        {
          type: "question" as const,
          stem: [{ type: "paragraph" as const, content: [{ type: "text" as const, text: "Q?" }] }],
          enunciado: [{ type: "text" as const, text: "Observe a imagem." }],
          enunciadoPosition: "above" as const,
          answer: { kind: "open" as const, answerLines: 3 },
        },
      ],
    };
    const doc = normalizeAiActivity(activityWithEnunciado);
    const q = doc.blocks[0] as Extract<(typeof doc.blocks)[number], { type: "question" }>;
    expect(q.enunciado).toEqual([{ type: "text", text: "Observe a imagem." }]);
    expect(q.enunciadoPosition).toBe("above");
  });

  it("table answer passes round-trip (no per-item ids needed)", () => {
    const doc = normalizeAiActivity(validAllAnswerTypesActivity);
    expect(() => validateDocument(doc)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// buildAdaptationResult
// ---------------------------------------------------------------------------

describe("buildAdaptationResult", () => {
  it("carries strategies_applied from the AI output", () => {
    const result = buildAdaptationResult(validRichActivity);
    expect(result.strategies_applied).toEqual(validRichActivity.strategies_applied);
  });

  it("carries pedagogical_justification from the AI output", () => {
    const result = buildAdaptationResult(validRichActivity);
    expect(result.pedagogical_justification).toBe(validRichActivity.pedagogical_justification);
  });

  it("carries implementation_tips from the AI output", () => {
    const result = buildAdaptationResult(validRichActivity);
    expect(result.implementation_tips).toEqual(validRichActivity.implementation_tips);
  });

  it("sets schemaVersion to SCHEMA_VERSION", () => {
    const result = buildAdaptationResult(validRichActivity);
    expect(result.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it("produces a valid canonical document inside the result", () => {
    const result = buildAdaptationResult(validRichActivity);
    expect(() => validateDocument(result.document)).not.toThrow();
  });

  it("works with minimal activity", () => {
    const result = buildAdaptationResult(validMinimalActivity);
    expect(result.strategies_applied).toEqual([]);
    expect(result.implementation_tips).toEqual([]);
    expect(() => validateDocument(result.document)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// parseAiActivity
// ---------------------------------------------------------------------------

describe("parseAiActivity — valid", () => {
  it("returns ok:true for valid rich fixture", () => {
    const result = parseAiActivity(validRichActivity);
    expect(result.ok).toBe(true);
  });

  it("returns the typed AiActivity value on success", () => {
    const result = parseAiActivity(validMinimalActivity);
    if (result.ok) {
      expect(result.value.blocks).toBeDefined();
      expect(result.value.pedagogical_justification).toBeDefined();
    }
  });
});

describe("parseAiActivity — adversarial rejections", () => {
  it("rejects multipleChoice with 0 correct (ok:false with informative errors)", () => {
    const result = parseAiActivity(adversarialZeroCorrect);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThan(0);
      // Each error should follow '<path>: <message>' format
      for (const e of result.errors) {
        expect(e).toMatch(/:/);
      }
    }
  });

  it("rejects multipleChoice with 2 correct (ok:false with informative errors)", () => {
    const result = parseAiActivity(adversarialTwoCorrect);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });

  it("rejects missing pedagogical_justification", () => {
    const result = parseAiActivity(adversarialMissingJustification);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.errors.some((e) => e.toLowerCase().includes("pedagogical"))
      ).toBe(true);
    }
  });

  it("rejects a question whose stem contains a nested question", () => {
    const result = parseAiActivity(adversarialNestedQuestion);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });

  it("rejects unknown block type", () => {
    const result = parseAiActivity(adversarialUnknownBlockType);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });

  it("rejects non-array blocks", () => {
    const result = parseAiActivity(adversarialNonArrayBlocks);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });

  it("rejects null input", () => {
    const result = parseAiActivity(null);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// A1 — AI image src allowlist
// ---------------------------------------------------------------------------

describe("AiContentBlockSchema — image src allowlist", () => {
  const img = (src: string) => ({ type: "image" as const, src, alt: "" });

  it("accepts an https image src", () => {
    expect(AiContentBlockSchema.safeParse(img("https://x.com/a.png")).success).toBe(true);
  });

  it("accepts a data:image src", () => {
    expect(AiContentBlockSchema.safeParse(img("data:image/png;base64,AAAA")).success).toBe(true);
  });

  it("rejects a javascript: image src", () => {
    expect(AiContentBlockSchema.safeParse(img("javascript:alert(1)")).success).toBe(false);
  });

  it("rejects a data:text image src", () => {
    expect(AiContentBlockSchema.safeParse(img("data:text/html,x")).success).toBe(false);
  });
});
