/**
 * FillBlankView — read-only render of fill-in-the-blank answer.
 * Answer key is hidden: gaps live inline in the stem; nothing to render here.
 * Returns null. Mirrors PdfAnswer (fillBlank → <View/>).
 */

import type { QuestionAnswer } from "@/lib/adaptation/canonical/schema";

type FillBlankAnswer = Extract<QuestionAnswer, { kind: "fillBlank" }>;

export function FillBlankView({ answer: _answer }: { answer: FillBlankAnswer }) {
  return null;
}

export default FillBlankView;
