/**
 * InlineMathNodeView — renders an inline `inlineMath` atom as KaTeX (inline
 * display mode, identical to the read-only `RichTextView`). Without a NodeView
 * the atom shows as a blank gap and can't be edited; here clicking the rendered
 * math reveals a small input to edit the `latex` attr.
 */

import { useState } from "react";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { inlineLatexToHtml } from "./nodeViewUtils";

export function InlineMathNodeView({ node, updateAttributes, editor }: NodeViewProps) {
  const [editing, setEditing] = useState(false);
  const { latex } = node.attrs as { latex: string };
  const disabled = !editor.isEditable;

  return (
    <NodeViewWrapper as="span" className="inline-flex items-center" data-testid="inlinemath-node" contentEditable={false}>
      {editing && !disabled ? (
        <span className="inline-flex items-center gap-1 rounded border border-border px-1 align-middle">
          <Input
            value={latex}
            autoFocus
            className="h-6 w-28 px-1 py-0 text-sm"
            onChange={(e) => updateAttributes({ latex: e.target.value })}
            placeholder="LaTeX"
            aria-label="Expressão LaTeX inline"
          />
          <Button type="button" size="sm" variant="outline" className="h-6 px-1.5 text-xs" onClick={() => setEditing(false)}>
            Pronto
          </Button>
        </span>
      ) : (
        <button
          type="button"
          className="rounded px-0.5 align-middle hover:bg-accent"
          disabled={disabled}
          onClick={() => setEditing(true)}
          title="Editar fórmula"
          data-testid="inlinemath-render"
          dangerouslySetInnerHTML={{ __html: inlineLatexToHtml(latex) }}
        />
      )}
    </NodeViewWrapper>
  );
}
