import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  ArrowRight,
  Type,
  Database,
  Search,
  Check,
  Loader2,
  X,
  Image as ImageIcon,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import ImagePreviewDialog from "@/components/dialogs/ImagePreviewDialog";
import type { WizardData, SelectedQuestion } from "@/lib/adaptation/wizard/wizardState";

type Props = {
  data: WizardData;
  updateData: (partial: Partial<WizardData>) => void;
  onNext: () => void;
  onPrev: () => void;
};

type Tab = "manual" | "banco";

type BankQuestion = {
  id: string;
  text: string;
  subject: string;
  topic: string | null;
  difficulty: string | null;
  image_url: string | null;
  options: unknown;
};

const SUBJECTS = [
  "Física", "Matemática", "Química", "Biologia", "Português",
  "História", "Geografia", "Inglês", "Ciências", "Arte", "Ed. Física", "Geral",
];

const DIFFICULTIES = [
  { value: "facil", label: "Fácil" },
  { value: "medio", label: "Médio" },
  { value: "dificil", label: "Difícil" },
];

const TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
  { key: "manual", label: "Colar Texto", icon: Type },
  { key: "banco", label: "Banco de Questões", icon: Database },
];

// Most recent questions shown in the bank picker.
const BANK_QUERY_LIMIT = 50;
// Debounce (ms) before re-running the bank search as the user types.
const BANK_SEARCH_DEBOUNCE_MS = 300;

function buildActivityText(questions: SelectedQuestion[]): string {
  return questions
    .map((q, i) => {
      let text = `${i + 1}) ${q.text}`;
      if (q.options && Array.isArray(q.options)) {
        text += "\n" + q.options.map((o: string, j: number) => `   ${String.fromCharCode(65 + j)}) ${o}`).join("\n");
      }
      return text;
    })
    .join("\n\n");
}

export function StepActivityInput({ data, updateData, onNext, onPrev }: Props) {
  const [tab, setTab] = useState<Tab>("manual");
  const [error, setError] = useState("");

  // Set default tab based on whether the user has questions in their bank.
  // A failed probe is non-fatal (the user can still pick the tab manually), so
  // it is logged rather than surfaced — but it must NOT be silently swallowed.
  useEffect(() => {
    supabase
      .from("question_bank")
      .select("id")
      .limit(1)
      .then(({ data: rows, error }) => {
        if (error) {
          console.error("question_bank probe failed:", error);
          return;
        }
        if (rows && rows.length > 0) setTab("banco");
      });
  }, []);

  // Bank modal state
  const [showBankModal, setShowBankModal] = useState(false);
  const [bankQuestions, setBankQuestions] = useState<BankQuestion[]>([]);
  const [bankSearch, setBankSearch] = useState("");
  const [bankLoading, setBankLoading] = useState(false);
  const [bankError, setBankError] = useState(false);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [filterSubject, setFilterSubject] = useState("all");
  const [filterDifficulty, setFilterDifficulty] = useState("all");

  // Image preview
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);

  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Bank query ────────────────────────────────────────────────────────────

  const fetchBankQuestions = useCallback(async () => {
    setBankLoading(true);
    setBankError(false);
    let query = supabase
      .from("question_bank")
      .select("id, text, subject, topic, difficulty, image_url, options")
      .order("created_at", { ascending: false })
      .limit(BANK_QUERY_LIMIT);
    if (bankSearch.trim()) query = query.ilike("text", `%${bankSearch.trim()}%`);
    if (filterSubject !== "all") query = query.eq("subject", filterSubject);
    if (filterDifficulty !== "all") query = query.eq("difficulty", filterDifficulty);
    const { data: rows, error } = await query;
    if (error) {
      // A failed bank query must NOT masquerade as an empty bank: tell the user.
      console.error("question_bank query failed:", error);
      setBankError(true);
      setBankQuestions([]);
      toast.error("Erro ao carregar o banco de questões. Tente novamente.");
    } else {
      /* v8 ignore next -- v8 não credita o branch após await; o caminho rows nulo é exercitado em teste */
      setBankQuestions((rows as BankQuestion[]) || []);
    }
    setBankLoading(false);
  }, [bankSearch, filterSubject, filterDifficulty]);

  useEffect(() => {
    if (!showBankModal) return;
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(fetchBankQuestions, BANK_SEARCH_DEBOUNCE_MS);
    /* v8 ignore next -- searchTimerRef.current sempre setado na linha anterior */
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
  }, [showBankModal, fetchBankQuestions]);

  // ── Navigation ────────────────────────────────────────────────────────────

  function handleNext() {
    if (!data.activityText.trim()) {
      setError("Digite ou cole a atividade antes de continuar.");
      return;
    }
    setError("");
    onNext();
  }

  // ── Bank selection ────────────────────────────────────────────────────────

  function toggleQuestion(id: string) {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function confirmBankSelection() {
    const selected = bankQuestions.filter((q) => checkedIds.has(q.id));
    const newQuestions: SelectedQuestion[] = selected.map((q) => ({
      id: q.id,
      text: q.text,
      image_url: q.image_url,
      options: Array.isArray(q.options) ? (q.options as string[]) : null,
      subject: q.subject,
      topic: q.topic,
      difficulty: q.difficulty,
    }));
    const existingIds = new Set(data.selectedQuestions.map((q) => q.id));
    const merged = [...data.selectedQuestions, ...newQuestions.filter((q) => !existingIds.has(q.id))];
    updateData({ selectedQuestions: merged, activityText: buildActivityText(merged) });
    setShowBankModal(false);
    setCheckedIds(new Set());
    toast.success(`${selected.length} questão(ões) adicionada(s)`);
  }

  function removeQuestion(id: string) {
    const updated = data.selectedQuestions.filter((q) => q.id !== id);
    updateData({ selectedQuestions: updated, activityText: buildActivityText(updated) });
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Atividade original</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Cole ou digite o conteúdo que será adaptado pela IA.
        </p>
      </div>

      {/* Tab navigation */}
      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Button
            key={t.key}
            variant={tab === t.key ? "default" : "outline"}
            size="sm"
            onClick={() => setTab(t.key)}
          >
            <t.icon className="w-4 h-4 mr-1" />
            {t.label}
          </Button>
        ))}
      </div>

      {/* Tab: Colar Texto */}
      {tab === "manual" && (
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
      )}

      {/* Tab: Banco de Questões */}
      {tab === "banco" && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Selecione questões do seu banco para compor a atividade.
          </p>
          <Button variant="outline" onClick={() => setShowBankModal(true)}>
            <Database className="w-4 h-4 mr-1" />
            Abrir Banco de Questões
          </Button>

          {data.selectedQuestions.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground font-medium">
                {data.selectedQuestions.length} questão(ões) selecionada(s):
              </p>
              {data.selectedQuestions.map((q, i) => (
                <div key={q.id} className="border rounded-lg p-3 bg-muted/30 relative group">
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Remover questão"
                    className="absolute top-1 right-1 h-6 w-6"
                    onClick={() => removeQuestion(q.id)}
                  >
                    <X className="w-3 h-3" />
                  </Button>
                  <div className="flex gap-3">
                    <span className="text-xs font-bold text-primary shrink-0 mt-0.5">{i + 1})</span>
                    <div className="flex-1 min-w-0 space-y-2">
                      <p className="text-sm line-clamp-3 pr-6">{q.text}</p>
                      {q.image_url && (
                        <div
                          className="inline-block cursor-zoom-in"
                          onClick={() => setPreviewImageUrl(q.image_url)}
                        >
                          <img
                            src={q.image_url}
                            alt="Imagem da questão"
                            className="max-h-28 rounded border border-border/50"
                            loading="lazy"
                          />
                        </div>
                      )}
                      {q.options && q.options.length > 0 && (
                        <div className="space-y-0.5 pl-2">
                          {q.options.map((o, j) => (
                            <p key={j} className="text-xs text-muted-foreground">
                              {String.fromCharCode(65 + j)}) {o}
                            </p>
                          ))}
                        </div>
                      )}
                      <div className="flex gap-1.5 flex-wrap">
                        <Badge variant="secondary" className="text-[10px]">{q.subject}</Badge>
                        {q.topic && <Badge variant="outline" className="text-[10px]">{q.topic}</Badge>}
                        {q.image_url && (
                          <Badge variant="outline" className="text-[10px]">
                            <ImageIcon className="w-2.5 h-2.5 mr-0.5" /> Com imagem
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {error && (
            <p role="alert" className="text-sm text-destructive">{error}</p>
          )}
        </div>
      )}

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

      {/* Bank Modal */}
      <Dialog open={showBankModal} onOpenChange={setShowBankModal}>
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Selecionar Questões</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 flex-1 flex flex-col min-h-0">
            <div className="flex flex-wrap gap-2">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  value={bankSearch}
                  onChange={(e) => setBankSearch(e.target.value)}
                  placeholder="Buscar questões..."
                  className="pl-9"
                />
              </div>
              <Select value={filterSubject} onValueChange={setFilterSubject}>
                <SelectTrigger className="w-40"><SelectValue placeholder="Matéria" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {SUBJECTS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filterDifficulty} onValueChange={setFilterDifficulty}>
                <SelectTrigger className="w-36"><SelectValue placeholder="Dificuldade" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {DIFFICULTIES.map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {bankLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : bankError ? (
              <p role="alert" className="text-sm text-destructive py-8 text-center">
                Erro ao carregar o banco de questões. Tente novamente.
              </p>
            ) : bankQuestions.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Nenhuma questão encontrada.</p>
            ) : (
              <div className="space-y-2 flex-1 overflow-y-auto px-1 py-1">
                {bankQuestions.map((q) => {
                  const isSelected = checkedIds.has(q.id);
                  return (
                    <div
                      key={q.id}
                      onClick={() => toggleQuestion(q.id)}
                      className={`border rounded-lg p-3 cursor-pointer transition-all flex items-start gap-3 ${
                        isSelected ? "border-primary bg-primary/5 shadow-sm" : "hover:bg-accent/20"
                      }`}
                    >
                      <div
                        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
                          isSelected ? "bg-primary border-primary" : "border-muted-foreground/40"
                        }`}
                      >
                        {isSelected && <Check className="w-3 h-3 text-primary-foreground" />}
                      </div>
                      <div className="flex-1 min-w-0 space-y-2">
                        <p className="text-sm line-clamp-2">{q.text}</p>
                        {q.image_url && (
                          <div
                            className="relative inline-block cursor-zoom-in"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPreviewImageUrl(q.image_url);
                            }}
                          >
                            <img
                              src={q.image_url}
                              alt="Imagem da questão"
                              className="max-h-24 rounded border"
                              loading="lazy"
                            />
                          </div>
                        )}
                        <div className="flex gap-2 flex-wrap">
                          <Badge variant="secondary" className="text-xs">{q.subject}</Badge>
                          {q.topic && <Badge variant="outline" className="text-xs">{q.topic}</Badge>}
                          {q.difficulty && (
                            <Badge variant="outline" className="text-xs">
                              {DIFFICULTIES.find((d) => d.value === q.difficulty)?.label || q.difficulty}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <Button
              onClick={confirmBankSelection}
              disabled={checkedIds.size === 0}
              className="w-full shrink-0"
            >
              Adicionar {checkedIds.size} questão(ões)
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ImagePreviewDialog
        open={!!previewImageUrl}
        onOpenChange={(open) => {
          /* v8 ignore next -- Radix controlado sem trigger nunca chama onOpenChange(true) */
          if (!open) setPreviewImageUrl(null);
        }}
        imageUrl={previewImageUrl}
        title="Prévia da imagem da questão"
      />
    </div>
  );
}
