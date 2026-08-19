// =============================================================================
// Strips the question ordinal the model echoes back into the stem.
//
// Both activity builders (`buildActivityText` for the bank path and
// `buildActivityTextFromExtraction` for the upload path) emit
// `${i + 1}) ${q.text}`. That numbering is deliberate: it gives the model
// question boundaries and a stable order, which MODO FIEL depends on.
//
// The model then reproduces the prefix faithfully inside the stem — and the
// renderer numbers the question AGAIN from document order, because canonical
// questions carry no number of their own. The sheet ended up reading
// "1. 1) O conceito de lugar".
//
// Fixing it in the renderer is wrong (the number genuinely is in the text) and
// dropping it from the builders is worse (the model loses the ordering cue).
// So it is removed here, deterministically, after generation.
// =============================================================================

import type { AdaptationResult } from "../../../src/lib/adaptation/canonical/schema.ts";

/**
 * A leading ordinal: optional space, digits, then a separator that marks it as
 * a label rather than content. The separator is required — "5 maçãs custam
 * quanto?" opens with a digit but is the question itself, not its number.
 */
const LEADING_ORDINAL = /^\s*\d+\s*[).\-–—]\s+/;

type InlineLike = { type: string; text?: string };
type BlockLike = { type: string; content?: InlineLike[]; stem?: BlockLike[] };

function stripFromStem(stem: BlockLike[]): BlockLike[] {
  // `first` is always defined: the caller only calls in for a non-empty stem.
  const [first, ...rest] = stem;
  if (!first.content?.length) return stem;

  const [firstInline, ...otherInlines] = first.content;
  if (firstInline.type !== "text" || typeof firstInline.text !== "string") return stem;

  const stripped = firstInline.text.replace(LEADING_ORDINAL, "");
  // A stem that is ONLY an ordinal would be blanked to "", which
  // InlineText.min(1) rejects — the document would then fail to reload at all.
  // Leaving the oddity visible beats shipping something that cannot reopen.
  if (stripped === firstInline.text || stripped.length === 0) return stem;

  return [
    { ...first, content: [{ ...firstInline, text: stripped }, ...otherInlines] },
    ...rest,
  ];
}

/** Remove the echoed ordinal from the opening text of every question stem. */
export function stripQuestionNumbers(result: AdaptationResult): AdaptationResult {
  return {
    ...result,
    document: {
      ...result.document,
      blocks: result.document.blocks.map((block) => {
        const b = block as unknown as BlockLike;
        if (b.type !== "question" || !b.stem?.length) return block;
        return { ...block, stem: stripFromStem(b.stem) } as typeof block;
      }),
    },
  };
}
