import { useRef, useState } from "react";
import { AlignLeft, AlignCenter, AlignRight, Captions, Crop, ImageIcon, Trash2 } from "lucide-react";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { toast } from "sonner";
import { FOLHA_BUTTON, FOLHA_GHOST, FOLHA_INPUT, FOLHA_RAIL, FOLHA_RAIL_HOST, FOLHA_SELECTED, FOLHA_TOUCH_TARGET } from "../folhaChrome";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { deleteNodeAndRefocus } from "./nodeViewUtils";

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

export function ImageNodeView({ node, updateAttributes, deleteNode, editor, getPos, selected }: NodeViewProps) {
  const [modalOpen, setModalOpen] = useState(false);
  // 0349 — o gatilho vive dentro do NodeViewWrapper `contentEditable={false}`:
  // o ProseMirror seleciona o nó no `mousedown` (com `preventDefault`), então o
  // botão nunca recebe foco de DOM e o Radix não teria a quem devolver ao fechar.
  const imageButtonRef = useRef<HTMLButtonElement>(null);
  const [cropOpen, setCropOpen] = useState(false);
  // 0351 — a exclusão leva três dados de uma vez (figura, texto alternativo e
  // legenda) e o autosave grava a perda em seguida. Mesma barreira que "Excluir
  // questão" ganhou no achado 0252: o clique só abre a confirmação.
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  // 0354 — a lixeira é o gatilho do diálogo e vive no mesmo chrome não editável:
  // sem `ref` não há âncora para devolver o foco a quem desistiu da exclusão.
  const deleteButtonRef = useRef<HTMLButtonElement>(null);
  // Marca a saída "confirmou a exclusão" para o onCloseAutoFocus do diálogo.
  const deletedRef = useRef(false);
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
    <NodeViewWrapper
      /*
        0113 — o chrome de edição não mora mais no fluxo do papel. Empilhado
        (barra + campo de texto alternativo + cabeçalho da legenda) ele somava
        ~144px que o Revisar desenhava e o arquivo não tem: era parte do papel
        que media 1225px onde o Exportar media 825px. Desde o 0172 a folha
        descontava a faixa da CONTAGEM de páginas, mas continuava esticando o
        papel para caber o desenho (0183) — descontar conserta o número, não
        devolve o espaço. Agora o chrome flutua no rail, como já fazem a
        questão e a fórmula, e o bloco de imagem mede o que imprime.
      */
      className={cn(FOLHA_RAIL_HOST, selected && FOLHA_SELECTED)}
      data-testid="image-node"
      contentEditable={false}
    >
      {/*
        Rail de ações (ver FOLHA_RAIL): ancorado no vão acima do bloco, aceso
        por hover ou foco. `flex-wrap` porque esta é a barra mais larga da
        folha (três alinhamentos, trocar, recortar, legenda, excluir e o campo
        de texto alternativo): sem isso ela estouraria a largura do papel em
        vez de virar duas linhas.
      */}
      <div data-testid="image-controls" className={cn(FOLHA_RAIL, "max-w-full flex-wrap justify-end")}>
        {ALIGNMENTS.map(({ value, Icon, label }) => (
          <Button
            key={value}
            type="button"
            variant="ghost"
            size="icon"
            className={cn("h-7 w-7", FOLHA_GHOST, FOLHA_TOUCH_TARGET, alignment === value && "bg-surface-mesa-2 text-surface-ink")}
            disabled={disabled}
            onClick={() => updateAttributes({ alignment: value })}
            title={label}
            aria-label={label}
          >
            <Icon className="h-3.5 w-3.5" />
          </Button>
        ))}
        <Button
          ref={imageButtonRef}
          type="button"
          variant="outline"
          size="sm"
          className={cn("gap-1", FOLHA_BUTTON)}
          disabled={disabled}
          onClick={() => setModalOpen(true)}
          aria-label="Trocar ou adicionar imagem"
        >
          {/*
            0339 — o rótulo na face do botão é decoração: o nome programático
            vem do `aria-label`. Como o chrome vive dentro do `contenteditable`,
            texto visível aqui entrava no `value` do textbox da folha e era lido
            como linha impressa da atividade.
          */}
          <ImageIcon className="h-3.5 w-3.5" /> <span aria-hidden="true">Trocar ou adicionar imagem</span>
        </Button>
        {canCropFromOriginal && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn("gap-1", FOLHA_BUTTON)}
            disabled={disabled || cropping}
            onClick={() => setCropOpen(true)}
            aria-label="Recortar do original"
          >
            {/* 0339 — idem: rótulo decorativo, nome vem do `aria-label`. */}
            <Crop className="h-3.5 w-3.5" /> <span aria-hidden="true">Recortar do original</span>
          </Button>
        )}
        {/*
          Legenda: alternador. `null` esconde a legenda; qualquer array a mostra
          na folha. Os dois estados moram no rail — o rótulo "LEGENDA" e o
          cabeçalho que o hospedava saíram com o 0113: eram faixa de papel para
          anunciar um texto que já se lê sozinho.
        */}
        {caption === null ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn("gap-1", FOLHA_GHOST)}
            disabled={disabled}
            onClick={() => updateAttributes({ caption: [] })}
            aria-label="Adicionar legenda"
          >
            {/* 0339 — idem: rótulo decorativo, nome vem do `aria-label`. */}
            <Captions className="h-3.5 w-3.5" /> <span aria-hidden="true">Legenda</span>
          </Button>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            // 24x24 é o alvo mínimo do WCAG 2.5.8; o ícone continua 12px, o
            // ganho vem do padding. 0342 — a tinta é a da folha (FOLHA_GHOST),
            // não a do app: `text-muted-foreground` cai para ~2,3:1 no tema
            // escuro sobre um papel que continua branco.
            className={cn("h-6 w-6", FOLHA_GHOST, FOLHA_TOUCH_TARGET, "hover:text-destructive")}
            disabled={disabled}
            onClick={() => updateAttributes({ caption: null })}
            aria-label="Remover legenda"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        )}
        <Button
          ref={deleteButtonRef}
          type="button"
          variant="ghost"
          size="sm"
          className="gap-1 text-destructive hover:bg-surface-mesa hover:text-destructive"
          disabled={disabled}
          onClick={() => setConfirmDeleteOpen(true)}
          aria-label="Excluir imagem"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
        {/*
          Texto alternativo: campo de acessibilidade da imagem (vai para o leitor
          de tela, para o PDF e para o marcador `[Imagem: alt]` do Word). Não é
          impresso, então vive no rail. O antigo rótulo "TEXTO ALTERNATIVO"
          virou o placeholder: ele já era decorativo desde o 0337 (o nome vem do
          `aria-label`) e custava uma faixa inteira de papel.
        */}
        <Input
          value={alt}
          disabled={disabled}
          aria-label="Texto alternativo"
          placeholder="Texto alternativo: descreva a imagem…"
          /* 0342 — o `<Input>` cru pinta `border-input bg-background`: some
             no papel (1,09:1) no tema claro e vira laje escura no tema
             escuro. Chrome sobre a folha usa a paleta da folha. */
          className={cn("h-8 w-56 text-xs", FOLHA_INPUT)}
          onChange={(e) => updateAttributes({ alt: e.target.value })}
        />
      </div>

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

        {caption !== null && (
          <div>
              {/*
                A legenda é impressa junto da figura: a prévia alinha o `figure`
                inteiro (text-center) e o PDF alinha a `View` inteira, então a
                legenda acompanha a imagem nas duas. Aqui a legenda mora fora do
                contêiner alinhado (o chrome de edição fica no meio), então o
                alinhamento chega nela pelo text-align. Achado 0116.
              */}
              {/*
                0306 — `plain` herda tamanho e entrelinha, nunca cor: sem esta
                classe a legenda saía em cor de corpo no Revisar, competindo com
                o enunciado, enquanto a prévia e o PDF imprimem cinza secundário.
              */}
              <div
                data-testid="image-caption-text"
                className="text-muted-foreground"
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
      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <AlertDialogContent
          // Achado 0354: o diálogo é aberto por estado, sem AlertDialogTrigger, e a
          // lixeira mora no chrome `contentEditable={false}` — o ProseMirror faz
          // preventDefault no mousedown do nodeview não editável, então o botão nunca
          // recebe foco de DOM e o Radix não tem `previouslyFocusedElement` para
          // restaurar: o foco cairia no <body>. Devolvemos à mão. Confirmar é o caso
          // oposto: ali quem manda é o `deleteNodeAndRefocus` (achado 0253), que já
          // levou o cursor para a folha — o Radix não pode roubá-lo de volta para um
          // chrome que sumiu. Mesma correção que o 0254 fez no diálogo da questão.
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (deletedRef.current) {
              deletedRef.current = false;
              return;
            }
            deleteButtonRef.current?.focus();
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir imagem?</AlertDialogTitle>
            <AlertDialogDescription>
              {/* Achado 0353: o diálogo da questão ensina o Ctrl+Z desde o 0255 e este
                  ficou só enumerando a perda, porque foi copiado do QuestionNodeView
                  minutos antes daquela correção. O desfazer alcança os dois igualmente:
                  deleteNodeAndRefocus devolve o cursor à folha (0253) e o histórico do
                  StarterKit desfaz a exclusão inteira. */}
              A figura, o texto alternativo e a legenda serão apagados. Dá para desfazer logo em seguida com Ctrl+Z (Cmd+Z no Mac).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col">
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                deletedRef.current = true;
                deleteNodeAndRefocus(deleteNode, editor, getPos);
              }}
              className="bg-destructive-surface text-destructive-foreground hover:bg-destructive-surface-hover"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <ImageManagerModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onConfirm={handlePick}
        restoreFocusRef={imageButtonRef}
      />
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
