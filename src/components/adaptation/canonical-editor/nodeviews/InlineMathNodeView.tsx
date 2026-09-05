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
import { FOLHA_BUTTON, FOLHA_SELECTED } from "../folhaChrome";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { inlineLatexToHtml } from "./nodeViewUtils";
import { useLatexDraft } from "./useLatexDraft";

/**
 * Marca visual de "descrição desatualizada" na fórmula inline (achado 0437).
 *
 * A primeira tentativa (achado 0436) foi `underline decoration-wavy` no
 * `<button>`. O CSS entrava e o computado confirmava, mas nenhum pixel era
 * pintado: pela CSS Text Decoration nível 3 a decoração de um ancestral NÃO
 * atravessa caixa inline-level atômica, e o único filho do gatilho é o HTML do
 * KaTeX, cujo `.katex .base` é `inline-block`. Fundo não sofre essa regra (ele
 * pinta sob o descendente), então o ondulado vem de um `background-image` de
 * gradiente repetido ancorado na base do gatilho (regra em `index.css`), que
 * também não ocupa caixa: a folha continua compondo linha a linha igual ao
 * impresso (achado 0406).
 */
export const ALT_STALE_MARK_CLASS = "inlinemath-alt-stale";

export function InlineMathNodeView({ node, updateAttributes, editor, selected }: NodeViewProps) {
  const [editing, setEditing] = useState(false);
  const { latex, alt } = node.attrs as { latex: string; alt: string | null };
  const disabled = !editor.isEditable;
  // Latex vazio é irrepresentável e o alt não sobrevive à troca da fórmula
  // (achado 0436) — ver useLatexDraft.
  const draft = useLatexDraft(latex, alt, updateAttributes);

  return (
    <NodeViewWrapper
      as="span"
      className={cn("inline-flex items-center", selected && FOLHA_SELECTED)}
      data-testid="inlinemath-node"
      contentEditable={false}
    >
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
            className={cn("h-6 w-32 px-1 py-0 text-sm", draft.altStale && "border-destructive")}
            onChange={(e) => draft.onAltChange(e.target.value)}
            placeholder="Texto alternativo"
            aria-label="Texto alternativo da fórmula inline"
          />
          {/* Achado 0436: zerar o alt em silêncio trocaria uma mentira por um
              buraco — o professor vê que a descrição ficou para trás. */}
          {draft.altStale && (
            <span role="status" data-testid="inlinemath-alt-stale" className="text-xs text-surface-danger">
              Descrição desatualizada
            </span>
          )}
          <Button type="button" size="sm" variant="outline" className={cn("h-6 px-1.5 text-xs", FOLHA_BUTTON)} onClick={() => setEditing(false)}>
            Pronto
          </Button>
        </span>
      ) : (
        <button
          type="button"
          className={cn(
            "-mx-0.5 rounded px-0.5 align-middle hover:bg-accent",
            // Aviso de descrição desatualizada: tinta DO PRÓPRIO gatilho, não
            // decoração herdada (achado 0437) — ver ALT_STALE_MARK_CLASS.
            draft.altStale && ALT_STALE_MARK_CLASS
          )}
          disabled={disabled}
          onClick={() => setEditing(true)}
          title={draft.altStale ? "Editar fórmula — descrição desatualizada" : "Editar fórmula"}
          aria-label={
            draft.altStale
              ? `Editar fórmula: ${draft.accessibleName} (descrição desatualizada)`
              : `Editar fórmula: ${draft.accessibleName}`
          }
          data-alt-stale={draft.altStale ? "true" : undefined}
          data-testid="inlinemath-render"
        >
          <span
            role="math"
            aria-label={draft.accessibleName}
            data-testid="inlinemath-math"
            dangerouslySetInnerHTML={{ __html: inlineLatexToHtml(latex) }}
          />
        </button>
      )}
    </NodeViewWrapper>
  );
}
