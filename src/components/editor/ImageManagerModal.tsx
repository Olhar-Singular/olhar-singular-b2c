import { useState, useCallback, useRef, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Upload,
  ImageIcon,
  Trash2,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Clipboard,
} from "lucide-react";
import type { ImageItem, ImageAlign } from "./imageManagerUtils";

type Props = {
  open: boolean;
  onClose: () => void;
  onConfirm: (images: ImageItem[]) => void;
};

const MAX_DIMENSION = 800;
const JPEG_QUALITY = 0.85;

function generateId() {
  return Math.random().toString(36).slice(2, 10);
}

function resizeImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
          const ratio = Math.min(MAX_DIMENSION / width, MAX_DIMENSION / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", JPEG_QUALITY));
      };
      img.onerror = reject;
      img.src = reader.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function ImageManagerModal({ open, onClose, onConfirm }: Props) {
  const [images, setImages] = useState<ImageItem[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (open) setImages([]);
  }, [open]);

  const addImageFiles = useCallback(async (files: FileList | File[]) => {
    const validFiles = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (validFiles.length === 0) return;

    const newImages: ImageItem[] = [];
    for (const file of validFiles) {
      try {
        const src = await resizeImage(file);
        newImages.push({ id: generateId(), src, align: "center" });
      } catch {
        // skip invalid files
      }
    }
    setImages((prev) => [...prev, ...newImages]);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragging(false);
      if (e.dataTransfer.files.length > 0) addImageFiles(e.dataTransfer.files);
    },
    [addImageFiles]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
  }, []);

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        addImageFiles(e.target.files);
        e.target.value = "";
      }
    },
    [addImageFiles]
  );

  const handlePaste = useCallback(async () => {
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const imageType = item.types.find((t) => t.startsWith("image/"));
        if (imageType) {
          const blob = await item.getType(imageType);
          const file = new File([blob], "clipboard.png", { type: imageType });
          await addImageFiles([file]);
          return;
        }
      }
    } catch {
      // Clipboard API not available or denied
    }
  }, [addImageFiles]);

  const removeImage = useCallback((id: string) => {
    setImages((prev) => prev.filter((img) => img.id !== id));
  }, []);

  const setAlign = useCallback((id: string, align: ImageAlign) => {
    setImages((prev) =>
      prev.map((img) => (img.id === id ? { ...img, align } : img))
    );
  }, []);

  const handleConfirm = useCallback(() => {
    if (images.length > 0) onConfirm(images);
    onClose();
  }, [images, onConfirm, onClose]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ImageIcon className="w-5 h-5 text-violet-600" />
            Adicionar Imagens
          </DialogTitle>
          <DialogDescription>
            Envie imagens do computador ou cole da área de transferência.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 flex-1 min-h-0">
          <div
            ref={dropZoneRef}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
              dragging
                ? "border-violet-400 bg-violet-50"
                : "border-zinc-300 hover:border-violet-300 hover:bg-violet-50/50"
            }`}
          >
            <Upload className="w-8 h-8 mx-auto mb-2 text-zinc-400" />
            <p className="text-sm text-zinc-600 font-medium">
              Arraste imagens aqui ou clique para selecionar
            </p>
            <p className="text-xs text-muted-foreground mt-1">PNG, JPG ou GIF</p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleFileInput}
              className="hidden"
            />
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handlePaste}
            className="self-start gap-1.5"
          >
            <Clipboard className="w-3.5 h-3.5" />
            Colar da área de transferência
          </Button>

          {images.length > 0 && (
            <div className="flex-1 min-h-0 overflow-y-auto">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                {images.length} {images.length === 1 ? "imagem" : "imagens"} adicionada{images.length > 1 ? "s" : ""}
              </p>
              <div className="grid grid-cols-2 gap-3">
                {images.map((img) => (
                  <div key={img.id} className="border border-zinc-200 rounded-lg p-2 bg-zinc-50 group">
                    <div className="relative aspect-video bg-white rounded overflow-hidden mb-2 flex items-center justify-center">
                      <img src={img.src} alt="Preview" className="max-w-full max-h-full object-contain" />
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex gap-0.5">
                        {(["left", "center", "right"] as ImageAlign[]).map((a) => {
                          const Icon = a === "left" ? AlignLeft : a === "center" ? AlignCenter : AlignRight;
                          return (
                            <button
                              key={a}
                              type="button"
                              onClick={() => setAlign(img.id, a)}
                              className={`p-1 rounded transition-colors ${
                                img.align === a
                                  ? "bg-violet-100 text-violet-700"
                                  : "text-zinc-400 hover:text-zinc-600"
                              }`}
                            >
                              <Icon className="w-3.5 h-3.5" />
                            </button>
                          );
                        })}
                      </div>
                      <button
                        type="button"
                        onClick={() => removeImage(img.id)}
                        className="p-1 rounded text-zinc-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={images.length === 0}
            className="gap-1.5"
          >
            <ImageIcon className="w-4 h-4" />
            Inserir {images.length > 0 && `(${images.length})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
