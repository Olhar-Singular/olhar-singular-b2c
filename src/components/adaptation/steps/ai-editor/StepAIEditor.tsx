import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, FileEdit, Loader2, RefreshCw, Coins } from "lucide-react";
import ActivityEditor from "@/components/editor/ActivityEditor";
import { structuredToMarkdownDsl } from "@/lib/activityDslConverter";
import { useActivityContent } from "@/hooks/useActivityContent";
import { isStructuredActivity } from "@/types/adaptation";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { buildAIEditorAdvancePatch, resetGeneratedState } from "@/lib/adaptationWizardHelpers";
import type { WizardData, AdaptationResult } from "@/lib/adaptationWizardHelpers";
import { Link } from "react-router-dom";

type Props = {
  data: WizardData;
  updateData: (partial: Partial<WizardData>) => void;
  onNext: () => void;
  onPrev: () => void;
};

function toInitialDsl(result: AdaptationResult | null, version: "universal" | "directed"): string {
  if (!result) return "";
  const v = version === "universal" ? result.version_universal : result.version_directed;
  if (!v) return "";
  if (isStructuredActivity(v)) return structuredToMarkdownDsl(v);
  return String(v);
}

export default function StepAIEditor({ data, updateData, onNext, onPrev }: Props) {
  const [loading, setLoading] = useState(!data.result);
  const [activeTab, setActiveTab] = useState<"universal" | "directed">("universal");
  const [creditError, setCreditError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fallbackUniversal = useMemo(() => toInitialDsl(data.result, "universal"), []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fallbackDirected = useMemo(() => toInitialDsl(data.result, "directed"), []);

  const universalContent = useActivityContent({
    initialDsl: data.editorContentUniversal?.dsl ?? fallbackUniversal,
    initialRegistry: data.editorContentUniversal?.registry ?? {},
    onChange: (c) => updateData({ editorContentUniversal: { dsl: c.dsl, registry: c.registry } }),
  });
  const directedContent = useActivityContent({
    initialDsl: data.editorContentDirected?.dsl ?? fallbackDirected,
    initialRegistry: data.editorContentDirected?.registry ?? {},
    onChange: (c) => updateData({ editorContentDirected: { dsl: c.dsl, registry: c.registry } }),
  });

  const resultRef = useRef(data.result);
  useEffect(() => {
    if (data.result && data.result !== resultRef.current) {
      resultRef.current = data.result;
      universalContent.reset({ dsl: toInitialDsl(data.result, "universal"), registry: {} });
      directedContent.reset({ dsl: toInitialDsl(data.result, "directed"), registry: {} });
    }
  }, [data.result, universalContent, directedContent]);

  const generate = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setCreditError(null);

    try {
      const session = await supabase.auth.getSession();
      const accessToken = session.data.session?.access_token;

      // Credit check before calling adapt-activity
      const creditResp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/check-and-deduct-credits`,
        {
          method: "POST",
          signal: controller.signal,
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ amount: 1, type: "adapt" }),
        }
      );

      if (!creditResp.ok) {
        const err = await creditResp.json().catch(() => ({}));
        if (creditResp.status === 402) {
          setCreditError("Créditos insuficientes. Adquira mais créditos para continuar.");
          return;
        }
        throw new Error(err.error || `Erro ${creditResp.status}`);
      }

      const activeBarriers = data.barriers
        .filter((b) => b.is_active)
        .map((b) => ({ dimension: b.dimension, barrier_key: b.barrier_key, notes: b.notes }));

      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/adapt-activity`,
        {
          method: "POST",
          signal: controller.signal,
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            original_activity: data.activityText,
            activity_type: data.activityType,
            barriers: activeBarriers,
            observation_notes: data.observationNotes || undefined,
          }),
        }
      );

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || "Falha na adaptação");
      }

      const result = await resp.json();
      if (controller.signal.aborted) return;

      updateData({
        ...resetGeneratedState(),
        result: result.adaptation as AdaptationResult,
      });
    } catch (e: any) {
      if (e.name === "AbortError") return;
      toast.error(e.message || "Erro ao gerar adaptação");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [data, updateData]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (!data.result) generate(); }, []);

  const handleNext = () => {
    const patch = buildAIEditorAdvancePatch(
      universalContent.dslExpanded,
      directedContent.dslExpanded,
      data.result,
    );
    updateData(patch);
    onNext();
  };

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

  if (!data.result) {
    return (
      <div className="text-center py-20 space-y-4">
        <p className="text-muted-foreground">Não foi possível gerar a adaptação.</p>
        <Button onClick={generate}>Tentar novamente</Button>
        <Button variant="outline" onClick={onPrev} className="ml-2">Voltar</Button>
      </div>
    );
  }

  const activeContent = activeTab === "universal" ? universalContent : directedContent;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FileEdit className="w-6 h-6 text-primary" />
          <div>
            <h2 className="text-xl font-semibold">Editar Atividade Adaptada</h2>
            <p className="text-sm text-muted-foreground">
              Revise e edite a atividade antes de exportar.
            </p>
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={generate}>
          <RefreshCw className="w-4 h-4 mr-1" /> Regerar
        </Button>
      </div>

      <div className="flex gap-2">
        {(["universal", "directed"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              activeTab === tab
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {tab === "universal" ? "Versão Original" : "Versão Adaptada"}
          </button>
        ))}
      </div>

      <div className="-mx-4 sm:-mx-5 lg:-mx-7">
        <ActivityEditor
          key={activeTab}
          value={activeContent.dsl}
          onChange={activeContent.setDsl}
          imageRegistry={activeContent.registry}
          onUndo={activeContent.undo}
          onRedo={activeContent.redo}
          canUndo={activeContent.canUndo}
          canRedo={activeContent.canRedo}
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
