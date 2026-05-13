import { useState, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { calcAdaptationCost } from "@/lib/domain/barriers";
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
import { StepChoice } from "./steps/choice/StepChoice";
import StepAIEditor from "./steps/ai-editor/StepAIEditor";
import { StepEditor } from "./steps/editor/StepEditor";
import StepExport from "./steps/export/StepExport";
import {
  shouldConfirmDiscard,
  resetGeneratedState,
  type WizardData,
  type WizardMode,
} from "@/lib/domain/adaptationWizardHelpers";

const AI_STEPS = ["activity_type", "activity_input", "barriers", "choice", "ai_editor", "export"] as const;
const MANUAL_STEPS = ["activity_type", "activity_input", "barriers", "choice", "editor", "export"] as const;

const STEP_LABELS: Record<string, string> = {
  activity_type: "Tipo",
  activity_input: "Atividade",
  barriers: "Barreiras",
  choice: "Método",
  ai_editor: "Adaptação IA",
  editor: "Editor",
  export: "Exportar",
};

const INITIAL_DATA: WizardData = {
  activityType: null,
  activityText: "",
  barriers: [],
  barrierProfileId: null,
  result: null,
  wizardMode: "ai",
};

export default function AdaptationWizard() {
  const { profile } = useAuth();
  const [data, setData] = useState<WizardData>(INITIAL_DATA);
  const [stepIndex, setStepIndex] = useState(0);
  const [confirmTarget, setConfirmTarget] = useState<number | null>(null);

  const activeDimensions = [...new Set(
    data.barriers.filter((b) => b.is_active).map((b) => b.dimension).filter(Boolean),
  )];
  const creditCost = calcAdaptationCost(activeDimensions);
  const isFreeAdaptation = !profile?.free_adaptation_used;

  const steps = data.wizardMode === "manual" ? MANUAL_STEPS : AI_STEPS;
  const currentKey = steps[stepIndex];

  const updateData = useCallback((partial: Partial<WizardData>) => {
    setData((prev) => ({ ...prev, ...partial }));
  }, []);

  function goTo(target: number) {
    if (shouldConfirmDiscard(steps, stepIndex, target, !!data.result)) {
      setConfirmTarget(target);
      return;
    }
    setStepIndex(target);
  }

  function onNext() {
    setStepIndex((i) => Math.min(i + 1, steps.length - 1));
  }

  function onPrev() {
    goTo(stepIndex - 1);
  }

  function handleModeSelect(mode: WizardMode) {
    updateData({ wizardMode: mode });
    setStepIndex((i) => i + 1);
  }

  function handleRestart() {
    setData(INITIAL_DATA);
    setStepIndex(0);
  }

  /* v8 ignore start -- only invoked through the confirm-discard AlertDialog
   * (Radix portal) which we cannot exercise in jsdom. */
  function handleConfirmDiscard() {
    if (confirmTarget === null) return;
    updateData(resetGeneratedState());
    setStepIndex(confirmTarget);
    setConfirmTarget(null);
  }
  /* v8 ignore stop */

  const totalVisible = steps.length;

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
      case "choice":
        return (
          <StepChoice
            onSelect={handleModeSelect}
            creditCost={creditCost}
            isFreeAdaptation={isFreeAdaptation}
          />
        );
      case "ai_editor":
        return <StepAIEditor data={data} updateData={updateData} onNext={onNext} onPrev={onPrev} />;
      case "editor":
        return <StepEditor data={data} updateData={updateData} onNext={onNext} onPrev={onPrev} />;
      case "export":
        return <StepExport data={data} onPrev={onPrev} onRestart={handleRestart} />;
      /* v8 ignore next -- exhaustive switch over const tuple; branch is unreachable at runtime */
      default:
        return null;
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 space-y-6">
      {/* Step indicator */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {steps.map((key, i) => (
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
            {i < totalVisible - 1 && (
              <div className={`w-4 h-px ${i < stepIndex ? "bg-primary/40" : "bg-border"}`} />
            )}
          </div>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        Passo {stepIndex + 1} de {totalVisible}
      </p>

      <div className="min-h-[400px]">
        {renderStep()}
      </div>

      {/* v8 ignore start -- AlertDialog (Radix portal) only opens when the
          user navigates back from the editor with a generated result. */}
      <AlertDialog open={confirmTarget !== null} onOpenChange={(o) => !o && setConfirmTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Descartar resultado?</AlertDialogTitle>
            <AlertDialogDescription>
              Voltando agora o resultado gerado será perdido. Você precisará gerar novamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDiscard} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Descartar e voltar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {/* v8 ignore stop */}
    </div>
  );
}
