import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft, ArrowRight, User } from "lucide-react";
import { useBarrierProfiles } from "@/hooks/useBarrierProfiles";
import { BARRIER_DIMENSIONS } from "@/lib/barriers";
import type { WizardData, BarrierItem } from "@/lib/adaptationWizardHelpers";

type Props = {
  data: WizardData;
  updateData: (partial: Partial<WizardData>) => void;
  onNext: () => void;
  onPrev: () => void;
};

function barrierIsActive(barriers: BarrierItem[], dimension: string, key: string) {
  return barriers.some((b) => b.dimension === dimension && b.barrier_key === key && b.is_active);
}

function toggleBarrier(
  barriers: BarrierItem[],
  dimension: string,
  barrierKey: string,
  label: string,
  checked: boolean,
): BarrierItem[] {
  if (checked) {
    if (barrierIsActive(barriers, dimension, barrierKey)) return barriers;
    return [...barriers, { dimension, barrier_key: barrierKey, label, is_active: true }];
  }
  return barriers.filter((b) => !(b.dimension === dimension && b.barrier_key === barrierKey));
}

export function StepBarrierSelection({ data, updateData, onNext, onPrev }: Props) {
  const { data: profiles = [] } = useBarrierProfiles();
  const [error, setError] = useState("");

  function handleProfileChange(profileId: string) {
    if (!profileId) {
      updateData({ barrierProfileId: null, barriers: [] });
      return;
    }
    const profile = profiles.find((p) => p.id === profileId);
    if (!profile) return;

    const barriers: BarrierItem[] = profile.barriers.map((key: string) => {
      for (const dim of BARRIER_DIMENSIONS) {
        const b = dim.barriers.find((b) => b.key === key);
        if (b) return { dimension: dim.key, barrier_key: key, label: b.label, is_active: true };
      }
      return { dimension: "other", barrier_key: key, label: key, is_active: true };
    });

    updateData({ barrierProfileId: profileId, barriers });
  }

  function handleCheckboxChange(dimKey: string, barrierKey: string, label: string, checked: boolean) {
    const next = toggleBarrier(data.barriers, dimKey, barrierKey, label, checked);
    updateData({ barriers: next });
  }

  function handleNext() {
    const active = data.barriers.filter((b) => b.is_active);
    if (active.length === 0) {
      setError("Selecione pelo menos uma barreira de aprendizagem.");
      return;
    }
    setError("");
    onNext();
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Barreiras de aprendizagem</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Selecione as barreiras que serão consideradas na adaptação.
        </p>
      </div>

      {/* Profile selector */}
      {profiles.length > 0 && (
        <div className="space-y-2">
          <Label htmlFor="profile-select" className="flex items-center gap-1.5">
            <User className="w-3.5 h-3.5" />
            Carregar perfil salvo
          </Label>
          <select
            id="profile-select"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={data.barrierProfileId ?? ""}
            onChange={(e) => handleProfileChange(e.target.value)}
          >
            <option value="">— Selecionar perfil (opcional) —</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.barriers.length} barreira{p.barriers.length !== 1 ? "s" : ""}
                {p.observation ? ` — ${p.observation.slice(0, 40)}` : ""}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Barrier checkboxes grouped by dimension */}
      <div className="space-y-4 max-h-[400px] overflow-y-auto pr-1">
        {BARRIER_DIMENSIONS.map((dim) => (
          <div key={dim.key} className="space-y-2">
            <p className="text-sm font-semibold text-foreground">{dim.label}</p>
            <div className="grid sm:grid-cols-2 gap-2 pl-1">
              {dim.barriers.map((b) => {
                const checked = barrierIsActive(data.barriers, dim.key, b.key);
                return (
                  <div key={b.key} className="flex items-center gap-2">
                    <Checkbox
                      id={`barrier-${b.key}`}
                      checked={checked}
                      onCheckedChange={(v) =>
                        handleCheckboxChange(dim.key, b.key, b.label, !!v)
                      }
                    />
                    <Label htmlFor={`barrier-${b.key}`} className="text-sm font-normal cursor-pointer">
                      {b.label}
                    </Label>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Observation notes */}
      <div className="space-y-2">
        <Label htmlFor="obs-notes">Observações adicionais (opcional)</Label>
        <textarea
          id="obs-notes"
          value={data.observationNotes ?? ""}
          onChange={(e) => updateData({ observationNotes: e.target.value })}
          placeholder="Contexto extra sobre o aluno ou turma..."
          className="w-full min-h-[80px] resize-y rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          maxLength={1000}
        />
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">{error}</p>
      )}

      <div className="flex justify-between pt-2">
        <Button variant="outline" onClick={onPrev} aria-label="Voltar">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Voltar
        </Button>
        <Button onClick={handleNext} aria-label="Próximo">
          Próximo
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}
