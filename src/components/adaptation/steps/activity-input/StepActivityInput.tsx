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
  FileUp,
  Crop,
  Search,
  Check,
  Loader2,
  X,
  Image as ImageIcon,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import ImagePreviewDialog from "@/components/dialogs/ImagePreviewDialog";
import type { WizardData, SelectedQuestion } from "@/lib/domain/adaptationWizardHelpers";

type Props = {
  data: WizardData;
  updateData: (partial: Partial<WizardData>) => void;
  onNext: () => void;
  onPrev: () => void;
};

type Tab = "manual" | "banco" | "arquivo" | "imagem";

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
  { key: "arquivo", label: "Envio de Arquivo", icon: FileUp },
  { key: "imagem", label: "Imagem (OCR)", icon: Crop },
];

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

  // Bank modal state
  const [showBankModal, setShowBankModal] = useState(false);
  const [bankQuestions, setBankQuestions] = useState<BankQuestion[]>([]);
  const [bankSearch, setBankSearch] = useState("");
  const [bankLoading, setBankLoading] = useState(false);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [filterSubject, setFilterSubject] = useState("all");
  const [filterDifficulty, setFilterDifficulty] = useState("all");

  // Image preview
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);

  // File / image extraction state
  const [fileExtracting, setFileExtracting] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Bank query ────────────────────────────────────────────────────────────

  const fetchBankQuestions = useCallback(async () => {
    setBankLoading(true);
    let query = supabase
      .from("question_bank")
      .select("id, text, subject, topic, difficulty, image_url, options")
      .order("created_at", { ascending: false })
      .limit(50);
    if (bankSearch.trim()) query = query.ilike("text", `%${bankSearch.trim()}%`);
    if (filterSubject !== "all") query = query.eq("subject", filterSubject);
    if (filterDifficulty !== "all") query = query.eq("difficulty", filterDifficulty);
    const { data: rows } = await query;
    setBankQuestions((rows as BankQuestion[]) || []);
    setBankLoading(false);
  }, [bankSearch, filterSubject, filterDifficulty]);

  useEffect(() => {
    if (!showBankModal) return;
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(fetchBankQuestions, 300);
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

  // ── File / image extraction ───────────────────────────────────────────────

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();
    setFileExtracting(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const session = await supabase.auth.getSession();
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/extract-questions`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${session.data.session?.access_token}` },
          body: formData,
          signal: abortRef.current.signal,
        },
      );
      if (!resp.ok) {
        const err = await resp.json();
        throw new Error(err.error || "Falha na extração");
      }
      const result = await resp.json();
      const questions: Array<{ text: string; options?: string[] }> = result.questions || [];
      if (questions.length === 0) {
        toast.error("Nenhuma questão encontrada no arquivo.");
        return;
      }
      const extracted = questions
        .map((q, i) => {
          let t = `${i + 1}) ${q.text}`;
          if (q.options?.length) {
            t += "\n" + q.options.map((o, j) => `   ${String.fromCharCode(65 + j)}) ${o}`).join("\n");
          }
          return t;
        })
        .join("\n\n");
      updateData({ activityText: data.activityText ? data.activityText + "\n\n" + extracted : extracted });
      toast.success(`${questions.length} questão(ões) extraída(s) do arquivo!`);
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") return;
      const msg = err instanceof Error ? err.message : "Falha na extração";
      toast.error(msg);
    } finally {
      setFileExtracting(false);
    }
  }

  async function handleImageOcr(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) {
      toast.error("Selecione uma imagem.");
      return;
    }
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();
    setFileExtracting(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const session = await supabase.auth.getSession();
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/extract-questions`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${session.data.session?.access_token}` },
          body: formData,
          signal: abortRef.current.signal,
        },
      );
      if (!resp.ok) {
        const err = await resp.json();
        throw new Error(err.error || "Falha no OCR");
      }
      const result = await resp.json();
      const questions: Array<{ text: string; options?: string[] }> = result.questions || [];
      if (questions.length === 0) {
        toast.error("Nenhuma questão identificada na imagem.");
        return;
      }
      const extracted = questions
        .map((q, i) => {
          let t = `${i + 1}) ${q.text}`;
          if (q.options?.length) {
            t += "\n" + q.options.map((o, j) => `   ${String.fromCharCode(65 + j)}) ${o}`).join("\n");
          }
          return t;
        })
        .join("\n\n");
      updateData({ activityText: data.activityText ? data.activityText + "\n\n" + extracted : extracted });
      toast.success(`${questions.length} questão(ões) extraída(s) da imagem!`);
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") return;
      const msg = err instanceof Error ? err.message : "Falha no OCR";
      toast.error(msg);
    } finally {
      setFileExtracting(false);
    }
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

      {/* Tab: Envio de Arquivo */}
      {tab === "arquivo" && (
        <div className="space-y-3">
          <label className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors block">
            <FileUp className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground mb-1">
              {fileExtracting ? "Extraindo questões..." : "Clique ou arraste um arquivo aqui"}
            </p>
            <p className="text-xs text-muted-foreground">PDF ou Word (.docx) • A IA extrai as questões automaticamente</p>
            <input
              type="file"
              accept=".pdf,.docx"
              className="hidden"
              onChange={handleFileUpload}
              disabled={fileExtracting}
            />
          </label>
          {fileExtracting && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              Analisando arquivo com IA...
            </div>
          )}
          {data.activityText && (
            <div className="border rounded-lg p-3 bg-muted/30">
              <p className="text-xs text-muted-foreground mb-1">Conteúdo extraído:</p>
              <p className="text-sm whitespace-pre-wrap line-clamp-6">{data.activityText}</p>
            </div>
          )}
        </div>
      )}

      {/* Tab: Imagem (OCR) */}
      {tab === "imagem" && (
        <div className="space-y-3">
          <label className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors block">
            <Crop className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground mb-1">
              {fileExtracting ? "Extraindo texto da imagem..." : "Clique ou arraste uma imagem aqui"}
            </p>
            <p className="text-xs text-muted-foreground">Foto de prova ou atividade • PNG, JPG, WebP</p>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImageOcr}
              disabled={fileExtracting}
            />
          </label>
          {fileExtracting && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              Analisando imagem com IA (OCR)...
            </div>
          )}
          {data.activityText && (
            <div className="border rounded-lg p-3 bg-muted/30">
              <p className="text-xs text-muted-foreground mb-1">Texto extraído:</p>
              <p className="text-sm whitespace-pre-wrap line-clamp-6">{data.activityText}</p>
            </div>
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
        onOpenChange={(open) => { if (!open) setPreviewImageUrl(null); }}
        imageUrl={previewImageUrl}
        title="Prévia da imagem da questão"
      />
    </div>
  );
}
