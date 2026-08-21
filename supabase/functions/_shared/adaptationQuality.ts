// =============================================================================
// Semantic inspection of a generated adaptation — OBSERVE ONLY.
//
// `interpretAiResponse` validates JSON and Zod. That is syntax: a document can
// satisfy the schema perfectly while having quietly dropped half the questions,
// carrying no support text at all, or shipping an empty justification. Today
// those outcomes are indistinguishable from success, and the professor is
// charged a credit for them either way.
//
// This module does NOT reask and does NOT fail the request. It reports what it
// sees so we can find out how often each signal would fire before deciding the
// failure policy — which is a money decision (charge? refund? deliver with a
// warning?) and deserves data first. Enforcement, if it comes, feeds these
// same codes into the reask loop that already exists.
// =============================================================================

export type QualitySignal =
  | { code: "missing_questions"; expected: number; got: number }
  | { code: "no_scaffolding"; questionCount: number }
  | { code: "empty_justification" };

type StemBlock = { type: string };
type ActivityBlock = { type: string; stem?: StemBlock[] };

/**
 * Structurally an `AdaptationResult` (see `buildAdaptationResult`): the blocks
 * live under `document`, NOT at the top level. Getting this wrong is what made
 * the first version of this module throw
 * "Cannot read properties of undefined (reading 'filter')" on every generation
 * — after the AI call had already succeeded and the user had already waited.
 */
export interface InspectableActivity {
  document: { blocks: ActivityBlock[] };
  pedagogical_justification: string;
}

/**
 * Below this, an activity is short enough that support text is a judgement
 * call rather than an omission — demanding it from a two-question worksheet
 * would fire on adaptations that are perfectly fine.
 */
const SCAFFOLDING_REQUIRED_ABOVE = 2;

export function inspectAdaptationQuality(
  activity: InspectableActivity,
  expectedQuestionCount?: number,
): QualitySignal[] {
  const signals: QualitySignal[] = [];
  const blocks = activity.document.blocks;
  const questions = blocks.filter((b) => b.type === "question");

  // Only meaningful when the caller actually knows how many questions went in
  // (upload extraction and bank selection both do; free-typed text does not).
  if (expectedQuestionCount && questions.length < expectedQuestionCount) {
    signals.push({
      code: "missing_questions",
      expected: expectedQuestionCount,
      got: questions.length,
    });
  }

  const hasScaffolding = blocks.some(
    (b) => b.type === "scaffolding" || (b.stem ?? []).some((s) => s.type === "scaffolding"),
  );
  if (questions.length > SCAFFOLDING_REQUIRED_ABOVE && !hasScaffolding) {
    signals.push({ code: "no_scaffolding", questionCount: questions.length });
  }

  if (!activity.pedagogical_justification.trim()) {
    signals.push({ code: "empty_justification" });
  }

  return signals;
}
