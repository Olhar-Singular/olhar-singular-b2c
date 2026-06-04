/**
 * QuestionNodeView — renders a question block in the editor.
 *
 * - The header shows a READ-ONLY "Questão N" label, where N is the question's
 *   automatic ordinal (its 1-based position among all question nodes in the
 *   document). Questions have no editable number/points/difficulty.
 * - the stem is editable rich content via `NodeViewContent`.
 * - the discriminated `answer` is edited through `AnswerEditor`, whose changes
 *   are written back via `updateAttributes({ answer })`.
 */

import { NodeViewWrapper, NodeViewContent, type NodeViewProps } from "@tiptap/react";
import { Badge } from "@/components/ui/badge";
import type { QuestionAnswer } from "@/lib/adaptation/canonical/schema";
import { AnswerEditor } from "../answer-editors/AnswerEditor";
import { questionOrdinal } from "./nodeViewUtils";

export function QuestionNodeView({ node, updateAttributes, editor, getPos }: NodeViewProps) {
  const answer = node.attrs.answer as QuestionAnswer;
  const disabled = !editor.isEditable;
  const ordinal = questionOrdinal(editor.state.doc, getPos());

  return (
    <NodeViewWrapper className="my-3 rounded-lg border border-border p-3" data-testid="question-node">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Badge variant="secondary" data-testid="question-ordinal">
          Questão {ordinal}
        </Badge>
      </div>

      <div className="mb-2 rounded border border-dashed border-border p-2">
        <NodeViewContent />
      </div>

      <div className="mt-2" contentEditable={false}>
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Resposta</p>
        <AnswerEditor
          answer={answer}
          disabled={disabled}
          onChange={(next) => updateAttributes({ answer: next })}
        />
      </div>
    </NodeViewWrapper>
  );
}
