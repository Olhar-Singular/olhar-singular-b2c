/**
 * OrderingView — read-only render of an ordering answer.
 * Answer key is hidden: items shown in array order (no sort by position);
 * each item has a blank "____" slot for the student to write the order.
 * Mirrors PdfAnswer (ordering).
 */

import type { QuestionAnswer } from "@/lib/adaptation/canonical/schema";
import { RichTextView } from "../RichTextView";

type OrderingAnswer = Extract<QuestionAnswer, { kind: "ordering" }>;

export function OrderingView({ answer }: { answer: OrderingAnswer }) {
  return (
    <ul data-testid="answer-ordering" className="space-y-1">
      {answer.items.map((item) => (
        <li key={item.id} className="flex items-start gap-2">
          <span className="shrink-0 font-medium">____</span>
          <span className="flex-1">
            <RichTextView content={item.content} />
          </span>
        </li>
      ))}
    </ul>
  );
}

export default OrderingView;
