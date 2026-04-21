import { Bot, Pencil } from "lucide-react";
import type { WizardMode } from "@/lib/adaptationWizardHelpers";

type Props = {
  onSelect: (mode: WizardMode) => void;
};

const MODE_OPTIONS = [
  {
    mode: "ai" as WizardMode,
    icon: Bot,
    title: "Gerar com IA",
    description: "A IA adapta a atividade com base nas barreiras selecionadas.",
  },
  {
    mode: "manual" as WizardMode,
    icon: Pencil,
    title: "Adaptar manualmente",
    description: "Edite as questões diretamente, sem usar IA.",
  },
];

export function StepChoice({ onSelect }: Props) {
  return (
    <div className="flex flex-col gap-6 items-center py-8">
      <div className="text-center">
        <h2 className="text-xl font-semibold text-foreground">Como deseja adaptar?</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Escolha o método de adaptação para esta atividade.
        </p>
      </div>
      <div className="flex flex-col sm:flex-row gap-4 w-full max-w-xl">
        {MODE_OPTIONS.map(({ mode, icon: Icon, title, description }) => (
          <button
            key={mode}
            type="button"
            onClick={() => onSelect(mode)}
            className="flex-1 flex flex-col items-center gap-3 p-6 border rounded-xl hover:border-primary hover:bg-primary/5 transition-colors cursor-pointer"
          >
            <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
              <Icon className="w-6 h-6 text-primary" />
            </div>
            <div className="text-center">
              <p className="font-semibold text-foreground">{title}</p>
              <p className="text-sm text-muted-foreground mt-1">{description}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
