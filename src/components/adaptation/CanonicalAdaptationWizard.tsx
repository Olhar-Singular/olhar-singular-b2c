import { useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
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
import { wizardDataToPayload } from "@/lib/adaptation/wizard/rowMapping";
import { saveDraft } from "@/lib/adaptation/persistence/adaptationsRepo";
import { useAdaptationDraft } from "@/hooks/useAdaptationDraft";
import { useMarkReady } from "@/hooks/useAdaptations";
import { useAuth } from "@/hooks/useAuth";
import { parseDbError } from "@/lib/utils/errors";
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
const CONTENT_INDEX = STEPS.indexOf("content");
const EXPORT_INDEX = STEPS.indexOf("export");

export type EditModeSeed = {
  adaptationId: string;
  initialData: WizardData;
  initialUpdatedAt: string;
};

type Props = {
  /** When provided, the wizard opens an existing adaptation at the content step. */
  editMode?: EditModeSeed;
};

const SAVE_STATUS_LABEL: Record<string, string> = {
  saving: "Salvando…",
  saved: "Salvo",
  error: "Erro ao salvar",
  conflict: "Conflito — recarregue",
};

export default function CanonicalAdaptationWizard({ editMode }: Props = {}) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const markReady = useMarkReady();

  const [data, setData] = useState<WizardData>(
    editMode ? editMode.initialData : INITIAL_WIZARD_DATA,
  );
  const [stepIndex, setStepIndex] = useState(editMode ? CONTENT_INDEX : 0);
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);

  // Draft persistence state. In edit mode we already have a row.
  const [draftId, setDraftId] = useState<string | null>(
    editMode ? editMode.adaptationId : null,
  );
  const initialUpdatedAtRef = useRef<string | null>(
    editMode ? editMode.initialUpdatedAt : null,
  );

  const { status: saveStatus } = useAdaptationDraft({
    draftId,
    result: data.result,
    initialUpdatedAt: initialUpdatedAtRef.current,
  });

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

  // First generation creates the draft row so autosave has somewhere to write.
  const handleResult = useCallback(
    async (result: AdaptationResult) => {
      setData((prev) => setResult(prev, result));
      // Draft already exists (e.g. regenerate) → autosave handles the update.
      if (draftId) return;
      /* v8 ignore next -- user is guaranteed by ProtectedRoute */
      if (!user) return;
      try {
        const payload = wizardDataToPayload(
          { ...data, result },
          user.id,
        );
        const row = await saveDraft(payload);
        setDraftId(row.id);
        initialUpdatedAtRef.current = row.updated_at;
      } catch (err) {
        toast.error(parseDbError(err, "Erro ao salvar o rascunho."));
      }
    },
    [draftId, user, data],
  );

  const handleDocumentChange = useCallback((document: CanonicalDocument) => {
    setData((prev) => setDocument(prev, document));
  }, []);

  function handleRestart() {
    setData(INITIAL_WIZARD_DATA);
    setStepIndex(0);
    setDraftId(null);
    initialUpdatedAtRef.current = null;
  }

  function confirmRegenerateNow() {
    setConfirmRegenerate(false);
    setData((prev) => clearResult(prev));
    setStepIndex(GENERATE_INDEX);
  }

  // "Salvar": mark the draft ready (save happens before the export screen).
  const handleSave = useCallback(async () => {
    /* v8 ignore next -- guard: the Salvar button is disabled until a draft exists */
    if (!draftId) return;
    await markReady.mutateAsync(draftId);
    toast.success("Adaptação salva!");
    navigate("/historico");
  }, [draftId, markReady, navigate]);

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
        return (
          <StepExportCanonical
            result={data.result}
            canSave={!!draftId}
            saving={markReady.isPending}
            onSave={handleSave}
            onPrev={onPrev}
            onRestart={handleRestart}
          />
        );
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

      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Passo {stepIndex + 1} de {STEPS.length}
        </p>
        {/* Autosave status — shown once a draft exists and from the content step on. */}
        {draftId && stepIndex >= CONTENT_INDEX && stepIndex <= EXPORT_INDEX && saveStatus !== "idle" && (
          <p
            className="text-xs text-muted-foreground"
            role="status"
            aria-live="polite"
          >
            {SAVE_STATUS_LABEL[saveStatus]}
          </p>
        )}
      </div>

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
