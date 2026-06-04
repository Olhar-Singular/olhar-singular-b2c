/**
 * OpenAnswerView — read-only render of an open answer: a set of blank answer
 * lines (defaults to 3 when not authored).
 */

import type { QuestionAnswer } from "@/lib/adaptation/canonical/schema";

type OpenAnswer = Extract<QuestionAnswer, { kind: "open" }>;

export function OpenAnswerView({ answer }: { answer: OpenAnswer }) {
  const lines = answer.answerLines ?? 3;
  return (
    <div data-testid="answer-open" className="space-y-3" aria-label="Linhas de resposta">
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="border-b border-dashed border-border" />
      ))}
    </div>
  );
}

export default OpenAnswerView;
