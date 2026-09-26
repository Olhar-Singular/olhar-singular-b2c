// =============================================================================
// Sizes the writing space of a fill-in-the-blank question after generation.
//
// The canonical model does NOT draw the gap: a fill-in-the-blank keeps its
// blanks as literal underscores inside the stem text, and `answer.gaps` holds
// only the answer key. So the printed blank is whatever the model typed —
// always `___`, three glyphs, ~7 mm on paper — for `chuva` and for
// `condensacao` alike. Seven millimetres do not hold three handwritten
// letters, and this is the product whose reason to exist is adapting the sheet
// for a student with a learning barrier: large handwriting is the use case,
// not the edge case.
//
// Fixing it in the renderers is wrong and expensive: the blank is genuinely
// text, and there are four surfaces printing it (sheet, export preview, PDF,
// Word) which would each need their own inline-gap element to agree. Fixing it
// in the prompt is worse: the model does not size anything reliably. So the
// blank is widened here, deterministically, right after generation — one
// place, and all four surfaces print the same width because they print the
// same text.
//
// Lives in _shared/ (edge-only, Vitest-covered). Imports the canonical types
// ONLY as types, with an explicit .ts extension for Deno. Never touches the
// shared schema.
// =============================================================================

import type { AdaptationResult } from "../../../src/lib/adaptation/canonical/schema.ts";

/**
 * A printable blank: two or more underscores. Single underscores are left
 * alone — `x_1` is a subscript, not a gap.
 */
const BLANK_RUN = /_{2,}/g;

/** Underscores per character of the expected answer (handwriting is wider than type). */
const UNDERSCORES_PER_CHAR = 1.2;

/** Floor: even `eu` gets a line the student can actually write on. */
const MIN_UNDERSCORES = 6;

/** Ceiling: a pathological answer must not push the blank past the margin. */
const MAX_UNDERSCORES = 40;

/** The blank that holds `answer`, as a run of underscores. */
export function blankFor(answer: string): string {
  const wanted = Math.round(answer.length * UNDERSCORES_PER_CHAR);
  const clamped = Math.min(MAX_UNDERSCORES, Math.max(MIN_UNDERSCORES, wanted));
  return "_".repeat(clamped);
}

type InlineLike = { type: string; text?: string };
type BlockLike = { type: string; content?: InlineLike[]; stem?: BlockLike[] };
type GapLike = { answer: string };
type QuestionLike = BlockLike & {
  stem: BlockLike[];
  answer: { kind: string; gaps?: GapLike[] };
};

/** Prose-bearing inline nodes of a stem block, skipping nested questions. */
function inlinesOf(block: BlockLike): InlineLike[] {
  if (block.type === "question") return [];
  return block.content === undefined ? [] : block.content;
}

function countBlanks(stem: BlockLike[]): number {
  return stem.reduce(
    (total, block) =>
      total +
      inlinesOf(block).reduce(
        (n, node) => {
          if (node.type !== "text" || typeof node.text !== "string") return n;
          const runs = node.text.match(BLANK_RUN);
          return runs === null ? n : n + runs.length;
        },
        0,
      ),
    0,
  );
}

/**
 * Rewrite the nth blank of the stem to the width of `gaps[n].answer`. A gap
 * with an empty answer keeps whatever width it had — there is nothing to size
 * it by.
 */
function sizeStem(stem: BlockLike[], answers: string[]): BlockLike[] {
  let next = 0;
  return stem.map((block) => {
    const inlines = inlinesOf(block);
    if (inlines.length === 0) return block;

    const content = inlines.map((node) => {
      if (node.type !== "text" || typeof node.text !== "string") return node;
      const text = node.text.replace(BLANK_RUN, (run) => {
        const answer = answers[next];
        next += 1;
        return answer.length === 0 ? run : blankFor(answer);
      });
      return { ...node, text };
    });

    return { ...block, content };
  });
}

function sizeBlock(block: BlockLike): BlockLike {
  if (block.type !== "question") return block;

  const question = block as QuestionLike;
  const stem = question.stem.map(sizeBlock);
  if (question.answer.kind !== "fillBlank") return { ...block, stem };

  // `gaps` is required for the fillBlank variant of the canonical schema.
  const answers = (question.answer.gaps as GapLike[]).map((g) => g.answer);
  // Blanks and answers must line up one to one, in reading order. When they do
  // not, the mapping is a guess — and a guess would widen the wrong blank, so
  // the stem is left exactly as the model wrote it.
  if (answers.length === 0 || countBlanks(stem) !== answers.length) return { ...block, stem };

  return { ...block, stem: sizeStem(stem, answers) };
}

/**
 * Widen every fill-in-the-blank gap in the adapted document to the length of
 * the answer it has to hold. Returns a new AdaptationResult; block counts,
 * answer keys and sibling fields are preserved.
 */
export function sizeGapBlanks(result: AdaptationResult): AdaptationResult {
  return {
    ...result,
    document: {
      ...result.document,
      blocks: result.document.blocks.map(
        (block) => sizeBlock(block as unknown as BlockLike) as unknown as typeof block,
      ),
    },
  };
}
