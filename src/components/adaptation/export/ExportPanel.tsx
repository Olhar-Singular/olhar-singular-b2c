/**
 * ExportPanel — export controls for the canonical document.
 *
 * Holds `PanelSettings` (header fields, global page-break-per-question toggle)
 * and exposes two actions:
 *   - "Exportar PDF" → builds the PDF from the current document + settings +
 *     optional pageStyle and triggers a download.
 *   - "Copiar" → copies the plain-text projection to the clipboard.
 *
 * Since Fase 4a, font family/size/spacing come from the document-level
 * `pageStyle` prop (set by the "Aparência" popover upstream), NOT from a panel
 * font select. Pass `pageStyle` in from the parent (StepExportCanonical).
 */

import { useState } from "react";
import { Copy, FileDown, CalendarDays } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { CanonicalDocument, PageStyle } from "@/lib/adaptation/canonical/schema";
import { documentToPlainText } from "@/lib/adaptation/canonical/plainText";
import { downloadPdf } from "./exportPdf";
import { DEFAULT_PANEL_SETTINGS, type PanelSettings } from "./panelSettings";

type Props = {
  document: CanonicalDocument;
  /** Document-level presentation style (font, size, spacing). Comes from pageStyle in the result. */
  pageStyle?: PageStyle;
  /** Override the download trigger (used in tests). */
  onDownload?: (document: CanonicalDocument, settings: PanelSettings, pageStyle?: PageStyle) => Promise<void>;
};

export function ExportPanel({ document, pageStyle, onDownload = downloadPdf }: Props) {
  const [settings, setSettings] = useState<PanelSettings>(DEFAULT_PANEL_SETTINGS);
  const [exporting, setExporting] = useState(false);

  const setHeader = (key: keyof PanelSettings["header"], value: string) =>
    setSettings((s) => ({ ...s, header: { ...s.header, [key]: value } }));

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(documentToPlainText(document));
      toast.success("Copiado para a área de transferência!");
    } catch {
      toast.error("Erro ao copiar.");
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      await onDownload(document, settings, pageStyle);
      toast.success("PDF gerado!");
    } catch {
      toast.error("Erro ao gerar PDF.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="pdf-title">Título</Label>
          <Input
            id="pdf-title"
            maxLength={120}
            value={settings.header.title ?? ""}
            onChange={(e) => setHeader("title", e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="pdf-school">Escola</Label>
          <Input
            id="pdf-school"
            maxLength={100}
            value={settings.header.school ?? ""}
            onChange={(e) => setHeader("school", e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="pdf-teacher">Professor(a)</Label>
          <Input
            id="pdf-teacher"
            maxLength={80}
            value={settings.header.teacher ?? ""}
            onChange={(e) => setHeader("teacher", e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="pdf-date">Data</Label>
          <div className="relative group">
            <Input
              id="pdf-date"
              type="date"
              value={settings.header.date ?? ""}
              onChange={(e) => setHeader("date", e.target.value)}
              className="cursor-pointer pr-10 hover:border-primary/60 focus-visible:border-primary transition-colors duration-200 [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:cursor-pointer"
            />
            <CalendarDays className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground transition-colors duration-200 group-hover:text-primary" />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Switch
          id="pdf-page-break"
          checked={settings.pageBreakPerQuestion}
          onCheckedChange={(checked) =>
            setSettings((s) => ({ ...s, pageBreakPerQuestion: checked }))
          }
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
      </div>
    </div>
  );
}

export default ExportPanel;
