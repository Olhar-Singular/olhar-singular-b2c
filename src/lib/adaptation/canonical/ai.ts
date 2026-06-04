/**
 * AI-output schema and normalizer for the canonical adaptation model.
 *
 * The AI (Google Gemini structured-output) cannot handle recursive schemas or
 * $ref, and it does NOT generate node ids. This module provides:
 *
 *  1. Bounded, non-recursive, id-free Zod schemas for AI output (`Ai*Schema`).
 *  2. `aiActivityJsonSchema()` — a plain JSON Schema object safe for Gemini.
 *  3. `normalizeAiActivity()` — maps AI output → full CanonicalDocument (injects ids).
 *  4. `buildAdaptationResult()` — wraps normalized doc + metadata into AdaptationResult.
 *  5. `parseAiActivity()` — safe-parse helper mirroring validate.ts conventions.
 */

import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import {
  RichTextSchema,
  SCHEMA_VERSION,
  isSafeImageSrc,
  type CanonicalDocument,
  type AdaptationResult,
  type RichText,
} from "./schema.ts";
import { newId } from "./ids.ts";
import { validateDocument } from "./validate.ts";

// ---------------------------------------------------------------------------
// 1. AI schemas — NO ids, NO recursion, NO per-node style
// ---------------------------------------------------------------------------

/**
 * A single alternative in an AI multipleChoice answer.
 * No id — normalizer injects it.
 */
export const AiAlternativeSchema = z.object({
  content: RichTextSchema,
  correct: z.boolean(),
});
export type AiAlternative = z.infer<typeof AiAlternativeSchema>;

// --- Answer variants (id-free items) ----------------------------------------

const AiAnswerOpen = z.object({
  kind: z.literal("open"),
  answerLines: z.number().int().positive().optional(),
});

const AiAnswerMultipleChoice = z.object({
  kind: z.literal("multipleChoice"),
  alternatives: z.array(AiAlternativeSchema).min(1),
});

const AiAnswerTrueFalse = z.object({
  kind: z.literal("trueFalse"),
  items: z.array(
    z.object({
      content: RichTextSchema,
      value: z.boolean(),
    })
  ),
});

const AiAnswerCheckbox = z.object({
  kind: z.literal("checkbox"),
  items: z.array(
    z.object({
      content: RichTextSchema,
      checked: z.boolean(),
    })
  ),
});

const AiAnswerMatching = z.object({
  kind: z.literal("matching"),
  pairs: z.array(
    z.object({
      left: RichTextSchema,
      right: RichTextSchema,
    })
  ),
});

const AiAnswerOrdering = z.object({
  kind: z.literal("ordering"),
  items: z.array(
    z.object({
      content: RichTextSchema,
      position: z.number().int(),
    })
  ),
});

const AiAnswerFillBlank = z.object({
  kind: z.literal("fillBlank"),
  gaps: z.array(
    z.object({
      answer: z.string(),
      alternatives: z.array(z.string()).optional(),
      tip: z.string().optional(),
    })
  ),
});

const AiAnswerTable = z.object({
  kind: z.literal("table"),
  rows: z.array(z.array(RichTextSchema)),
});

/**
 * Id-free question-answer union (mirrors canonical QuestionAnswerSchema but
 * without ids on items/alternatives). Enforces "exactly one correct" on
 * multipleChoice via superRefine.
 */
export const AiQuestionAnswerSchema = z
  .discriminatedUnion("kind", [
    AiAnswerOpen,
    AiAnswerMultipleChoice,
    AiAnswerTrueFalse,
    AiAnswerCheckbox,
    AiAnswerMatching,
    AiAnswerOrdering,
    AiAnswerFillBlank,
    AiAnswerTable,
  ])
  .superRefine((data, ctx) => {
    if (data.kind === "multipleChoice") {
      const correctCount = data.alternatives.filter((a) => a.correct).length;
      if (correctCount !== 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `multipleChoice must have exactly one correct alternative, found ${correctCount}`,
          path: ["alternatives"],
        });
      }
    }
  });
export type AiQuestionAnswer = z.infer<typeof AiQuestionAnswerSchema>;

// --- Content block variants (NO question, NO recursion, NO id, NO style) ----

const AiHeading = z.object({
  type: z.literal("heading"),
  level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  content: RichTextSchema,
});

const AiParagraph = z.object({
  type: z.literal("paragraph"),
  content: RichTextSchema,
});

const AiBlockMath = z.object({
  type: z.literal("blockMath"),
  latex: z.string().min(1),
  alt: z.string().optional(),
});

const AiImage = z.object({
  type: z.literal("image"),
  src: z.string().min(1).refine(isSafeImageSrc, "src protocol não permitido"),
  alt: z.string(),
  width: z.number().positive().optional(),
  alignment: z.enum(["left", "center", "right"]).optional(),
  caption: RichTextSchema.optional(),
});

const AiScaffolding = z.object({
  type: z.literal("scaffolding"),
  items: z.array(z.string()),
});

/**
 * Bounded content block union — deliberately excludes "question" so that
 * stem blocks cannot nest questions (Gemini constraint + safety).
 */
export const AiContentBlockSchema = z.discriminatedUnion("type", [
  AiHeading,
  AiParagraph,
  AiBlockMath,
  AiImage,
  AiScaffolding,
]);
export type AiContentBlock = z.infer<typeof AiContentBlockSchema>;

/**
 * A question node in the AI output.
 * stem uses AiContentBlock (no recursion, no nested questions).
 */
export const AiQuestionSchema = z.object({
  // Match canonical Question constraints exactly: number is int+positive,
  // points is positive (may be fractional, e.g. 2.5). Keeping these in lockstep
  // with schema.ts means an AI emitting number:0 / points:0 fails parseAiActivity
  // up front instead of throwing later in normalizeAiActivity→validateDocument.
  type: z.literal("question"),
  number: z.number().int().positive().optional(),
  points: z.number().positive().optional(),
  difficulty: z.enum(["facil", "medio", "dificil"]).optional(),
  stem: z.array(AiContentBlockSchema),
  instruction: RichTextSchema.optional(),
  answer: AiQuestionAnswerSchema,
});
export type AiQuestion = z.infer<typeof AiQuestionSchema>;

/**
 * Top-level activity schema returned by the AI edge function.
 * blocks may be content blocks OR question nodes.
 */
export const AiActivitySchema = z.object({
  blocks: z.array(z.union([AiContentBlockSchema, AiQuestionSchema])),
  strategies_applied: z.array(z.string()),
  pedagogical_justification: z.string(),
  implementation_tips: z.array(z.string()),
});
export type AiActivity = z.infer<typeof AiActivitySchema>;

// ---------------------------------------------------------------------------
// 2. aiActivityJsonSchema()
// ---------------------------------------------------------------------------

/**
 * Returns a plain JSON Schema object for AiActivitySchema.
 *
 * Uses `$refStrategy: "none"` — because the AI schema has NO recursion,
 * this produces a fully inlined schema with no $ref and no console.warn.
 * Safe to pass directly to Gemini's `responseSchema`.
 *
 * A new object is returned on every call.
 */
export function aiActivityJsonSchema(): object {
  return zodToJsonSchema(AiActivitySchema, { $refStrategy: "none" }) as object;
}

// ---------------------------------------------------------------------------
// 3. normalizeAiActivity()
// ---------------------------------------------------------------------------

/** Normalize an AiContentBlock into a canonical Block (injecting an id). */
function normalizeContentBlock(block: AiContentBlock): CanonicalDocument["blocks"][number] {
  const id = newId();
  switch (block.type) {
    case "heading":
      return { id, type: "heading", level: block.level, content: block.content };
    case "paragraph":
      return { id, type: "paragraph", content: block.content };
    case "blockMath":
      return { id, type: "blockMath", latex: block.latex, ...(block.alt !== undefined && { alt: block.alt }) };
    case "image":
      return {
        id,
        type: "image",
        src: block.src,
        alt: block.alt,
        ...(block.width !== undefined && { width: block.width }),
        ...(block.alignment !== undefined && { alignment: block.alignment }),
        ...(block.caption !== undefined && { caption: block.caption }),
      };
    case "scaffolding":
      return { id, type: "scaffolding", items: block.items };
  }
}

/** Normalize an AiQuestionAnswer into a canonical QuestionAnswer (injecting ids). */
function normalizeAnswer(answer: AiQuestionAnswer): CanonicalDocument["blocks"][number] extends { type: "question"; answer: infer A } ? A : never {
  type CanonicalAnswer = Extract<CanonicalDocument["blocks"][number], { type: "question" }>["answer"];
  switch (answer.kind) {
    case "open":
      return { kind: "open", ...(answer.answerLines !== undefined && { answerLines: answer.answerLines }) } as CanonicalAnswer;

    case "multipleChoice":
      return {
        kind: "multipleChoice",
        alternatives: answer.alternatives.map((alt) => ({
          id: newId(),
          content: alt.content,
          correct: alt.correct,
        })),
      } as CanonicalAnswer;

    case "trueFalse":
      return {
        kind: "trueFalse",
        items: answer.items.map((item) => ({
          id: newId(),
          content: item.content,
          value: item.value,
        })),
      } as CanonicalAnswer;

    case "checkbox":
      return {
        kind: "checkbox",
        items: answer.items.map((item) => ({
          id: newId(),
          content: item.content,
          checked: item.checked,
        })),
      } as CanonicalAnswer;

    case "matching":
      return {
        kind: "matching",
        pairs: answer.pairs.map((pair) => ({
          id: newId(),
          left: pair.left as RichText,
          right: pair.right as RichText,
        })),
      } as CanonicalAnswer;

    case "ordering":
      return {
        kind: "ordering",
        items: answer.items.map((item) => ({
          id: newId(),
          content: item.content,
          position: item.position,
        })),
      } as CanonicalAnswer;

    case "fillBlank":
      return {
        kind: "fillBlank",
        gaps: answer.gaps.map((gap) => ({
          id: newId(),
          answer: gap.answer,
          ...(gap.alternatives !== undefined && { alternatives: gap.alternatives }),
          ...(gap.tip !== undefined && { tip: gap.tip }),
        })),
      } as CanonicalAnswer;

    case "table":
      return {
        kind: "table",
        rows: answer.rows,
      } as CanonicalAnswer;
  }
}

/**
 * Map an AiActivity to a full CanonicalDocument, injecting UUID ids on every
 * node that requires one. The returned document MUST pass `validateDocument()`.
 */
export function normalizeAiActivity(ai: AiActivity): CanonicalDocument {
  const blocks: CanonicalDocument["blocks"] = ai.blocks.map((block) => {
    if (block.type === "question") {
      const id = newId();
      const stemBlocks = block.stem.map(normalizeContentBlock);
      const answer = normalizeAnswer(block.answer);
      return {
        id,
        type: "question",
        ...(block.number !== undefined && { number: block.number }),
        ...(block.points !== undefined && { points: block.points }),
        ...(block.difficulty !== undefined && { difficulty: block.difficulty }),
        stem: stemBlocks,
        ...(block.instruction !== undefined && { instruction: block.instruction }),
        answer,
      } as CanonicalDocument["blocks"][number];
    }
    return normalizeContentBlock(block);
  });

  const doc = { schemaVersion: SCHEMA_VERSION as typeof SCHEMA_VERSION, blocks };
  // Validate eagerly so callers get a clear error if something is wrong
  return validateDocument(doc);
}

// ---------------------------------------------------------------------------
// 4. buildAdaptationResult()
// ---------------------------------------------------------------------------

/**
 * Build a full AdaptationResult from AI output.
 * Normalizes the document and attaches the AI-provided metadata verbatim.
 */
export function buildAdaptationResult(ai: AiActivity): AdaptationResult {
  return {
    schemaVersion: SCHEMA_VERSION,
    document: normalizeAiActivity(ai),
    strategies_applied: ai.strategies_applied,
    pedagogical_justification: ai.pedagogical_justification,
    implementation_tips: ai.implementation_tips,
  };
}

// ---------------------------------------------------------------------------
// 5. parseAiActivity()
// ---------------------------------------------------------------------------

/** Format a ZodError's issues into "<path>: <message>" strings. */
function formatAiIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
    return `${path}: ${issue.message}`;
  });
}

export type AiParseSuccess = { ok: true; value: AiActivity };
export type AiParseFailure = { ok: false; errors: string[] };
export type AiParseResult = AiParseSuccess | AiParseFailure;

/**
 * Safe-parse an unknown value as an AiActivity.
 * Returns `{ ok: true, value }` on success or `{ ok: false, errors }` on failure.
 * Never throws. Errors follow the "<path>: <message>" format.
 */
export function parseAiActivity(raw: unknown): AiParseResult {
  const result = AiActivitySchema.safeParse(raw);
  if (result.success) {
    return { ok: true, value: result.data };
  }
  return { ok: false, errors: formatAiIssues(result.error) };
}
