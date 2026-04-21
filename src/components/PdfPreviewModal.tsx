import { useState, useEffect, useRef, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Download, Loader2, Crop, Move } from "lucide-react";
import { renderPdfPage, getPdfPageCount } from "@/lib/pdf-utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  file: File | null;
  onCrop?: (dataUrl: string) => void;
  initialPage?: number;
};

export default function PdfPreviewModal({ open, onOpenChange, file, onCrop, initialPage }: Props) {
  const [pageCount, setPageCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageImage, setPageImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [cropping, setCropping] = useState(false);
  const [cropStart, setCropStart] = useState<{ x: number; y: number } | null>(null);
  const [cropEnd, setCropEnd] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (!open || !file) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const count = await getPdfPageCount(file);
        if (cancelled) return;
        setPageCount(count);
        const startPage = initialPage && initialPage >= 1 && initialPage <= count ? initialPage : 1;
        const img = await renderPdfPage(file, startPage, 2);
        if (cancelled) return;
        setPageImage(img);
        setCurrentPage(startPage);
      } catch (e) { console.error("Error loading PDF:", e); }
      finally { if (!cancelled) setLoading(false); }
    };
    load();
    return () => { cancelled = true; };
  }, [open, file, initialPage]);

  const loadPage = async (page: number) => {
    if (!file) return;
    setLoading(true);
    setCropStart(null); setCropEnd(null);
    try {
      const img = await renderPdfPage(file, page, 2);
      setPageImage(img); setCurrentPage(page);
    } catch (e) { console.error("Error rendering page:", e); }
    finally { setLoading(false); }
  };

  const handleClose = (isOpen: boolean) => {
    if (!isOpen) { setPageImage(null); setCurrentPage(1); setPageCount(0); setCropping(false); setCropStart(null); setCropEnd(null); }
    onOpenChange(isOpen);
  };

  const getRelativeCoords = useCallback((e: React.MouseEvent) => {
    const img = imgRef.current;
    if (!img) return null;
    const rect = img.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(img.clientWidth, e.clientX - rect.left)),
      y: Math.max(0, Math.min(img.clientHeight, e.clientY - rect.top)),
    };
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!cropping) return;
    e.preventDefault();
    const coords = getRelativeCoords(e);
    if (!coords) return;
    setCropStart(coords); setCropEnd(coords); setIsDragging(true);
  };
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !cropping) return;
    e.preventDefault();
    const coords = getRelativeCoords(e);
    if (coords) setCropEnd(coords);
  };
  const handleMouseUp = () => setIsDragging(false);

  const getCropRect = () => {
    const img = imgRef.current;
    if (!img || !cropStart || !cropEnd) return null;
    const x = Math.min(cropStart.x, cropEnd.x);
    const y = Math.min(cropStart.y, cropEnd.y);
    const width = Math.abs(cropEnd.x - cropStart.x);
    const height = Math.abs(cropEnd.y - cropStart.y);
    if (width < 5 || height < 5) return null;
    return { x, y, width, height, displayWidth: img.clientWidth, displayHeight: img.clientHeight };
  };

  const handleConfirmCrop = () => {
    const img = imgRef.current;
    const rect = getCropRect();
    if (!img || !rect || !onCrop) return;
    const scaleX = img.naturalWidth / rect.displayWidth;
    const scaleY = img.naturalHeight / rect.displayHeight;
    const sx = Math.max(0, Math.floor(rect.x * scaleX));
    const sy = Math.max(0, Math.floor(rect.y * scaleY));
    const sw = Math.max(1, Math.min(img.naturalWidth - sx, Math.ceil(rect.width * scaleX)));
    const sh = Math.max(1, Math.min(img.naturalHeight - sy, Math.ceil(rect.height * scaleY)));
    const canvas = document.createElement("canvas");
    canvas.width = sw; canvas.height = sh;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#FFFFFF"; ctx.fillRect(0, 0, sw, sh);
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
    onCrop(canvas.toDataURL("image/png"));
    setCropping(false); setCropStart(null); setCropEnd(null);
    handleClose(false);
  };

  const cropRect = getCropRect();

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[95vh]">
        <DialogHeader>
          <DialogTitle className="truncate">{file?.name || "Preview PDF"}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4">
          {cropping && (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Move className="w-3 h-3" /> Clique e arraste sobre a imagem para selecionar a área de recorte
            </p>
          )}
          {loading ? (
            <div className="flex items-center justify-center h-[60vh]">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : pageImage ? (
            <div className="overflow-auto max-h-[60vh] w-full flex justify-center">
              <div
                className={`relative inline-block align-top ${cropping ? "cursor-crosshair select-none" : ""}`}
                onMouseDown={handleMouseDown} onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}
              >
                <img ref={imgRef} src={pageImage} alt={`Página ${currentPage}`} className="block max-w-full rounded shadow-sm" draggable={false} />
                {cropping && cropRect && (
                  <div className="absolute border-2 border-primary pointer-events-none" style={{ left: `${cropRect.x}px`, top: `${cropRect.y}px`, width: `${cropRect.width}px`, height: `${cropRect.height}px` }}>
                    {[{ top: -4, left: -4 }, { top: -4, right: -4 }, { bottom: -4, left: -4 }, { bottom: -4, right: -4 }].map((pos, i) => (
                      <div key={i} className="absolute w-2 h-2 bg-primary rounded-full" style={pos as any} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground py-12">Nenhum PDF carregado</p>
          )}
          <div className="flex items-center gap-3 flex-wrap justify-center">
            <Button size="icon" variant="outline" disabled={currentPage <= 1 || loading} onClick={() => loadPage(currentPage - 1)}><ChevronLeft className="w-4 h-4" /></Button>
            <span className="text-sm text-muted-foreground min-w-[120px] text-center">Página {currentPage} / {pageCount}</span>
            <Button size="icon" variant="outline" disabled={currentPage >= pageCount || loading} onClick={() => loadPage(currentPage + 1)}><ChevronRight className="w-4 h-4" /></Button>
            <Button size="sm" variant="outline" onClick={() => { if (!file) return; const url = URL.createObjectURL(file); const a = document.createElement("a"); a.href = url; a.download = file.name; a.click(); URL.revokeObjectURL(url); }}>
              <Download className="w-4 h-4 mr-1" /> Baixar
            </Button>
            {onCrop && !cropping && <Button size="sm" variant="secondary" onClick={() => setCropping(true)}><Crop className="w-4 h-4 mr-1" /> Recortar Imagem</Button>}
            {cropping && <>
              <Button size="sm" variant="ghost" onClick={() => { setCropping(false); setCropStart(null); setCropEnd(null); }}>Cancelar</Button>
              <Button size="sm" disabled={!cropRect} onClick={handleConfirmCrop}>Confirmar Recorte</Button>
            </>}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
