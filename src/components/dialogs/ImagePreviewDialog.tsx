import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  imageUrl: string | null;
  title?: string;
};

export default function ImagePreviewDialog({ open, onOpenChange, imageUrl, title = "Prévia da imagem" }: Props) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content className="fixed left-[50%] top-[50%] z-[100] translate-x-[-50%] translate-y-[-50%] w-[90vw] max-w-3xl max-h-[85vh] outline-none">
          <div className="relative rounded-xl overflow-hidden bg-background shadow-2xl border">
            <DialogPrimitive.Close className="absolute top-3 right-3 z-10 rounded-full bg-foreground/80 hover:bg-foreground text-background p-1.5 shadow-lg transition-colors">
              <X className="h-5 w-5" />
            </DialogPrimitive.Close>
            {imageUrl ? (
              <div className="p-4 flex items-center justify-center max-h-[85vh] overflow-auto">
                <img src={imageUrl} alt={title} className="max-w-full max-h-[78vh] object-contain rounded" />
              </div>
            ) : null}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
