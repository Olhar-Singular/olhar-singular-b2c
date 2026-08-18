/**
 * ExportPanel — export controls for the canonical document.
 *
 * Holds `PanelSettings` (header fields, global page-break-per-question toggle)
 * and exposes two actions:
 *   - "Exportar PDF" → builds the PDF from the current document + settings +
 *     optional pageStyle and triggers a download.
 *   - "Copiar" → copies the plain-text projection to the clipboard, com o mesmo
 *     cabeçalho e a mesma quebra por questão que a prévia e o PDF usam.
 *
 * Since Fase 4a, font family/size/spacing come from the document-level
 * `pageStyle` prop (set by the "Aparência" popover upstream), NOT from a panel
 * font select. Pass `pageStyle` in from the parent (StepExportCanonical).
 */

import { useState } from "react";
import { Copy, FileDown, CalendarDays, FileText } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { CanonicalDocument, DocumentHeader, PageStyle } from "@/lib/adaptation/canonical/schema";
import { documentToPlainText } from "@/lib/adaptation/canonical/plainText";
import { downloadPdf } from "./exportPdf";
import { downloadDocx, docxExportWarnings } from "./exportDocx";
import { documentHasMath, pdfExportWarnings } from "./exportWarnings";
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
import { type PanelSettings } from "./panelSettings";

type Props = {
  document: CanonicalDocument;
  /**
   * The document header (title/school/teacher/date), controlled by the parent so
   * it persists inside the adaptation result. Defaults to empty.
   */
  header?: DocumentHeader;
  /** Fired with the merged header whenever a header field changes. */
  onHeaderChange?: (header: DocumentHeader) => void;
  /** Document-level presentation style (font, size, spacing). Comes from pageStyle in the result. */
  pageStyle?: PageStyle;
  /**
   * Avisa o pai a cada mudança do switch "Quebra de página por questão", para que
   * a prévia irmã possa desenhar a quebra. O estado continua morando aqui (é uma
   * escolha de exportação, não vai para o documento salvo).
   */
  onPageBreakPerQuestionChange?: (value: boolean) => void;
  /** Override the PDF download trigger (used in tests). */
  onDownload?: (document: CanonicalDocument, settings: PanelSettings, pageStyle?: PageStyle) => Promise<void>;
  /** Override the Word download trigger (used in tests). */
  onDownloadWord?: (document: CanonicalDocument, settings: PanelSettings, pageStyle?: PageStyle) => Promise<void>;
};

export function ExportPanel({
  document,
  header = {},
  onHeaderChange = () => {},
  pageStyle,
  onPageBreakPerQuestionChange = () => {},
  onDownload = downloadPdf,
  onDownloadWord = downloadDocx,
}: Props) {
  // Page-break is a transient, export-only choice (not persisted); the header
  // is lifted to the parent so it survives save.
  const [pageBreakPerQuestion, setPageBreakPerQuestion] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportingWord, setExportingWord] = useState(false);
  /**
   * Preenchido enquanto o diálogo "o que não sobrevive à exportação" está
   * aberto. Vale para os dois formatos: a exportação corria direto e dizia
   * "Word gerado!" / "PDF gerado!" por cima de conteúdo que o arquivo não
   * carrega — o professor só descobria o buraco na frente da turma.
   */
  const [pending, setPending] = useState<{ format: "pdf" | "word"; warnings: string[] } | null>(
    null,
  );

  const setField = (key: keyof DocumentHeader, value: string) =>
    onHeaderChange({ ...header, [key]: value });

  const handleCopy = async () => {
    try {
      // O "Copiar" recebe as MESMAS opções que o PDF (`runPdfExport`) e o Word:
      // sem elas era a única saída que descartava o cabeçalho recém-digitado e
      // ignorava o switch de quebra (achado 0127).
      await navigator.clipboard.writeText(
        documentToPlainText(document, { header, pageBreakPerQuestion }),
      );
      toast.success("Copiado para a área de transferência!");
    } catch {
      toast.error("Erro ao copiar.");
    }
  };

  const runPdfExport = async () => {
    setExporting(true);
    try {
      await onDownload(document, { header, pageBreakPerQuestion }, pageStyle);
      toast.success("PDF gerado!");
    } catch {
      toast.error("Erro ao gerar PDF.");
    } finally {
      setExporting(false);
    }
  };

  const handleExport = async () => {
    const warnings = pdfExportWarnings(document);
    if (warnings.length > 0) {
      setPending({ format: "pdf", warnings });
      return;
    }
    await runPdfExport();
  };

  const runWordExport = async () => {
    setExportingWord(true);
    try {
      // As MESMAS opções que o PDF recebe: sem o `pageBreakPerQuestion` o Word
      // era a única saída que ignorava o switch de quebra (achado 0132).
      await onDownloadWord(document, { header, pageBreakPerQuestion }, pageStyle);
      toast.success("Word gerado!");
    } catch {
      toast.error("Erro ao gerar Word.");
    } finally {
      setExportingWord(false);
    }
  };

  const handleExportWord = async () => {
    const warnings = docxExportWarnings(document, pageStyle);
    // Only interrupt when there is something to say; a clean document still
    // downloads in one click.
    if (warnings.length > 0) {
      setPending({ format: "word", warnings });
      return;
    }
    await runWordExport();
  };

  const confirmPending = () => {
    const format = pending?.format;
    setPending(null);
    if (format === "pdf") void runPdfExport();
    else void runWordExport();
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="pdf-title">Título</Label>
          <Input
            id="pdf-title"
            maxLength={120}
            value={header.title ?? ""}
            onChange={(e) => setField("title", e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="pdf-school">Escola</Label>
          <Input
            id="pdf-school"
            maxLength={100}
            value={header.school ?? ""}
            onChange={(e) => setField("school", e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="pdf-teacher">Professor(a)</Label>
          <Input
            id="pdf-teacher"
            maxLength={80}
            value={header.teacher ?? ""}
            onChange={(e) => setField("teacher", e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="pdf-date">Data</Label>
          <div className="relative group">
            <Input
              id="pdf-date"
              type="date"
              value={header.date ?? ""}
              onChange={(e) => setField("date", e.target.value)}
              className="cursor-pointer pr-10 hover:border-primary/60 focus-visible:border-primary transition-colors duration-200 [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:cursor-pointer"
            />
            <CalendarDays className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground transition-colors duration-200 group-hover:text-primary" />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Switch
          id="pdf-page-break"
          checked={pageBreakPerQuestion}
          onCheckedChange={(value) => {
            setPageBreakPerQuestion(value);
            onPageBreakPerQuestionChange(value);
          }}
        />
        <Label htmlFor="pdf-page-break">Quebra de página por questão</Label>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={handleCopy}>
          <Copy className="mr-1 h-4 w-4" /> Copiar
        </Button>
        <Button variant="outline" onClick={handleExport} disabled={exporting}>
          <FileDown className="mr-1 h-4 w-4" /> Exportar PDF
        </Button>
        <Button variant="outline" onClick={handleExportWord} disabled={exportingWord}>
          <FileText className="mr-1 h-4 w-4" /> Exportar Word
        </Button>
      </div>

      <AlertDialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pending?.format === "pdf" ? "O que não vai para o PDF" : "O que não vai para o Word"}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                {/* A referência é sempre a prévia, a única superfície que o professor
                    tem na tela. Comparar com o PDF mentiria quando há fórmula: os dois
                    formatos imprimem o mesmo LaTeX cru. */}
                <p className="mb-2">
                  O arquivo será gerado, mas estes itens não saem como aparecem na prévia:
                </p>
                <ul className="list-disc space-y-1 pl-5 text-left">
                  {(pending?.warnings ?? []).map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
                {/* Só empurra para o PDF quando o PDF é de fato mais fiel: com
                    fórmula ele imprime o mesmo LaTeX cru que o Word. */}
                {pending?.format === "word" && !documentHasMath(document) && (
                  <p className="mt-2">Para fidelidade total, exporte em PDF.</p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmPending}>Baixar mesmo assim</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default ExportPanel;
