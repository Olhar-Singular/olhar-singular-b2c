/**
 * MultipleChoiceView — read-only render of lettered alternatives. The correct
 * alternative is marked authoritatively from the model's `correct` flag (no
 * heuristic re-derivation).
 */

import { Check } from "lucide-react";
import type { QuestionAnswer } from "@/lib/adaptation/canonical/schema";
import { RichTextView } from "../RichTextView";
import { indexToLetter } from "../letters";

type MultipleChoiceAnswer = Extract<QuestionAnswer, { kind: "multipleChoice" }>;

export function MultipleChoiceView({ answer }: { answer: MultipleChoiceAnswer }) {
  return (
    <ul data-testid="answer-multipleChoice" className="space-y-2">
      {answer.alternatives.map((alt, i) => (
        <li
          key={alt.id}
          data-correct={alt.correct}
          className="flex items-start gap-2"
        >
          <span className="font-medium">{indexToLetter(i)})</span>
          <span className="flex-1">
            <RichTextView content={alt.content} />
          </span>
          {alt.correct && (
            <Check data-testid="correct-marker" className="h-4 w-4 text-green-600" aria-label="Resposta correta" />
          )}
        </li>
      ))}
    </ul>
  );
}

export default MultipleChoiceView;
