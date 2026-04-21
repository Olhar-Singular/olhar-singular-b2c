import { FileText, BookOpen, ClipboardList, PenLine } from "lucide-react";

const ACTIVITY_TYPES = [
  { type: "exercício", icon: PenLine, label: "Exercício", description: "Lista de questões ou exercícios práticos" },
  { type: "prova", icon: ClipboardList, label: "Prova", description: "Avaliação formal com questões objetivas ou dissertativas" },
  { type: "texto", icon: FileText, label: "Texto / Leitura", description: "Texto de leitura com questões de compreensão" },
  { type: "projeto", icon: BookOpen, label: "Projeto / Pesquisa", description: "Atividade de pesquisa ou projeto interdisciplinar" },
] as const;

type Props = {
  onSelect: (type: string) => void;
};

export function StepActivityType({ onSelect }: Props) {
  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-xl font-semibold text-foreground">Tipo de atividade</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Escolha o tipo para que a IA adapte com a abordagem mais adequada.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        {ACTIVITY_TYPES.map(({ type, icon: Icon, label, description }) => (
          <button
            key={type}
            type="button"
            onClick={() => onSelect(type)}
            className="flex flex-col items-center gap-3 p-6 border rounded-xl hover:border-primary hover:bg-primary/5 transition-colors text-center cursor-pointer group"
          >
            <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
              <Icon className="w-6 h-6 text-primary" />
            </div>
            <div>
              <p className="font-semibold text-foreground">{label}</p>
              <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
