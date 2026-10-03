/**
 * OriginalExamDialog — shows the file the teacher uploaded (Adaptar direto do
 * arquivo only), so they can compare the adapted document against the source.
 *
 * - PDF: `pageImages` are the pages rasterized by pdf-utils at upload time.
 * - Word (.docx): `pageImages` are the figures embedded in the document (not
 *   pages), so the dialog shows the extracted `text` and labels each image as
 *   "Figura N" (achado 0280). No extra parsing here.
 *
 * The dialog is state-controlled (no `DialogTrigger`), so Radix would restore
 * focus to a null trigger and drop it on `<body>`. `restoreFocusRef` hands the
 * opener back on close (achado 0281, same pattern as MetadataDrawer/0349).
 */

import type { RefObject } from "react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  restoreFocusRef?: RefObject<HTMLElement>;
  pageImages: string[];
  fileType?: "pdf" | "docx";
  text?: string;
};

function ImageList({ images, label }: { images: string[]; label: string }) {
  return (
    <div className="flex flex-col gap-4">
      {images.map((src, i) => (
        <div key={i} className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">{label} {i + 1}</p>
          <img src={src} alt={`${label} ${i + 1} da prova original`} className="w-full rounded border" />
        </div>
      ))}
    </div>
  );
}

function DocxContent({ text, figures }: { text: string; figures: string[] }) {
  if (!text.trim() && figures.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Nenhum conteúdo disponível para comparação.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      {text.trim() && (
        <div
          data-testid="original-exam-text"
          className="whitespace-pre-wrap break-words rounded border p-4 text-sm"
        >
          {text}
        </div>
      )}
      <ImageList images={figures} label="Figura" />
    </div>
  );
}

export function OriginalExamDialog({
  open,
  onOpenChange,
  restoreFocusRef,
  pageImages,
  fileType,
  text = "",
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-3xl max-h-[85vh] overflow-y-auto"
        onCloseAutoFocus={(event) => {
          const trigger = restoreFocusRef?.current;
          if (!trigger) return;
          event.preventDefault();
          trigger.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>Prova original</DialogTitle>
        </DialogHeader>
        {fileType === "docx" ? (
          <DocxContent text={text} figures={pageImages} />
        ) : pageImages.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nenhuma página disponível para comparação.
          </p>
        ) : (
          <ImageList images={pageImages} label="Página" />
        )}
      </DialogContent>
    </Dialog>
  );
}

export default OriginalExamDialog;
