import { Button } from "@/components/ui/button";
import { ArrowLeft, RotateCcw, Save, Loader2 } from "lucide-react";
import { CanonicalRenderer } from "@/components/adaptation/render/CanonicalRenderer";
import { ExportPanel } from "@/components/adaptation/export/ExportPanel";
import type { AdaptationResult, DocumentHeader } from "@/lib/adaptation/canonical/schema";

type Props = {
  result: AdaptationResult;
  /** Whether a draft row exists to mark ready. */
  canSave: boolean;
  /** True while the markReady mutation is in flight. */
  saving: boolean;
  onSave: () => void;
  /** Persist a change to the document header (title/school/teacher/date). */
  onHeaderChange?: (header: DocumentHeader) => void;
  onPrev: () => void;
  onRestart: () => void;
};

export function StepExportCanonical({
  result,
  canSave,
  saving,
  onSave,
  onHeaderChange,
  onPrev,
  onRestart,
}: Props) {
  const document = result.document;

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-foreground">Exportar</h2>

      <ExportPanel
        document={document}
        header={result.header}
        onHeaderChange={onHeaderChange}
        pageStyle={result.pageStyle}
      />

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={onSave} disabled={!canSave || saving}>
          {saving ? (
            <Loader2 className="w-4 h-4 mr-1 animate-spin" />
          ) : (
            <Save className="w-4 h-4 mr-1" />
          )}
          Salvar
        </Button>
      </div>

      <div className="rounded-md border border-input bg-background p-4">
        <CanonicalRenderer document={document} />
      </div>

      <div className="flex justify-between">
        <Button variant="outline" onClick={onPrev}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Voltar
        </Button>
        <Button variant="outline" onClick={onRestart}>
          <RotateCcw className="w-4 h-4 mr-1" /> Nova adaptação
        </Button>
      </div>
    </div>
  );
}

export default StepExportCanonical;
