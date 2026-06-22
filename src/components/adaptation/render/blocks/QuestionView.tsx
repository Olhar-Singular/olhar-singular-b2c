/**
 * QuestionView — read-only render of a canonical question block.
 *
 * The question number is AUTOMATIC: computed from the question's position
 * among the document's question blocks and passed in via `number`. If the
 * block carries a `customNumber` override, that takes precedence. The number
 * is rendered inline (flex row) with the stem content so the layout mirrors
 * the printed question format. Renders the recursive stem blocks (via the
 * shared BlockView dispatcher), an optional enunciado at the chosen position
 * (above or below the stem), an optional instruction, and the typed answer via
 * AnswerView. The authored answer `kind` and correct-answer flags are
 * authoritative.
 */

import type { Block } from "@/lib/adaptation/canonical/schema";
import { nodeStyleToCss } from "../style";
import { RichTextView } from "../RichTextView";
import { AnswerView } from "../answers/AnswerView";
import { BlockView } from "../BlockView";
import { questionNumbers } from "../questionNumbering";

type QuestionBlock = Extract<Block, { type: "question" }>;

export function QuestionView({
  block,
  number,
  selectedId,
}: {
  block: QuestionBlock;
  number: number;
  selectedId?: string;
}) {
  const stemNumbers = questionNumbers(block.stem);
  const hasEnunciado = block.enunciado != null && block.enunciado.length > 0;
  const position = block.enunciadoPosition ?? "below";
  const displayNumber = block.customNumber ?? number.toString();

  const enunciadoNode = hasEnunciado ? (
    <p className="text-sm text-foreground" data-testid="question-enunciado">
      <RichTextView content={block.enunciado!} />
    </p>
  ) : null;

  return (
    <div data-testid="question" className="space-y-2" style={nodeStyleToCss(block.style)}>
      <div className="flex items-baseline gap-2">
        <span data-testid="question-number" className="shrink-0 font-bold text-foreground">
          {displayNumber}.
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {position === "above" && enunciadoNode}
          <div className="space-y-2">
            {block.stem.map((child, i) => (
              <BlockView key={child.id} block={child} number={stemNumbers[i]} selectedId={selectedId} />
            ))}
          </div>
          {position === "below" && enunciadoNode}
        </div>
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
