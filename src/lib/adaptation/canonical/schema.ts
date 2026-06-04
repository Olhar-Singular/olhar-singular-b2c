/**
 * Canonical document schema — single source of truth for the Adaptar feature.
 * Built incrementally through M1 tasks; each task adds its section.
 */

import { z } from "zod";
import { isAllowedColor } from "./colors";
import { isId } from "./ids";

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

export const SCHEMA_VERSION = 1;

const Color = z.string().refine(isAllowedColor, "cor não permitida");

const Mark = z.enum(["bold", "italic", "underline", "strike"]);

// ---------------------------------------------------------------------------
// Task 1.3 — Inline nodes
// ---------------------------------------------------------------------------

const InlineText = z.object({
  type: z.literal("text"),
  text: z.string(),
  marks: z.array(Mark).optional(),
  color: Color.optional(),
});

const InlineMath = z.object({
  type: z.literal("inlineMath"),
  latex: z.string().min(1),
  alt: z.string().optional(),
});

export const Inline = z.discriminatedUnion("type", [InlineText, InlineMath]);

export const RichText = z.array(Inline);

// ---------------------------------------------------------------------------
// Task 1.5b — Per-node style attributes
// ---------------------------------------------------------------------------

const NodeStyle = z
  .object({
    fontFamily: z.string().optional(),
    fontSize: z.number().positive().optional(),
    align: z.enum(["left", "center", "right", "justify"]).optional(),
    color: Color.optional(),
    spacingAfter: z.number().nonnegative().optional(),
    pageBreakBefore: z.boolean().optional(),
  })
  .strict();

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

const Id = z.string().refine(isId, "id must be a valid UUID");
const BlockBase = z.object({ id: Id, style: NodeStyle.optional() });

// ---------------------------------------------------------------------------
// Task 1.5 — Block nodes (forward declaration for recursion)
// ---------------------------------------------------------------------------

// We use an interface + z.lazy for the recursive Block type.
// Block is declared as a lazy schema so Alternative.nested and Question.stem
// can reference it without a temporal dead zone.
type BlockInput = z.input<typeof _BlockUnion>;
type BlockOutput = z.output<typeof _BlockUnion>;

// eslint-disable-next-line prefer-const
export let Block: z.ZodType<BlockOutput, z.ZodTypeDef, BlockInput>;

// ---------------------------------------------------------------------------
// Task 1.4 — Question interaction (QuestionAnswer)
// ---------------------------------------------------------------------------

const Alternative = z.object({
  id: Id,
  content: RichText,
  correct: z.boolean(),
  // z.lazy defers resolution of Block until runtime
  nested: z
    .lazy(() => z.array(Block))
    .optional(),
});

const AnswerOpen = z.object({
  kind: z.literal("open"),
  answerLines: z.number().int().positive().optional(),
});

const AnswerMultipleChoice = z.object({
  kind: z.literal("multipleChoice"),
  alternatives: z.array(Alternative).min(1),
});

const AnswerTrueFalse = z.object({
  kind: z.literal("trueFalse"),
  items: z.array(
    z.object({
      id: Id,
      content: RichText,
      value: z.boolean(),
    })
  ),
});

const AnswerCheckbox = z.object({
  kind: z.literal("checkbox"),
  items: z.array(
    z.object({
      id: Id,
      content: RichText,
      checked: z.boolean(),
    })
  ),
});

const AnswerMatching = z.object({
  kind: z.literal("matching"),
  pairs: z.array(
    z.object({
      id: Id,
      left: RichText,
      right: RichText,
    })
  ),
});

const AnswerOrdering = z.object({
  kind: z.literal("ordering"),
  items: z.array(
    z.object({
      id: Id,
      content: RichText,
      position: z.number().int(),
    })
  ),
});

const AnswerFillBlank = z.object({
  kind: z.literal("fillBlank"),
  gaps: z.array(
    z.object({
      id: Id,
      answer: z.string(),
      alternatives: z.array(z.string()).optional(),
      tip: z.string().optional(),
    })
  ),
});

const AnswerTable = z.object({
  kind: z.literal("table"),
  rows: z.array(z.array(RichText)),
});

const _QuestionAnswerUnion = z.discriminatedUnion("kind", [
  AnswerOpen,
  AnswerMultipleChoice,
  AnswerTrueFalse,
  AnswerCheckbox,
  AnswerMatching,
  AnswerOrdering,
  AnswerFillBlank,
  AnswerTable,
]);

export const QuestionAnswer = _QuestionAnswerUnion.superRefine((data, ctx) => {
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

// ---------------------------------------------------------------------------
// Block variants
// ---------------------------------------------------------------------------

const Heading = BlockBase.extend({
  type: z.literal("heading"),
  level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  content: RichText,
});

const Paragraph = BlockBase.extend({
  type: z.literal("paragraph"),
  content: RichText,
});

const BlockMath = BlockBase.extend({
  type: z.literal("blockMath"),
  latex: z.string().min(1),
  alt: z.string().optional(),
});

const ImageBlock = BlockBase.extend({
  type: z.literal("image"),
  src: z.string().min(1),
  alt: z.string(),
  width: z.number().positive().optional(),
  alignment: z.enum(["left", "center", "right"]).optional(),
  caption: RichText.optional(),
});

const Scaffolding = BlockBase.extend({
  type: z.literal("scaffolding"),
  items: z.array(z.string()),
});

const Divider = BlockBase.extend({
  type: z.literal("divider"),
});

// Question.stem is recursive — references Block via z.lazy
const Question = BlockBase.extend({
  type: z.literal("question"),
  number: z.number().int().positive().optional(),
  points: z.number().positive().optional(),
  difficulty: z.enum(["facil", "medio", "dificil"]).optional(),
  stem: z.lazy(() => z.array(Block)),
  instruction: RichText.optional(),
  answer: QuestionAnswer,
});

// The actual union — evaluated once all variants are defined.
const _BlockUnion = z.discriminatedUnion("type", [
  Heading,
  Paragraph,
  BlockMath,
  ImageBlock,
  Scaffolding,
  Divider,
  Question,
]);

// Now assign the forward declaration. All z.lazy references above will resolve
// correctly because they are evaluated lazily at parse time.
Block = _BlockUnion;

// ---------------------------------------------------------------------------
// Task 1.6 — CanonicalDocument + AdaptationResult
// ---------------------------------------------------------------------------

export const CanonicalDocumentSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  blocks: z.array(Block).min(1),
});

export const AdaptationResultSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  document: CanonicalDocumentSchema,
  strategies_applied: z.array(z.string()),
  pedagogical_justification: z.string(),
  implementation_tips: z.array(z.string()),
});

// ---------------------------------------------------------------------------
// Inferred TypeScript types (exported for consumers)
// ---------------------------------------------------------------------------

export type CanonicalDocument = z.infer<typeof CanonicalDocumentSchema>;
export type AdaptationResult = z.infer<typeof AdaptationResultSchema>;
// Block type uses _BlockUnion for the concrete inferred type
export type Block = z.infer<typeof _BlockUnion>;
export type RichTextType = z.infer<typeof RichText>;
export type InlineType = z.infer<typeof Inline>;
export type QuestionAnswerType = z.infer<typeof QuestionAnswer>;
export type AlternativeType = z.infer<typeof Alternative>;
export type NodeStyleType = z.infer<typeof NodeStyle>;
