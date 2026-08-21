import { useState } from "react";
import { AlignLeft, AlignCenter, AlignRight, Crop, ImageIcon, Trash2 } from "lucide-react";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { toast } from "sonner";
import { FOLHA_BUTTON, FOLHA_GHOST } from "../folhaChrome";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import ImageResizer from "@/components/editor/ImageResizer";
import ImageManagerModal from "@/components/editor/ImageManagerModal";
import PdfPreviewModal from "@/components/forms/PdfPreviewModal";
import type { ImageItem } from "@/components/editor/imageManagerUtils";
import type { RichText } from "@/lib/adaptation/canonical/schema";
import { newId } from "@/lib/adaptation/canonical/ids";
import { buildSiblingImagesTransaction } from "./blockTransactions";
import type { UploadedExamOptions } from "../uploadedExamExtension";
import { uploadImageDataUrl } from "@/lib/utils/imageUpload";
import { RichTextField } from "../RichTextField";
import { cn } from "@/lib/utils";

const ALIGNMENTS = [
  { value: "left", Icon: AlignLeft, label: "Alinhar à esquerda" },
  { value: "center", Icon: AlignCenter, label: "Centralizar" },
  { value: "right", Icon: AlignRight, label: "Alinhar à direita" },
] as const;

/** Alinhamento herdado pela legenda (paridade com a prévia e o PDF — achado 0116). */
const CAPTION_ALIGN: Record<string, "left" | "center" | "right"> = {
  left: "left",
  center: "center",
  right: "right",
};

export function ImageNodeView({ node, updateAttributes, deleteNode, editor, getPos }: NodeViewProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [cropOpen, setCropOpen] = useState(false);
  const [cropping, setCropping] = useState(false);
  const { src, alt, width, alignment, caption } = node.attrs as {
    src: string;
    alt: string;
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

  /**
   * Achado 0318: a modal é multi-seleção e anuncia o lote ("Inserir (3)").
   * A primeira imagem troca este bloco; as demais entram como blocos irmãos
   * logo abaixo, cada uma com o alinhamento escolhido na grade — em vez de
   * sumirem em silêncio.
   */
  const handlePick = (images: ImageItem[]) => {
    const [first, ...rest] = images;
    if (!first) return;
    /**
     * Achado 0317: o arquivo novo não herda o que descrevia o antigo. `alt` e
     * legenda descrevem AQUELA figura (o alt vai para o leitor de tela e a
     * legenda é impressa no PDF), e a largura foi ajustada para a proporção
     * dela. A legenda só é zerada, não removida: quem tinha legenda continua
     * com o campo aberto para reescrever. O alinhamento é o contrário — é do
     * lugar na folha, não do arquivo — então o padrão `center` da modal só
     * vence se o usuário tiver mexido nos controles dela.
     */
    updateAttributes({
      src: first.src,
      alt: "",
      width: null,
      caption: caption === null ? null : [],
      alignment: first.alignTouched ? first.align : alignment,
    });
    if (rest.length === 0) return;
    const currentPos = getPos();
    if (typeof currentPos !== "number") return;
    const tr = buildSiblingImagesTransaction(
      editor.state,
      currentPos,
      rest.map((image) => ({ id: newId(), src: image.src, alt: "", alignment: image.align })),
    );
    if (tr) editor.view.dispatch(tr);
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
              <ImageIcon className="h-3.5 w-3.5" /> Trocar ou adicionar imagem
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
              {/*
                A legenda é impressa junto da figura: a prévia alinha o `figure`
                inteiro (text-center) e o PDF alinha a `View` inteira, então a
                legenda acompanha a imagem nas duas. Aqui a legenda mora fora do
                contêiner alinhado (o chrome de edição fica no meio), então o
                alinhamento chega nela pelo text-align. Achado 0116.
              */}
              <div
                data-testid="image-caption-text"
                style={{ fontSize: "var(--doc-fs-caption, inherit)", textAlign: CAPTION_ALIGN[alignment ?? "left"] }}
              >
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
