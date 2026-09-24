/**
 * BlockMathNodeView — renders KaTeX from the `latex` attr.
 *
 * Click the rendered math to edit the latex (and alt) inline. The KaTeX HTML is
 * produced by the reused `renderMathToHtml` from `lib/domain/latexRenderer`.
 * A delete button lives in the top-right rail (FOLHA_RAIL) to remove the block.
 *
 * `role="math"` (with the teacher's alt as accessible name) lives on a
 * non-interactive `<span>`, never on the `<button>`: an explicit role REPLACES
 * the implicit one, so putting it on the button would erase the edit affordance
 * from the accessibility tree (WCAG 4.1.2).
 *
 * O botão de edição é um OVERLAY absoluto sobre a fórmula, não um embrulho: o
 * chrome de edição não pode entrar no fluxo vertical da folha (achado 0405).
 */

import { useId } from "react";
import { Trash2 } from "lucide-react";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { Input } from "@/components/ui/input";
import {
  FOLHA_BUTTON,
  FOLHA_GHOST,
  FOLHA_INPUT,
  FOLHA_RAIL,
  FOLHA_RAIL_HOST,
  FOLHA_SELECTED,
  FOLHA_TOUCH_TARGET,
} from "../folhaChrome";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { deleteNodeAndRefocus, latexToHtml } from "./nodeViewUtils";
import { useLatexDraft } from "./useLatexDraft";
import { useMathEditing } from "./useMathEditing";

export function BlockMathNodeView({ node, updateAttributes, editor, deleteNode, getPos, selected }: NodeViewProps) {
  // 0312 — identidade de campo: sem `id`/`name` o Chrome reporta "A form field
  // element should have an id or name attribute" e o agente do usuário não
  // trata o input como campo. `useId` não colide entre fórmulas da mesma folha.
  const latexId = useId();
  const altId = useId();
  const errorId = useId();
  const altErrorId = useId();
  const { latex, alt } = node.attrs as { latex: string; alt: string | null };
  const disabled = !editor.isEditable;
  // Latex vazio é irrepresentável e o alt não sobrevive à troca da fórmula
  // (achado 0436) — ver useLatexDraft.
  const draft = useLatexDraft(latex, alt, updateAttributes);
  // Escape fecha o editor e devolve o foco à fórmula (achado 0416).
  const editing = useMathEditing(draft.onBlur);

  const open = editing.editing && !disabled;

  return (
    <NodeViewWrapper
      className={cn(FOLHA_RAIL_HOST, selected && FOLHA_SELECTED)}
      data-testid="blockmath-node"
      contentEditable={false}
    >
      {/* Rail de ações: excluir (ver FOLHA_RAIL). Some enquanto o editor está
          aberto — achado 0420: o `autoFocus` do campo de LaTeX acende o rail por
          `group-focus-within` e a caixa opaca fica invadindo o bloco de cima
          durante toda a edição. Aberto o editor, a exclusão mora dentro dele. */}
      {!open && (
        <div
          data-role="blockmath-rail"
          className={FOLHA_RAIL}
          contentEditable={false}
        >
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn(FOLHA_GHOST, "h-7 w-7 text-destructive hover:text-destructive", FOLHA_TOUCH_TARGET)}
            disabled={disabled}
            onClick={() => deleteNodeAndRefocus(deleteNode, editor, getPos, "Fórmula excluída")}
            title="Excluir fórmula"
            aria-label="Excluir fórmula"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {open ? (
        <div
          // 0423 — a caixa vive SOBRE o papel: paleta da folha, nunca os tokens
          // do app (que invertem no tema escuro). Ver folhaChrome.
          className="flex flex-col gap-2 rounded-lg border border-surface-line-2 bg-surface-paper p-2"
          onKeyDown={editing.onKeyDown}
        >
          {/* Prévia ao vivo (achado 0421): abrir o editor trocava a fórmula
              tipografada pelo LaTeX cru, então uma chave fora do lugar — que o
              KaTeX não recusa (`throwOnError: false`), só pinta de vermelho —
              só aparecia depois de fechar. Sai de `draft.value`, que acompanha
              cada tecla, pelo MESMO `latexToHtml` da folha, para que o que se
              vê aqui seja o que será impresso. É eco visual do campo ao lado:
              `aria-hidden`, para o leitor de tela não anunciar a fórmula duas
              vezes enquanto o professor digita. */}
          <span
            data-testid="blockmath-preview"
            aria-hidden="true"
            className="block overflow-x-auto text-center"
            dangerouslySetInnerHTML={{ __html: latexToHtml(draft.value) }}
          />
          <Input
            id={latexId}
            name="blockmath-latex"
            value={draft.value}
            autoFocus
            onChange={(e) => draft.onChange(e.target.value)}
            onBlur={draft.onBlur}
            className={cn(FOLHA_INPUT, draft.error && "border-destructive")}
            placeholder="LaTeX"
            aria-label="Expressão LaTeX"
            aria-invalid={draft.error ? "true" : undefined}
            aria-describedby={draft.error ? errorId : undefined}
          />
          {/* Achado 0434: o vermelho do `katex-error` na prévia é cor, não
              mensagem — não é anunciado e some no PDF, que imprime LaTeX cru.
              A razão vem do próprio KaTeX e é dita em texto (WCAG 3.3.1).
              O "Pronto" continua habilitado de propósito: o valor inválido nem
              chegou ao nó, então fechar só descarta o rascunho — travar a saída
              prenderia o professor na caixa. */}
          {draft.error && (
            <span id={errorId} role="alert" data-testid="blockmath-latex-error" className="text-xs text-surface-danger">
              Fórmula inválida: {draft.error}
            </span>
          )}
          <Input
            id={altId}
            name="blockmath-alt"
            value={alt ?? ""}
            className={cn(FOLHA_INPUT, draft.altStale && "border-destructive")}
            onChange={(e) => draft.onAltChange(e.target.value)}
            placeholder="Texto alternativo"
            aria-label="Texto alternativo da fórmula"
            // 0443 — a borda vermelha é cor pura: sem `aria-invalid` o campo se
            // anuncia válido e o aviso ao lado fica sem dono (WCAG 1.4.1/3.3.1).
            aria-invalid={draft.altStale ? "true" : undefined}
            aria-describedby={draft.altStale ? altErrorId : undefined}
          />
          {/* Achado 0436: o alt caiu junto com a fórmula que ele descrevia; o
              professor precisa ver isso, não descobrir depois. */}
          {draft.altStale && (
            // 0439 — ver o gêmeo no InlineMathNodeView: texto puro dentro do
            // `contenteditable` entrava no texto acessível da folha. Vira
            // decoração; o aviso é anunciado pelo `aria-label` do gatilho.
            // 0443 — `aria-hidden` mantém o aviso fora do texto da folha (0439)
            // SEM tirá-lo da descrição: nó referenciado direto por
            // `aria-describedby` entra no cálculo do nome/descrição mesmo oculto.
            <span
              id={altErrorId}
              aria-hidden="true"
              data-testid="blockmath-alt-stale"
              className="text-xs text-surface-danger"
            >
              Descrição desatualizada: reescreva o texto alternativo.
            </span>
          )}
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={cn(FOLHA_BUTTON)}
              onClick={editing.close}
              // 0439 — rótulo decorativo, nome pelo `aria-label` (molde 0339).
              aria-label="Concluir edição da fórmula"
            >
              <span aria-hidden="true">Pronto</span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={cn(FOLHA_GHOST, "text-destructive hover:text-destructive")}
              onClick={() => deleteNodeAndRefocus(deleteNode, editor, getPos, "Fórmula excluída")}
              title="Excluir fórmula"
              aria-label="Excluir fórmula"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      ) : (
        <div className="relative">
          <span
            role="math"
            aria-label={draft.accessibleName}
            data-testid="blockmath-math"
            className="block text-center"
          >
            {/* Achado 0438: ver o gêmeo no InlineMathNodeView — o subtree do
                KaTeX é decoração e a descrição do professor entra como texto do
                documento, que é por onde o leitor de tela percorre a folha. */}
            <span className="sr-only">{draft.accessibleName}</span>
            <span aria-hidden="true" dangerouslySetInnerHTML={{ __html: latexToHtml(latex) }} />
          </span>
          {/* Overlay: o alvo de clique e a moldura de hover são chrome e vivem
              FORA do fluxo vertical (achado 0405). Antes o botão embrulhava a
              fórmula com `p-2` + `border` e, por ter padding/borda, ainda
              bloqueava o colapso da margem do `.katex-display` com o `my-3` do
              wrapper — 47px de papel a mais que o impresso
              (`render/blocks/BlockMathView`, um div `my-3 text-center`).
              O alvo ganha folga só na VERTICAL (`-inset-y-2`, que cai no vão
              `my-3`); na horizontal ele termina na coluna de texto
              (`inset-x-0`), porque a fórmula já é `block` e ocupa a coluna
              inteira — `-inset-2` desenhava a moldura e recebia clique dentro
              da margem do papel (achado 0414). O anel global de foco
              (`:focus-visible { outline-offset-2 }`) vazaria pelo mesmo motivo,
              daí o `outline-offset-0`. `outline` desenha sem ocupar fluxo. */}
          <button
            type="button"
            className={cn(
              "absolute -inset-y-2 inset-x-0 rounded-lg focus-visible:outline-offset-0 hover:outline hover:outline-1 hover:outline-surface-ink-soft",
              // Outline não entra no fluxo vertical da folha (achado 0405).
              draft.altStale && "outline outline-1 outline-destructive"
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
            data-testid="blockmath-render"
          />
        </div>
      )}
    </NodeViewWrapper>
  );
}
