/**
 * OrderingView — read-only render of an ordering answer. Items are shown in
 * their authored correct sequence (sorted by `position`), numbered — this is
 * the answer key.
 */

import type { QuestionAnswer } from "@/lib/adaptation/canonical/schema";
import { RichTextView } from "../RichTextView";

type OrderingAnswer = Extract<QuestionAnswer, { kind: "ordering" }>;

export function OrderingView({ answer }: { answer: OrderingAnswer }) {
  const ordered = [...answer.items].sort((a, b) => a.position - b.position);
  return (
    <ol data-testid="answer-ordering" className="list-decimal space-y-1 pl-6">
      {ordered.map((item) => (
        <li key={item.id}>
          <RichTextView content={item.content} />
        </li>
      ))}
    </ol>
  );
}

export default OrderingView;
