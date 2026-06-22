/**
 * ScaffoldNodeView — editable list of scaffolding step strings (`items` attr).
 * Mutations go through the pure `scaffoldOps` helpers and write back via
 * `updateAttributes({ items })`. A delete button in the header removes the block.
 */

import { Plus, Trash2 } from "lucide-react";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { setStep, addStep, removeStep } from "./scaffoldOps";

export function ScaffoldNodeView({ node, updateAttributes, editor, deleteNode }: NodeViewProps) {
  const items = node.attrs.items as string[];
  const disabled = !editor.isEditable;

  return (
    <NodeViewWrapper className="my-3 rounded-lg border border-border bg-muted/30 p-3" data-testid="scaffold-node" contentEditable={false}>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Andaime</p>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-destructive"
          disabled={disabled}
          onClick={() => deleteNode()}
          title="Excluir andaime"
          aria-label="Excluir andaime"
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
      <div className="flex flex-col gap-1.5">
        {items.map((item, index) => (
          <div key={index} className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{index + 1}.</span>
            <Input
              value={item}
              disabled={disabled}
              onChange={(e) => updateAttributes({ items: setStep(items, index, e.target.value) })}
              placeholder="Passo"
              aria-label={`Passo ${index + 1}`}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
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
          className="self-start gap-1"
          disabled={disabled}
          onClick={() => updateAttributes({ items: addStep(items) })}
        >
          <Plus className="h-3.5 w-3.5" /> Passo
        </Button>
      </div>
    </NodeViewWrapper>
  );
}
