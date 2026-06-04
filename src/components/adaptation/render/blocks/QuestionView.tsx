/**
 * QuestionView — read-only render of a canonical question block.
 *
 * Renders the optional number/points/difficulty header, the recursive stem
 * blocks (via the shared BlockView dispatcher), an optional instruction, and
 * the typed answer via AnswerView. The authored answer `kind` and
 * correct-answer flags are authoritative.
 */

import type { Block } from "@/lib/adaptation/canonical/schema";
import { nodeStyleToCss } from "../style";
import { RichTextView } from "../RichTextView";
import { AnswerView } from "../answers/AnswerView";
import { BlockView } from "../BlockView";

type QuestionBlock = Extract<Block, { type: "question" }>;

const DIFFICULTY_LABEL: Record<NonNullable<QuestionBlock["difficulty"]>, string> = {
  facil: "Fácil",
  medio: "Médio",
  dificil: "Difícil",
};

export function QuestionView({ block }: { block: QuestionBlock }) {
  return (
    <div data-testid="question" className="space-y-2" style={nodeStyleToCss(block.style)}>
      <div className="flex items-baseline gap-2 text-sm text-muted-foreground">
        {block.number !== undefined && (
          <span data-testid="question-number" className="font-semibold text-foreground">
            {block.number}.
          </span>
        )}
        {block.points !== undefined && <span data-testid="question-points">({block.points} pts)</span>}
        {block.difficulty !== undefined && (
          <span data-testid="question-difficulty">{DIFFICULTY_LABEL[block.difficulty]}</span>
        )}
      </div>

      <div className="space-y-2">
        {block.stem.map((child) => (
          <BlockView key={child.id} block={child} />
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
