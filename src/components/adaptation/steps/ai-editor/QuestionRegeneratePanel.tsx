import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useRegenerateQuestion } from "@/hooks/useRegenerateQuestion";
import { markdownDslToStructured, structuredToMarkdownDsl } from "@/lib/domain/activityDslConverter";
import type { StructuredQuestion } from "@/types/adaptation";
import type { AdaptationResult, BarrierItem } from "@/lib/domain/adaptationWizardHelpers";

type Props = {
  result: AdaptationResult;
  versionType: "universal" | "directed";
  activityType: string;
  barriers: BarrierItem[];
  currentDsl: string;
  onDslUpdate: (newDsl: string) => void;
  onCreditRefresh: () => void;
};

function replaceQuestionInDsl(currentDsl: string, questionNumber: number, questionDsl: string): string {
  const current = markdownDslToStructured(currentDsl);
  const parsed = markdownDslToStructured(questionDsl);
  const newQuestion = parsed.sections[0]?.questions[0];
  if (!newQuestion) return currentDsl;
  newQuestion.number = questionNumber;

  for (const section of current.sections) {
    const idx = section.questions.findIndex((q) => q.number === questionNumber);
    if (idx !== -1) {
      section.questions[idx] = newQuestion;
      break;
    }
  }

  return structuredToMarkdownDsl(current);
}

export default function QuestionRegeneratePanel({
  result,
  versionType,
  activityType,
  barriers,
  currentDsl,
  onDslUpdate,
  onCreditRefresh,
}: Props) {
  const [loadingQuestion, setLoadingQuestion] = useState<number | null>(null);
  const { mutate } = useRegenerateQuestion();

  const version = versionType === "universal" ? result.version_universal : result.version_directed;
  const questions: StructuredQuestion[] = version.sections.flatMap((s) => s.questions);

  if (questions.length === 0) return null;

  const activeBarriers = barriers.filter((b) => b.is_active);

  function handleRegenerate(question: StructuredQuestion) {
    setLoadingQuestion(question.number);
    mutate(
      {
        question,
        version_type: versionType,
        activity_type: activityType,
        barriers: activeBarriers,
      },
      {
        onSuccess: (res) => {
          const newDsl = replaceQuestionInDsl(currentDsl, question.number, res.question_dsl);
          onDslUpdate(newDsl);
          onCreditRefresh();
          if (res.changes_made[0]) toast.success(res.changes_made[0]);
          setLoadingQuestion(null);
        },
        onError: (err) => {
          toast.error(err.message);
          setLoadingQuestion(null);
        },
      }
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        Regenerar questão individual
      </p>
      <div className="flex flex-wrap gap-2">
        {questions.map((q) => {
          const isLoading = loadingQuestion === q.number;
          const truncated =
            q.statement.length > 60 ? q.statement.slice(0, 60) + "…" : q.statement;
          return (
            <Button
              key={q.number}
              size="sm"
              variant="outline"
              disabled={loadingQuestion !== null}
              aria-label={`Regerar Q${q.number}`}
              onClick={() => handleRegenerate(q)}
              title={q.statement}
              className="flex items-center gap-1 text-xs h-8"
            >
              <RefreshCw className={`w-3 h-3 ${isLoading ? "animate-spin" : ""}`} />
              <span className="font-semibold">Q{q.number}</span>
              <span className="text-muted-foreground hidden sm:inline max-w-[180px] truncate">
                {truncated}
              </span>
            </Button>
          );
        })}
      </div>
    </div>
  );
}
