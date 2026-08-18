import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
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
import { Loader2, Coins } from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { parseEdgeFnError } from "@/lib/utils/errors";
import { useAuth } from "@/hooks/useAuth";
import { extractExamQuestions } from "../upload-exam/extractExamQuestions";
import { buildActivityTextFromExtraction, type ExamExtractedQuestion } from "../upload-exam/buildActivityTextFromExtraction";
import type { AdaptationResult } from "@/lib/adaptation/canonical/schema";
import type { WizardData } from "@/lib/adaptation/wizard/wizardState";

export const MAX_QUESTIONS = 12;

const MESSAGE_INTERVAL_MS = 2800;

const EXTRACTING_MESSAGES = [
  "Lendo o arquivo enviado...",
  "Identificando as questões da prova...",
  "Reconhecendo imagens e figuras...",
];

const ADAPTING_MESSAGES = [
  "ISA está adaptando a atividade...",
  "Aplicando os princípios do Desenho Universal para a Aprendizagem (DUA)...",
  "Ajustando a atividade para as barreiras selecionadas...",
  "Organizando o texto e os textos de apoio...",
  "Revisando a adaptação gerada...",
];

/** The `adaptations` row the SERVER created for this generation (A7). */
export type GeneratedRow = {
  id: string;
  /** Seeds the autosave optimistic-concurrency token — no extra round-trip. */
  updatedAt: string;
};

type Props = {
  data: WizardData;
  onResult: (result: AdaptationResult, row: GeneratedRow) => void;
  onNext: () => void;
  onPrev: () => void;
  onLoadingChange?: (loading: boolean) => void;
};

export function StepGenerate({ data, onResult, onNext, onPrev, onLoadingChange }: Props) {
  const { user, refreshProfile } = useAuth();
  const [loading, setLoading] = useState(!data.result);
  const [phase, setPhase] = useState<"extracting" | "adapting">(data.uploadedExam ? "extracting" : "adapting");
  const [creditError, setCreditError] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  // Upload path only: extraction found more than MAX_QUESTIONS. Generation is
  // paused here — proceeding to the paid adapt-activity call needs an explicit
  // user decision, same as the pre-upload-refactor flow did at the Atividade step.
  const [pendingExtracted, setPendingExtracted] = useState<ExamExtractedQuestion[] | null>(null);
  const [totalExtracted, setTotalExtracted] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const startedRef = useRef(false);
  const [messageIndex, setMessageIndex] = useState(0);

  // Rotates the loading copy so a long wait (real generations run for minutes)
  // doesn't sit on one static line — resets to the first message whenever a
  // fresh wait starts (phase change, or a retry re-entering the same phase).
  useEffect(() => {
    setMessageIndex(0);
    if (!loading) return;
    const messages = phase === "extracting" ? EXTRACTING_MESSAGES : ADAPTING_MESSAGES;
    const id = setInterval(() => {
      setMessageIndex((i) => (i + 1) % messages.length);
    }, MESSAGE_INTERVAL_MS);
    return () => clearInterval(id);
  }, [phase, loading]);

  const adaptActivity = useCallback(async (activityText: string, controller: AbortController) => {
    const activeBarriers = data.barriers
      .filter((b) => b.is_active)
      .map((b) => ({ dimension: b.dimension, barrier_key: b.barrier_key, notes: b.notes }));

    const { data: fnResult, error: fnError } = await supabase.functions.invoke("adapt-activity", {
      body: {
        original_activity: activityText,
        activity_type: data.activityType,
        barriers: activeBarriers,
        observation_notes: data.observationNotes || undefined,
        // The server writes the adaptation row itself now, so it needs the
        // profile link the row carries.
        barrier_profile_id: data.barrierProfileId ?? undefined,
        // Idempotency key for the credit reservation: it makes a replayed
        // request (retried transport, double-click) impossible to charge
        // twice. Fresh per attempt — a real retry IS a new charge.
        request_id: crypto.randomUUID(),
      },
      signal: controller.signal,
    });

    /* v8 ignore next -- AbortController race */
    if (controller.signal.aborted) return;

    if (fnError) {
      const context = (fnError as { context?: Response }).context;
      if (context?.status === 402) {
        setCreditError("Créditos insuficientes. Adquira mais créditos para continuar.");
        return;
      }
      let errMsg = "Falha na adaptação";
      try {
        const body = await context?.json();
        if (body?.error) errMsg = body.error;
      } catch {
        // corpo já consumido ou não-JSON — mantém o fallback
      }
      throw new Error(errMsg);
    }

    // A7: the document is only worth showing if the server already stored it.
    // Accepting a response without a row id would put us back to editing a
    // document with nowhere to autosave — the exact loss this flow fixes.
    const adaptationId = fnResult?.adaptation_id as string | undefined;
    const adaptationUpdatedAt = fnResult?.adaptation_updated_at as string | undefined;
    if (!adaptationId || !adaptationUpdatedAt) {
      throw new Error("A adaptação não foi salva no servidor. Tente novamente.");
    }

    onResult(fnResult.adaptation as AdaptationResult, {
      id: adaptationId,
      updatedAt: adaptationUpdatedAt,
    });
    refreshProfile().catch(() => {});
    onNext();
  }, [data, onResult, onNext, refreshProfile]);

  const proceedToAdapt = useCallback(async (activityText: string, controller: AbortController) => {
    setPhase("adapting");
    setLoading(true);
    onLoadingChange?.(true);
    try {
      await adaptActivity(activityText, controller);
    } catch (e) {
      /* v8 ignore next -- AbortController race */
      if ((e as Error).name === "AbortError" || controller.signal.aborted) return;
      console.error("Erro ao gerar adaptação:", e);
      setFailed(true);
      toast.error(parseEdgeFnError(e, "Erro ao gerar adaptação."));
    } finally {
      /* v8 ignore next -- AbortController race */
      if (!controller.signal.aborted) {
        setLoading(false);
        onLoadingChange?.(false);
      }
    }
  }, [adaptActivity, onLoadingChange]);

  const generate = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setCreditError(null);
    setFailed(false);
    setPendingExtracted(null);

    if (!data.uploadedExam) {
      await proceedToAdapt(data.activityText, controller);
      return;
    }

    setPhase("extracting");
    setLoading(true);
    onLoadingChange?.(true);
    let extracted: ExamExtractedQuestion[];
    try {
      /* v8 ignore next -- user is always set: this step only renders inside the authenticated wizard */
      const userId = user?.id ?? "";
      const result = await extractExamQuestions(data.uploadedExam, userId, controller.signal);
      /* v8 ignore next -- AbortController race */
      if (controller.signal.aborted) return;
      if (result.status === "empty") {
        throw new Error("Não foi possível identificar questões no arquivo enviado. Volte e tente outro arquivo.");
      }
      extracted = result.questions;
    } catch (e) {
      /* v8 ignore next -- AbortController race */
      if ((e as Error).name === "AbortError" || controller.signal.aborted) return;
      console.error("Erro ao gerar adaptação:", e);
      setFailed(true);
      toast.error(parseEdgeFnError(e, "Erro ao gerar adaptação."));
      setLoading(false);
      onLoadingChange?.(false);
      return;
    }

    if (extracted.length > MAX_QUESTIONS) {
      setTotalExtracted(extracted.length);
      setPendingExtracted(extracted);
      setLoading(false);
      onLoadingChange?.(false);
      return;
    }

    await proceedToAdapt(buildActivityTextFromExtraction(extracted), controller);
  }, [data, user, proceedToAdapt, onLoadingChange]);

  function confirmTruncate() {
    /* v8 ignore next -- guard: the dialog only renders while pendingExtracted is set */
    if (!pendingExtracted) return;
    const truncated = pendingExtracted.slice(0, MAX_QUESTIONS);
    setPendingExtracted(null);
    /* v8 ignore next -- guard: generate() always sets abortRef before pendingExtracted can be set */
    const controller = abortRef.current ?? new AbortController();
    void proceedToAdapt(buildActivityTextFromExtraction(truncated), controller);
  }

  /** Bails out to the Atividade step — the file stays attached, so the user can re-attach or swap it. */
  function cancelTruncate() {
    setPendingExtracted(null);
    onPrev();
  }

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    if (!data.result) generate();
  }, [data.result, generate]);

  if (pendingExtracted) {
    return (
      <>
        <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
          <p className="text-muted-foreground">Aguardando confirmação...</p>
        </div>
        <AlertDialog
          open
          onOpenChange={(open) => {
            /* v8 ignore next -- no trigger opens this; Radix only fires open=false */
            if (!open) cancelTruncate();
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Atividade com muitas questões</AlertDialogTitle>
              <AlertDialogDescription>
                Sua atividade tem {totalExtracted} questões — o limite para essa adaptação é {MAX_QUESTIONS}. Apenas
                as {MAX_QUESTIONS} primeiras serão adaptadas. Continuar?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={cancelTruncate}>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={confirmTruncate}>Continuar</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );
  }

  if (loading) {
    const messages = phase === "extracting" ? EXTRACTING_MESSAGES : ADAPTING_MESSAGES;
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
        <p className="text-lg font-medium text-foreground text-center max-w-md">
          {messages[messageIndex % messages.length]}
        </p>
        <p className="text-xs text-muted-foreground">Isso pode levar alguns minutos</p>
      </div>
    );
  }

  if (creditError) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
        <Coins className="w-10 h-10 text-muted-foreground" />
        <p className="text-destructive font-medium">{creditError}</p>
        <div className="flex gap-2">
          <Button asChild>
            <Link to="/creditos">Comprar créditos</Link>
          </Button>
          <Button variant="outline" onClick={onPrev}>Voltar</Button>
        </div>
      </div>
    );
  }

  if (failed) {
    return (
      <div className="text-center py-20 space-y-4">
        <p className="text-muted-foreground">Não foi possível gerar a adaptação.</p>
        <Button onClick={generate}>Tentar novamente</Button>
        <Button variant="outline" onClick={onPrev} className="ml-2">Voltar</Button>
      </div>
    );
  }

  // Result already present (e.g. navigated back into this step).
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
      <p className="text-muted-foreground">Adaptação pronta.</p>
      <div className="flex gap-2">
        <Button variant="outline" onClick={onPrev}>Voltar</Button>
        <Button onClick={onNext}>Continuar</Button>
      </div>
    </div>
  );
}

export default StepGenerate;
