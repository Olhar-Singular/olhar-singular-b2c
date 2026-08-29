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

export function ScaffoldNodeView({ node, updateAttributes, editor, deleteNode }: NodeViewProps) {
  const items = node.attrs.items as string[];
  const disabled = !editor.isEditable;

  return (
    <NodeViewWrapper
      className="my-3 border p-3"
      style={{
        backgroundColor: SCAFFOLDING_BG,
        borderColor: SCAFFOLDING_BORDER,
        borderRadius: `${SCAFFOLDING_RADIUS_PX}px`,
      }}
      data-testid="scaffold-node"
      contentEditable={false}
    >
      <div className="mb-2 flex items-center justify-between">
        <p
          data-testid="scaffold-label"
          className="font-semibold uppercase tracking-wide"
          style={{ fontSize: "var(--doc-fs-caption, 0.833em)", color: DEFAULT_INK }}
        >
          {SCAFFOLDING_LABEL}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-destructive hover:bg-surface-paper/60"
          disabled={disabled}
          onClick={() => deleteNode()}
          title="Excluir apoio"
          aria-label="Excluir apoio"
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
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
              className="border-surface-line bg-surface-paper text-surface-ink placeholder:text-surface-ink-faint"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-surface-ink-soft hover:bg-surface-paper/60"
              disabled={disabled}
              onClick={() => updateAttributes({ items: removeStep(items, index) })}
              title="Remover passo"
              aria-label={`Remover passo ${index + 1}`}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          /*
            0172 — "+ Passo" é chrome de edição: ocupa faixa própria no fluxo e
            não sai no arquivo, então não conta como papel impresso. A lixeira
            do cabeçalho e a de cada passo ficam SEM marca de propósito: elas
            dividem a linha com o rótulo e o passo impressos, e descontá-las
            tiraria do papel a altura da própria linha impressa.
          */
          data-folha-chrome=""
          className="self-start gap-1 border-surface-line bg-surface-paper text-surface-ink-soft hover:bg-surface-mesa hover:text-surface-ink"
          disabled={disabled}
          onClick={() => updateAttributes({ items: addStep(items) })}
        >
          <Plus className="h-3.5 w-3.5" /> Passo
        </Button>
      </div>
    </NodeViewWrapper>
  );
}
