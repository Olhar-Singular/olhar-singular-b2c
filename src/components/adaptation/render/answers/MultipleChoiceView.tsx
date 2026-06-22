/**
 * MultipleChoiceView — read-only render of lettered alternatives.
 * Answer key is hidden: no correct marker is shown. Mirrors PdfAnswer (multipleChoice).
 */

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
          className="flex items-start gap-2"
        >
          <span className="font-medium">{indexToLetter(i)})</span>
          <span className="flex-1">
            <RichTextView content={alt.content} />
          </span>
        </li>
      ))}
    </ul>
  );
}

export default MultipleChoiceView;
