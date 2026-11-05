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
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { isNetworkError, parseEdgeFnError } from "@/lib/utils/errors";
import { useAuth } from "@/hooks/useAuth";
import { insufficientCreditsMessage } from "@/lib/domain/access";
import { calcAdaptationCost } from "@/lib/domain/barriers";
import { EXTRACTION_COST } from "@/lib/domain/extractionCost";
import { parseExtractionIssues, type ExtractionIssue } from "@/lib/domain/examIssues";
import { extractExamQuestions } from "../upload-exam/extractExamQuestions";
import {
  buildActivityTextFromExtraction,
  type ExamExtractedHeader,
  type ExamExtractedQuestion,
} from "../upload-exam/buildActivityTextFromExtraction";
import type { AdaptationResult } from "@/lib/adaptation/canonical/schema";
import { activeUploadedExam, type WizardData } from "@/lib/adaptation/wizard/wizardState";

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
  /** What the server's check of the adaptation found (C-04). Informs only; empty when none. */
  reviewIssues?: ExtractionIssue[];
};

type Props = {
  data: WizardData;
  onResult: (result: AdaptationResult, row: GeneratedRow) => void;
  onNext: () => void;
  onPrev: () => void;
  onLoadingChange?: (loading: boolean) => void;
  /**
   * Volta para a adaptação que existia ANTES deste "Regerar" (0326).
   *
   * Só chega definida quando o wizard tem uma adaptação guardada, ou seja, numa
   * regeração. Sem ela, uma geração que falha deixava o professor numa tela de
   * erro com os passos Revisar/Exportar desabilitados, embora o documento
   * anterior continuasse intacto no servidor: só um reload devolvia o Passo 5.
   */
  onRestorePrevious?: () => void;
  /**
   * The check of the AI extraction against the file's text (C-03). Reported as soon as
   * the extraction returns, for Revisar to show; the generation does not wait for it.
   */
  onExtractionIssues?: (issues: ExtractionIssue[]) => void;
};

export function StepGenerate({
  data,
  onResult,
  onNext,
  onPrev,
  onLoadingChange,
  onRestorePrevious,
  onExtractionIssues,
}: Props) {
  const { user, refreshProfile } = useAuth();
  const queryClient = useQueryClient();
  // The file to read at this step, per the mode the teacher is in (null on the
  // paste/bank path even if a file was left attached).
  const uploadedExam = activeUploadedExam(data);
  const [loading, setLoading] = useState(!data.result);
  const [phase, setPhase] = useState<"extracting" | "adapting">(uploadedExam ? "extracting" : "adapting");
  const [creditError, setCreditError] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  /**
   * Motivo já parseado da falha (0328). O toast some sozinho; a tela de falha é
   * permanente, então é ela que precisa carregar o porquê — para o professor e
   * para ele repassar ao suporte.
   */
  const [failReason, setFailReason] = useState<string | null>(null);
  // Upload path only: extraction found more than MAX_QUESTIONS. Generation is
  // paused here — proceeding to the paid adapt-activity call needs an explicit
  // user decision, same as the pre-upload-refactor flow did at the Atividade step.
  const [pendingExtracted, setPendingExtracted] = useState<ExamExtractedQuestion[] | null>(null);
  // The exam's title/general instruction, kept across the >12-question detour (0473).
  const pendingHeaderRef = useRef<ExamExtractedHeader | undefined>(undefined);
  const [totalExtracted, setTotalExtracted] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const startedRef = useRef(false);
  const [messageIndex, setMessageIndex] = useState(0);
  /**
   * Ação principal de cada tela de erro (0471). "Tentar novamente" desmonta a si
   * mesmo ao trocar para a espera, e o efeito de foco do wizard só roda quando o
   * passo muda: sem pousar o foco aqui, ele cai no <body> e o próximo Tab
   * recomeça no topo da página.
   */
  const retryRef = useRef<HTMLButtonElement>(null);
  const subscribeRef = useRef<HTMLAnchorElement>(null);

  // The error state is set before `loading` drops, so wait for the error screen
  // to actually be on the page before moving focus into it.
  useEffect(() => {
    if (loading) return;
    if (creditError) subscribeRef.current?.focus();
    else if (failed) retryRef.current?.focus();
  }, [creditError, failed, loading]);

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

  // Both the extraction and the adaptation are charged: the balance in the
  // header and the statement in Créditos must move right after each one.
  const refreshCredits = useCallback(() => {
    refreshProfile().catch(() => {});
    queryClient.invalidateQueries({ queryKey: ["credit_transactions"] });
  }, [refreshProfile, queryClient]);

  const adaptActivity = useCallback(async (
    activityText: string,
    controller: AbortController,
    expectedQuestionCount: number,
  ) => {
    const activeBarriers = data.barriers
      .filter((b) => b.is_active)
      // `label` is the human name the teacher actually picked ("Dificuldade na
      // leitura e interpretação de enunciados"); without it the prompt only
      // shows the snake_case key. It also lands in the persisted
      // `barriers_used`, which until now stored keys alone.
      .map((b) => ({
        dimension: b.dimension,
        barrier_key: b.barrier_key,
        label: b.label,
        notes: b.notes,
      }));

    const { data: fnResult, error: fnError } = await supabase.functions.invoke("adapt-activity", {
      body: {
        original_activity: activityText,
        activity_type: data.activityType,
        barriers: activeBarriers,
        observation_notes: data.observationNotes || undefined,
        // The server writes the adaptation row itself now, so it needs the
        // profile link the row carries.
        barrier_profile_id: data.barrierProfileId ?? undefined,
        // The activity text was extracted from a real exam the teacher
        // uploaded, so question and image order must survive the adaptation.
        // Turns on the MODO FIEL block of the system prompt — which is what
        // the upload screen already promises ("preservando a ordem das
        // questões e as imagens originais").
        fidelity_mode: !!uploadedExam,
        // How many questions actually went in, so the server can tell a
        // complete adaptation from one that quietly came back short. Zero
        // means "not knowable" (free-typed activity) and is not inspected.
        expected_question_count: expectedQuestionCount,
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
      // The request never reached the server: keep the original error so
      // parseEdgeFnError can say it is the connection, not the adaptation.
      if (isNetworkError(fnError)) throw fnError;
      const context = (fnError as { context?: Response }).context;
      if (context?.status === 402) {
        // The server just said the balance does not cover the cost: the cached
        // balance (sidebar, banner) may be stale, so re-read it.
        refreshCredits();
        // The 402 carries the balance and the cost: say them (0470).
        let balance: number | null = null;
        let required: number | null = null;
        try {
          const body = await context.json();
          if (typeof body?.balance === "number") balance = body.balance;
          if (typeof body?.required === "number") required = body.required;
        } catch {
          // corpo já consumido ou não-JSON: mensagem genérica
        }
        setCreditError(insufficientCreditsMessage(balance, required));
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
      reviewIssues: parseExtractionIssues(fnResult.review_issues),
    });
    refreshCredits();
    onNext();
  }, [data, uploadedExam, onResult, onNext, refreshCredits]);

  const proceedToAdapt = useCallback(async (
    activityText: string,
    controller: AbortController,
    expectedQuestionCount: number,
  ) => {
    setPhase("adapting");
    setLoading(true);
    onLoadingChange?.(true);
    try {
      await adaptActivity(activityText, controller, expectedQuestionCount);
    } catch (e) {
      /* v8 ignore next -- AbortController race */
      if ((e as Error).name === "AbortError" || controller.signal.aborted) return;
      console.error("Erro ao gerar adaptação:", e);
      // A failure may still have charged the reservation (worker died after
      // opening it), so the balance shown must be re-read.
      refreshCredits();
      const reason = parseEdgeFnError(e, "Erro ao gerar adaptação.");
      setFailed(true);
      setFailReason(reason);
    } finally {
      /* v8 ignore next -- AbortController race */
      if (!controller.signal.aborted) {
        setLoading(false);
        onLoadingChange?.(false);
      }
    }
  }, [adaptActivity, onLoadingChange, refreshCredits]);

  const generate = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setCreditError(null);
    setFailed(false);
    setFailReason(null);
    setPendingExtracted(null);

    if (!uploadedExam) {
      // Questions picked from the bank are countable; free-typed text is not,
      // and 0 tells the server to skip that check rather than guess.
      await proceedToAdapt(data.activityText, controller, data.selectedQuestions.length);
      return;
    }

    setPhase("extracting");
    setLoading(true);
    onLoadingChange?.(true);
    let extracted: ExamExtractedQuestion[];
    let header: ExamExtractedHeader | undefined;
    try {
      /* v8 ignore next -- user is always set: this step only renders inside the authenticated wizard */
      const userId = user?.id ?? "";
      const result = await extractExamQuestions(uploadedExam, userId, controller.signal);
      /* v8 ignore next -- AbortController race */
      if (controller.signal.aborted) return;
      if (result.status === "insufficient_credits") {
        // Refused before anything was charged: same screen as the adaptation's 402.
        // The cost that matters is the whole one (reading + adaptation), the
        // same total Passo 3 showed.
        const dimensions = [...new Set(data.barriers.filter((b) => b.is_active).map((b) => b.dimension).filter(Boolean))];
        setCreditError(insufficientCreditsMessage(result.balance, calcAdaptationCost(dimensions) + EXTRACTION_COST));
        setLoading(false);
        onLoadingChange?.(false);
        return;
      }
      // An empty extraction was charged too; a reused one charged nothing new.
      if (result.status === "empty" || result.charged) refreshCredits();
      if (result.status === "empty") {
        throw new Error("Não foi possível identificar questões no arquivo enviado. Volte e tente outro arquivo.");
      }
      extracted = result.questions;
      header = result.header;
      onExtractionIssues?.(result.issues ?? []);
    } catch (e) {
      /* v8 ignore next -- AbortController race */
      if ((e as Error).name === "AbortError" || controller.signal.aborted) return;
      console.error("Erro ao gerar adaptação:", e);
      const reason = parseEdgeFnError(e, "Erro ao gerar adaptação.");
      setFailed(true);
      setFailReason(reason);
      setLoading(false);
      onLoadingChange?.(false);
      return;
    }

    if (extracted.length > MAX_QUESTIONS) {
      setTotalExtracted(extracted.length);
      pendingHeaderRef.current = header;
      setPendingExtracted(extracted);
      setLoading(false);
      onLoadingChange?.(false);
      return;
    }

    await proceedToAdapt(buildActivityTextFromExtraction(extracted, header), controller, extracted.length);
  }, [data, uploadedExam, user, proceedToAdapt, onLoadingChange, onExtractionIssues, refreshCredits]);

  function confirmTruncate() {
    /* v8 ignore next -- guard: the dialog only renders while pendingExtracted is set */
    if (!pendingExtracted) return;
    const truncated = pendingExtracted.slice(0, MAX_QUESTIONS);
    setPendingExtracted(null);
    /* v8 ignore next -- guard: generate() always sets abortRef before pendingExtracted can be set */
    const controller = abortRef.current ?? new AbortController();
    void proceedToAdapt(buildActivityTextFromExtraction(truncated, pendingHeaderRef.current), controller, truncated.length);
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
                Sua atividade tem {totalExtracted} questões, e o limite para essa adaptação é {MAX_QUESTIONS}. Apenas
                as {MAX_QUESTIONS} primeiras serão adaptadas. Continuar?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="flex-col">
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
    /**
     * Anúncio ESTÁVEL da espera (0362). A copy visível roda a cada 2,8 s; se ela
     * vivesse na região viva, o leitor de tela recitaria uma frase nova o tempo todo
     * durante uma geração de minutos. A região viva diz uma vez o que começou, e o
     * texto rotativo fica explicitamente fora dela.
     */
    const announcement =
      phase === "extracting"
        ? "Lendo a atividade enviada. Isso pode levar alguns minutos."
        : "Gerando a adaptação. Isso pode levar alguns minutos.";
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4" aria-busy="true">
        <Loader2 aria-hidden="true" className="w-10 h-10 animate-spin text-primary" />
        <p role="status" className="sr-only">
          {announcement}
        </p>
        <p aria-live="off" className="text-lg font-medium text-foreground text-center max-w-md">
          {messages[messageIndex % messages.length]}
        </p>
        <p aria-live="off" className="text-xs text-muted-foreground">
          Isso pode levar alguns minutos
        </p>
      </div>
    );
  }

  if (creditError) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
        <Coins className="w-10 h-10 text-muted-foreground" />
        <p role="alert" className="text-destructive font-medium">{creditError}</p>
        <div className="flex gap-2">
          <Button asChild>
            <Link ref={subscribeRef} to="/assinar">Assinar</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/creditos">Comprar créditos extras</Link>
          </Button>
          {onRestorePrevious && (
            <Button variant="outline" onClick={onRestorePrevious}>Voltar para a adaptação atual</Button>
          )}
          <Button variant="outline" onClick={onPrev}>Voltar</Button>
        </div>
      </div>
    );
  }

  if (failed) {
    return (
      <div className="text-center py-20 space-y-4">
        <div role="alert" className="space-y-1">
          <p className="text-destructive font-medium">Não foi possível gerar a adaptação.</p>
          <p className="text-sm text-destructive">{failReason}</p>
        </div>
        <Button ref={retryRef} onClick={generate}>Tentar novamente</Button>
        {onRestorePrevious && (
          <Button variant="outline" onClick={onRestorePrevious} className="ml-2">
            Voltar para a adaptação atual
          </Button>
        )}
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
