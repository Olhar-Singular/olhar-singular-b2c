/**
 * ExportPanel — export controls for the canonical document.
 *
 * Holds `PanelSettings` (header fields, base font family, global
 * page-break-per-question toggle) and exposes two actions:
 *   - "Exportar PDF" → builds the PDF from the current document + settings and
 *     triggers a download.
 *   - "Copiar" → copies the plain-text projection to the clipboard.
 */

import { useState } from "react";
import { Copy, FileDown } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { CanonicalDocument } from "@/lib/adaptation/canonical/schema";
import { documentToPlainText } from "@/lib/adaptation/canonical/plainText";
import { downloadPdf } from "./exportPdf";
import {
  DEFAULT_PANEL_SETTINGS,
  PDF_FONTS,
  type PanelSettings,
  type PdfFont,
} from "./panelSettings";

type Props = {
  document: CanonicalDocument;
  /** Override the download trigger (used in tests). */
  onDownload?: (document: CanonicalDocument, settings: PanelSettings) => Promise<void>;
};

export function ExportPanel({ document, onDownload = downloadPdf }: Props) {
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
      await onDownload(document, settings);
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
            value={settings.header.title ?? ""}
            onChange={(e) => setHeader("title", e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="pdf-school">Escola</Label>
          <Input
            id="pdf-school"
            value={settings.header.school ?? ""}
            onChange={(e) => setHeader("school", e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="pdf-teacher">Professor(a)</Label>
          <Input
            id="pdf-teacher"
            value={settings.header.teacher ?? ""}
            onChange={(e) => setHeader("teacher", e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="pdf-date">Data</Label>
          <Input
            id="pdf-date"
            value={settings.header.date ?? ""}
            onChange={(e) => setHeader("date", e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="pdf-font">Fonte</Label>
          <select
            id="pdf-font"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={settings.fontFamily}
            onChange={(e) =>
              setSettings((s) => ({ ...s, fontFamily: e.target.value as PdfFont }))
            }
          >
            {PDF_FONTS.map((font) => (
              <option key={font} value={font}>
                {font}
              </option>
            ))}
          </select>
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
