import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, RefreshCw, FileEdit } from "lucide-react";
import { CanonicalEditor } from "@/components/adaptation/canonical-editor/CanonicalEditor";
import type { CanonicalDocument } from "@/lib/adaptation/canonical/schema";

type Props = {
  document: CanonicalDocument;
  onDocumentChange: (doc: CanonicalDocument) => void;
  onRegenerate: () => void;
  onNext: () => void;
  onPrev: () => void;
};

export function StepContent({ document, onDocumentChange, onRegenerate, onNext, onPrev }: Props) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FileEdit className="w-6 h-6 text-primary" />
          <div>
            <h2 className="text-xl font-semibold">Conteúdo</h2>
            <p className="text-sm text-muted-foreground">
              Edite o texto e as questões da atividade adaptada.
            </p>
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={onRegenerate}>
          <RefreshCw className="w-4 h-4 mr-1" /> Regerar
        </Button>
      </div>

      <CanonicalEditor value={document} onChange={onDocumentChange} />

      <div className="flex justify-between pt-4">
        <Button variant="outline" onClick={onPrev} aria-label="Voltar">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Voltar
        </Button>
        <Button onClick={onNext} aria-label="Avançar para estilo">
          Estilo
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}

export default StepContent;
