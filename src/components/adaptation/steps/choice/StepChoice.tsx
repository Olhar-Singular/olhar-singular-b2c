import { Bot, Pencil } from "lucide-react";
import type { WizardMode } from "@/lib/domain/adaptationWizardHelpers";

type Props = {
  onSelect: (mode: WizardMode) => void;
  creditCost?: number;
  isFreeAdaptation?: boolean;
};

export function StepChoice({ onSelect, creditCost, isFreeAdaptation }: Props) {
  return (
    <div className="flex flex-col gap-6 items-center py-8">
      <div className="text-center">
        <h2 className="text-xl font-semibold text-foreground">Como deseja adaptar?</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Escolha o método de adaptação para esta atividade.
        </p>
      </div>
      <div className="flex flex-col sm:flex-row gap-4 w-full max-w-xl">
        <button
          type="button"
          onClick={() => onSelect("ai")}
          className="flex-1 flex flex-col items-center gap-3 p-6 border rounded-xl hover:border-primary hover:bg-primary/5 transition-colors cursor-pointer"
        >
          <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
            <Bot className="w-6 h-6 text-primary" />
          </div>
          <div className="text-center">
            <p className="font-semibold text-foreground">Gerar com IA</p>
            <p className="text-sm text-muted-foreground mt-1">
              A IA adapta a atividade com base nas barreiras selecionadas.
            </p>
            {creditCost !== undefined && (
              <p className="text-xs font-semibold text-primary mt-2">
                {isFreeAdaptation ? "Grátis (1ª adaptação)" : `${creditCost} créditos`}
              </p>
            )}
          </div>
        </button>

        <button
          type="button"
          onClick={() => onSelect("manual")}
          className="flex-1 flex flex-col items-center gap-3 p-6 border rounded-xl hover:border-primary hover:bg-primary/5 transition-colors cursor-pointer"
        >
          <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
            <Pencil className="w-6 h-6 text-primary" />
          </div>
          <div className="text-center">
            <p className="font-semibold text-foreground">Adaptar manualmente</p>
            <p className="text-sm text-muted-foreground mt-1">
              Edite as questões diretamente, sem usar IA.
            </p>
            <p className="text-xs font-semibold text-muted-foreground mt-2">Sem custo</p>
          </div>
        </button>
      </div>
    </div>
  );
}
