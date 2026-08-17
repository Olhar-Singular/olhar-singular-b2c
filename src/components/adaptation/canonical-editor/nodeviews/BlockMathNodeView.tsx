/**
 * BlockMathNodeView — renders KaTeX from the `latex` attr.
 *
 * Click the rendered math to edit the latex (and alt) inline. The KaTeX HTML is
 * produced by the reused `renderMathToHtml` from `lib/domain/latexRenderer`.
 * A delete button appears on hover (top-right rail) to remove the block.
 *
 * `role="math"` (with the teacher's alt as accessible name) lives on a
 * non-interactive `<span>`, never on the `<button>`: an explicit role REPLACES
 * the implicit one, so putting it on the button would erase the edit affordance
 * from the accessibility tree (WCAG 4.1.2).
 *
 * O botão de edição é um OVERLAY absoluto sobre a fórmula, não um embrulho: o
 * chrome de edição não pode entrar no fluxo vertical da folha (achado 0405).
 */

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { latexToHtml } from "./nodeViewUtils";
import { useLatexDraft } from "./useLatexDraft";

export function BlockMathNodeView({ node, updateAttributes, editor, deleteNode }: NodeViewProps) {
  const [editing, setEditing] = useState(false);
  const { latex, alt } = node.attrs as { latex: string; alt: string | null };
  const disabled = !editor.isEditable;
  // An empty latex is unrepresentable — see useLatexDraft.
  const draft = useLatexDraft(latex, (next) => updateAttributes({ latex: next }));

  return (
    <NodeViewWrapper className="group relative my-3" data-testid="blockmath-node" contentEditable={false}>
      {/* Hover rail: delete button */}
      <div
        className="absolute right-0 top-0 z-10 hidden items-center gap-1 rounded-md border border-surface-line-2 bg-surface-paper p-0.5 shadow-sm group-hover:flex group-focus-within:flex"
        contentEditable={false}
      >
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-destructive"
          disabled={disabled}
          onClick={() => deleteNode()}
          title="Excluir fórmula"
          aria-label="Excluir fórmula"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      {editing && !disabled ? (
        <div className="flex flex-col gap-2 rounded-lg border border-border p-2">
          <Input
            value={draft.value}
            autoFocus
            onChange={(e) => draft.onChange(e.target.value)}
            onBlur={draft.onBlur}
            placeholder="LaTeX"
            aria-label="Expressão LaTeX"
          />
          <Input
            value={alt ?? ""}
            onChange={(e) => updateAttributes({ alt: e.target.value || null })}
            placeholder="Texto alternativo"
            aria-label="Texto alternativo da fórmula"
          />
          <Button type="button" size="sm" variant="outline" className="self-start" onClick={() => setEditing(false)}>
            Pronto
          </Button>
        </div>
      ) : (
        <div className="relative">
          <span
            role="math"
            aria-label={alt ?? latex}
            data-testid="blockmath-math"
            className="block text-center"
            dangerouslySetInnerHTML={{ __html: latexToHtml(latex) }}
          />
          {/* Overlay: o alvo de clique e a moldura de hover são chrome e vivem
              FORA do fluxo vertical (achado 0405). Antes o botão embrulhava a
              fórmula com `p-2` + `border` e, por ter padding/borda, ainda
              bloqueava o colapso da margem do `.katex-display` com o `my-3` do
              wrapper — 47px de papel a mais que o impresso
              (`render/blocks/BlockMathView`, um div `my-3 text-center`).
              `-inset-2` alarga o alvo e `outline` desenha a moldura sem ocupar
              fluxo. */}
          <button
            type="button"
            className="absolute -inset-2 rounded-lg hover:outline hover:outline-1 hover:outline-border"
            disabled={disabled}
            onClick={() => setEditing(true)}
            title="Editar fórmula"
            aria-label={`Editar fórmula: ${alt ?? latex}`}
            data-testid="blockmath-render"
          />
        </div>
      )}
    </NodeViewWrapper>
  );
}
