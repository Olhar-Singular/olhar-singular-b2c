/**
 * TrueFalseView — read-only render of true/false statements.
 * Answer key is hidden: blank "(  ) V  (  ) F" markers shown instead of the
 * authored value. Mirrors PdfAnswer (trueFalse).
 */

import type { QuestionAnswer } from "@/lib/adaptation/canonical/schema";
import { RichTextView } from "../RichTextView";

type TrueFalseAnswer = Extract<QuestionAnswer, { kind: "trueFalse" }>;

export function TrueFalseView({ answer }: { answer: TrueFalseAnswer }) {
  return (
    <ul data-testid="answer-trueFalse" className="space-y-2">
      {answer.items.map((item) => (
        <li key={item.id} className="flex items-start gap-3">
          <span className="shrink-0 font-medium" aria-label="Marque Verdadeiro ou Falso">
            (  ) V  (  ) F
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
