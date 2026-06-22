import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, X } from "lucide-react";

type OptionsEditorProps = {
  options: string[];
  correctAnswer: number | null;
  onChange: (options: string[], correctAnswer: number | null) => void;
};

/**
 * Controlled editor for multiple-choice alternatives: add / edit / remove
 * options and toggle which one is correct. Shared by QuestionForm and the
 * extraction review so both behave identically.
 */
export default function OptionsEditor({ options, correctAnswer, onChange }: OptionsEditorProps) {
  const addOption = () => onChange([...options, ""], correctAnswer);

  const updateOption = (index: number, value: string) => {
    const next = [...options];
    next[index] = value;
    onChange(next, correctAnswer);
  };

  const removeOption = (index: number) => {
    const next = options.filter((_, j) => j !== index);
    let nextCorrect = correctAnswer;
    if (correctAnswer === index) nextCorrect = null;
    else if (correctAnswer !== null && correctAnswer > index) nextCorrect = correctAnswer - 1;
    onChange(next, nextCorrect);
  };

  const toggleCorrect = (index: number) =>
    onChange(options, correctAnswer === index ? null : index);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <Label>Alternativas</Label>
        <Button type="button" size="sm" variant="outline" onClick={addOption}>
          <Plus className="w-3 h-3 mr-1" /> Adicionar
        </Button>
      </div>
      {options.length === 0 && (
        <p className="text-xs text-muted-foreground">Clique em "Adicionar" para criar alternativas.</p>
      )}
      {options.map((opt, i) => {
        const letter = String.fromCharCode(65 + i);
        return (
          <div key={i} className="flex gap-2 mb-2">
            <Input
              value={opt}
              onChange={(e) => updateOption(i, e.target.value)}
              placeholder={`Alternativa ${letter}`}
            />
            <Button
              type="button"
              size="sm"
              variant={correctAnswer === i ? "default" : "outline"}
              onClick={() => toggleCorrect(i)}
              className="shrink-0"
              aria-label={`Marcar alternativa ${letter} como correta`}
            >
              {correctAnswer === i ? "✓" : letter}
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={() => removeOption(i)}
              aria-label={`Remover alternativa ${letter}`}
            >
              <X className="w-3 h-3" />
            </Button>
          </div>
        );
      })}
    </div>
  );
}
