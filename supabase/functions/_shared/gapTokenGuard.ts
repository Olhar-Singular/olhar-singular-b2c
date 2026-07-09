// =============================================================================
// Edge-only guard against fabricated AI gap tokens. The canonical model has NO
// `{gapN}` placeholder concept: a fill-in-the-blank question keeps its blanks as
// plain underscores inside the stem text, and `answer.gaps` holds only the answer
// key. Yet the model sometimes emits a template form ("Pirulit{gap1} que
// bat{gap2}") into a stem/enunciado, which then renders literally on the folha
// and in the PDF. This module rewrites those tokens into a printable blank.
//
// Lives in _shared/ (edge-only, Vitest-covered). Imports the canonical types ONLY
// as types, with explicit .ts extension for Deno. Never touches the shared schema,
// so browser parsing/render is unaffected.
// =============================================================================

import type {
  AdaptationResult,
  Block,
  QuestionAnswer,
  RichText,
} from "../../../src/lib/adaptation/canonical/schema.ts";

/**
 * A fabricated gap placeholder: `{gap}`, `{gap1}`, `{ gap 3 }`, `{gap_4}`,
 * `{{gap5}}`, `{lacuna2}`, `{lacunas}` — any case. Deliberately requires the
 * `gap`/`lacuna` keyword so ordinary braces (`{a, b}`, `{x1}`) survive.
 */
const GAP_TOKEN = /\{{1,2}\s*(?:gap|lacuna)s?\s*[-_]?\s*\d*\s*\}{1,2}/gi;

/** The blank a fill-in-the-blank question is supposed to print. */
const BLANK = "___";

/** Rewrite every gap token in a plain string into a printable blank. */
export function normalizeGapTokens(text: string): string {
  return text.replace(GAP_TOKEN, BLANK);
}

/** Clean the text nodes of a RichText run; inline math is opaque and untouched. */
function cleanRichText(rt: RichText): RichText {
  return rt.map((node) =>
    node.type === "text" ? { ...node, text: normalizeGapTokens(node.text) } : node,
  );
}

function cleanAnswer(answer: QuestionAnswer): QuestionAnswer {
  switch (answer.kind) {
    case "multipleChoice":
      return {
        ...answer,
        alternatives: answer.alternatives.map((a) => ({ ...a, content: cleanRichText(a.content) })),
      };
    case "trueFalse":
    case "checkbox":
    case "ordering":
      return {
        ...answer,
        items: answer.items.map((i) => ({ ...i, content: cleanRichText(i.content) })),
      };
    case "matching":
      return {
        ...answer,
        pairs: answer.pairs.map((p) => ({
          ...p,
          left: cleanRichText(p.left),
          right: cleanRichText(p.right),
        })),
      };
    case "table":
      return { ...answer, rows: answer.rows.map((row) => row.map(cleanRichText)) };
    case "fillBlank":
      return {
        ...answer,
        gaps: answer.gaps.map((g) => ({
          ...g,
          answer: normalizeGapTokens(g.answer),
          ...(g.alternatives !== undefined && { alternatives: g.alternatives.map(normalizeGapTokens) }),
          ...(g.tip !== undefined && { tip: normalizeGapTokens(g.tip) }),
        })),
      };
    /* v8 ignore next 2 -- exhaustive switch; "open" carries no text */
    case "open":
    default:
      return answer;
  }
}

function cleanBlock(block: Block): Block {
  switch (block.type) {
    case "heading":
    case "paragraph":
      return { ...block, content: cleanRichText(block.content) };
    case "image":
      return block.caption === undefined
        ? block
        : { ...block, caption: cleanRichText(block.caption) };
    case "scaffolding":
      return { ...block, items: block.items.map(normalizeGapTokens) };
    case "question":
      return {
        ...block,
        stem: block.stem.map(cleanBlock),
        ...(block.enunciado !== undefined && { enunciado: cleanRichText(block.enunciado) }),
        ...(block.instruction !== undefined && { instruction: cleanRichText(block.instruction) }),
        answer: cleanAnswer(block.answer),
      };
    /* v8 ignore next 3 -- exhaustive switch; blockMath/divider carry no prose */
    case "blockMath":
    case "divider":
    default:
      return block;
  }
}

/**
 * Rewrite every fabricated `{gapN}` token in the adapted document into a
 * printable blank (`___`). Walks all prose-bearing blocks, question stems
 * (recursively), enunciado / instruction, and every answer kind. Returns a new
 * AdaptationResult; block counts and sibling fields are preserved.
 */
export function stripGapTokens(result: AdaptationResult): AdaptationResult {
  return {
    ...result,
    document: { ...result.document, blocks: result.document.blocks.map(cleanBlock) },
  };
}
