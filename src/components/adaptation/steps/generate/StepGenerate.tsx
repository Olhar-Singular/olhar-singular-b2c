import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Coins } from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { parseEdgeFnError } from "@/lib/utils/errors";
import { useAuth } from "@/hooks/useAuth";
import type { AdaptationResult } from "@/lib/adaptation/canonical/schema";
import type { WizardData } from "@/lib/adaptation/wizard/wizardState";

type Props = {
  data: WizardData;
  onResult: (result: AdaptationResult) => void;
  onNext: () => void;
  onPrev: () => void;
  onLoadingChange?: (loading: boolean) => void;
};

export function StepGenerate({ data, onResult, onNext, onPrev, onLoadingChange }: Props) {
  const { refreshProfile } = useAuth();
  const [loading, setLoading] = useState(!data.result);
  const [creditError, setCreditError] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const startedRef = useRef(false);

  const generate = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    onLoadingChange?.(true);
    setCreditError(null);
    setFailed(false);

    try {
      const activeBarriers = data.barriers
        .filter((b) => b.is_active)
        .map((b) => ({ dimension: b.dimension, barrier_key: b.barrier_key, notes: b.notes }));

      const { data: fnResult, error: fnError } = await supabase.functions.invoke("adapt-activity", {
        body: {
          original_activity: data.activityText,
          activity_type: data.activityType,
          barriers: activeBarriers,
          observation_notes: data.observationNotes || undefined,
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

      onResult(fnResult.adaptation as AdaptationResult);
      refreshProfile().catch(() => {});
      onNext();
    } catch (e) {
      /* v8 ignore next -- AbortController race */
      if ((e as Error).name === "AbortError" || controller.signal.aborted) return;
      setFailed(true);
      toast.error(parseEdgeFnError(e, "Erro ao gerar adaptação."));
    } finally {
      /* v8 ignore next -- AbortController race: aborted branch only reachable via Regerar timing */
      if (!controller.signal.aborted) {
        setLoading(false);
        onLoadingChange?.(false);
      }
    }
  }, [data, onResult, onNext, refreshProfile, onLoadingChange]);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    if (!data.result) generate();
  }, [data.result, generate]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
        <p className="text-muted-foreground">ISA está adaptando a atividade...</p>
        <p className="text-xs text-muted-foreground">Isso pode levar alguns segundos</p>
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
