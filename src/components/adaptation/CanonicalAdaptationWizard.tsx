import { useState, useCallback } from "react";
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
import { StepActivityType } from "./steps/activity-type/StepActivityType";
import { StepActivityInput } from "./steps/activity-input/StepActivityInput";
import { StepBarrierSelection } from "./steps/barriers/StepBarrierSelection";
import { StepGenerate } from "./steps/generate/StepGenerate";
import { StepContent } from "./steps/content/StepContent";
import { StepStyling } from "./steps/styling/StepStyling";
import { StepExportCanonical } from "./steps/export/StepExportCanonical";
import {
  INITIAL_WIZARD_DATA,
  setResult,
  setDocument,
  clearResult,
  type WizardData,
} from "@/lib/adaptation/wizard/wizardState";
import type { AdaptationResult, CanonicalDocument } from "@/lib/adaptation/canonical/schema";

const STEPS = [
  "activity_type",
  "activity_input",
  "barriers",
  "generate",
  "content",
  "styling",
  "export",
] as const;

type StepKey = (typeof STEPS)[number];

const STEP_LABELS: Record<StepKey, string> = {
  activity_type: "Tipo",
  activity_input: "Atividade",
  barriers: "Barreiras",
  generate: "Gerar",
  content: "Conteúdo",
  styling: "Estilo",
  export: "Exportar",
};

const GENERATE_INDEX = STEPS.indexOf("generate");

export default function CanonicalAdaptationWizard() {
  const [data, setData] = useState<WizardData>(INITIAL_WIZARD_DATA);
  const [stepIndex, setStepIndex] = useState(0);
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);

  const currentKey = STEPS[stepIndex];

  const updateData = useCallback((partial: Partial<WizardData>) => {
    setData((prev) => ({ ...prev, ...partial }));
  }, []);

  const onNext = useCallback(() => {
    setStepIndex((i) => Math.min(i + 1, STEPS.length - 1));
  }, []);

  const onPrev = useCallback(() => {
    setStepIndex((i) => Math.max(i - 1, 0));
  }, []);

  function goTo(target: number) {
    setStepIndex(target);
  }

  const handleResult = useCallback((result: AdaptationResult) => {
    setData((prev) => setResult(prev, result));
  }, []);

  const handleDocumentChange = useCallback((document: CanonicalDocument) => {
    setData((prev) => setDocument(prev, document));
  }, []);

  function handleRestart() {
    setData(INITIAL_WIZARD_DATA);
    setStepIndex(0);
  }

  function confirmRegenerateNow() {
    setConfirmRegenerate(false);
    setData((prev) => clearResult(prev));
    setStepIndex(GENERATE_INDEX);
  }

  const renderStep = () => {
    switch (currentKey) {
      case "activity_type":
        return (
          <StepActivityType
            onSelect={(type) => {
              updateData({ activityType: type });
              onNext();
            }}
          />
        );
      case "activity_input":
        return <StepActivityInput data={data} updateData={updateData} onNext={onNext} onPrev={onPrev} />;
      case "barriers":
        return <StepBarrierSelection data={data} updateData={updateData} onNext={onNext} onPrev={onPrev} />;
      case "generate":
        return (
          <StepGenerate data={data} onResult={handleResult} onNext={onNext} onPrev={onPrev} />
        );
      case "content":
        /* v8 ignore next -- guard: content step is only reachable once a result exists */
        if (!data.result) return null;
        return (
          <StepContent
            document={data.result.document}
            onDocumentChange={handleDocumentChange}
            onRegenerate={() => setConfirmRegenerate(true)}
            onNext={onNext}
            onPrev={onPrev}
          />
        );
      case "styling":
        /* v8 ignore next -- guard: styling step is only reachable once a result exists */
        if (!data.result) return null;
        return (
          <StepStyling
            document={data.result.document}
            onDocumentChange={handleDocumentChange}
            onRegenerate={() => setConfirmRegenerate(true)}
            onNext={onNext}
            onPrev={onPrev}
          />
        );
      case "export":
        /* v8 ignore next -- guard: export step is only reachable once a result exists */
        if (!data.result) return null;
        return <StepExportCanonical result={data.result} onPrev={onPrev} onRestart={handleRestart} />;
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 space-y-6">
      {/* Step indicator */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {STEPS.map((key, i) => (
          <div key={key} className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => goTo(i)}
              disabled={i > stepIndex}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                i === stepIndex
                  ? "bg-primary text-primary-foreground"
                  : i < stepIndex
                  ? "bg-primary/10 text-primary hover:bg-primary/20"
                  : "bg-muted text-muted-foreground cursor-not-allowed"
              }`}
            >
              <span className="w-4 h-4 rounded-full border flex items-center justify-center text-[0.6rem] font-bold">
                {i + 1}
              </span>
              {STEP_LABELS[key]}
            </button>
            {i < STEPS.length - 1 && (
              <div className={`w-4 h-px ${i < stepIndex ? "bg-primary/40" : "bg-border"}`} />
            )}
          </div>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        Passo {stepIndex + 1} de {STEPS.length}
      </p>

      <div className="min-h-[400px]">{renderStep()}</div>

      <AlertDialog open={confirmRegenerate} onOpenChange={setConfirmRegenerate}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Regerar adaptação?</AlertDialogTitle>
            <AlertDialogDescription>
              A adaptação atual será substituída por uma nova. As edições de conteúdo e estilo serão perdidas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmRegenerateNow}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Regerar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
