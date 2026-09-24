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

import { useId } from "react";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { Input } from "@/components/ui/input";
import { FOLHA_BUTTON, FOLHA_INPUT, FOLHA_SELECTED } from "../folhaChrome";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { inlineLatexToHtml } from "./nodeViewUtils";
import { useLatexDraft } from "./useLatexDraft";
import { useMathEditing } from "./useMathEditing";

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

/**
 * Largura do campo, em `ch`, acompanhando o valor que ele guarda (achado 0418).
 *
 * As larguras eram constantes (`w-28` no LaTeX, `w-32` no alt) e menores que o
 * conteúdo típico: o alt é frase em português ("x ao quadrado mais 2x mais 1
 * igual a zero", 41 caracteres) e era editado por uma janela de ~17, rolando
 * com as setas, sem nunca aparecer inteiro — logo no campo que vira o nome
 * acessível da fórmula para o leitor de tela. Encolher não preservava nada: o
 * widget já quebra a composição da linha de qualquer jeito.
 *
 * O piso evita o campo sumir quando está vazio; o teto evita que um alt muito
 * longo estoure a coluna de texto da folha (o `max-w-full` fecha a conta na
 * viewport estreita).
 */
const FIELD_MIN_CH = 12;
const FIELD_MAX_CH = 48;

export function inlineFieldWidth(value: string): string {
  const desired = value.length + 2;
  return `${Math.min(Math.max(desired, FIELD_MIN_CH), FIELD_MAX_CH)}ch`;
}

export function InlineMathNodeView({ node, updateAttributes, editor, selected }: NodeViewProps) {
  // 0312 — identidade de campo: sem `id`/`name` o Chrome reporta "A form field
  // element should have an id or name attribute" e o agente do usuário não
  // trata o input como campo. `useId` não colide entre fórmulas da mesma folha.
  const latexId = useId();
  const altId = useId();
  const errorId = useId();
  const { latex, alt } = node.attrs as { latex: string; alt: string | null };
  const disabled = !editor.isEditable;
  // Latex vazio é irrepresentável e o alt não sobrevive à troca da fórmula
  // (achado 0436) — ver useLatexDraft.
  const draft = useLatexDraft(latex, alt, updateAttributes);
  // Escape fecha o editor e devolve o foco à fórmula (achado 0416).
  const editing = useMathEditing(draft.onBlur);

  return (
    <NodeViewWrapper
      as="span"
      className={cn("inline-flex items-center", selected && FOLHA_SELECTED)}
      data-testid="inlinemath-node"
      contentEditable={false}
    >
      {editing.editing && !disabled ? (
        <span
          // 0423 — mesma paleta da caixa em bloco: a folha não segue o tema do app.
          className="inline-flex items-center gap-1 rounded border border-surface-line-2 bg-surface-paper px-1 align-middle"
          onKeyDown={editing.onKeyDown}
        >
          {/* Prévia ao vivo (achado 0421): ver o comentário gêmeo no
              BlockMathNodeView. Aqui ela vem ANTES dos campos, no lugar que a
              fórmula ocupava no parágrafo, e em modo inline — mesmo motor e
              mesmo display mode do que a folha imprime. */}
          <span
            data-testid="inlinemath-preview"
            aria-hidden="true"
            className="max-w-full overflow-x-auto"
            dangerouslySetInnerHTML={{ __html: inlineLatexToHtml(draft.value) }}
          />
          <Input
            id={latexId}
            name="inlinemath-latex"
            value={draft.value}
            autoFocus
            className={cn("h-6 max-w-full px-1 py-0 text-sm", FOLHA_INPUT, draft.error && "border-destructive")}
            style={{ width: inlineFieldWidth(draft.value) }}
            onChange={(e) => draft.onChange(e.target.value)}
            onBlur={draft.onBlur}
            placeholder="LaTeX"
            aria-label="Expressão LaTeX inline"
            aria-invalid={draft.error ? "true" : undefined}
            aria-describedby={draft.error ? errorId : undefined}
          />
          {/* Achado 0434: ver o gêmeo no BlockMathNodeView — LaTeX que não
              parseia fica no rascunho e a razão do KaTeX é dita em texto. */}
          {draft.error && (
            <span id={errorId} role="alert" data-testid="inlinemath-latex-error" className="text-xs text-surface-danger">
              Fórmula inválida: {draft.error}
            </span>
          )}
          <Input
            id={altId}
            name="inlinemath-alt"
            value={alt ?? ""}
            className={cn("h-6 max-w-full px-1 py-0 text-sm", FOLHA_INPUT, draft.altStale && "border-destructive")}
            style={{ width: inlineFieldWidth(alt ?? "") }}
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
          <Button type="button" size="sm" variant="outline" className={cn("h-6 px-1.5 text-xs", FOLHA_BUTTON)} onClick={editing.close}>
            Pronto
          </Button>
        </span>
      ) : (
        <button
          type="button"
          className={cn(
            // 0423 — `--accent` é dourado saturado nos dois temas: o realce do
            // hover acendia um bloco dourado no meio do papel. O chrome da folha
            // recua para o cinza quente da paleta `--sf-*`.
            "-mx-0.5 rounded px-0.5 align-middle hover:bg-surface-mesa",
            // Aviso de descrição desatualizada: tinta DO PRÓPRIO gatilho, não
            // decoração herdada (achado 0437) — ver ALT_STALE_MARK_CLASS.
            draft.altStale && ALT_STALE_MARK_CLASS
          )}
          disabled={disabled}
          autoFocus={editing.returnFocus}
          onClick={editing.open}
          title={draft.altStale ? "Editar fórmula — descrição desatualizada" : "Editar fórmula"}
          aria-label={
            draft.altStale
              ? `Editar fórmula: ${draft.accessibleName} (descrição desatualizada)`
              : `Editar fórmula: ${draft.accessibleName}`
          }
          data-alt-stale={draft.altStale ? "true" : undefined}
          data-testid="inlinemath-render"
        >
          <span role="math" aria-label={draft.accessibleName} data-testid="inlinemath-math">
            {/* Achado 0438: a folha é UM textbox multiline e o leitor de tela a
                percorre pelo texto renderizado. As duas árvores do KaTeX
                (MathML + LaTeX cru da `<annotation>` + fallback HTML) despejam
                a notação nesse texto; o `aria-label` resolve só o NOME do nó.
                O subtree vira decoração e a descrição entra como texto. O
                `aria-hidden` cai sobre conteúdo NÃO focável — o botão que abre
                o editor fica de fora, com nome próprio (cf. 0337/0339). */}
            <span className="sr-only">{draft.accessibleName}</span>
            <span aria-hidden="true" dangerouslySetInnerHTML={{ __html: inlineLatexToHtml(latex) }} />
          </span>
        </button>
      )}
    </NodeViewWrapper>
  );
}
