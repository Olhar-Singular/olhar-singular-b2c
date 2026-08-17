/**
 * InlineMathNodeView — renders an inline `inlineMath` atom as KaTeX (inline
 * display mode, identical to the read-only `RichTextView`). Without a NodeView
 * the atom shows as a blank gap and can't be edited; here clicking the rendered
 * math reveals small inputs to edit the `latex` and `alt` attrs.
 *
 * The rendered formula carries `role="math"` + `aria-label={alt ?? latex}`, the
 * same exposure the read-only `RichTextView` gives it: the alt the teacher typed
 * has to be announced on the screen where he reviews the activity, and without
 * the aria-label the accessible name collapses into the duplicated MathML text.
 * That role lives on an inner non-interactive `<span>`, never on the `<button>`:
 * an explicit role REPLACES the implicit one, so `role="math"` on the button
 * would erase the edit affordance from the accessibility tree (WCAG 4.1.2).
 *
 * The button's horizontal padding (the click target / hover highlight) is undone
 * by an equal negative margin: the printed surface renders the formula as a bare
 * `<span>`, so any leftover box space would push the neighbouring text apart on
 * the review sheet only, and the sheet has to compose exactly like the print.
 */

import { useState } from "react";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { inlineLatexToHtml } from "./nodeViewUtils";
import { useLatexDraft } from "./useLatexDraft";

export function InlineMathNodeView({ node, updateAttributes, editor }: NodeViewProps) {
  const [editing, setEditing] = useState(false);
  const { latex, alt } = node.attrs as { latex: string; alt: string | null };
  const disabled = !editor.isEditable;
  // An empty latex is unrepresentable — see useLatexDraft.
  const draft = useLatexDraft(latex, (next) => updateAttributes({ latex: next }));

  return (
    <NodeViewWrapper as="span" className="inline-flex items-center" data-testid="inlinemath-node" contentEditable={false}>
      {editing && !disabled ? (
        <span className="inline-flex items-center gap-1 rounded border border-border px-1 align-middle">
          <Input
            value={draft.value}
            autoFocus
            className="h-6 w-28 px-1 py-0 text-sm"
            onChange={(e) => draft.onChange(e.target.value)}
            onBlur={draft.onBlur}
            placeholder="LaTeX"
            aria-label="Expressão LaTeX inline"
          />
          <Input
            value={alt ?? ""}
            className="h-6 w-32 px-1 py-0 text-sm"
            onChange={(e) => updateAttributes({ alt: e.target.value || null })}
            placeholder="Texto alternativo"
            aria-label="Texto alternativo da fórmula inline"
          />
          <Button type="button" size="sm" variant="outline" className="h-6 px-1.5 text-xs" onClick={() => setEditing(false)}>
            Pronto
          </Button>
        </span>
      ) : (
        <button
          type="button"
          className="-mx-0.5 rounded px-0.5 align-middle hover:bg-accent"
          disabled={disabled}
          onClick={() => setEditing(true)}
          title="Editar fórmula"
          aria-label={`Editar fórmula: ${alt ?? latex}`}
          data-testid="inlinemath-render"
        >
          <span
            role="math"
            aria-label={alt ?? latex}
            data-testid="inlinemath-math"
            dangerouslySetInnerHTML={{ __html: inlineLatexToHtml(latex) }}
          />
        </button>
      )}
    </NodeViewWrapper>
  );
}
