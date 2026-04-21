import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, FileEdit } from "lucide-react";
import ActivityEditor from "@/components/editor/ActivityEditor";
import { structuredToMarkdownDsl, markdownDslToStructured } from "@/lib/activityDslConverter";
import { useActivityContent } from "@/hooks/useActivityContent";
import type { WizardData, AdaptationResult } from "@/lib/adaptationWizardHelpers";
import { buildManualResult } from "@/lib/adaptationWizardHelpers";

type Props = {
  data: WizardData;
  updateData: (partial: Partial<WizardData>) => void;
  onNext: () => void;
  onPrev: () => void;
};

export function StepEditor({ data, updateData, onNext, onPrev }: Props) {
  const initialDsl = useMemo(() => {
    if (data.result?.version_universal) {
      return structuredToMarkdownDsl(data.result.version_universal);
    }
    return data.activityText || "";
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const content = useActivityContent({
    initialDsl: data.editorContentManual?.dsl ?? initialDsl,
    initialRegistry: data.editorContentManual?.registry ?? {},
    onChange: (c) => updateData({ editorContentManual: { dsl: c.dsl, registry: c.registry } }),
  });

  const handleNext = () => {
    const activity = markdownDslToStructured(content.dslExpanded);
    const result: AdaptationResult = buildManualResult(activity);
    updateData({ result });
    onNext();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <FileEdit className="w-6 h-6 text-primary" />
        <div>
          <h2 className="text-xl font-semibold">Editar Atividade</h2>
          <p className="text-sm text-muted-foreground">
            Edite e revise antes de exportar.
          </p>
        </div>
      </div>

      <div className="-mx-4 sm:-mx-5 lg:-mx-7">
        <ActivityEditor
          value={content.dsl}
          onChange={content.setDsl}
          imageRegistry={content.registry}
          onUndo={content.undo}
          onRedo={content.redo}
          canUndo={content.canUndo}
          canRedo={content.canRedo}
        />
      </div>

      <div className="flex justify-between pt-4">
        <Button variant="outline" onClick={onPrev} aria-label="Voltar">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Voltar
        </Button>
        <Button onClick={handleNext} aria-label="Avançar para exportação">
          Avançar
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}
