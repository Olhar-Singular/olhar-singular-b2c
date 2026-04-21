import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Loader2, Plus, BookOpen, Search, Gift, CreditCard, ScanText, MoreVertical, Pencil, Trash2, FileText } from "lucide-react";
import { useAuthContext } from "@/contexts/AuthContext";
import { useQuestions, useDeleteQuestion, useQuestionStats, useInsertQuestions } from "@/hooks/useQuestionBank";
import QuestionExtractModal from "@/components/QuestionExtractModal";
import QuestionForm from "@/components/QuestionForm";
import ManualQuestionEditor from "@/components/ManualQuestionEditor";
import "katex/dist/katex.min.css";

const SUBJECTS = [
  "Física", "Matemática", "Química", "Biologia", "Português",
  "História", "Geografia", "Inglês", "Ciências", "Arte", "Ed. Física", "Geral",
];

const DIFFICULTY_LABEL: Record<string, string> = {
  facil: "Fácil",
  medio: "Médio",
  dificil: "Difícil",
};

const DIFFICULTY_COLOR: Record<string, string> = {
  facil: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  medio: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
  dificil: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
};

export default function QuestionBankPage() {
  const { profile, refreshProfile } = useAuthContext();
  const creditBalance = profile?.credit_balance ?? 0;
  const freeExtractionUsed = profile?.free_extraction_used ?? false;
  const isFree = !freeExtractionUsed;
  const canExtract = isFree || creditBalance >= 5;

  const [subjectFilter, setSubjectFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [extractOpen, setExtractOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editQuestion, setEditQuestion] = useState<any | null>(null);
  const [manualFile, setManualFile] = useState<File | null>(null);

  const filters = {
    subject: subjectFilter !== "all" ? subjectFilter : undefined,
  };

  const { data: questions = [], isLoading } = useQuestions(filters);
  const { data: stats } = useQuestionStats();
  const deleteQuestion = useDeleteQuestion();
  const insertQuestions = useInsertQuestions();

  const filteredQuestions = search.trim()
    ? questions.filter((q) =>
        q.text?.toLowerCase().includes(search.toLowerCase()) ||
        q.subject?.toLowerCase().includes(search.toLowerCase()) ||
        q.topic?.toLowerCase().includes(search.toLowerCase())
      )
    : questions;

  const handleExtracted = (extracted: any[], sourceFileName: string) => {
    const rows = extracted.map((q) => ({ ...q, source_file_name: sourceFileName }));
    insertQuestions.mutate(rows);
  };

  const handleManualFileSelect = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    input.onchange = (e) => {
      const f = (e.target as HTMLInputElement).files?.[0];
      if (f) setManualFile(f);
    };
    input.click();
  };

  if (manualFile) {
    return (
      <ManualQuestionEditor
        file={manualFile}
        onFinish={() => setManualFile(null)}
      />
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <BookOpen className="w-6 h-6" />
            Banco de Questões
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {stats?.total ?? 0} questão(ões) no seu banco
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {isFree && (
            <Badge variant="outline" className="border-green-500 text-green-600 dark:text-green-400 flex items-center gap-1">
              <Gift className="w-3 h-3" /> Extração gratuita disponível
            </Badge>
          )}
          {!isFree && (
            <Badge variant="outline" className="flex items-center gap-1">
              <CreditCard className="w-3 h-3" /> {creditBalance} crédito(s)
            </Badge>
          )}

          <Button variant="outline" onClick={handleManualFileSelect}>
            <FileText className="w-4 h-4 mr-1" /> Editor Manual
          </Button>
          <Button
            variant="outline"
            disabled={!canExtract}
            onClick={() => setExtractOpen(true)}
          >
            <ScanText className="w-4 h-4 mr-1" /> Extrair Questões
          </Button>
          <Button onClick={() => { setEditQuestion(null); setFormOpen(true); }}>
            <Plus className="w-4 h-4 mr-1" /> Nova Questão
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Buscar por enunciado, matéria ou tópico..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={subjectFilter} onValueChange={setSubjectFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Todas as matérias" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as matérias</SelectItem>
            {SUBJECTS.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : filteredQuestions.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <BookOpen className="w-12 h-12 mx-auto mb-4 opacity-30" />
          <p className="text-lg font-medium">Nenhuma questão encontrada</p>
          <p className="text-sm mt-1">
            {search || subjectFilter !== "all"
              ? "Tente ajustar os filtros de busca."
              : "Comece adicionando questões manualmente ou extraindo de um documento."}
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {filteredQuestions.map((q: any) => (
            <Card key={q.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="secondary">{q.subject}</Badge>
                    {q.topic && <Badge variant="outline" className="text-xs">{q.topic}</Badge>}
                    {q.difficulty && (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${DIFFICULTY_COLOR[q.difficulty] ?? ""}`}>
                        {DIFFICULTY_LABEL[q.difficulty] ?? q.difficulty}
                      </span>
                    )}
                    {Array.isArray(q.options) && q.options.length > 0 && (
                      <Badge variant="outline" className="text-xs">Objetiva</Badge>
                    )}
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0">
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => { setEditQuestion(q); setFormOpen(true); }}>
                        <Pencil className="w-4 h-4 mr-2" /> Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => deleteQuestion.mutateAsync(q.id)}
                      >
                        <Trash2 className="w-4 h-4 mr-2" /> Excluir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-foreground leading-relaxed line-clamp-3">
                  {q.text?.replace(/<[^>]+>/g, "") || ""}
                </p>
                {Array.isArray(q.options) && q.options.length > 0 && (
                  <div className="mt-3 space-y-1">
                    {q.options.map((opt: string, i: number) => (
                      <div
                        key={i}
                        className={`flex items-center gap-2 text-xs px-2 py-1 rounded ${
                          q.correct_answer === i
                            ? "bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-300 font-medium"
                            : "text-muted-foreground"
                        }`}
                      >
                        <span className="font-medium w-4 shrink-0">{String.fromCharCode(65 + i)})</span>
                        <span>{opt}</span>
                        {q.correct_answer === i && <span className="ml-auto">✓</span>}
                      </div>
                    ))}
                  </div>
                )}
                {q.image_url && (
                  <img src={q.image_url} alt="Imagem da questão" className="mt-3 max-h-40 rounded border" />
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <QuestionExtractModal
        open={extractOpen}
        onOpenChange={setExtractOpen}
        onExtracted={handleExtracted}
        creditBalance={creditBalance}
        freeExtractionUsed={freeExtractionUsed}
        refreshProfile={refreshProfile}
      />

      <QuestionForm
        open={formOpen}
        onOpenChange={setFormOpen}
        question={editQuestion}
        onSaved={() => setFormOpen(false)}
      />
    </div>
  );
}
