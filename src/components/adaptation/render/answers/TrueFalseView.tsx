/**
 * TrueFalseView — read-only render of true/false statements.
 * Answer key is hidden: blank "(  ) V  (  ) F" markers shown instead of the
 * authored value. Mirrors PdfAnswer (trueFalse).
 */

import type { QuestionAnswer } from "@/lib/adaptation/canonical/schema";
import {
  TRUE_FALSE_MARKER_GAP_PX,
  TRUE_FALSE_MARKER_TEXT,
} from "@/components/adaptation/render/pageTokens";
import { RichTextView } from "../RichTextView";

type TrueFalseAnswer = Extract<QuestionAnswer, { kind: "trueFalse" }>;

export function TrueFalseView({ answer }: { answer: TrueFalseAnswer }) {
  return (
    <ul data-testid="answer-trueFalse" className="space-y-2">
      {answer.items.map((item) => (
        <li
          key={item.id}
          className="flex items-start"
          style={{ columnGap: `${TRUE_FALSE_MARKER_GAP_PX}px` }}
        >
          <span className="shrink-0 font-medium" aria-label="Marque Verdadeiro ou Falso">
            {TRUE_FALSE_MARKER_TEXT}
          </span>
          <span className="flex-1">
            <RichTextView content={item.content} />
          </span>
        </li>
      ))}
    </ul>
  );
}

export default TrueFalseView;
