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
 * A leading label, in the three shapes the model echoes (C-14: the old single regex accepted a
 * `-` after ANY number, so "9 - 4 = ___" lost its first operand):
 *  1. "Questão 3:", "QUESTÃO 12 -": the word makes it a label, whatever follows. The short "Q5)" /
 *     "Q5:" needs its separator ("Q1 = 5" is content, L7-3).
 *  2. "1)" / "2." GLUED to the digits (one or two, never a year) and followed by a space: "1) 9 - 4" -> "9 - 4". "5 . 3" has a
 *     space before the dot and "5.3" none after it: both are numbers, never labels.
 *  3. "3 - Explique": a dash only counts when what follows is a WORD (2+ letters) that is not
 *     the start of an expression. "9 - 4", "15 - 8", "3 - x = 5" are calculations.
 */
// L7-3: "Q1 = 5" and "Q2 é a mediana" are content. The long word ("Questão 3") is a label on its own;
// the short "Q3" only counts with a separator ("Q3)", "Q3:", "Q3.", or "Q3 - " before a word).
const QUESTION_WORD_LABEL = /^\s*quest[aã]o\s*\d+\s*[:.)\-–—]?\s+/iu;
const SHORT_LABEL = /^\s*q\s*\d+\s*(?:[:.)]|[\-–—](?=\s+\p{L}{2,}(?![\p{L}\d_^(])(?!\s*[=+\-−–—×*/÷^<>])))\s+/iu;
// A year ("2024. Foi...") is not an ordinal: question numbers have one or two digits.
const GLUED_LABEL = /^\s*\d{1,2}[.)]\s+/;
// A unit or a number word right after "12 - " (and nothing else) is a quantity, not a title.
const QUANTITY_ONLY =
  "(?:mm|cm|dm|km|mg|kg|ml|cl|dl|hz|min|seg|um|uma|dois|duas|tr[eê]s|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|cem|mil)\\s*[.,;:?!]?\\s*$";
const DASH_LABEL = new RegExp(
  `^\\s*\\d+\\s+[\\-–—]\\s+(?!${QUANTITY_ONLY})(?=\\p{L}{2,}(?![\\p{L}\\d_^(])(?!\\s*[=+\\-−–—×*/÷^<>]))`,
  "iu",
);

function stripLabel(text: string): string {
  return text.replace(QUESTION_WORD_LABEL, "").replace(SHORT_LABEL, "").replace(GLUED_LABEL, "").replace(DASH_LABEL, "");
}

type InlineLike = { type: string; text?: string };
type BlockLike = { type: string; content?: InlineLike[]; stem?: BlockLike[] };

function stripFromStem(stem: BlockLike[]): BlockLike[] {
  // `first` is always defined: the caller only calls in for a non-empty stem.
  const [first, ...rest] = stem;
  if (!first.content?.length) return stem;

  const [firstInline, ...otherInlines] = first.content;
  if (firstInline.type !== "text" || typeof firstInline.text !== "string") return stem;

  const stripped = stripLabel(firstInline.text);
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
