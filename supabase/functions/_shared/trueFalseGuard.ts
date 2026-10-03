// =============================================================================
// Edge-only guard against trueFalse questions whose items are the answer
// options themselves ("Verdadeiro" / "Falso") instead of statements to judge.
//
// Every trueFalse item is printed with its own "( ) V ( ) F" marker, so an item
// reading "Verdadeiro" asks the student to judge the word "Verdadeiro", and its
// `value` answer key means nothing. The model does this when the statement sits
// in the stem (often as a blockMath). There is no deterministic repair (the
// statement may be math, text, or both), so the output is rejected and the
// model is reasked with a precise error.
//
// Lives in _shared/ (edge-only, Vitest-covered). Imports the canonical types
// ONLY as types, with explicit .ts extension for Deno. Never touches the shared
// schema, so browser parsing/render is unaffected.
// =============================================================================

import type { AdaptationResult } from "../../../src/lib/adaptation/canonical/schema.ts";

/**
 * A bare true/false label, optionally wrapped in a "( )" box or brackets and
 * followed by trailing punctuation: V, F, Verdadeiro(a), Falso(a), Certo, Errado.
 */
const LABEL_ONLY =
  /^[\s(\[]*\)?\s*(?:v|f|verdadeir[oa]|fals[oa]|certo|errado)\s*[)\]]?[\s.!:;]*$/i;

type InlineLike = { type: string; text?: string };
type ItemLike = { content: InlineLike[] };
type BlockLike = { type: string; answer?: { kind: string; items?: ItemLike[] } };

function isLabelOnly(content: InlineLike[]): boolean {
  if (content.some((n) => n.type !== "text")) return false;
  return LABEL_ONLY.test(content.map((n) => n.text).join(""));
}

/**
 * One reask error per trueFalse question (numbered in document order) that has
 * at least one item which is only a V/F label. Empty when the document is fine.
 */
export function findLabelOnlyTrueFalseItems(result: AdaptationResult): string[] {
  const errors: string[] = [];
  let questionNumber = 0;
  for (const block of result.document.blocks as unknown as BlockLike[]) {
    if (block.type !== "question") continue;
    questionNumber += 1;
    const answer = block.answer!;
    if (answer.kind !== "trueFalse") continue;
    if (!answer.items!.some((item) => isLabelOnly(item.content))) continue;
    errors.push(
      `Questão ${questionNumber} ("trueFalse"): cada item deve ser uma afirmação a ser julgada, ` +
        `não as opções "Verdadeiro"/"Falso" (o marcador "( ) V ( ) F" já é impresso automaticamente). ` +
        `Coloque a afirmação no "content" do item e o gabarito em "value".`,
    );
  }
  return errors;
}
