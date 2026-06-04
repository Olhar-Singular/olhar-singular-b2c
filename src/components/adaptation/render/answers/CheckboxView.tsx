/**
 * CheckboxView — read-only render of checkbox items. Each item's authored
 * `checked` flag marks the answer key authoritatively.
 */

import { Check } from "lucide-react";
import type { QuestionAnswer } from "@/lib/adaptation/canonical/schema";
import { RichTextView } from "../RichTextView";

type CheckboxAnswer = Extract<QuestionAnswer, { kind: "checkbox" }>;

export function CheckboxView({ answer }: { answer: CheckboxAnswer }) {
  return (
    <ul data-testid="answer-checkbox" className="space-y-2">
      {answer.items.map((item) => (
        <li key={item.id} data-checked={item.checked} className="flex items-start gap-2">
          <span
            className="flex h-4 w-4 shrink-0 items-center justify-center rounded border border-border"
            aria-label={item.checked ? "Marcado" : "Não marcado"}
          >
            {item.checked && <Check data-testid="checked-marker" className="h-3 w-3 text-green-600" />}
          </span>
          <span className="flex-1">
            <RichTextView content={item.content} />
          </span>
        </li>
      ))}
    </ul>
  );
}

export default CheckboxView;
