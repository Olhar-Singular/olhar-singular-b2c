/**
 * QuestionNodeView — renders a question block in the editor.
 *
 * - number / points / difficulty are editable badges (stored as node attrs).
 * - the stem is editable rich content via `NodeViewContent`.
 * - the discriminated `answer` is edited through `AnswerEditor`, whose changes
 *   are written back via `updateAttributes({ answer })`.
 */

import { NodeViewWrapper, NodeViewContent, type NodeViewProps } from "@tiptap/react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type { QuestionAnswer } from "@/lib/adaptation/canonical/schema";
import { AnswerEditor } from "../answer-editors/AnswerEditor";
import { parsePositiveNumber } from "./nodeViewUtils";

const DIFFICULTIES = [
  { value: "facil", label: "Fácil" },
  { value: "medio", label: "Médio" },
  { value: "dificil", label: "Difícil" },
] as const;

export function QuestionNodeView({ node, updateAttributes, editor }: NodeViewProps) {
  const { number, points, difficulty } = node.attrs as {
    number: number | null;
    points: number | null;
    difficulty: string | null;
  };
  const answer = node.attrs.answer as QuestionAnswer;
  const disabled = !editor.isEditable;

  return (
    <NodeViewWrapper className="my-3 rounded-lg border border-border p-3" data-testid="question-node">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Badge variant="secondary">Questão</Badge>
        <label className="flex items-center gap-1 text-xs text-muted-foreground">
          Nº
          <Input
            type="number"
            className="h-7 w-16"
            value={number ?? ""}
            disabled={disabled}
            onChange={(e) => updateAttributes({ number: parsePositiveNumber(e.target.value) })}
            aria-label="Número da questão"
          />
        </label>
        <label className="flex items-center gap-1 text-xs text-muted-foreground">
          Pontos
          <Input
            type="number"
            className="h-7 w-16"
            value={points ?? ""}
            disabled={disabled}
            onChange={(e) => updateAttributes({ points: parsePositiveNumber(e.target.value) })}
            aria-label="Pontos da questão"
          />
        </label>
        <div className="flex gap-1">
          {DIFFICULTIES.map((d) => (
            <button
              key={d.value}
              type="button"
              disabled={disabled}
              onClick={() => updateAttributes({ difficulty: difficulty === d.value ? null : d.value })}
              className={
                difficulty === d.value
                  ? "rounded bg-primary px-2 py-0.5 text-xs text-primary-foreground"
                  : "rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground"
              }
            >
              {d.label}
            </button>
          ))}
        </div>
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
