/**
 * CheckboxView — read-only render of checkbox items.
 * Answer key is hidden: all boxes rendered empty. Mirrors PdfAnswer (checkbox).
 */

import type { QuestionAnswer } from "@/lib/adaptation/canonical/schema";
import { RichTextView } from "../RichTextView";
import { CheckboxBox } from "../CheckboxBox";

type CheckboxAnswer = Extract<QuestionAnswer, { kind: "checkbox" }>;

export function CheckboxView({ answer }: { answer: CheckboxAnswer }) {
  return (
    <ul data-testid="answer-checkbox" className="space-y-2">
      {answer.items.map((item) => (
        <li key={item.id} className="flex items-start gap-2">
          <CheckboxBox />
          <span className="flex-1">
            <RichTextView content={item.content} />
          </span>
        </li>
      ))}
    </ul>
  );
}

export default CheckboxView;
