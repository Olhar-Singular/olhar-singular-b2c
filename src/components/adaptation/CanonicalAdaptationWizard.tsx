import { useState, useCallback, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useNavigationGuard } from "@/hooks/useNavigationGuard";
import { useAuth } from "@/hooks/useAuth";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { StepActivityType } from "./steps/activity-type/StepActivityType";
import { StepActivityInput } from "./steps/activity-input/StepActivityInput";
import { StepUploadExam } from "./steps/upload-exam/StepUploadExam";
import { StepBarrierSelection } from "./steps/barriers/StepBarrierSelection";
import { StepGenerate, type GeneratedRow } from "./steps/generate/StepGenerate";
import { StepReview } from "./steps/review/StepReview";
import { StepExportCanonical } from "./steps/export/StepExportCanonical";
import {
  INITIAL_WIZARD_DATA,
  setResult,
  setDocument,
  setPageStyle,
  setHeader,
  clearResult,
  type WizardData,
} from "@/lib/adaptation/wizard/wizardState";
import { readMirror, clearMirror, type MirrorEntry } from "@/lib/adaptation/persistence/draftMirror";
import { shouldOfferRestore } from "@/lib/adaptation/persistence/restoreDecision";
import { useAdaptationDraft } from "@/hooks/useAdaptationDraft";
import { useMarkReady } from "@/hooks/useAdaptations";
import type { AdaptationResult, CanonicalDocument, DocumentHeader, PageStyle } from "@/lib/adaptation/canonical/schema";

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
  /** The folder it was filed under — a column, so it rides beside the blob. */
  subject?: string | null;
};

type Props = {
  /** When provided, the wizard opens an existing adaptation at the review step. */
  editMode?: EditModeSeed;
};

/**
 * The autosave state, which is NOT the same thing as the "Salvar" button.
 *
 * This used to read "Salvo" — the same word as the button that marks the
 * adaptation finished. The passive one fires first and took the word, so the
 * teacher read "Salvo", concluded the work was filed, and never pressed
 * Salvar: every row in the database sat at `draft` forever. Naming the draft
 * explicitly is what keeps the two states distinguishable.
 */
const SAVE_STATUS_LABEL: Record<string, string> = {
  saving: "Salvando…",
  saved: "Rascunho salvo",
  error: "Erro ao salvar",
  conflict: "Conflito — recarregue",
};

export default function CanonicalAdaptationWizard({ editMode }: Props = {}) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const markReady = useMarkReady();
  const [isGenerating, setIsGenerating] = useState(false);
  // Upload-direto-de-prova only: true while StepUploadExam is parsing a file
  // locally (no AI, no network — pdf-utils/docx-utils only; AI extraction is
  // deferred to "Gerar", bundled with the paid adapt-activity call). Blocks
  // navigation the same way isGenerating does, but there is no credit at stake
  // here — the dialog wording differs.
  const [isUploading, setIsUploading] = useState(false);
  const [isSaved, setIsSaved] = useState(!!editMode);
  /**
   * The folder the adaptation is filed under. Lives here, not in WizardData:
   * it is a COLUMN, not part of the result blob, so it rides the explicit save
   * (with `markReady`) rather than the autosave, which only patches the blob.
   * `null` = unclassified, which is not the same as the real subject "Geral".
   */
  const [subject, setSubject] = useState<string | null>(editMode?.subject ?? null);

  const [data, setData] = useState<WizardData>(
    editMode ? editMode.initialData : INITIAL_WIZARD_DATA,
  );

  const hasUnsavedResult = !!data.result && !isSaved && !isGenerating;
  const navGuard = useNavigationGuard(isGenerating || isUploading || hasUnsavedResult);
  const [stepIndex, setStepIndex] = useState(editMode ? REVIEW_INDEX : 0);
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);
  /**
   * Set while the editor cannot convert the sheet to the canonical model, i.e.
   * while edits are NOT reaching the autosave. It overrides the save status:
   * "Salvo" over dropped keystrokes is exactly how B8 destroyed work.
   */
  const [captureFailure, setCaptureFailure] = useState<string | null>(null);
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
    let cancelled = false;
    void (async () => {
      const mirror = await readMirror(draftId);
      const serverUpdatedAt = editMode ? editMode.initialUpdatedAt : null;
      // Hand over what the server actually loaded: divergence, not recency,
      // decides whether the mirror still holds work. A failed autosave followed
      // by a successful "Salvar" leaves the row NEWER than the mirror and still
      // missing the edit — judged on timestamps alone, we would delete the only
      // copy of it.
      const serverResult = editMode ? editMode.initialData.result : null;
      // A cancelled run must leave NO trace: the effect that superseded it will
      // redo the check. This is why the latch is set here and not up front —
      // the app runs in <StrictMode>, which mounts effects twice, so latching
      // before the read meant run 1 was cancelled by the cleanup and run 2
      // short-circuited on the latch. The recovery prompt never appeared in the
      // real browser at all, however much work the mirror was holding.
      if (cancelled) return;
      checkedMirrorFor.current = draftId;
      if (shouldOfferRestore(mirror, serverUpdatedAt, serverResult)) {
        setPendingMirror(mirror);
      } else if (mirror) {
        // Nothing to recover (the row already holds it): clear the leftover so
        // it never lingers to mislead a later open.
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

  const { status: saveStatus, flush, currentUpdatedAt, syncUpdatedAt } = useAdaptationDraft({
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

  // A7: the row is created by the EDGE FUNCTION, before it settles the charge —
  // so by the time a document reaches us it is already durable and we only
  // adopt its identity. The wizard used to do the INSERT here, which meant
  // every millisecond between the 200 and that write was a window where the
  // user had paid for something that existed nowhere but in memory.
  //
  // Adoption is unconditional, including on regenerate: a regeneration is a new
  // paid request and therefore a new row. Staying bound to the previous one
  // would autosave the new document over the old adaptation, against a token
  // that no longer describes it.
  const handleResult = useCallback((result: AdaptationResult, row: GeneratedRow) => {
    // Reset isGenerating immediately when a result arrives. The real StepGenerate
    // calls onLoadingChange(false) via useEffect, but that effect may not fire when
    // the component is unmounted in the same React 18 batch as onNext(). Resetting
    // here ensures the navigation guard switches to "unsaved" mode, not "generating".
    setIsGenerating(false);
    setData((prev) => setResult(prev, result));
    setDraftId(row.id);
    setDraftUpdatedAt(row.updatedAt);
  }, []);

  // Every edit re-arms "unsaved". `isSaved` only ever went true before, so
  // after the first save the wizard could no longer tell that the teacher had
  // kept editing: the exit guard stopped warning, and there was no signal that
  // the filed version had fallen behind the sheet on screen.
  const handleDocumentChange = useCallback((document: CanonicalDocument) => {
    setIsSaved(false);
    setData((prev) => setDocument(prev, document));
  }, []);

  const handleHeaderChange = useCallback((header: DocumentHeader) => {
    setIsSaved(false);
    setData((prev) => setHeader(prev, header));
  }, []);

  const handleTitleChange = useCallback((title: string) => {
    setIsSaved(false);
    setData((prev) => setHeader(prev, { ...prev.result?.header, title }));
  }, []);

  const handlePageStyleChange = useCallback((pageStyle: PageStyle) => {
    setIsSaved(false);
    setData((prev) => setPageStyle(prev, pageStyle));
  }, []);

  function handleRestart() {
    setData(INITIAL_WIZARD_DATA);
    setStepIndex(0);
    setDraftId(null);
    setDraftUpdatedAt(null);
    setIsSaved(false);
    // Everything below belonged to the adaptation being left behind. The
    // optimistic token is reset inside the autosave hook (it rebinds whenever
    // the draft id changes); what has to be dropped HERE is the leftover UI
    // state, so a restore prompt for the old draft cannot land on the new one
    // and the next draft gets its own mirror check.
    setPendingMirror(null);
    checkedMirrorFor.current = null;
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
    const flushed = await flush();
    // A FAILED flush must stop the save dead. Marking the row ready anyway used
    // to report "Salvo" over edits that never left the browser — and worse, the
    // server-side updated_at bump then made the surviving crash mirror look
    // stale, so the next open threw away the only copy of them.
    if (flushed.status === "failed") {
      // A conflict has already been surfaced (toast + reload) by the hook's
      // onConflict; only the plain failure still needs telling.
      if (flushed.reason === "error") {
        toast.error(
          "Não foi possível salvar suas últimas alterações. Verifique a conexão e tente de novo.",
        );
      }
      return;
    }
    // The flush hands back the freshest updated_at it produced, so markReady's
    // optimistic guard uses a token that cannot be stale from this same save.
    const latestUpdatedAt = flushed.updatedAt ?? currentUpdatedAt;
    /* v8 ignore next -- guard: a draft always has a known updated_at by now */
    if (!latestUpdatedAt) return;
    // markReady uses the latest known updated_at (advanced by every autosave) so
    // the optimistic-concurrency guard does not desync. A conflict means another
    // writer touched the row — warn + reload instead of navigating away blind.
    const res = await markReady.mutateAsync({
      id: draftId,
      expectedUpdatedAt: latestUpdatedAt,
      subject,
    });
    if (!res.ok) {
      handleConflict();
      return;
    }
    // markReady wrote to the row, so the trigger stamped a NEW updated_at. Feed
    // it back to the autosave token or the next keystroke saves against a value
    // the server has already moved past — a conflict, a navigate(0), and the
    // edit that triggered it gone.
    syncUpdatedAt(res.updatedAt);
    toast.success("Adaptação salva!");
    setIsSaved(true);
    // `subject` belongs here: without it the callback keeps the folder chosen
    // at the time it was last rebuilt, so picking a subject and pressing
    // Salvar would file the adaptation under the PREVIOUS one — or under
    // nothing at all, on the first pick.
  }, [draftId, currentUpdatedAt, flush, markReady, handleConflict, syncUpdatedAt, subject]);

  const renderStep = () => {
    switch (currentKey) {
      case "activity_type":
        return (
          <StepActivityType
            onSelect={(type) => {
              // Resets to "bank": re-picking a type after having toggled into the
              // upload path (then navigating back) should not strand the Atividade
              // step showing the upload view for a possibly different type.
              updateData({ activityType: type, activityInputMode: "bank" });
              onNext();
            }}
          />
        );
      case "activity_input":
        return data.activityInputMode === "upload" ? (
          <StepUploadExam
            data={data}
            updateData={updateData}
            onNext={onNext}
            onPrev={onPrev}
            onLoadingChange={setIsUploading}
          />
        ) : (
          <StepActivityInput data={data} updateData={updateData} onNext={onNext} onPrev={onPrev} />
        );
      case "barriers":
        return <StepBarrierSelection data={data} updateData={updateData} onNext={onNext} onPrev={onPrev} />;
      case "generate":
        return (
          <StepGenerate
            data={data}
            onResult={handleResult}
            onNext={onNext}
            onPrev={onPrev}
            onLoadingChange={setIsGenerating}
          />
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
            onCaptureFailure={setCaptureFailure}
            title={data.result.header?.title ?? ""}
            onTitleChange={handleTitleChange}
            subject={subject}
            onSubjectChange={(s) => {
              setIsSaved(false);
              setSubject(s);
            }}
            canSave={!!draftId}
            saving={markReady.isPending}
            onSave={handleSave}
            originalExam={
              data.uploadedExam
                ? { file: data.uploadedExam.file, pageImages: data.uploadedExam.pageImages, userId: user?.id ?? null }
                : null
            }
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
            onHeaderChange={handleHeaderChange}
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
        {captureFailure !== null ? (
          <p
            className="text-xs font-medium text-destructive"
            role="status"
            aria-live="polite"
            data-testid="capture-failure"
            title={captureFailure}
          >
            Alterações não estão sendo salvas — desfaça a última edição
          </p>
        ) : (
          draftId &&
          stepIndex >= REVIEW_INDEX &&
          stepIndex <= EXPORT_INDEX &&
          saveStatus !== "idle" && (
            <p
              className="text-xs text-muted-foreground"
              role="status"
              aria-live="polite"
            >
              {SAVE_STATUS_LABEL[saveStatus]}
            </p>
          )
        )}
      </div>

      <div className="min-h-[400px]">{renderStep()}</div>

      {navGuard.state === "blocked" && isUploading && (
        <Dialog open onOpenChange={() => navGuard.reset?.()}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>O arquivo ainda está sendo processado</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              A IA ainda está lendo e extraindo a atividade enviada. Se sair agora, o processamento será perdido e
              você vai precisar enviar o arquivo de novo — nenhum crédito foi usado nessa etapa.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => navGuard.reset?.()}>Continuar aqui</Button>
              <Button variant="destructive" onClick={() => navGuard.proceed?.()}>Sair mesmo assim</Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {navGuard.state === "blocked" && isGenerating && !isUploading && (
        <Dialog open onOpenChange={() => navGuard.reset?.()}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>A adaptação ainda está em andamento</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              A ISA ainda está gerando a adaptação. Se sair agora, o resultado será perdido e os créditos não serão devolvidos.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => navGuard.reset?.()}>Continuar aqui</Button>
              <Button variant="destructive" onClick={() => navGuard.proceed?.()}>Sair mesmo assim</Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {navGuard.state === "blocked" && !isGenerating && !isUploading && (
        <Dialog open onOpenChange={() => navGuard.reset?.()}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Sair sem salvar?</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              Você tem uma adaptação não salva. O rascunho ficará disponível em Adaptações.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => navGuard.reset?.()}>Voltar e salvar</Button>
              <Button variant="destructive" onClick={() => navGuard.proceed?.()}>Sair assim mesmo</Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

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
