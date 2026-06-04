/**
 * BlockMathNodeView — renders KaTeX from the `latex` attr.
 *
 * Click the rendered math to edit the latex (and alt) inline. The KaTeX HTML is
 * produced by the reused `renderMathToHtml` from `lib/domain/latexRenderer`.
 */

import { useState } from "react";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { latexToHtml } from "./nodeViewUtils";

export function BlockMathNodeView({ node, updateAttributes, editor }: NodeViewProps) {
  const [editing, setEditing] = useState(false);
  const { latex, alt } = node.attrs as { latex: string; alt: string | null };
  const disabled = !editor.isEditable;

  return (
    <NodeViewWrapper className="my-3" data-testid="blockmath-node" contentEditable={false}>
      {editing && !disabled ? (
        <div className="flex flex-col gap-2 rounded-lg border border-border p-2">
          <Input
            value={latex}
            autoFocus
            onChange={(e) => updateAttributes({ latex: e.target.value })}
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
        <button
          type="button"
          className="block w-full rounded-lg border border-transparent p-2 text-center hover:border-border"
          disabled={disabled}
          onClick={() => setEditing(true)}
          title="Editar fórmula"
          data-testid="blockmath-render"
          dangerouslySetInnerHTML={{ __html: latexToHtml(latex) }}
        />
      )}
    </NodeViewWrapper>
  );
}
