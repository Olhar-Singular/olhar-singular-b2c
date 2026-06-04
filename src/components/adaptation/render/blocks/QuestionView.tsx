/**
 * QuestionView — read-only render of a canonical question block.
 *
 * The question number is AUTOMATIC: it is computed from the question's position
 * among the document's question blocks and passed in via `number` — the block
 * itself stores no number/points/difficulty. Renders the recursive stem blocks
 * (via the shared BlockView dispatcher), an optional instruction, and the typed
 * answer via AnswerView. The authored answer `kind` and correct-answer flags are
 * authoritative.
 */

import type { Block } from "@/lib/adaptation/canonical/schema";
import { nodeStyleToCss } from "../style";
import { RichTextView } from "../RichTextView";
import { AnswerView } from "../answers/AnswerView";
import { BlockView } from "../BlockView";
import { questionNumbers } from "../questionNumbering";

type QuestionBlock = Extract<Block, { type: "question" }>;

export function QuestionView({ block, number }: { block: QuestionBlock; number: number }) {
  const stemNumbers = questionNumbers(block.stem);
  return (
    <div data-testid="question" className="space-y-2" style={nodeStyleToCss(block.style)}>
      <div className="flex items-baseline gap-2 text-sm text-muted-foreground">
        <span data-testid="question-number" className="font-semibold text-foreground">
          {number}.
        </span>
      </div>

      <div className="space-y-2">
        {block.stem.map((child, i) => (
          <BlockView key={child.id} block={child} number={stemNumbers[i]} />
        ))}
      </div>

      {block.instruction && (
        <p className="text-sm italic text-muted-foreground" data-testid="question-instruction">
          <RichTextView content={block.instruction} />
        </p>
      )}

      <AnswerView answer={block.answer} />
    </div>
  );
}

export default QuestionView;
