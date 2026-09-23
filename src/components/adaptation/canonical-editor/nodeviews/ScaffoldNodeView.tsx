/**
 * ScaffoldNodeView — editable list of scaffolding step strings (`items` attr).
 * Mutations go through the pure `scaffoldOps` helpers and write back via
 * `updateAttributes({ items })`. A delete button in the header removes the block.
 *
 * Fundo e borda vêm de `pageTokens` (`SCAFFOLDING_BG` / `SCAFFOLDING_BORDER`):
 * é o mesmo bege que a prévia do Exportar e o PDF pintam (achado 0149). O rótulo
 * também: `SCAFFOLDING_LABEL` é o mesmo texto que as duas superfícies impressas
 * desenham no topo da caixa, na tipografia da folha (achado 0155) e na tinta do
 * documento (`DEFAULT_INK`) — o rótulo e os ordinais dos passos são IMPRESSOS,
 * então nenhum dos dois usa token de chrome apagado (achado 0160).
 */

import { Plus, Trash2 } from "lucide-react";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { setStep, addStep, removeStep } from "./scaffoldOps";
import {
  DEFAULT_INK,
  SCAFFOLDING_BG,
  SCAFFOLDING_BORDER,
  SCAFFOLDING_LABEL,
  SCAFFOLDING_RADIUS_PX,
} from "@/components/adaptation/render/pageTokens";
import { deleteNodeAndRefocus } from "./nodeViewUtils";
import { FOLHA_BUTTON, FOLHA_GHOST, FOLHA_RAIL, FOLHA_RAIL_HOST, FOLHA_SELECTED, FOLHA_TOUCH_TARGET } from "../folhaChrome";
import { cn } from "@/lib/utils";

export function ScaffoldNodeView({ node, updateAttributes, editor, deleteNode, getPos, selected }: NodeViewProps) {
  const items = node.attrs.items as string[];
  const disabled = !editor.isEditable;

  return (
    <NodeViewWrapper
      /*
        0113 — o cartão media 212px no Revisar contra 101px impressos. A caixa,
        o rótulo e os ordinais são papel (0149/0155/0160); a diferença toda era
        chrome no fluxo: a lixeira do bloco na faixa do rótulo e o "+ Passo"
        numa faixa própria. Os dois foram para o rail flutuante, como na questão
        e na fórmula — o 0172 descontava o "+ Passo" da CONTAGEM de páginas, mas
        o papel continuava esticando para caber o desenho (0183).
      */
      className={cn(FOLHA_RAIL_HOST, "border p-3", selected && FOLHA_SELECTED)}
      style={{
        backgroundColor: SCAFFOLDING_BG,
        borderColor: SCAFFOLDING_BORDER,
        borderRadius: `${SCAFFOLDING_RADIUS_PX}px`,
      }}
      data-testid="scaffold-node"
      contentEditable={false}
    >
      {/* Rail de ações (ver FOLHA_RAIL): excluir o apoio e acrescentar passo. */}
      <div className={FOLHA_RAIL}>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn("gap-1", FOLHA_BUTTON)}
          disabled={disabled}
          onClick={() => updateAttributes({ items: addStep(items) })}
        >
          <Plus className="h-3.5 w-3.5" /> Passo
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn("h-6 w-6 text-destructive hover:bg-surface-mesa hover:text-destructive", FOLHA_TOUCH_TARGET)}
          disabled={disabled}
          onClick={() => deleteNodeAndRefocus(deleteNode, editor, getPos)}
          title="Excluir apoio"
          aria-label="Excluir apoio"
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
      <p
        data-testid="scaffold-label"
        className="mb-2 font-semibold uppercase tracking-wide"
        style={{ fontSize: "var(--doc-fs-caption, 0.833em)", color: DEFAULT_INK }}
      >
        {SCAFFOLDING_LABEL}
      </p>
      <div className="flex flex-col gap-1.5">
        {items.map((item, index) => (
          <div key={index} className="flex items-center gap-2">
            <span data-testid={`scaffold-step-ordinal-${index}`} style={{ color: DEFAULT_INK }}>
              {index + 1}.
            </span>
            <Input
              value={item}
              disabled={disabled}
              onChange={(e) => updateAttributes({ items: setStep(items, index, e.target.value) })}
              placeholder="Passo"
              aria-label={`Passo ${index + 1}`}
              /*
                0113 — `h-10` + `py-2` do `<Input>` do app contra uma linha de
                lista impressa: ~18px por passo que só existiam no Revisar. A
                borda fica (é o que diz que dá para digitar ali, achado 0342);
                a altura passa a ser a do texto.
              */
              className={cn(
                "h-auto py-0",
                "border-surface-line bg-surface-paper text-surface-ink placeholder:text-surface-ink-faint",
              )}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={cn("h-6 w-6", FOLHA_GHOST, FOLHA_TOUCH_TARGET)}
              disabled={disabled}
              onClick={() => updateAttributes({ items: removeStep(items, index) })}
              title="Remover passo"
              aria-label={`Remover passo ${index + 1}`}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
      </div>
    </NodeViewWrapper>
  );
}
