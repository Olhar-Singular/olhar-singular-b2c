import { useEffect, useRef, useState, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, ChevronLeft, ChevronRight, Download, ExternalLink, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { renderPdfPage, getPdfPageCount } from "@/lib/pdf-utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  file: File | null;
  mode: "pdf" | "docx" | null;
  storagePath?: string | null;
};

export default function FilePreviewModal({ open, onOpenChange, file, mode, storagePath }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const styleContainerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pdfPageImage, setPdfPageImage] = useState<string | null>(null);
  const [pdfCurrentPage, setPdfCurrentPage] = useState(1);
  const [pdfPageCount, setPdfPageCount] = useState(0);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [wmfWarning, setWmfWarning] = useState(false);
  const [officeViewerUrl, setOfficeViewerUrl] = useState<string | null>(null);
  const [useOfficeViewer, setUseOfficeViewer] = useState(false);

  const clearDocxContainers = () => {
    if (containerRef.current) containerRef.current.innerHTML = "";
    if (styleContainerRef.current) styleContainerRef.current.innerHTML = "";
  };

  const loadPdfPage = useCallback(async (f: File, page: number) => {
    setPdfLoading(true);
    try {
      const img = await renderPdfPage(f, page, 2);
      setPdfPageImage(img);
      setPdfCurrentPage(page);
    } catch (e) {
      console.error("Error rendering PDF page:", e);
    } finally {
      setPdfLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open || !file || mode !== "pdf") return;
    let cancelled = false;
    const load = async () => {
      setPdfLoading(true);
      try {
        const count = await getPdfPageCount(file);
        if (cancelled) return;
        setPdfPageCount(count);
        const img = await renderPdfPage(file, 1, 2);
        if (cancelled) return;
        setPdfPageImage(img);
        setPdfCurrentPage(1);
      } catch (e) {
        console.error("Error loading PDF:", e);
      } finally {
        if (!cancelled) setPdfLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [open, file, mode]);

  useEffect(() => {
    if (!open || !storagePath || mode !== "docx") {
      setOfficeViewerUrl(null);
      return;
    }
    let cancelled = false;
    const generateUrl = async () => {
      try {
        const { data } = await supabase.storage
          .from("question-pdfs")
          .createSignedUrl(storagePath, 3600);
        if (!cancelled && data?.signedUrl) {
          const viewerUrl = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(data.signedUrl)}`;
          setOfficeViewerUrl(viewerUrl);
        }
      } catch {
        // silently fail — Office viewer is a fallback
      }
    };
    void generateUrl();
    return () => { cancelled = true; };
  }, [open, storagePath, mode]);

  useEffect(() => {
    if (!open || !file) return;
    let cancelled = false;
    setWmfWarning(false);
    setUseOfficeViewer(false);

    if (mode === "pdf") return;
    if (mode !== "docx") return;

    const renderDocx = async () => {
      setLoading(true);
      setError(null);
      clearDocxContainers();

      const renderFallbackHtml = async () => {
        const mammoth = await import("mammoth");
        const arrayBuffer = await file.arrayBuffer();
        if (cancelled || !containerRef.current) return;

        let hasWmf = false;
        const result = await mammoth.convertToHtml(
          { arrayBuffer },
          {
            convertImage: mammoth.images.imgElement((image: any) => {
              const ct = image.contentType || "";
              if (ct.includes("wmf") || ct.includes("emf") || ct.includes("x-wmf") || ct.includes("x-emf")) {
                hasWmf = true;
              }
              return image.read("base64").then((imageBuffer: string) => ({
                src: `data:${image.contentType};base64,${imageBuffer}`,
              }));
            }),
          }
        );

        if (cancelled || !containerRef.current) return;
        if (hasWmf) setWmfWarning(true);
        containerRef.current.innerHTML = result.value;
      };

      try {
        const docxPreview = await import("docx-preview");
        const renderAsync = (docxPreview as any).renderAsync ?? (docxPreview as any).default?.renderAsync;

        if (typeof renderAsync !== "function") {
          throw new Error("Renderizador DOCX indisponível");
        }

        const arrayBuffer = await file.arrayBuffer();
        if (cancelled || !containerRef.current || !styleContainerRef.current) return;

        await renderAsync(arrayBuffer, containerRef.current, styleContainerRef.current, {
          className: "docx",
          inWrapper: true,
          breakPages: true,
          ignoreWidth: false,
          ignoreHeight: false,
          ignoreFonts: false,
          ignoreLastRenderedPageBreak: false,
          useBase64URL: true,
        });

        if (cancelled || !containerRef.current) return;

        const docxRoot = containerRef.current.querySelector(".docx") as HTMLElement | null;
        const imgs = docxRoot?.querySelectorAll("img") ?? [];
        let wmfDetected = false;
        imgs.forEach((img) => {
          const src = img.getAttribute("src") || "";
          if (src.includes("x-wmf") || src.includes("x-emf") || src.includes("image/wmf") || src.includes("image/emf")) {
            wmfDetected = true;
          }
        });

        const textLength = docxRoot?.textContent?.replace(/\s+/g, "").length ?? 0;
        const hasVisualElements = !!docxRoot?.querySelector("img, table, svg, canvas, object, li, p");

        if (textLength < 20 && !hasVisualElements) {
          await renderFallbackHtml();
        } else if (wmfDetected) {
          setWmfWarning(true);
        }
      } catch (primaryError) {
        try {
          await renderFallbackHtml();
        } catch (fallbackError) {
          console.error("Erro ao renderizar DOCX:", primaryError);
          console.error("Fallback de DOCX falhou:", fallbackError);
          if (!cancelled) {
            setError("Não foi possível renderizar este arquivo Word. Tente baixar para conferir o conteúdo original.");
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void renderDocx();
    return () => {
      cancelled = true;
      clearDocxContainers();
      setError(null);
      setWmfWarning(false);
    };
  }, [open, file, mode]);

  const handleClose = (isOpen: boolean) => {
    if (!isOpen) {
      setPdfPageImage(null);
      setPdfCurrentPage(1);
      setPdfPageCount(0);
      clearDocxContainers();
      setError(null);
      setWmfWarning(false);
      setUseOfficeViewer(false);
    }
    onOpenChange(isOpen);
  };

  const handleDownload = () => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-5xl max-h-[92vh]">
        <DialogHeader>
          <DialogTitle className="truncate">{file?.name || "Visualização do Documento"}</DialogTitle>
        </DialogHeader>

        <div ref={styleContainerRef} className="hidden" />

        {wmfWarning && mode === "docx" && (
          <Alert variant="destructive" className="border-yellow-500 bg-yellow-50 dark:bg-yellow-950/30 text-yellow-800 dark:text-yellow-200 [&>svg]:text-yellow-600">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="flex flex-col gap-2">
              <span>Algumas imagens deste arquivo estão em formato antigo (WMF/EMF) que navegadores não suportam.</span>
              <span className="text-xs opacity-80">Dica: salve o arquivo como PDF no Word antes de enviar, ou use o botão abaixo para visualizar com todas as imagens.</span>
              {officeViewerUrl && (
                <Button
                  size="sm"
                  variant="outline"
                  className="w-fit mt-1 border-yellow-600 text-yellow-700 hover:bg-yellow-100 dark:border-yellow-500 dark:text-yellow-300 dark:hover:bg-yellow-900"
                  onClick={() => setUseOfficeViewer(true)}
                >
                  <ExternalLink className="w-4 h-4 mr-1" />
                  Visualizar com Microsoft Office Online
                </Button>
              )}
            </AlertDescription>
          </Alert>
        )}

        <div className="relative overflow-auto max-h-[75vh] rounded-md border bg-muted/30">
          {mode === "pdf" && (
            <div className="flex flex-col items-center gap-4 p-4">
              {pdfLoading ? (
                <div className="flex items-center justify-center h-[60vh]">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
              ) : pdfPageImage ? (
                <img src={pdfPageImage} alt={`Página ${pdfCurrentPage}`} className="max-w-full rounded shadow-sm" />
              ) : (
                <p className="text-muted-foreground py-12">Nenhum PDF carregado</p>
              )}
              {pdfPageCount > 1 && (
                <div className="flex items-center gap-3">
                  <Button size="icon" variant="outline" disabled={pdfCurrentPage <= 1 || pdfLoading} onClick={() => file && loadPdfPage(file, pdfCurrentPage - 1)}>
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <span className="text-sm text-muted-foreground min-w-[120px] text-center">Página {pdfCurrentPage} / {pdfPageCount}</span>
                  <Button size="icon" variant="outline" disabled={pdfCurrentPage >= pdfPageCount || pdfLoading} onClick={() => file && loadPdfPage(file, pdfCurrentPage + 1)}>
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              )}
            </div>
          )}

          {mode === "docx" && useOfficeViewer && officeViewerUrl && (
            <iframe
              src={officeViewerUrl}
              className="w-full rounded-md border-0"
              style={{ height: "72vh" }}
              title="Office Online Viewer"
            />
          )}

          {mode === "docx" && !useOfficeViewer && (
            <>
              {loading && (
                <div className="absolute inset-0 z-10 grid place-items-center bg-background/80">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                </div>
              )}
              {error ? (
                <div className="py-10 px-4 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-destructive" />
                  <p>{error}</p>
                  {officeViewerUrl && (
                    <Button size="sm" variant="outline" onClick={() => setUseOfficeViewer(true)} className="mt-2">
                      <ExternalLink className="w-4 h-4 mr-1" /> Tentar com Office Online
                    </Button>
                  )}
                </div>
              ) : (
                <div
                  ref={containerRef}
                  className="p-6 prose prose-sm max-w-none dark:prose-invert [&_.docx-wrapper]:bg-transparent [&_.docx-wrapper]:p-0 [&_.docx]:mx-auto [&_.docx]:shadow-sm [&_img]:max-w-full [&_img]:h-auto [&_img]:rounded [&_table]:border-collapse [&_td]:border [&_td]:border-border [&_td]:p-2 [&_th]:border [&_th]:border-border [&_th]:p-2 [&_th]:bg-muted"
                />
              )}
            </>
          )}
        </div>

        <div className="flex justify-end">
          <Button size="sm" variant="outline" onClick={handleDownload}>
            <Download className="w-4 h-4 mr-1" /> Baixar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
