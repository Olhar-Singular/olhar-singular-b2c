/**
 * MultipleChoiceView — read-only render of lettered alternatives.
 * Answer key is hidden: no correct marker is shown. Mirrors PdfAnswer (multipleChoice).
 */

import type { QuestionAnswer } from "@/lib/adaptation/canonical/schema";
import { RichTextView } from "../RichTextView";
import { indexToLetter } from "../letters";
import { ALTERNATIVE_MARKER_CLASS } from "./markerColumn";

type MultipleChoiceAnswer = Extract<QuestionAnswer, { kind: "multipleChoice" }>;

export function MultipleChoiceView({ answer }: { answer: MultipleChoiceAnswer }) {
  return (
    <ul data-testid="answer-multipleChoice" className="space-y-2">
      {answer.alternatives.map((alt, i) => (
        <li
          key={alt.id}
          className="flex items-start gap-2"
        >
          <span data-testid="alternative-marker" className={ALTERNATIVE_MARKER_CLASS}>
            {indexToLetter(i)})
          </span>
          <span className="flex-1">
            <RichTextView content={alt.content} />
          </span>
        </li>
      ))}
    </ul>
  );
}

export default MultipleChoiceView;
