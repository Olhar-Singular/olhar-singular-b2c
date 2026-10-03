import { useState, useCallback, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
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
import { canAfford, computeAccess } from "@/lib/domain/access";
import {
  BARRIER_DIMENSIONS,
  COMPLEXITY_LABELS,
  calcAdaptationCost,
  getComplexityTier,
} from "@/lib/domain/barriers";
import { EXTRACTION_COST } from "@/lib/domain/extractionCost";
import { activeUploadedExam, type WizardData, type BarrierItem } from "@/lib/adaptation/wizard/wizardState";
import { BarrierProfileForm } from "@/components/forms/BarrierProfileForm";
import type { BarrierProfileFormValues } from "@/components/forms/BarrierProfileForm";

const PROFILE_ERROR_ID = "profile-select-error";

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
  // 0383: id of the profile just created, selected once the refetched list
  // contains it. Picking `profiles[0]` right after the mutation grabbed the
  // previous profile, because the list had not refetched yet.
  const [pendingProfileId, setPendingProfileId] = useState<string | null>(null);
  const selectRef = useRef<HTMLSelectElement>(null);
  // 1122: the dialog is opened by state, with no `DialogTrigger`, so Radix
  // would restore focus to `<body>` on close. Closing hands it back to the
  // button that opened it; after a profile is created it goes to the select,
  // which may only appear once the list refetches (first profile ever).
  const triggerRef = useRef<HTMLButtonElement>(null);
  const createdProfileRef = useRef(false);
  const focusSelectPendingRef = useRef(false);

  const activeDimensions = [...new Set(
    data.barriers.filter((b) => b.is_active).map((b) => b.dimension).filter(Boolean),
  )];
  const hasBarriers = activeDimensions.length > 0;
  // Courtesy accounts never pay; everyone else sees the cost and whether the
  // two buckets cover it (the server re-checks inside the reservation RPC).
  const access = computeAccess(profile, new Date());
  const isExempt = access?.unlimited ?? false;
  const creditCost = calcAdaptationCost(activeDimensions);
  // An attached file is read by AI at "Gerar" before the adaptation, and that
  // reading is charged on its own. Same rule StepGenerate uses (the mode
  // decides), so the cost shown here is the one charged there.
  const extractionCost = activeUploadedExam(data) ? EXTRACTION_COST : 0;
  const totalCost = creditCost + extractionCost;
  const affordable = canAfford(access, totalCost);
  const complexityTier = getComplexityTier(activeDimensions);

  const handleProfileChange = useCallback((profileId: string) => {
    if (!profileId) {
      updateData({ barrierProfileId: null, barriers: [], observationNotes: undefined });
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

    // The free-text observation is the richest signal about the student the
    // teacher ever gives, and it feeds PILAR 1 of the system prompt. Carrying
    // it here is what makes it reach the AI at all: StepGenerate sends
    // `data.observationNotes`, and nothing else ever writes that field on a
    // fresh adaptation (rowMapping only rehydrates it for a saved one).
    updateData({
      barrierProfileId: profileId,
      barriers,
      observationNotes: p.observation || undefined,
    });
  }, [profiles, updateData]);

  useEffect(() => {
    if (!pendingProfileId || !profiles.some((p) => p.id === pendingProfileId)) return;
    handleProfileChange(pendingProfileId);
    setPendingProfileId(null);
  }, [pendingProfileId, profiles, handleProfileChange]);

  useEffect(() => {
    if (!focusSelectPendingRef.current || !selectRef.current) return;
    focusSelectPendingRef.current = false;
    selectRef.current.focus();
  }, [profiles]);

  function handleDialogCloseAutoFocus(event: Event) {
    event.preventDefault();
    if (!createdProfileRef.current) {
      triggerRef.current?.focus();
      return;
    }
    createdProfileRef.current = false;
    if (selectRef.current) selectRef.current.focus();
    else focusSelectPendingRef.current = true;
  }

  async function handleCreateProfile(values: BarrierProfileFormValues) {
    const created = await createProfile.mutateAsync({
      name: values.name,
      barriers: values.barriers,
      observation: values.observation,
    });
    createdProfileRef.current = true;
    setCreatingProfile(false);
    setPendingProfileId(created.id);
  }

  // Both validation failures are about the profile field, so the message is
  // tied to the select (aria-invalid + aria-describedby) and the focus goes
  // back to it: the alert alone announces the problem but never says where.
  function failValidation(message: string) {
    setError(message);
    selectRef.current?.focus();
  }

  function handleNext() {
    if (!data.barrierProfileId) {
      failValidation("Selecione um perfil de barreira antes de continuar.");
      return;
    }
    if (data.barriers.filter((b) => b.is_active).length === 0) {
      failValidation("O perfil selecionado não possui barreiras. Crie um novo perfil com ao menos uma barreira.");
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
            <Button ref={triggerRef} size="sm" variant="outline" onClick={() => setCreatingProfile(true)}>
              <Plus className="w-3 h-3 mr-1" /> Criar perfil
            </Button>
          </div>
        ) : (
          <div className="flex gap-2 items-center">
            <select
              id="profile-select"
              ref={selectRef}
              aria-required="true"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? PROFILE_ERROR_ID : undefined}
              className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={data.barrierProfileId ?? ""}
              onChange={(e) => handleProfileChange(e.target.value)}
            >
              <option value="">Selecionar perfil</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name || "Perfil sem nome"}
                </option>
              ))}
            </select>
            <Button ref={triggerRef} size="sm" variant="outline" onClick={() => setCreatingProfile(true)}>
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
        <p role="alert" id={PROFILE_ERROR_ID} className="text-sm text-destructive-strong">{error}</p>
      )}

      {hasBarriers && (
        isExempt ? (
          <div className="flex items-center gap-2 p-3 bg-primary/5 rounded-lg border border-primary/20">
            <Coins className="w-4 h-4 text-primary shrink-0" />
            <p className="text-sm">
              <strong>Sem débito</strong>
              <span className="text-muted-foreground ml-1">(conta com cortesia)</span>
            </p>
          </div>
        ) : (
          <div
            className={`flex items-center gap-2 p-3 rounded-lg border ${
              affordable ? "bg-warning-surface border-warning-border" : "bg-destructive/10 border-destructive/30"
            }`}
          >
            <Coins className={`w-4 h-4 shrink-0 ${affordable ? "text-warning-icon" : "text-destructive"}`} />
            <p className={`text-sm ${affordable ? "text-warning-ink" : "text-destructive"}`}>
              Esta adaptação consumirá{" "}
              <strong>{totalCost} créditos</strong>
              <span className={"ml-1"}>
                (complexidade {COMPLEXITY_LABELS[complexityTier]})
              </span>
              {extractionCost > 0 && (
                <span className="block mt-1">
                  Inclui {extractionCost} créditos pela leitura do arquivo enviado.
                </span>
              )}
              {!affordable && (
                <span className="block mt-1">
                  Seus créditos acabaram.{" "}
                  <Link to="/assinar" className="underline font-medium">Assinar</Link>
                  {" ou "}
                  <Link to="/creditos" className="underline font-medium">comprar créditos extras</Link>
                </span>
              )}
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
          className="gap-2 shadow-md shadow-primary/40 hover:shadow-lg hover:shadow-primary/50 transition-all duration-200"
        >
          <Sparkles className="w-4 h-4" />
          Adaptar
        </Button>
      </div>

      {/* Inline profile creation dialog */}
      <Dialog open={creatingProfile} onOpenChange={setCreatingProfile}>
        <DialogContent
          className="max-w-lg max-h-[85vh] overflow-y-auto"
          onCloseAutoFocus={handleDialogCloseAutoFocus}
        >
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
