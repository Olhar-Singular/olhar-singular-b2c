import { useState, useCallback, useEffect, useRef } from "react";
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
import { StepReview } from "./steps/review/StepReview";
import { StepExportCanonical } from "./steps/export/StepExportCanonical";
import {
  INITIAL_WIZARD_DATA,
  setResult,
  setDocument,
  setPageStyle,
  clearResult,
  type WizardData,
} from "@/lib/adaptation/wizard/wizardState";
import { wizardDataToPayload } from "@/lib/adaptation/wizard/rowMapping";
import { saveDraft } from "@/lib/adaptation/persistence/adaptationsRepo";
import { readMirror, clearMirror, type MirrorEntry } from "@/lib/adaptation/persistence/draftMirror";
import { shouldOfferRestore } from "@/lib/adaptation/persistence/restoreDecision";
import { useAdaptationDraft } from "@/hooks/useAdaptationDraft";
import { useMarkReady } from "@/hooks/useAdaptations";
import { useAuth } from "@/hooks/useAuth";
import { parseDbError } from "@/lib/utils/errors";
import type { AdaptationResult, CanonicalDocument, PageStyle } from "@/lib/adaptation/canonical/schema";

const STEPS = [
  "activity_type",
  "activity_input",
  "barriers",
  "generate",
  "review",
  "export",
] as const;

type StepKey = (typeof STEPS)[number];

const STEP_LABELS: Record<StepKey, string> = {
  activity_type: "Tipo",
  activity_input: "Atividade",
  barriers: "Barreiras",
  generate: "Gerar",
  review: "Revisar",
  export: "Exportar",
};

const GENERATE_INDEX = STEPS.indexOf("generate");
const REVIEW_INDEX = STEPS.indexOf("review");
const EXPORT_INDEX = STEPS.indexOf("export");

export type EditModeSeed = {
  adaptationId: string;
  initialData: WizardData;
  initialUpdatedAt: string;
};

type Props = {
  /** When provided, the wizard opens an existing adaptation at the review step. */
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
  const [stepIndex, setStepIndex] = useState(editMode ? REVIEW_INDEX : 0);
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);
  // Crash-mirror recovery: a surviving mirror newer than the loaded row means a
  // save was lost. We hold it here and prompt the user to recover it.
  const [pendingMirror, setPendingMirror] = useState<MirrorEntry | null>(null);
  // Mirror-check runs once per draftId so we never re-prompt after a decision.
  const checkedMirrorFor = useRef<string | null>(null);

  // Draft persistence state. In edit mode we already have a row. Both the id
  // and updated_at live in REACT STATE so that, in the create flow, the values
  // set after the first generation actually re-render and propagate as props
  // into the autosave hook (a ref would never reach it).
  const [draftId, setDraftId] = useState<string | null>(
    editMode ? editMode.adaptationId : null,
  );
  const [draftUpdatedAt, setDraftUpdatedAt] = useState<string | null>(
    editMode ? editMode.initialUpdatedAt : null,
  );

  const handleConflict = useCallback(() => {
    toast.error("Esta adaptação foi alterada em outro lugar. Recarregue.");
    navigate(0);
  }, [navigate]);

  // Once a draftId is known (edit mode at mount, or a create-flow draft just
  // created), check the crash mirror. A surviving mirror that is newer than the
  // loaded server state means an autosave was lost — offer to recover it.
  useEffect(() => {
    if (!draftId || checkedMirrorFor.current === draftId) return;
    checkedMirrorFor.current = draftId;
    let cancelled = false;
    void (async () => {
      const mirror = await readMirror(draftId);
      const serverUpdatedAt = editMode ? editMode.initialUpdatedAt : null;
      if (cancelled) return;
      if (shouldOfferRestore(mirror, serverUpdatedAt)) {
        setPendingMirror(mirror);
      } else if (mirror) {
        // Stale/older mirror: clear it so it never lingers to mislead later.
        void clearMirror(draftId);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [draftId, editMode]);

  // Both handlers run only while the prompt is open, i.e. pendingMirror is set;
  // the early return is a defensive guard that never triggers in practice.
  const confirmRestore = useCallback(() => {
    /* v8 ignore next -- the prompt only renders while pendingMirror is set */
    if (!pendingMirror) return;
    setData((prev) => setResult(prev, pendingMirror.result));
    setPendingMirror(null);
  }, [pendingMirror]);

  const dismissRestore = useCallback(() => {
    /* v8 ignore next -- the mirror is keyed by draftId, always present here */
    if (!pendingMirror) return;
    void clearMirror(pendingMirror.draftId);
    setPendingMirror(null);
  }, [pendingMirror]);

  const { status: saveStatus, flush, currentUpdatedAt } = useAdaptationDraft({
    draftId,
    result: data.result,
    initialUpdatedAt: draftUpdatedAt,
    onConflict: handleConflict,
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
        setDraftUpdatedAt(row.updated_at);
      } catch (err) {
        toast.error(parseDbError(err, "Erro ao salvar o rascunho."));
      }
    },
    [draftId, user, data],
  );

  const handleDocumentChange = useCallback((document: CanonicalDocument) => {
    setData((prev) => setDocument(prev, document));
  }, []);

  const handlePageStyleChange = useCallback((pageStyle: PageStyle) => {
    setData((prev) => setPageStyle(prev, pageStyle));
  }, []);

  function handleRestart() {
    setData(INITIAL_WIZARD_DATA);
    setStepIndex(0);
    setDraftId(null);
    setDraftUpdatedAt(null);
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
    // Flush any pending autosave first so an edit made within the debounce
    // window lands in adaptation_result before the row is flipped to ready.
    // The flush returns the freshest updated_at it produced, so markReady's
    // optimistic guard uses a token that cannot be stale from this same save.
    const latestUpdatedAt = (await flush()) ?? currentUpdatedAt;
    /* v8 ignore next -- guard: a draft always has a known updated_at by now */
    if (!latestUpdatedAt) return;
    // markReady uses the latest known updated_at (advanced by every autosave) so
    // the optimistic-concurrency guard does not desync. A conflict means another
    // writer touched the row — warn + reload instead of navigating away blind.
    const res = await markReady.mutateAsync({ id: draftId, expectedUpdatedAt: latestUpdatedAt });
    if (!res.ok) {
      handleConflict();
      return;
    }
    toast.success("Adaptação salva!");
    navigate("/historico");
  }, [draftId, currentUpdatedAt, flush, markReady, navigate, handleConflict]);

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
      case "review":
        /* v8 ignore next -- guard: review step is only reachable once a result exists */
        if (!data.result) return null;
        return (
          <StepReview
            document={data.result.document}
            metadata={{
              strategiesApplied: data.result.strategies_applied,
              implementationTips: data.result.implementation_tips,
              pedagogicalJustification: data.result.pedagogical_justification,
            }}
            pageStyle={data.result.pageStyle}
            onDocumentChange={handleDocumentChange}
            onPageStyleChange={handlePageStyleChange}
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
    <div className="mx-auto max-w-6xl px-4 py-6 space-y-6">
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
        {/* Autosave status — shown once a draft exists and from the review step on. */}
        {draftId && stepIndex >= REVIEW_INDEX && stepIndex <= EXPORT_INDEX && saveStatus !== "idle" && (
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

      <AlertDialog
        open={!!pendingMirror}
        onOpenChange={(open) => {
          /* v8 ignore next -- no trigger opens this; Radix only fires open=false */
          if (!open) dismissRestore();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Recuperar alterações não salvas?</AlertDialogTitle>
            <AlertDialogDescription>
              Encontramos edições que não chegaram a ser salvas. Deseja recuperá-las? Caso contrário, elas serão descartadas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={dismissRestore}>Descartar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmRestore}>Recuperar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmRegenerate} onOpenChange={setConfirmRegenerate}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Regerar adaptação?</AlertDialogTitle>
            <AlertDialogDescription>
              A adaptação atual será substituída por uma nova. As edições serão perdidas.
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
