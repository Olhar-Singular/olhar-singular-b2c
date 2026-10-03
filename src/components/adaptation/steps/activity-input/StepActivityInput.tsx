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
  Upload,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import ImagePreviewDialog from "@/components/dialogs/ImagePreviewDialog";
import { buildActivityText } from "./buildActivityText";
import {
  MAX_ACTIVITY_CHARS,
  escapedLength,
  isActivityOverLimit,
} from "@/lib/domain/activityLimits";
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

// 1131: the bank search runs here, over the whole (owner-scoped) list, like
// the bank page: accent- and case-insensitive, over statement, subject and
// topic, and with `%`/`_` as plain characters (no LIKE wildcards).
function foldForSearch(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function matchesBankSearch(q: BankQuestion, term: string): boolean {
  return [q.text, q.subject, q.topic].some((field) => !!field && foldForSearch(field).includes(term));
}

// Debounce (ms) before re-running the bank search as the user types.
const BANK_SEARCH_DEBOUNCE_MS = 300;
// Id of the "Colar Texto" validation message, referenced by the textarea.
const ACTIVITY_ERROR_ID = "activity-text-error";

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
  // 1127: the dialog is opened by state, with no `DialogTrigger`, so Radix
  // would restore focus to `<body>` on close. Hand it back to the opener.
  const bankTriggerRef = useRef<HTMLButtonElement>(null);
  // 1128: the remove button unmounts with its card, which would drop focus on
  // <body>. Remember where focus should land (the question now at that
  // position, else the opener) and move it once the new list has rendered.
  const removeButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const pendingRemoveFocusRef = useRef<string | null>(null);
  const [removeAnnouncement, setRemoveAnnouncement] = useState("");
  const [bankQuestions, setBankQuestions] = useState<BankQuestion[]>([]);
  const [bankSearch, setBankSearch] = useState("");
  const [bankLoading, setBankLoading] = useState(false);
  const [bankError, setBankError] = useState(false);
  // Checked questions keyed by id, holding the whole row: a checked question
  // must survive a search/filter change that drops it from `bankQuestions`.
  const [checked, setChecked] = useState<Map<string, BankQuestion>>(new Map());
  const [filterSubject, setFilterSubject] = useState("all");
  const [filterDifficulty, setFilterDifficulty] = useState("all");

  // Image preview
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);

  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const bankSearchInputRef = useRef<HTMLInputElement>(null);

  // ── Bank query ────────────────────────────────────────────────────────────

  const fetchBankQuestions = useCallback(async () => {
    setBankLoading(true);
    setBankError(false);
    let query = supabase
      .from("question_bank")
      .select("id, text, subject, topic, difficulty, image_url, options")
      .order("created_at", { ascending: false });
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
  }, [filterSubject, filterDifficulty]);

  const bankSearchTerm = foldForSearch(bankSearch.trim());
  const visibleBankQuestions = bankSearchTerm
    ? bankQuestions.filter((q) => matchesBankSearch(q, bankSearchTerm))
    : bankQuestions;
  const bankFiltered = !!bankSearchTerm || filterSubject !== "all" || filterDifficulty !== "all";

  function clearBankFilters() {
    setBankSearch("");
    setFilterSubject("all");
    setFilterDifficulty("all");
  }

  // 0534: selection, search and filters live in the step, so every way of
  // closing the dialog resets them. Reopening starts with the whole bank and
  // nothing checked, never with a stale filter or an abandoned selection.
  function closeBankModal() {
    setShowBankModal(false);
    setChecked(new Map());
    clearBankFilters();
  }

  // 0535: the 'Limpar filtros' button unmounts itself, so send focus to the
  // search field instead of letting it fall back to the dialog container.
  function clearBankFiltersAndFocusSearch() {
    clearBankFilters();
    bankSearchInputRef.current?.focus();
  }

  function switchToPasteText() {
    closeBankModal();
    setTab("manual");
  }

  useEffect(() => {
    if (!showBankModal) return;
    // 1134: show the spinner from the moment the query is scheduled, so the
    // previous result (e.g. a stale "empty") never stands in for the new one.
    setBankLoading(true);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(fetchBankQuestions, BANK_SEARCH_DEBOUNCE_MS);
    /* v8 ignore next -- searchTimerRef.current sempre setado na linha anterior */
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
  }, [showBankModal, fetchBankQuestions]);

  // ── Navigation ────────────────────────────────────────────────────────────

  // The server escapes the text and then truncates it at MAX_ACTIVITY_CHARS,
  // silently. Measuring the ESCAPED length here is what makes the counter honest
  // and stops a credit being spent on an activity that cannot arrive whole.
  const activityLength = escapedLength(data.activityText);
  const overLimit = isActivityOverLimit(data.activityText);

  // Both validation failures are about the activity text, so the message is
  // tied to the textarea (aria-invalid + aria-describedby) and the focus goes
  // to it, which also scrolls it into view. Same contract as the Barriers step.
  // On the "banco" tab the textarea is not mounted and the ref stays null.
  function failValidation(message: string) {
    setError(message);
    textareaRef.current?.focus();
  }

  function handleNext() {
    if (!data.activityText.trim()) {
      failValidation("Digite ou cole a atividade antes de continuar.");
      return;
    }
    if (overLimit) {
      failValidation(
        `A atividade passou do limite de ${MAX_ACTIVITY_CHARS.toLocaleString("pt-BR")} caracteres. ` +
          "Reduza o texto ou divida em duas adaptações: o excedente seria cortado e você pagaria por uma prova incompleta.",
      );
      return;
    }
    setError("");
    onNext();
  }

  // ── Bank selection ────────────────────────────────────────────────────────

  // Questions already in the activity are shown as added and cannot be
  // checked again, so the add button never counts a no-op duplicate.
  const addedIds = new Set(data.selectedQuestions.map((q) => q.id));
  // 0534: a checked question survives a search/filter that hides it (1130),
  // so say how many the add button counts that are not on screen.
  const visibleIds = new Set(visibleBankQuestions.map((q) => q.id));
  const hiddenCheckedCount = [...checked.keys()].filter((id) => !visibleIds.has(id)).length;

  function toggleQuestion(q: BankQuestion) {
    if (addedIds.has(q.id)) return;
    setChecked((prev) => {
      const next = new Map(prev);
      if (next.has(q.id)) next.delete(q.id); else next.set(q.id, q);
      return next;
    });
  }

  // Both tabs write the same `activityText`, and changing the bank list rebuilds
  // it from the list. When the user already edited the text by hand ("Colar
  // Texto"), that rebuild would wipe the edit, so it only happens on consent.
  function canRebuildActivityText(): boolean {
    if (data.activityText === buildActivityText(data.selectedQuestions)) return true;
    return window.confirm(
      "O texto da atividade foi editado à mão. Alterar as questões do banco vai substituí-lo " +
        "pelo texto das questões selecionadas e a edição será perdida. Continuar?",
    );
  }

  function confirmBankSelection() {
    if (!canRebuildActivityText()) return;
    const newQuestions: SelectedQuestion[] = [...checked.values()]
      .filter((q) => !addedIds.has(q.id))
      .map((q) => ({
      id: q.id,
      text: q.text,
      image_url: q.image_url,
      options: Array.isArray(q.options) ? (q.options as string[]) : null,
      subject: q.subject,
      topic: q.topic,
      difficulty: q.difficulty,
    }));
    const merged = [...data.selectedQuestions, ...newQuestions];
    // `result: null` for the same reason as the upload path: StepGenerate
    // skips generation while a result is present, so changing the question set
    // without clearing it would silently reuse the adaptation of the old set.
    updateData({ selectedQuestions: merged, activityText: buildActivityText(merged), result: null });
    closeBankModal();
    toast.success(`${newQuestions.length} questão(ões) adicionada(s)`);
  }

  function removeQuestion(id: string) {
    if (!canRebuildActivityText()) return;
    const index = data.selectedQuestions.findIndex((q) => q.id === id);
    const updated = data.selectedQuestions.filter((q) => q.id !== id);
    // Next question (now at the same index), else the previous one, else the opener.
    pendingRemoveFocusRef.current = updated[Math.min(index, updated.length - 1)]?.id ?? "";
    setRemoveAnnouncement(`Questão removida. ${updated.length} questão(ões) selecionada(s).`);
    updateData({ selectedQuestions: updated, activityText: buildActivityText(updated), result: null });
  }

  useEffect(() => {
    const target = pendingRemoveFocusRef.current;
    if (target === null) return;
    pendingRemoveFocusRef.current = null;
    const button = target ? removeButtonRefs.current.get(target) : bankTriggerRef.current;
    button?.focus();
  }, [data.selectedQuestions]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Atividade original</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Cole ou digite o conteúdo que será adaptado pela IA.
        </p>
      </div>

      {/* Direct path: skip manual curation entirely — upload the file and adapt it whole. */}
      <button
        type="button"
        onClick={() => updateData({ activityInputMode: "upload" })}
        className="w-full flex items-center gap-4 p-4 border-2 border-primary rounded-xl bg-primary/5 hover:bg-primary/10 transition-colors text-left group"
      >
        <div className="w-11 h-11 shrink-0 rounded-lg bg-primary/15 flex items-center justify-center group-hover:bg-primary/25 transition-colors">
          <Upload className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-primary">Adaptar direto do arquivo</p>
          <p className="text-sm text-muted-foreground">
            Suba o PDF ou Word da atividade e a IA adapta ela inteira automaticamente, sem escolher questão por questão.
          </p>
        </div>
        <ArrowRight className="w-5 h-5 text-primary shrink-0" />
      </button>

      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-border" />
        <p className="text-xs text-muted-foreground shrink-0">ou monte manualmente</p>
        <div className="h-px flex-1 bg-border" />
      </div>

      {/* Tab navigation */}
      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Button
            key={t.key}
            variant={tab === t.key ? "default" : "outline"}
            size="sm"
            aria-pressed={tab === t.key}
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
            ref={textareaRef}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? ACTIVITY_ERROR_ID : undefined}
            value={data.activityText}
            onChange={(e) => updateData({ activityText: e.target.value })}
            placeholder="Cole ou digite a atividade aqui..."
            className={`w-full min-h-[300px] resize-y rounded-md border ${error ? "border-destructive" : "border-input"} bg-background px-3 py-2 text-sm font-mono leading-relaxed placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
          />
          <p
            data-testid="activity-char-count"
            className={`text-xs ${overLimit ? "text-destructive-strong font-medium" : "text-muted-foreground"}`}
          >
            {activityLength.toLocaleString("pt-BR")} / {MAX_ACTIVITY_CHARS.toLocaleString("pt-BR")} caracteres
          </p>
          {error && (
            <p id={ACTIVITY_ERROR_ID} role="alert" className="text-sm text-destructive-strong">{error}</p>
          )}
        </div>
      )}

      {/* Tab: Banco de Questões */}
      {tab === "banco" && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Selecione questões do seu banco para compor a atividade.
          </p>
          <Button ref={bankTriggerRef} variant="outline" onClick={() => setShowBankModal(true)}>
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
                    ref={(el) => {
                      if (el) removeButtonRefs.current.set(q.id, el);
                      else removeButtonRefs.current.delete(q.id);
                    }}
                    size="icon"
                    variant="ghost"
                    aria-label={`Remover questão ${i + 1}`}
                    className="absolute top-1 right-1 h-8 w-8"
                    onClick={() => removeQuestion(q.id)}
                  >
                    <X className="w-3 h-3" />
                  </Button>
                  <div className="flex gap-3">
                    <span className="text-xs font-bold text-primary shrink-0 mt-0.5">{i + 1})</span>
                    <div className="flex-1 min-w-0 space-y-2">
                      <p className="text-sm line-clamp-3 pr-8 break-words">{q.text}</p>
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
            <p role="alert" className="text-sm text-destructive-strong">{error}</p>
          )}

          <p role="status" aria-live="polite" className="sr-only">{removeAnnouncement}</p>
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
      <Dialog
        open={showBankModal}
        onOpenChange={(open) => {
          /* v8 ignore next -- Radix controlado sem trigger nunca chama onOpenChange(true) */
          if (!open) closeBankModal();
        }}
      >
        <DialogContent
          className="max-w-3xl max-h-[85vh] flex flex-col"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            // 0533: "Colar Texto" switches to the manual tab, unmounting the bank
            // trigger; focus the textarea that path promised instead.
            (bankTriggerRef.current ?? textareaRef.current)?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>Selecionar Questões</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 flex-1 flex flex-col min-h-0">
            <div className="flex flex-wrap gap-2">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  ref={bankSearchInputRef}
                  value={bankSearch}
                  onChange={(e) => setBankSearch(e.target.value)}
                  placeholder="Buscar questões..."
                  className="pl-9"
                />
              </div>
              <Select value={filterSubject} onValueChange={setFilterSubject}>
                <SelectTrigger className="w-40" aria-label="Filtrar por matéria"><SelectValue placeholder="Matéria" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {SUBJECTS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filterDifficulty} onValueChange={setFilterDifficulty}>
                <SelectTrigger className="w-36" aria-label="Filtrar por dificuldade"><SelectValue placeholder="Dificuldade" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {DIFFICULTIES.map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {bankLoading ? (
              <div role="status" aria-label="Carregando questões" className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-primary" aria-hidden="true" />
              </div>
            ) : bankError ? (
              <p role="alert" className="text-sm text-destructive-strong py-8 text-center">
                Erro ao carregar o banco de questões. Tente novamente.
              </p>
            ) : visibleBankQuestions.length === 0 && bankFiltered ? (
              <div className="py-8 text-center space-y-3">
                <p className="text-sm text-muted-foreground">Nenhuma questão encontrada para esta busca ou filtro.</p>
                <Button variant="outline" size="sm" onClick={clearBankFiltersAndFocusSearch}>Limpar filtros</Button>
              </div>
            ) : visibleBankQuestions.length === 0 ? (
              <div className="py-8 text-center space-y-3">
                <p className="text-sm text-muted-foreground">
                  Seu banco ainda não tem questões. Cadastre-as em Banco de Questões, no menu lateral, ou cole o texto da atividade.
                </p>
                <Button variant="outline" size="sm" onClick={switchToPasteText}>
                  <Type className="w-4 h-4 mr-1" />
                  Colar Texto
                </Button>
              </div>
            ) : (
              <div className="space-y-2 flex-1 overflow-y-auto px-1 py-1">
                {visibleBankQuestions.map((q) => {
                  const isAdded = addedIds.has(q.id);
                  const isSelected = isAdded || checked.has(q.id);
                  return (
                    <div
                      key={q.id}
                      role="checkbox"
                      aria-checked={isSelected}
                      aria-disabled={isAdded || undefined}
                      tabIndex={0}
                      onClick={() => toggleQuestion(q)}
                      onKeyDown={(e) => {
                        if (e.target !== e.currentTarget) return;
                        if (e.key !== " " && e.key !== "Enter") return;
                        e.preventDefault();
                        toggleQuestion(q);
                      }}
                      className={`border rounded-lg p-3 cursor-pointer transition-all flex items-start gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                        isAdded
                          ? "border-primary/40 bg-primary/5 cursor-not-allowed opacity-70"
                          : isSelected
                            ? "border-primary bg-primary/5 shadow-sm"
                            : "hover:bg-accent/20"
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
                        <p className="text-sm line-clamp-2 break-words">{q.text}</p>
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
                          {isAdded && <Badge className="text-xs">Já adicionada</Badge>}
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

            {hiddenCheckedCount > 0 && (
              <p className="text-xs text-muted-foreground text-center shrink-0">
                {hiddenCheckedCount} selecionada(s) fora deste filtro
              </p>
            )}
            <Button
              onClick={confirmBankSelection}
              disabled={checked.size === 0}
              className="w-full shrink-0"
            >
              Adicionar {checked.size} questão(ões)
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
