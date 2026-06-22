import { useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ArrowLeft, Sparkles, User, Coins, Plus } from "lucide-react";
import { useBarrierProfiles, useCreateBarrierProfile } from "@/hooks/useBarrierProfiles";
import { useAuth } from "@/hooks/useAuth";
import {
  BARRIER_DIMENSIONS,
  COMPLEXITY_LABELS,
  calcAdaptationCost,
  getComplexityTier,
} from "@/lib/domain/barriers";
import type { WizardData, BarrierItem } from "@/lib/adaptation/wizard/wizardState";
import { BarrierProfileForm } from "@/components/forms/BarrierProfileForm";
import type { BarrierProfileFormValues } from "@/components/forms/BarrierProfileForm";

type Props = {
  data: WizardData;
  updateData: (partial: Partial<WizardData>) => void;
  onNext: () => void;
  onPrev: () => void;
};

export function StepBarrierSelection({ data, updateData, onNext, onPrev }: Props) {
  const { data: profiles = [] } = useBarrierProfiles();
  const { profile } = useAuth();
  const createProfile = useCreateBarrierProfile();
  const [error, setError] = useState("");
  const [creatingProfile, setCreatingProfile] = useState(false);
  const [selectNewest, setSelectNewest] = useState(false);

  const activeDimensions = [...new Set(
    data.barriers.filter((b) => b.is_active).map((b) => b.dimension).filter(Boolean),
  )];
  const hasBarriers = activeDimensions.length > 0;
  const isFreeAdaptation = !profile?.free_adaptation_used;
  const creditCost = calcAdaptationCost(activeDimensions);
  const complexityTier = getComplexityTier(activeDimensions);

  const handleProfileChange = useCallback((profileId: string) => {
    if (!profileId) {
      updateData({ barrierProfileId: null, barriers: [] });
      return;
    }
    const p = profiles.find((p) => p.id === profileId);
    /* v8 ignore next -- defensive guard: select options are generated from profiles list */
    if (!p) return;

    const barriers: BarrierItem[] = p.barriers.map((key: string) => {
      for (const dim of BARRIER_DIMENSIONS) {
        const b = dim.barriers.find((b) => b.key === key);
        if (b) return { dimension: dim.key, barrier_key: key, label: b.label, is_active: true };
      }
      return { dimension: "other", barrier_key: key, label: key, is_active: true };
    });

    updateData({ barrierProfileId: profileId, barriers });
  }, [profiles, updateData]);

  useEffect(() => {
    if (!selectNewest || profiles.length === 0) return;
    handleProfileChange(profiles[0].id);
    setSelectNewest(false);
  }, [selectNewest, profiles, handleProfileChange]);

  async function handleCreateProfile(values: BarrierProfileFormValues) {
    await createProfile.mutateAsync({
      name: values.name,
      barriers: values.barriers,
      observation: values.observation,
    });
    setCreatingProfile(false);
    setSelectNewest(true);
  }

  function handleNext() {
    if (!data.barrierProfileId) {
      setError("Selecione um perfil de barreira antes de continuar.");
      return;
    }
    if (data.barriers.filter((b) => b.is_active).length === 0) {
      setError("O perfil selecionado não possui barreiras. Crie um novo perfil com ao menos uma barreira.");
      return;
    }
    setError("");
    onNext();
  }

  const selectedProfile = profiles.find((p) => p.id === data.barrierProfileId);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Barreiras de aprendizagem</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Selecione um perfil de barreira para a adaptação.
        </p>
      </div>

      {/* Profile selector */}
      <div className="space-y-2">
        <Label htmlFor="profile-select" className="flex items-center gap-1.5">
          <User className="w-3.5 h-3.5" />
          Perfil de barreira
          <span className="text-destructive ml-0.5">*</span>
        </Label>
        {profiles.length === 0 ? (
          <div className="flex items-center gap-3">
            <p className="text-sm text-muted-foreground">Nenhum perfil criado.</p>
            <Button size="sm" variant="outline" onClick={() => setCreatingProfile(true)}>
              <Plus className="w-3 h-3 mr-1" /> Criar perfil
            </Button>
          </div>
        ) : (
          <div className="flex gap-2 items-center">
            <select
              id="profile-select"
              className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={data.barrierProfileId ?? ""}
              onChange={(e) => handleProfileChange(e.target.value)}
            >
              <option value="">— Selecionar perfil —</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name || "Perfil sem nome"}
                </option>
              ))}
            </select>
            <Button size="sm" variant="outline" onClick={() => setCreatingProfile(true)}>
              <Plus className="w-3 h-3 mr-1" /> Novo
            </Button>
          </div>
        )}
      </div>

      {/* Barrier tags — read-only summary of the selected profile */}
      {selectedProfile && data.barriers.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">Barreiras do perfil</p>
          <div className="flex flex-wrap gap-1.5">
            {data.barriers.map((b) => (
              <Badge key={b.barrier_key} variant="secondary">{b.label}</Badge>
            ))}
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-destructive">{error}</p>
      )}

      {hasBarriers && (
        isFreeAdaptation ? (
          <div className="flex items-center gap-2 p-3 bg-primary/5 rounded-lg border border-primary/20">
            <Coins className="w-4 h-4 text-primary shrink-0" />
            <p className="text-sm">
              <strong>Grátis</strong>
              <span className="text-muted-foreground ml-1">(primeira adaptação por IA)</span>
            </p>
          </div>
        ) : (
          <div className="flex items-center gap-2 p-3 bg-amber-50 rounded-lg border border-amber-200">
            <Coins className="w-4 h-4 text-amber-600 shrink-0" />
            <p className="text-sm text-amber-800">
              Esta adaptação consumirá{" "}
              <strong>{creditCost} créditos</strong>
              <span className="ml-1 text-amber-600">
                (complexidade {COMPLEXITY_LABELS[complexityTier]})
              </span>
            </p>
          </div>
        )
      )}

      <div className="flex justify-between pt-2">
        <Button variant="outline" onClick={onPrev} aria-label="Voltar">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Voltar
        </Button>
        <Button
          onClick={handleNext}
          aria-label="Adaptar"
          className="gap-2 shadow-md shadow-primary/40 ring-2 ring-primary/30 ring-offset-2 hover:shadow-lg hover:shadow-primary/50 hover:ring-primary/50 transition-all duration-200"
        >
          <Sparkles className="w-4 h-4" />
          Adaptar
        </Button>
      </div>

      {/* Inline profile creation dialog */}
      <Dialog open={creatingProfile} onOpenChange={setCreatingProfile}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Criar perfil de barreira</DialogTitle>
          </DialogHeader>
          <BarrierProfileForm
            onSubmit={handleCreateProfile}
            isPending={createProfile.isPending}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
