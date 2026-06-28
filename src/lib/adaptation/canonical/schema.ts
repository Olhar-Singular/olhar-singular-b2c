/**
 * Canonical document schema — single source of truth for the Adaptar feature.
 * Built incrementally through M1 tasks; each task adds its section.
 *
 * Naming convention:
 *   - Zod schema constants: <Name>Schema (e.g. RichTextSchema, BlockSchema)
 *   - Inferred TypeScript types: <Name> (e.g. RichText, Block)
 * This avoids the value/type collision that previously required an awkward
 * `*Type` suffix on the inferred types (RichTextType, InlineType, etc.).
 */

import { z } from "zod";
import { isAllowedColor } from "./colors.ts";
import { isId } from "./ids.ts";

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

export const SCHEMA_VERSION = 1;

const Color = z.string().refine(isAllowedColor, "cor não permitida");

const Mark = z.enum(["bold", "italic", "underline", "strike"]);

/**
 * Allowlist guard for image `src` URLs. Only `https://`, `http://`, and
 * `data:image/` sources are permitted; everything else (`javascript:`,
 * `vbscript:`, `data:text/...`, etc.) is rejected. Centralizing this here means
 * editor, screen render, and PDF all enforce the same rule via the schema.
 */
export function isSafeImageSrc(src: string): boolean {
  const normalized = src.trim().toLowerCase();
  return (
    normalized.startsWith("https://") ||
    normalized.startsWith("http://") ||
    normalized.startsWith("data:image/")
  );
}

// ---------------------------------------------------------------------------
// Task 1.3 — Inline nodes
// ---------------------------------------------------------------------------

const InlineText = z.object({
  type: z.literal("text"),
  text: z.string(),
  marks: z.array(Mark).optional(),
  color: Color.optional(),
  fontSize: z.number().positive().optional(),
});

const InlineMath = z.object({
  type: z.literal("inlineMath"),
  latex: z.string().min(1),
  alt: z.string().optional(),
});

export const InlineSchema = z.discriminatedUnion("type", [InlineText, InlineMath]);

export const RichTextSchema = z.array(InlineSchema);

// ---------------------------------------------------------------------------
// Task 1.5b — Per-node style attributes
// ---------------------------------------------------------------------------

export const NodeStyleSchema = z
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
const BlockBase = z.object({ id: Id, style: NodeStyleSchema.optional() });

// ---------------------------------------------------------------------------
// Task 1.5 — Block nodes (forward declaration for recursion)
// ---------------------------------------------------------------------------

// We use a forward declaration + z.lazy for the recursive Block type.
// BlockSchema is declared up front so Question.stem can reference it via z.lazy
// without a temporal dead zone.
type BlockInput = z.input<typeof _BlockUnion>;
type BlockOutput = z.output<typeof _BlockUnion>;

// eslint-disable-next-line prefer-const
export let BlockSchema: z.ZodType<BlockOutput, z.ZodTypeDef, BlockInput>;

// ---------------------------------------------------------------------------
// Task 1.4 — Question interaction (QuestionAnswer)
// ---------------------------------------------------------------------------

export const AlternativeSchema = z.object({
  id: Id,
  content: RichTextSchema,
  correct: z.boolean(),
});

const AnswerOpen = z.object({
  kind: z.literal("open"),
  answerLines: z.number().int().positive().optional(),
});

const AnswerMultipleChoice = z.object({
  kind: z.literal("multipleChoice"),
  alternatives: z.array(AlternativeSchema).min(1),
});

const AnswerTrueFalse = z.object({
  kind: z.literal("trueFalse"),
  items: z.array(
    z.object({
      id: Id,
      content: RichTextSchema,
      value: z.boolean(),
    })
  ),
});

const AnswerCheckbox = z.object({
  kind: z.literal("checkbox"),
  items: z.array(
    z.object({
      id: Id,
      content: RichTextSchema,
      checked: z.boolean(),
    })
  ),
});

const AnswerMatching = z.object({
  kind: z.literal("matching"),
  pairs: z.array(
    z.object({
      id: Id,
      left: RichTextSchema,
      right: RichTextSchema,
    })
  ),
});

const AnswerOrdering = z.object({
  kind: z.literal("ordering"),
  items: z.array(
    z.object({
      id: Id,
      content: RichTextSchema,
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
  rows: z.array(z.array(RichTextSchema)),
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

export const QuestionAnswerSchema = _QuestionAnswerUnion.superRefine((data, ctx) => {
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
  content: RichTextSchema,
});

const Paragraph = BlockBase.extend({
  type: z.literal("paragraph"),
  content: RichTextSchema,
});

const BlockMath = BlockBase.extend({
  type: z.literal("blockMath"),
  latex: z.string().min(1),
  alt: z.string().optional(),
});

const ImageBlock = BlockBase.extend({
  type: z.literal("image"),
  src: z.string().min(1).refine(isSafeImageSrc, "src protocol não permitido"),
  alt: z.string(),
  width: z.number().positive().optional(),
  alignment: z.enum(["left", "center", "right"]).optional(),
  caption: RichTextSchema.optional(),
});

const Scaffolding = BlockBase.extend({
  type: z.literal("scaffolding"),
  items: z.array(z.string()),
});

const Divider = BlockBase.extend({
  type: z.literal("divider"),
});

// Question.stem is recursive — references BlockSchema via z.lazy.
// `customNumber` overrides the auto-derived ordinal when set (e.g. "1a", "B2").
// Absent/null → the renderer falls back to the automatic position-based number.
const Question = BlockBase.extend({
  type: z.literal("question"),
  stem: z.lazy(() => z.array(BlockSchema)),
  instruction: RichTextSchema.optional(),
  enunciado: RichTextSchema.optional(),
  enunciadoPosition: z.enum(["above", "below"]).optional(),
  customNumber: z.string().optional(),
  answer: QuestionAnswerSchema,
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
BlockSchema = _BlockUnion;

// ---------------------------------------------------------------------------
// Task 1.6 — CanonicalDocument + AdaptationResult
// ---------------------------------------------------------------------------

export const CanonicalDocumentSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  blocks: z.array(BlockSchema).min(1),
});

/**
 * Per-element font-size overrides (in pt), controlled via the "Formato" popover.
 * Each key is optional — absent means "inherit the global fontSize".
 */
const ElementFontSizesSchema = z
  .object({
    stem: z.number().positive().optional(),
    instruction: z.number().positive().optional(),
    alternative: z.number().positive().optional(),
    caption: z.number().positive().optional(),
  })
  .strict();

export type ElementFontSizes = z.infer<typeof ElementFontSizesSchema>;

/**
 * Document-wide presentation style (plano §7.1) — additive, optional sibling of
 * `document` inside `adaptation_result`. Controls font/size/spacing for the whole
 * sheet via the "Formato" popover. Absent → renderers fall back to current
 * defaults, so legacy documents (no `pageStyle`) round-trip byte-for-byte. Units:
 * `fontSize`/element sizes in pt (mirrors page tokens / PDF), `blockSpacing` in px.
 */
export const PageStyleSchema = z
  .object({
    fontFamily: z.string().optional(),
    fontSize: z.number().positive().optional(),
    blockSpacing: z.number().nonnegative().optional(),
    elementFontSizes: ElementFontSizesSchema.optional(),
  })
  .strict();

/**
 * Document header (title/school/teacher/date) — additive, optional sibling of
 * `document` inside `adaptation_result`. These are user-entered fields filled on
 * the "Exportar" step; the AI never produces them, so they are absent at
 * generation and only appear once the teacher types them. Stored here (rather
 * than as ephemeral export-panel state) so they persist via the same autosave
 * path as `pageStyle` and survive edit-after-save. Absent → the PDF renders no
 * header, so legacy documents round-trip byte-for-byte.
 */
export const DocumentHeaderSchema = z
  .object({
    title: z.string().optional(),
    school: z.string().optional(),
    teacher: z.string().optional(),
    date: z.string().optional(),
  })
  .strict();

export const AdaptationResultSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  document: CanonicalDocumentSchema,
  // snake_case intentional: these field names are part of the AI edge-function
  // output contract and are persisted verbatim in the adaptation_result jsonb
  // column. Renaming to camelCase would break the AI prompt and DB contract.
  strategies_applied: z.array(z.string()),
  pedagogical_justification: z.string(),
  implementation_tips: z.array(z.string()),
  // Additive & optional: never injected on read, so legacy docs parse identically.
  pageStyle: PageStyleSchema.optional(),
  header: DocumentHeaderSchema.optional(),
});

// ---------------------------------------------------------------------------
// Inferred TypeScript types (exported for consumers)
// ---------------------------------------------------------------------------

export type CanonicalDocument = z.infer<typeof CanonicalDocumentSchema>;
export type AdaptationResult = z.infer<typeof AdaptationResultSchema>;
// Block type uses _BlockUnion for the concrete inferred type
export type Block = z.infer<typeof _BlockUnion>;
export type RichText = z.infer<typeof RichTextSchema>;
export type Inline = z.infer<typeof InlineSchema>;
export type QuestionAnswer = z.infer<typeof QuestionAnswerSchema>;
export type Alternative = z.infer<typeof AlternativeSchema>;
export type NodeStyle = z.infer<typeof NodeStyleSchema>;
export type PageStyle = z.infer<typeof PageStyleSchema>;
export type DocumentHeader = z.infer<typeof DocumentHeaderSchema>;
