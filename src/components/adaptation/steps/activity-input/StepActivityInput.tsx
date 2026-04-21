import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ArrowLeft, ArrowRight } from "lucide-react";
import type { WizardData } from "@/lib/adaptationWizardHelpers";

type Props = {
  data: WizardData;
  updateData: (partial: Partial<WizardData>) => void;
  onNext: () => void;
  onPrev: () => void;
};

export function StepActivityInput({ data, updateData, onNext, onPrev }: Props) {
  const [error, setError] = useState("");

  function handleNext() {
    if (!data.activityText.trim()) {
      setError("Digite ou cole a atividade antes de continuar.");
      return;
    }
    setError("");
    onNext();
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Atividade original</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Cole ou digite o conteúdo que será adaptado pela IA.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="activity-text">Conteúdo da atividade</Label>
        <textarea
          id="activity-text"
          value={data.activityText}
          onChange={(e) => updateData({ activityText: e.target.value })}
          placeholder="Cole ou digite a atividade aqui..."
          className="w-full min-h-[300px] resize-y rounded-md border border-input bg-background px-3 py-2 text-sm font-mono leading-relaxed placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        {error && (
          <p role="alert" className="text-sm text-destructive">{error}</p>
        )}
      </div>

      <div className="flex justify-between pt-2">
        <Button variant="outline" onClick={onPrev}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Voltar
        </Button>
        <Button onClick={handleNext}>
          Próximo
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}
