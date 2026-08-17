import { useState } from "react";
import { AlignLeft, AlignCenter, AlignRight, ImageIcon, Trash2 } from "lucide-react";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

export function ImageNodeView({ node, updateAttributes, deleteNode, editor }: NodeViewProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const { src, alt, width, alignment, caption } = node.attrs as {
    src: string;
    alt: string;
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
            alt={alt}
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
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="gap-1 text-destructive hover:text-destructive"
              disabled={disabled}
              onClick={() => deleteNode()}
              aria-label="Excluir imagem"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/*
            Texto alternativo: é o campo de acessibilidade da imagem (vai para o
            leitor de tela, para o PDF e para o marcador `[Imagem: alt]` do Word).
            Fica no chrome, não na folha, porque não é impresso.
          */}
          <div>
            <span className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wide text-surface-ink-faint">
              Texto alternativo
            </span>
            <Input
              value={alt}
              disabled={disabled}
              aria-label="Texto alternativo"
              placeholder="Descreva a imagem para quem não a enxerga…"
              className="h-8 text-xs"
              onChange={(e) => updateAttributes({ alt: e.target.value })}
            />
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
                  // 24x24 é o alvo mínimo do WCAG 2.5.8; o ícone continua 12px,
                  // o ganho vem do padding, sem engordar o chrome da folha.
                  className="h-6 w-6 text-muted-foreground hover:text-destructive"
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
                  // A legenda é texto impresso na folha: lê como o PDF (sem borda
                  // nem fundo de input), mesma convenção do AnswerPreview.
                  plain={true}
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
