import { useState, useRef, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Loader2, Upload, ScanText, Move } from "lucide-react";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  onImageCropped?: (imageUrl: string) => void;
};

export default function ImageCropperModal({ open, onOpenChange, onSaved, onImageCropped }: Props) {
  const { user } = useAuth();
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [cropStart, setCropStart] = useState<{ x: number; y: number } | null>(null);
  const [cropEnd, setCropEnd] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Selecione uma imagem");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setImageSrc(reader.result as string);
    reader.readAsDataURL(file);
  };

  const getRelativeCoords = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
    };
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    const coords = getRelativeCoords(e);
    setCropStart(coords);
    setCropEnd(coords);
    setIsDragging(true);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    setCropEnd(getRelativeCoords(e));
  };

  const handleMouseUp = () => setIsDragging(false);

  const getCropRect = () => {
    if (!cropStart || !cropEnd) return null;
    const x = Math.min(cropStart.x, cropEnd.x);
    const y = Math.min(cropStart.y, cropEnd.y);
    const w = Math.abs(cropEnd.x - cropStart.x);
    const h = Math.abs(cropEnd.y - cropStart.y);
    if (w < 0.01 || h < 0.01) return null;
    return { x, y, width: w, height: h };
  };

  const getCroppedBlob = useCallback((): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const img = imgRef.current;
      const rect = getCropRect();
      if (!img || !rect) { resolve(null); return; }
      const canvas = document.createElement("canvas");
      const px = rect.x * img.naturalWidth;
      const py = rect.y * img.naturalHeight;
      const pw = rect.width * img.naturalWidth;
      const ph = rect.height * img.naturalHeight;
      canvas.width = pw;
      canvas.height = ph;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, pw, ph);
      ctx.drawImage(img, px, py, pw, ph, 0, 0, pw, ph);
      canvas.toBlob(resolve, "image/png", 0.92);
    });
  }, [cropStart, cropEnd]);

  const uploadBlob = async (blob: Blob) => {
    const fileName = `${user!.id}/${Date.now()}.png`;
    const { error } = await supabase.storage
      .from("question-images")
      .upload(fileName, blob, { contentType: "image/png" });
    if (error) throw error;
    const { data: { publicUrl } } = supabase.storage.from("question-images").getPublicUrl(fileName);
    return publicUrl;
  };

  const handleUploadCrop = async () => {
    if (!user) return;
    setUploading(true);
    try {
      const blob = await getCroppedBlob();
      if (!blob) throw new Error("Selecione uma área para recortar.");
      const publicUrl = await uploadBlob(blob);
      toast.success("Imagem salva!");
      onImageCropped?.(publicUrl);
      onOpenChange(false);
      setImageSrc(null);
    } catch (e: any) {
      toast.error("Erro", { description: e.message });
    } finally {
      setUploading(false);
    }
  };

  const handleOcr = async () => {
    if (!user) return;
    setExtracting(true);
    try {
      const blob = await getCroppedBlob();
      if (!blob) throw new Error("Selecione uma área para recortar.");

      const formData = new FormData();
      formData.append("file", blob, "crop.png");

      const session = await supabase.auth.getSession();
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/extract-questions`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${session.data.session?.access_token}` },
          body: formData,
        }
      );

      if (!resp.ok) {
        const err = await resp.json();
        throw new Error(err.error || "Falha no OCR");
      }

      const data = await resp.json();
      const questions = data.questions || [];

      if (questions.length > 0) {
        const publicUrl = await uploadBlob(blob);
        const rows = questions.map((q: any) => ({
          text: q.text,
          subject: q.subject || "Geral",
          topic: q.topic || null,
          options: q.options || null,
          correct_answer: q.correct_answer ?? null,
          difficulty: "medio",
          source: "image_crop",
          image_url: publicUrl,
          created_by: user.id,
        }));

        const { error } = await (supabase.from as any)("question_bank").insert(rows);
        if (error) throw error;
        toast.success(`${questions.length} questão(ões) extraída(s) e salva(s)!`);
        onSaved();
      } else {
        toast.error("Nenhuma questão identificada na imagem.");
      }
      onOpenChange(false);
      setImageSrc(null);
    } catch (e: any) {
      toast.error("Erro", { description: e.message });
    } finally {
      setExtracting(false);
    }
  };

  const handleClose = (isOpen: boolean) => {
    if (!isOpen) {
      setImageSrc(null);
      setCropStart(null);
      setCropEnd(null);
    }
    onOpenChange(isOpen);
  };

  const cropRect = getCropRect();

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Recortar Imagem de Questão</DialogTitle>
        </DialogHeader>

        {!imageSrc ? (
          <div
            className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Clique para selecionar uma imagem (foto de prova, diagrama...)
            </p>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Move className="w-3 h-3" /> Clique e arraste para selecionar a área de recorte
            </p>
            <div
              className="relative max-h-[50vh] overflow-auto cursor-crosshair select-none"
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            >
              <img ref={imgRef} src={imageSrc} alt="Preview" className="max-w-full" draggable={false} />
              {cropRect && (
                <>
                  <div className="absolute left-0 right-0 top-0 bg-black/50 pointer-events-none" style={{ height: `${cropRect.y * 100}%` }} />
                  <div className="absolute left-0 right-0 bottom-0 bg-black/50 pointer-events-none" style={{ height: `${(1 - cropRect.y - cropRect.height) * 100}%` }} />
                  <div className="absolute left-0 bg-black/50 pointer-events-none" style={{ top: `${cropRect.y * 100}%`, width: `${cropRect.x * 100}%`, height: `${cropRect.height * 100}%` }} />
                  <div className="absolute right-0 bg-black/50 pointer-events-none" style={{ top: `${cropRect.y * 100}%`, width: `${(1 - cropRect.x - cropRect.width) * 100}%`, height: `${cropRect.height * 100}%` }} />
                  <div
                    className="absolute border-2 border-primary pointer-events-none"
                    style={{ left: `${cropRect.x * 100}%`, top: `${cropRect.y * 100}%`, width: `${cropRect.width * 100}%`, height: `${cropRect.height * 100}%` }}
                  >
                    {[{ top: -4, left: -4 }, { top: -4, right: -4 }, { bottom: -4, left: -4 }, { bottom: -4, right: -4 }].map((pos, i) => (
                      <div key={i} className="absolute w-2 h-2 bg-primary rounded-full" style={pos as any} />
                    ))}
                  </div>
                </>
              )}
            </div>
            <div className="flex gap-2">
              <Button onClick={handleUploadCrop} disabled={uploading || extracting || !cropRect} className="flex-1">
                {uploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-1" />}
                Salvar Recorte
              </Button>
              <Button onClick={handleOcr} disabled={extracting || uploading || !cropRect} variant="outline" className="flex-1">
                {extracting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ScanText className="w-4 h-4 mr-1" />}
                Extrair Texto (OCR)
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
