import { useState } from "react";
import { AlignLeft, AlignCenter, AlignRight, ImageIcon, Trash2 } from "lucide-react";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { Button } from "@/components/ui/button";
import ImageResizer from "@/components/editor/ImageResizer";
import ImageManagerModal from "@/components/editor/ImageManagerModal";
import type { ImageItem } from "@/components/editor/imageManagerUtils";
import type { RichText } from "@/lib/adaptation/canonical/schema";
import { RichTextField } from "../RichTextField";
import { cn } from "@/lib/utils";

const ALIGNMENTS = [
  { value: "left", Icon: AlignLeft, label: "Alinhar à esquerda" },
  { value: "center", Icon: AlignCenter, label: "Centralizar" },
  { value: "right", Icon: AlignRight, label: "Alinhar à direita" },
] as const;

export function ImageNodeView({ node, updateAttributes, editor }: NodeViewProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const { src, width, alignment, caption } = node.attrs as {
    src: string;
    width: number | null;
    alignment: string | null;
    caption: RichText | null;
  };
  const disabled = !editor.isEditable;

  const handlePick = (images: ImageItem[]) => {
    const first = images[0];
    if (first) updateAttributes({ src: first.src, alignment: first.align });
  };

  return (
    <NodeViewWrapper className="my-3 space-y-2" data-testid="image-node" contentEditable={false}>
      <div className="flex flex-col gap-2">
        <div
          data-testid="image-align-container"
          className={cn("flex", alignment === "center" && "justify-center", alignment === "right" && "justify-end")}
        >
          <ImageResizer
            src={src}
            initialWidth={width ?? undefined}
            onResize={(w) => updateAttributes({ width: w })}
          />
        </div>

        {/* Controls: hidden inside a non-expanded question card, always shown at top-level */}
        <div data-testid="image-controls" className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-1">
            {ALIGNMENTS.map(({ value, Icon, label }) => (
              <Button
                key={value}
                type="button"
                variant={alignment === value ? "default" : "ghost"}
                size="icon"
                className="h-7 w-7"
                disabled={disabled}
                onClick={() => updateAttributes({ alignment: value })}
                title={label}
                aria-label={label}
              >
                <Icon className="h-3.5 w-3.5" />
              </Button>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1"
              disabled={disabled}
              onClick={() => setModalOpen(true)}
            >
              <ImageIcon className="h-3.5 w-3.5" /> Trocar imagem
            </Button>
          </div>

          {/* Legenda: toggle — null = hidden, not-null = visible with trash in header */}
          {caption === null ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="self-start text-xs text-surface-ink-faint"
              disabled={disabled}
              onClick={() => updateAttributes({ caption: [] })}
              aria-label="Adicionar legenda"
            >
              + Adicionar legenda
            </Button>
          ) : (
            <div>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[10.5px] font-semibold uppercase tracking-wide text-surface-ink-faint">Legenda</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5 text-muted-foreground hover:text-destructive"
                  disabled={disabled}
                  onClick={() => updateAttributes({ caption: null })}
                  aria-label="Remover legenda"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
              <div style={{ fontSize: "var(--doc-fs-caption, inherit)" }}>
                <RichTextField
                  value={caption}
                  placeholder="Escreva uma legenda para a imagem…"
                  disabled={disabled}
                  onChange={(rt) => updateAttributes({ caption: rt })}
                  ariaLabel="Legenda da imagem"
                  noBubble={true}
                />
              </div>
            </div>
          )}
        </div>
      </div>
      <ImageManagerModal open={modalOpen} onClose={() => setModalOpen(false)} onConfirm={handlePick} />
    </NodeViewWrapper>
  );
}
