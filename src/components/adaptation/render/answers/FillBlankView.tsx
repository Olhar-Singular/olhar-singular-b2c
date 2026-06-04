/**
 * FillBlankView — read-only render of fill-in-the-blank gaps. Each gap shows
 * its authoritative answer (and accepted alternatives / tip when authored).
 */

import type { QuestionAnswer } from "@/lib/adaptation/canonical/schema";

type FillBlankAnswer = Extract<QuestionAnswer, { kind: "fillBlank" }>;

export function FillBlankView({ answer }: { answer: FillBlankAnswer }) {
  return (
    <ol data-testid="answer-fillBlank" className="list-decimal space-y-2 pl-6">
      {answer.gaps.map((gap) => (
        <li key={gap.id}>
          <span data-testid="gap-answer" className="rounded bg-muted px-1 font-medium">
            {gap.answer}
          </span>
          {gap.alternatives && gap.alternatives.length > 0 && (
            <span className="ml-2 text-sm text-muted-foreground">
              (também: {gap.alternatives.join(", ")})
            </span>
          )}
          {gap.tip && <span className="ml-2 text-sm italic text-muted-foreground">{gap.tip}</span>}
        </li>
      ))}
    </ol>
  );
}

export default FillBlankView;
