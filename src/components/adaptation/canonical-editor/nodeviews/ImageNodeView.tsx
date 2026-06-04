/**
 * ImageNodeView — renders an image block.
 *
 * - Shows the image via the reused `ImageResizer` (width edits write `width`).
 * - Alignment buttons update `alignment`.
 * - Caption is an inline rich-text field (RichText, so formatting + inline math
 *   survive); alt is a plain accessibility text input.
 * - "Trocar imagem" opens the reused `ImageManagerModal`; the first picked image
 *   updates `src`.
 */

import { useState } from "react";
import { AlignLeft, AlignCenter, AlignRight, ImageIcon } from "lucide-react";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import ImageResizer from "@/components/editor/ImageResizer";
import ImageManagerModal from "@/components/editor/ImageManagerModal";
import type { ImageItem } from "@/components/editor/imageManagerUtils";
import type { RichText } from "@/lib/adaptation/canonical/schema";
import { RichTextField } from "../RichTextField";

const ALIGNMENTS = [
  { value: "left", Icon: AlignLeft, label: "Alinhar à esquerda" },
  { value: "center", Icon: AlignCenter, label: "Centralizar" },
  { value: "right", Icon: AlignRight, label: "Alinhar à direita" },
] as const;

export function ImageNodeView({ node, updateAttributes, editor }: NodeViewProps) {
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
    <NodeViewWrapper className="my-3" data-testid="image-node" contentEditable={false}>
      <div className="flex flex-col gap-2 rounded-lg border border-border p-2">
        <ImageResizer
          src={src}
          initialWidth={width ?? undefined}
          onResize={(w) => updateAttributes({ width: w })}
        />
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
        <RichTextField
          value={caption ?? []}
          placeholder="Legenda"
          disabled={disabled}
          onChange={(rt) => updateAttributes({ caption: rt.length > 0 ? rt : null })}
          ariaLabel="Legenda da imagem"
        />
        <Input
          value={alt}
          placeholder="Texto alternativo (acessibilidade)"
          disabled={disabled}
          onChange={(e) => updateAttributes({ alt: e.target.value })}
          aria-label="Texto alternativo"
        />
      </div>
      <ImageManagerModal open={modalOpen} onClose={() => setModalOpen(false)} onConfirm={handlePick} />
    </NodeViewWrapper>
  );
}
