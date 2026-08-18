/**
 * OriginalExamDialog — shows the page images of the file the teacher uploaded
 * (Adaptar direto do arquivo only), so they can compare the adapted document
 * against the source. `pageImages` are the same ones already rasterized by
 * pdf-utils/docx-utils at upload time — no extra parsing here.
 */

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pageImages: string[];
};

export function OriginalExamDialog({ open, onOpenChange, pageImages }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Prova original</DialogTitle>
        </DialogHeader>
        {pageImages.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nenhuma página disponível para comparação.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {pageImages.map((src, i) => (
              <div key={i} className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Página {i + 1}</p>
                <img src={src} alt={`Página ${i + 1} da prova original`} className="w-full rounded border" />
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default OriginalExamDialog;
