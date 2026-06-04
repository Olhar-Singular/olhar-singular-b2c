/**
 * TrueFalseView — read-only render of true/false statements. Each statement's
 * authored `value` marks V (true) or F (false) authoritatively.
 */

import type { QuestionAnswer } from "@/lib/adaptation/canonical/schema";
import { RichTextView } from "../RichTextView";

type TrueFalseAnswer = Extract<QuestionAnswer, { kind: "trueFalse" }>;

export function TrueFalseView({ answer }: { answer: TrueFalseAnswer }) {
  return (
    <ul data-testid="answer-trueFalse" className="space-y-2">
      {answer.items.map((item) => (
        <li key={item.id} data-value={item.value} className="flex items-start gap-2">
          <span
            className="font-bold"
            aria-label={item.value ? "Verdadeiro" : "Falso"}
          >
            ({item.value ? "V" : "F"})
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
