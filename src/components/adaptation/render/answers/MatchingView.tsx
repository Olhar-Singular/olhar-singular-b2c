/**
 * MatchingView — read-only render of matching pairs (left ↔ right). The
 * authored pairing is the answer key.
 */

import type { QuestionAnswer } from "@/lib/adaptation/canonical/schema";
import { RichTextView } from "../RichTextView";

type MatchingAnswer = Extract<QuestionAnswer, { kind: "matching" }>;

export function MatchingView({ answer }: { answer: MatchingAnswer }) {
  return (
    <ul data-testid="answer-matching" className="space-y-2">
      {answer.pairs.map((pair) => (
        <li key={pair.id} className="flex items-center gap-2">
          <span className="flex-1">
            <RichTextView content={pair.left} />
          </span>
          <span aria-hidden className="text-muted-foreground">
            ↔
          </span>
          <span className="flex-1">
            <RichTextView content={pair.right} />
          </span>
        </li>
      ))}
    </ul>
  );
}

export default MatchingView;
