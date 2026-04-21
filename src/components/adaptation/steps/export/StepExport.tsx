import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { Save, Copy, RotateCcw, Check, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQueryClient } from "@tanstack/react-query";
import { structuredToMarkdownDsl } from "@/lib/activityDslConverter";
import { isStructuredActivity } from "@/types/adaptation";
import type { WizardData } from "@/lib/adaptationWizardHelpers";

type Props = {
  data: WizardData;
  onPrev: () => void;
  onRestart: () => void;
};

function flattenVersion(v: unknown): string {
  if (!v) return "";
  if (isStructuredActivity(v)) return structuredToMarkdownDsl(v);
  return String(v);
}

export default function StepExport({ data, onPrev, onRestart }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const r = data.result;
  if (!r) return null;

  const universalText = flattenVersion(r.version_universal);
  const directedText = flattenVersion(r.version_directed);

  const fullText = [
    "VERSÃO ORIGINAL",
    "",
    universalText,
    "",
    "---",
    "",
    "VERSÃO ADAPTADA",
    "",
    directedText,
    "",
    "---",
    "",
    "ESTRATÉGIAS APLICADAS",
    ...r.strategies_applied.map((s) => `• ${s}`),
    "",
    "---",
    "",
    "JUSTIFICATIVA PEDAGÓGICA",
    "",
    r.pedagogical_justification,
    "",
    "---",
    "",
    "DICAS DE IMPLEMENTAÇÃO",
    ...r.implementation_tips.map((t, i) => `${i + 1}. ${t}`),
    "",
    "---",
    "Ferramenta pedagógica. Não realiza diagnóstico. A decisão final é sempre do profissional.",
  ].join("\n");

  const handleSave = async () => {
    if (!user || saved) return;
    setSaving(true);

    try {
      const activeBarriers = data.barriers
        .filter((b) => b.is_active)
        .map((b) => ({
          dimension: b.dimension,
          barrier_key: b.barrier_key,
          label: b.label,
          notes: b.notes,
        }));

      const { error } = await supabase
        .from("adaptations")
        .insert({
          user_id: user.id,
          original_activity: data.activityText,
          activity_type: data.activityType,
          barriers_used: activeBarriers,
          barrier_profile_id: data.barrierProfileId || null,
          adaptation_result: r as any,
        })
        .select("id")
        .single();

      if (error) throw error;

      setSaved(true);
      toast.success("Adaptação salva no histórico!");
      queryClient.invalidateQueries({ queryKey: ["adaptations"] });
    } catch (e: any) {
      toast.error(e.message || "Erro ao salvar. Tente novamente.");
    } finally {
      setSaving(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(fullText);
      toast.success("Copiado para a área de transferência!");
    } catch {
      toast.error("Erro ao copiar.");
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-foreground">Exportar e Salvar</h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card className={`border-2 border-transparent transition-all duration-200 hover:border-primary/20 hover:shadow-lg ${saving ? "opacity-70" : ""}`}>
          <CardContent className="p-0">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || saved}
              aria-label="Salvar no Histórico"
              className="w-full flex flex-col items-center text-center gap-3 p-6 group disabled:cursor-not-allowed"
            >
              <div className={`p-4 rounded-xl transition-colors ${saved ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary group-hover:bg-primary/20"}`}>
                {saving ? <Loader2 className="w-7 h-7 animate-spin" /> : saved ? <Check className="w-7 h-7" /> : <Save className="w-7 h-7" />}
              </div>
              <div>
                <p className="font-semibold text-foreground">
                  {saving ? "Salvando..." : saved ? "Salvo ✓" : "Salvar no Histórico"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">Acesse depois em Minhas Adaptações</p>
              </div>
            </button>
          </CardContent>
        </Card>

        <Card className="border-2 border-transparent transition-all duration-200 hover:border-blue-500/20 hover:shadow-lg">
          <CardContent className="p-0">
            <button
              type="button"
              onClick={handleCopy}
              aria-label="Copiar texto"
              className="w-full flex flex-col items-center text-center gap-3 p-6 group"
            >
              <div className="p-4 rounded-xl bg-blue-500/10 text-blue-600 group-hover:bg-blue-500/20 transition-colors">
                <Copy className="w-7 h-7" />
              </div>
              <div>
                <p className="font-semibold text-foreground">Copiar texto</p>
                <p className="text-xs text-muted-foreground mt-1">Copia as duas versões + estratégias</p>
              </div>
            </button>
          </CardContent>
        </Card>
      </div>

      {r.strategies_applied.length > 0 && (
        <div className="rounded-lg border border-border p-4 space-y-2">
          <p className="text-sm font-semibold text-foreground">Estratégias aplicadas</p>
          <ul className="space-y-1">
            {r.strategies_applied.map((s, i) => (
              <li key={i} className="text-sm text-muted-foreground flex gap-2">
                <span className="text-primary">•</span> {s}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex justify-between">
        <Button variant="outline" onClick={onPrev}>Voltar ao Resultado</Button>
        <Button variant="outline" onClick={onRestart}>
          <RotateCcw className="w-4 h-4 mr-1" /> Nova Adaptação
        </Button>
      </div>
    </div>
  );
}
