import { Button } from "@/components/ui/button";
import { ArrowLeft, Copy, RotateCcw, Save, FileDown } from "lucide-react";
import { toast } from "sonner";
import { CanonicalRenderer } from "@/components/adaptation/render/CanonicalRenderer";
import { documentToPlainText } from "@/lib/adaptation/canonical/plainText";
import type { AdaptationResult } from "@/lib/adaptation/canonical/schema";

type Props = {
  result: AdaptationResult;
  onPrev: () => void;
  onRestart: () => void;
};

export function StepExportCanonical({ result, onPrev, onRestart }: Props) {
  const document = result.document;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(documentToPlainText(document));
      toast.success("Copiado para a área de transferência!");
    } catch {
      toast.error("Erro ao copiar.");
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-foreground">Exportar</h2>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={handleCopy}>
          <Copy className="w-4 h-4 mr-1" /> Copiar
        </Button>
        {/* TODO(M6): persistence — wire to adaptations insert + grant_credits seam. */}
        <Button variant="outline" disabled title="Em breve">
          <Save className="w-4 h-4 mr-1" /> Salvar
        </Button>
        {/* TODO(M7): PDF export — wire to the canonical → PDF mapper. */}
        <Button variant="outline" disabled title="Em breve">
          <FileDown className="w-4 h-4 mr-1" /> Exportar PDF
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
