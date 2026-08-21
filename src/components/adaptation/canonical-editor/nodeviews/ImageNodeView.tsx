import { useState } from "react";
import { AlignLeft, AlignCenter, AlignRight, Crop, ImageIcon, Trash2 } from "lucide-react";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { toast } from "sonner";
import { FOLHA_BUTTON, FOLHA_GHOST } from "../folhaChrome";
import { Button } from "@/components/ui/button";
import ImageResizer from "@/components/editor/ImageResizer";
import ImageManagerModal from "@/components/editor/ImageManagerModal";
import PdfPreviewModal from "@/components/forms/PdfPreviewModal";
import type { ImageItem } from "@/components/editor/imageManagerUtils";
import type { RichText } from "@/lib/adaptation/canonical/schema";
import type { UploadedExamOptions } from "../uploadedExamExtension";
import { uploadImageDataUrl } from "@/lib/utils/imageUpload";
import { RichTextField } from "../RichTextField";
import { cn } from "@/lib/utils";

const ALIGNMENTS = [
  { value: "left", Icon: AlignLeft, label: "Alinhar à esquerda" },
  { value: "center", Icon: AlignCenter, label: "Centralizar" },
  { value: "right", Icon: AlignRight, label: "Alinhar à direita" },
] as const;

export function ImageNodeView({ node, updateAttributes, deleteNode, editor }: NodeViewProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [cropOpen, setCropOpen] = useState(false);
  const [cropping, setCropping] = useState(false);
  const { src, width, alignment, caption } = node.attrs as {
    src: string;
    width: number | null;
    alignment: string | null;
    caption: RichText | null;
  };
  const disabled = !editor.isEditable;

  // Only set for adaptações do "Adaptar direto do arquivo" (UploadedExamExtension,
  // configured per Revisar session) — absent for Banco de Questões adaptações
  // (no source file to re-crop from) AND for any editor instance that never
  // registered the extension at all (it's opt-in, not part of the base set —
  // e.g. read-only/preview mounts), so this must not assume it is present.
  // PdfPreviewModal is PDF-only (renderPdfPage/pdf.js), same limitation the
  // Banco de Questões crop tool has.
  const uploadedExam = editor.storage.uploadedExam as UploadedExamOptions | undefined;
  const originalFile = uploadedExam?.file ?? null;
  const canCropFromOriginal = !!originalFile && originalFile.type === "application/pdf";

  const handlePick = (images: ImageItem[]) => {
    const first = images[0];
    if (first) updateAttributes({ src: first.src, alignment: first.align });
  };

  const handleCropFromOriginal = async (dataUrl: string) => {
    const userId = uploadedExam?.userId;
    /* v8 ignore next -- guard: the crop button (and thus this modal) only renders while UploadedExamExtension carries a userId */
    if (!userId) return;
    setCropping(true);
    try {
      const url = await uploadImageDataUrl(dataUrl, userId);
      if (url) {
        updateAttributes({ src: url });
      } else {
        toast.error("Não foi possível enviar a imagem recortada. Tente novamente.");
      }
    } finally {
      setCropping(false);
    }
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
                variant="ghost"
                size="icon"
                className={cn(
                  "h-7 w-7",
                  FOLHA_GHOST,
                  alignment === value && "bg-surface-mesa-2 text-surface-ink",
                )}
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
              className={cn("gap-1", FOLHA_BUTTON)}
              disabled={disabled}
              onClick={() => setModalOpen(true)}
            >
              <ImageIcon className="h-3.5 w-3.5" /> Trocar imagem
            </Button>
            {canCropFromOriginal && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={cn("gap-1", FOLHA_BUTTON)}
                disabled={disabled || cropping}
                onClick={() => setCropOpen(true)}
              >
                <Crop className="h-3.5 w-3.5" /> Recortar do original
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="gap-1 text-destructive hover:bg-surface-mesa hover:text-destructive"
              disabled={disabled}
              onClick={() => deleteNode()}
              aria-label="Excluir imagem"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* Legenda: toggle — null = hidden, not-null = visible with trash in header */}
          {caption === null ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="self-start text-xs text-surface-ink-faint hover:bg-surface-mesa hover:text-surface-ink"
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
      {canCropFromOriginal && (
        <PdfPreviewModal
          open={cropOpen}
          onOpenChange={setCropOpen}
          file={originalFile}
          onCrop={handleCropFromOriginal}
        />
      )}
    </NodeViewWrapper>
  );
}
