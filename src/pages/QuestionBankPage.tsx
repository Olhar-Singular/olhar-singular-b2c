import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Loader2, Plus, BookOpen, Search, Gift, CreditCard,
  MoreVertical, Pencil, Trash2, FileText, AlertTriangle,
  Upload, X, CheckCircle2, Eye, Crop, Folder,
} from "lucide-react";
import { toast } from "sonner";
import { useAuthContext } from "@/contexts/AuthContext";
import { useQuestions, useDeleteQuestion, useQuestionStats, useInsertQuestions } from "@/hooks/useQuestionBank";
import { validateExtractedQuestions } from "@/lib/domain/questionParser";
import { supabase } from "@/integrations/supabase/client";
import { parsePdf } from "@/lib/utils/pdf-utils";
import { extractDocxWithImages } from "@/lib/utils/docx-utils";
import { detectFileType } from "@/lib/utils/fileValidation";
import { resolveUniqueFileName } from "@/lib/utils/fileNameUtils";
import { normalizeTextForDedup, autoCropFromBbox, dataUrlToBlob } from "@/lib/utils/extraction-utils";
import QuestionForm from "@/components/forms/QuestionForm";
import ManualQuestionEditor from "@/components/forms/ManualQuestionEditor";
import PdfPreviewModal from "@/components/forms/PdfPreviewModal";
import { SUBJECTS } from "@/lib/utils/constants";
import "katex/dist/katex.min.css";

const EXTRACTION_COST = 5;

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

type ExtractedQuestion = {
  text: string;
  subject: string;
  topic?: string;
  options?: string[];
  correct_answer?: number;
  resolution?: string;
  has_figure?: boolean;
  figure_description?: string;
  image_page?: number;
  figure_bbox?: { x: number; y: number; width: number; height: number };
  imageUrl?: string;
  selected: boolean;
  saved?: boolean;
  isDuplicate?: boolean;
  editing?: boolean;
};

function FilePreviewDialog({
  open, file, objectUrl, onOpenChange,
}: {
  open: boolean;
  file: File | null;
  objectUrl: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{file?.name ?? "Prévia do arquivo"}</DialogTitle>
        </DialogHeader>
        {objectUrl && (
          <iframe
            src={`${objectUrl}#toolbar=0&navpanes=0`}
            className="flex-1 w-full rounded border"
            title="Prévia do arquivo"
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

type PdfUpload = {
  id: string;
  file_name: string;
  file_path: string;
  questions_extracted: number | null;
  uploaded_at: string;
};

export default function QuestionBankPage() {
  const { profile, refreshProfile, user } = useAuthContext();
  const creditBalance = profile?.credit_balance ?? 0;
  const freeExtractionUsed = profile?.free_extraction_used ?? false;
  const isFree = !freeExtractionUsed;
  const canExtract = isFree || creditBalance >= EXTRACTION_COST;

  // Question list state
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editQuestion, setEditQuestion] = useState<any>(null);
  const [manualFile, setManualFile] = useState<File | null>(null);
  const [extractionWarnings, setExtractionWarnings] = useState<string[]>([]);

  // Tab state (default: questoes to keep existing question list immediately visible)
  const [activeTab, setActiveTab] = useState("questoes");

  // Provas tab: upload + extraction state
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [extractionTime, setExtractionTime] = useState(0);
  const [extractedQuestions, setExtractedQuestions] = useState<ExtractedQuestion[]>([]);
  const [showReview, setShowReview] = useState(false);

  // Exam history state
  const [pdfUploads, setPdfUploads] = useState<PdfUpload[]>([]);
  const [loadingUploads, setLoadingUploads] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // File preview dialog
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewObjectUrl, setPreviewObjectUrl] = useState<string | null>(null);

  // PDF crop modal
  const [cropModalOpen, setCropModalOpen] = useState(false);
  const [cropTargetIndex, setCropTargetIndex] = useState<number | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const filters = { subject: subjectFilter !== "all" ? subjectFilter : undefined };
  const { data: questions = [], isLoading } = useQuestions(filters);
  const { data: stats } = useQuestionStats();
  const deleteQuestion = useDeleteQuestion();
  const insertQuestions = useInsertQuestions();

  // Extraction timer
  useEffect(() => {
    if (extracting) {
      setExtractionTime(0);
      timerRef.current = setInterval(() => setExtractionTime((t) => t + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [extracting]);

  // Fetch pdf_uploads history
  const fetchUploads = useCallback(async () => {
    setLoadingUploads(true);
    const { data } = await supabase
      .from("pdf_uploads")
      .select("*")
      .order("uploaded_at", { ascending: false });
    setPdfUploads((data as PdfUpload[]) || []);
    setLoadingUploads(false);
  }, []);

  useEffect(() => {
    if (activeTab === "provas") fetchUploads();
  }, [activeTab, fetchUploads]);

  // ── File upload (Provas tab) ──────────────────────────────────────────────

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = "";
    if (!file || !user) return;

    if (file.size > 10 * 1024 * 1024) {
      toast.error("Arquivo muito grande. Máximo 10 MB.");
      return;
    }

    const bytes = new Uint8Array(await file.slice(0, 4).arrayBuffer());
    const type = detectFileType(bytes);
    if (type !== "pdf" && type !== "docx") {
      toast.error("Formato inválido. Apenas PDF e DOCX.");
      return;
    }

    const { finalName, wasRenamed } = resolveUniqueFileName(
      file.name,
      pdfUploads.map((u) => u.file_name),
    );
    const fileToUpload = wasRenamed ? new File([file], finalName, { type: file.type }) : file;

    setUploading(true);
    try {
      const safeName = fileToUpload.name
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^a-zA-Z0-9._-]/g, "_");
      const filePath = `${user.id}/${Date.now()}_${safeName}`;
      await supabase.storage.from("question-pdfs").upload(filePath, fileToUpload);
      await supabase.from("pdf_uploads").insert({
        user_id: user.id,
        file_name: fileToUpload.name,
        file_path: filePath,
      });
      setUploadFile(fileToUpload);
      await fetchUploads();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro ao enviar arquivo.");
    } finally {
      setUploading(false);
    }
  };

  // ── Extract questions (AI) ────────────────────────────────────────────────

  const handleExtract = async (fileParam?: File) => {
    const file = fileParam ?? uploadFile;
    if (!file || !canExtract) return;
    if (fileParam) setUploadFile(fileParam);
    setExtracting(true);

    try {
      const bytes = new Uint8Array(await file.slice(0, 4).arrayBuffer());
      const type = detectFileType(bytes);

      let pdfText = "";
      let images: string[] = [];

      if (type === "pdf") {
        const result = await parsePdf(file);
        pdfText = result.text;
        images = result.pageImages;
      } else if (type === "docx") {
        const docxResult = await extractDocxWithImages(file);
        pdfText = docxResult.text;
        images = docxResult.images;
      }

      const { data, error: fnError } = await supabase.functions.invoke("extract-questions", {
        body: {
          pdfText,
          pdfFileName: file.name,
          pageImages: images,
        },
      });

      if (fnError) {
        const context = (fnError as any).context as Response | undefined;
        let errMsg = "Falha na extração.";
        try {
          const body = await context?.json();
          if (body?.error) errMsg = body.error;
        } catch {}
        toast.error(errMsg);
        return;
      }
      const { questions: extracted, warnings } = validateExtractedQuestions(data.questions || []);

      if (extracted.length === 0) {
        toast.error("Nenhuma questão identificável encontrada.");
        return;
      }

      const existingNorm = new Set(questions.map((q) => normalizeTextForDedup(q.text || "")));
      const processed: ExtractedQuestion[] = [];
      for (const q of extracted) {
        let imageUrl: string | undefined;
        if (q.has_figure && q.image_page && images[q.image_page - 1]) {
          try {
            if (q.figure_bbox) {
              imageUrl = await autoCropFromBbox(images[q.image_page - 1], q.figure_bbox);
            } else {
              imageUrl = images[q.image_page - 1];
            }
          } catch (e) {
            console.warn("Auto-crop failed:", e);
            imageUrl = images[q.image_page - 1];
          }
        }
        processed.push({
          text: q.text || "",
          subject: q.subject || "Geral",
          topic: q.topic || undefined,
          options: q.options || undefined,
          correct_answer: q.correct_answer != null ? q.correct_answer : undefined,
          resolution: q.resolution || undefined,
          has_figure: q.has_figure || false,
          figure_description: q.figure_description || undefined,
          image_page: q.image_page || undefined,
          figure_bbox: q.figure_bbox || undefined,
          imageUrl,
          selected: !existingNorm.has(normalizeTextForDedup(q.text || "")),
          isDuplicate: existingNorm.has(normalizeTextForDedup(q.text || "")),
        });
      }

      setExtractedQuestions(processed);
      setExtractionWarnings(warnings);
      setShowReview(true);
      await refreshProfile();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Falha na extração.");
    } finally {
      setExtracting(false);
    }
  };

  // ── Review: save all selected ─────────────────────────────────────────────

  const handleSaveExtracted = async () => {
    const selected = extractedQuestions.filter((q) => q.selected && !q.saved);
    const source = uploadFile?.name.toLowerCase().endsWith(".pdf") ? "pdf_extract" : "docx_extract";
    let imageUploadErrors = 0;

    const rows = await Promise.all(
      selected.map(async (q) => {
        let image_url: string | null = null;
        if (q.imageUrl?.startsWith("data:") && user) {
          const blob = dataUrlToBlob(q.imageUrl);
          const fileName = `${user.id}/${Date.now()}_${Math.random().toString(36).slice(2)}.png`;
          const { error } = await supabase.storage
            .from("question-images")
            .upload(fileName, blob, { contentType: "image/png" });
          if (!error) {
            const { data: { publicUrl } } = supabase.storage
              .from("question-images")
              .getPublicUrl(fileName);
            image_url = publicUrl;
          } else {
            imageUploadErrors++;
            console.error("Image upload error:", error);
          }
        }
        return {
          text: q.text,
          subject: q.subject,
          topic: q.topic || null,
          options: q.options || null,
          correct_answer: q.correct_answer ?? null,
          resolution: q.resolution || null,
          difficulty: "medio",
          source,
          source_file_name: uploadFile?.name || null,
          image_url,
        };
      }),
    );

    if (imageUploadErrors > 0) {
      toast.error(`${imageUploadErrors} imagem(ns) não puderam ser salvas no armazenamento.`);
    }
    insertQuestions.mutate(rows);
    setShowReview(false);
    setExtractedQuestions([]);
  };

  const handleSaveOne = async (index: number) => {
    const q = extractedQuestions[index];
    if (!q || q.saved) return;
    const source = uploadFile?.name.toLowerCase().endsWith(".pdf") ? "pdf_extract" : "docx_extract";

    let image_url: string | null = null;
    if (q.imageUrl?.startsWith("data:") && user) {
      const blob = dataUrlToBlob(q.imageUrl);
      const fileName = `${user.id}/${Date.now()}_${Math.random().toString(36).slice(2)}.png`;
      const { error } = await supabase.storage
        .from("question-images")
        .upload(fileName, blob, { contentType: "image/png" });
      if (!error) {
        const { data: { publicUrl } } = supabase.storage
          .from("question-images")
          .getPublicUrl(fileName);
        image_url = publicUrl;
      } else {
        console.error("Image upload error:", error);
        toast.error("Imagem não pôde ser salva no armazenamento.");
      }
    }

    insertQuestions.mutate([{
      text: q.text,
      subject: q.subject,
      topic: q.topic || null,
      options: q.options || null,
      correct_answer: q.correct_answer ?? null,
      resolution: q.resolution || null,
      difficulty: "medio",
      source,
      source_file_name: uploadFile?.name || null,
      image_url,
    }]);

    setExtractedQuestions((prev) =>
      prev.map((eq, idx) => (idx === index ? { ...eq, saved: true, selected: true } : eq)),
    );
  };

  const handleRemoveOne = (index: number) => {
    setExtractedQuestions((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleRemoveSelected = () => {
    setExtractedQuestions((prev) => prev.filter((q) => q.saved || !q.selected));
  };

  const handleFinishReview = () => {
    setShowReview(false);
    setExtractedQuestions([]);
  };

  const updateExtracted = (i: number, field: keyof ExtractedQuestion, value: unknown) => {
    setExtractedQuestions((prev) =>
      prev.map((q, idx) => (idx === i ? { ...q, [field]: value } : q)),
    );
  };

  const openPreview = (file: File) => {
    if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
    const url = URL.createObjectURL(file);
    setPreviewObjectUrl(url);
    setPreviewOpen(true);
  };

  // ── Exam history: delete ──────────────────────────────────────────────────

  const handleDeleteUpload = async (upload: PdfUpload) => {
    setDeletingId(upload.id);
    try {
      await supabase.storage.from("question-pdfs").remove([upload.file_path]);
      await supabase.from("pdf_uploads").delete().eq("id", upload.id);
      await fetchUploads();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao excluir.");
    } finally {
      setDeletingId(null);
    }
  };

  // ── Exam history: re-extract ──────────────────────────────────────────────

  const handleReExtract = async (upload: PdfUpload) => {
    try {
      const { data: fileData } = await supabase.storage
        .from("question-pdfs")
        .download(upload.file_path);
      if (!fileData) throw new Error("Não foi possível baixar o arquivo.");
      const isDocx = upload.file_name.toLowerCase().endsWith(".docx");
      const file = new File([fileData], upload.file_name, {
        type: isDocx
          ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          : "application/pdf",
      });
      await handleExtract(file);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao carregar arquivo.");
    }
  };

  // ── Manual editor ─────────────────────────────────────────────────────────

  const handleManualFileSelect = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept =
      ".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    input.onchange = (e) => {
      const f = (e.target as HTMLInputElement).files?.[0];
      if (f) setManualFile(f);
    };
    input.click();
  };

  const filteredQuestions = search.trim()
    ? questions.filter(
        (q) =>
          q.text?.toLowerCase().includes(search.toLowerCase()) ||
          q.subject?.toLowerCase().includes(search.toLowerCase()) ||
          q.topic?.toLowerCase().includes(search.toLowerCase()),
      )
    : questions;

  // ── Guards ────────────────────────────────────────────────────────────────

  if (manualFile) {
    return <ManualQuestionEditor file={manualFile} onFinish={() => setManualFile(null)} />;
  }

  // ── Review mode ───────────────────────────────────────────────────────────

  if (showReview) {
    const selectedCount = extractedQuestions.filter((q) => q.selected && !q.saved).length;
    const savedCount = extractedQuestions.filter((q) => q.saved).length;

    return (
      <div className="p-6 max-w-6xl mx-auto space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h1 className="text-2xl font-bold text-foreground">Revisão de Questões Extraídas</h1>
          <div className="flex items-center gap-2 flex-wrap">
            {selectedCount > 0 && (
              <Button variant="destructive" size="sm" onClick={handleRemoveSelected}>
                <Trash2 className="w-3 h-3 mr-1" /> Remover selecionadas ({selectedCount})
              </Button>
            )}
            {uploadFile && (
              <Button variant="outline" onClick={() => openPreview(uploadFile)}>
                <Eye className="w-4 h-4 mr-1" /> Ver Exercícios
              </Button>
            )}
          </div>
        </div>

        <Alert>
          <AlertTriangle className="w-4 h-4" />
          <AlertDescription>
            A IA pode errar na classificação. <strong>Revise cada questão antes de salvar.</strong>
          </AlertDescription>
        </Alert>

        {extractionWarnings.length > 0 && (
          <Alert variant="default" className="border-yellow-400">
            <AlertTriangle className="w-4 h-4 text-yellow-600" />
            <AlertDescription>
              {extractionWarnings.map((w, i) => (
                <p key={i} className="text-sm">{w}</p>
              ))}
            </AlertDescription>
          </Alert>
        )}

        <p className="text-sm text-muted-foreground">
          {extractedQuestions.length} extraída(s) • {savedCount} salva(s) • {selectedCount} pendente(s)
        </p>

        <div className="space-y-3">
          {extractedQuestions.map((q, i) => (
            <Card
              key={i}
              className={`transition-all ${q.saved ? "border-green-400 bg-green-50/50" : ""} ${
                q.isDuplicate && !q.saved ? "border-destructive/30 bg-destructive/5" : ""
              } ${!q.selected && !q.saved ? "opacity-60" : ""}`}
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <Checkbox
                    checked={q.selected || q.saved}
                    onCheckedChange={(v) =>
                      !q.saved &&
                      setExtractedQuestions((prev) =>
                        prev.map((eq, idx) => (idx === i ? { ...eq, selected: !!v } : eq)),
                      )
                    }
                    disabled={q.saved}
                    aria-label={`Selecionar questão ${i + 1}`}
                  />
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="secondary">{i + 1}</Badge>
                        {q.saved && <Badge className="bg-green-600 text-white">✓ Salva</Badge>}
                        {q.isDuplicate && !q.saved && (
                          <Badge variant="destructive">Duplicada</Badge>
                        )}
                        <Badge variant="secondary">{q.subject}</Badge>
                        {q.topic && !q.editing && <Badge variant="outline">{q.topic}</Badge>}
                      </div>
                      <div className="flex gap-1 flex-wrap">
                        {!q.saved && (
                          <Button
                            size="sm"
                            variant={q.editing ? "secondary" : "ghost"}
                            onClick={() => updateExtracted(i, "editing", !q.editing)}
                          >
                            <Pencil className="w-3 h-3 mr-1" />
                            {q.editing ? "Fechar edição" : "Editar"}
                          </Button>
                        )}
                        {q.isDuplicate && !q.saved && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              updateExtracted(i, "isDuplicate", false);
                              updateExtracted(i, "selected", true);
                            }}
                          >
                            Forçar inclusão
                          </Button>
                        )}
                        {!q.saved && q.selected && (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => handleSaveOne(i)}
                          >
                            Salvar
                          </Button>
                        )}
                        {!q.saved && q.selected && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleRemoveOne(i)}
                          >
                            Remover
                          </Button>
                        )}
                      </div>
                    </div>

                    {q.editing ? (
                      <Textarea
                        value={q.text}
                        onChange={(e) => updateExtracted(i, "text", e.target.value)}
                        rows={3}
                        className="text-sm"
                      />
                    ) : (
                      <p className="text-sm leading-relaxed whitespace-pre-wrap">{q.text}</p>
                    )}

                    {q.imageUrl && (
                      <img
                        src={q.imageUrl}
                        alt="Imagem da questão"
                        className="mt-2 max-h-48 rounded border"
                      />
                    )}

                    {q.editing && uploadFile && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => { setCropTargetIndex(i); setCropModalOpen(true); }}
                      >
                        <Crop className="w-3 h-3 mr-1" /> Recortar do PDF
                      </Button>
                    )}

                    {q.editing && (
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-xs">Matéria</Label>
                          <Select
                            value={q.subject}
                            onValueChange={(v) => updateExtracted(i, "subject", v)}
                          >
                            <SelectTrigger className="h-8 text-sm" aria-label="Matéria">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {SUBJECTS.map((s) => (
                                <SelectItem key={s} value={s}>{s}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-xs">Tópico</Label>
                          <Input
                            value={q.topic || ""}
                            onChange={(e) => updateExtracted(i, "topic", e.target.value)}
                            className="h-8 text-sm"
                            placeholder="tópico"
                          />
                        </div>
                      </div>
                    )}

                    {q.options && q.options.length > 0 && (
                      <div className="space-y-1">
                        {q.options.map((opt: string, j: number) => (
                          <p
                            key={j}
                            className={`text-sm pl-2 ${
                              q.correct_answer === j
                                ? "font-semibold text-primary"
                                : "text-muted-foreground"
                            }`}
                          >
                            {String.fromCharCode(65 + j)}) {opt}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="flex gap-2 sticky bottom-4">
          <Button variant="outline" onClick={handleFinishReview} className="flex-1">
            {savedCount > 0 ? "Concluir" : "Cancelar"}
          </Button>
          <Button
            onClick={handleSaveExtracted}
            disabled={selectedCount === 0}
            className="flex-1"
          >
            <CheckCircle2 className="w-4 h-4 mr-1" />
            Salvar todas ({selectedCount})
          </Button>
        </div>

        <FilePreviewDialog
          open={previewOpen}
          file={uploadFile}
          objectUrl={previewObjectUrl}
          onOpenChange={(open) => {
            setPreviewOpen(open);
            if (!open && previewObjectUrl) {
              URL.revokeObjectURL(previewObjectUrl);
              setPreviewObjectUrl(null);
            }
          }}
        />

        <PdfPreviewModal
          open={cropModalOpen}
          onOpenChange={setCropModalOpen}
          file={uploadFile}
          initialPage={cropTargetIndex !== null ? extractedQuestions[cropTargetIndex]?.image_page : undefined}
          onCrop={(dataUrl) => {
            if (cropTargetIndex !== null) {
              updateExtracted(cropTargetIndex, "imageUrl", dataUrl);
            }
            setCropModalOpen(false);
          }}
        />
      </div>
    );
  }

  // ── Main view ─────────────────────────────────────────────────────────────

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
            <Badge
              variant="outline"
              className="border-green-500 text-green-600 dark:text-green-400 flex items-center gap-1"
            >
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
          <Button onClick={() => { setEditQuestion(null); setFormOpen(true); }}>
            <Plus className="w-4 h-4 mr-1" /> Nova Questão
          </Button>
        </div>
      </div>

      {/* Custom tabs */}
      <div role="tablist" className="flex border-b gap-1 mb-1">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "questoes"}
          onClick={() => setActiveTab("questoes")}
          className={`px-4 py-2 text-sm font-medium rounded-t border-b-2 transition-colors ${
            activeTab === "questoes"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Questões{questions.length > 0 ? ` (${questions.length})` : ""}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "provas"}
          onClick={() => setActiveTab("provas")}
          className={`flex items-center px-4 py-2 text-sm font-medium rounded-t border-b-2 transition-colors ${
            activeTab === "provas"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <FileText className="w-4 h-4 mr-1" />
          Provas
        </button>
      </div>

      {/* ── Questões tab ──────────────────────────────────────────────────── */}
      {activeTab === "questoes" && (
        <div className="flex gap-4 items-start">
          {/* Subject sidebar */}
          <aside className="w-44 shrink-0 space-y-0.5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-2 pb-1">
              Matérias
            </p>
            <button
              type="button"
              onClick={() => setSubjectFilter("all")}
              className={`w-full text-left px-3 py-2 rounded-md text-sm flex items-center gap-1.5 transition-colors ${
                subjectFilter === "all"
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted text-foreground"
              }`}
            >
              <Folder className="w-3.5 h-3.5 shrink-0" />
              <span className="flex-1">Todas as matérias</span>
              <Badge
                variant={subjectFilter === "all" ? "secondary" : "outline"}
                className="text-xs shrink-0"
              >
                {stats?.total ?? 0}
              </Badge>
            </button>
            {SUBJECTS.filter((s) => (stats?.bySubject?.[s] ?? 0) > 0).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSubjectFilter(s)}
                className={`w-full text-left px-3 py-2 rounded-md text-sm flex items-center gap-1.5 transition-colors ${
                  subjectFilter === s
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted text-foreground"
                }`}
              >
                <Folder className="w-3.5 h-3.5 shrink-0" />
                <span className="flex-1">{s}</span>
                <Badge
                  variant={subjectFilter === s ? "secondary" : "outline"}
                  className="text-xs shrink-0"
                >
                  {stats?.bySubject?.[s]}
                </Badge>
              </button>
            ))}
          </aside>

          {/* Main content */}
          <div className="flex-1 min-w-0 space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Buscar por enunciado, matéria ou tópico..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            {/* Extraction warnings (persisted between tab switches) */}
            {extractionWarnings.length > 0 && (
              <Alert variant="default" className="border-yellow-400 bg-yellow-50 dark:bg-yellow-950/30">
                <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
                <AlertDescription className="text-yellow-800 dark:text-yellow-200">
                  <p className="font-medium mb-1">Avisos da extração:</p>
                  <ul className="list-disc list-inside space-y-0.5 text-sm">
                    {extractionWarnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}

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
                          {q.topic && (
                            <Badge variant="outline" className="text-xs">
                              {q.topic}
                            </Badge>
                          )}
                          {q.difficulty && (
                            <span
                              className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                DIFFICULTY_COLOR[q.difficulty] ?? ""
                              }`}
                            >
                              {DIFFICULTY_LABEL[q.difficulty] ?? q.difficulty}
                            </span>
                          )}
                          {Array.isArray(q.options) && q.options.length > 0 && (
                            <Badge variant="outline" className="text-xs">
                              Objetiva
                            </Badge>
                          )}
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0">
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => {
                                setEditQuestion(q);
                                setFormOpen(true);
                              }}
                            >
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
                              <span className="font-medium w-4 shrink-0">
                                {String.fromCharCode(65 + i)})
                              </span>
                              <span>{opt}</span>
                              {q.correct_answer === i && <span className="ml-auto">✓</span>}
                            </div>
                          ))}
                        </div>
                      )}
                      {q.image_url && (
                        <img
                          src={q.image_url}
                          alt="Imagem da questão"
                          className="mt-3 max-h-40 rounded border"
                        />
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Provas tab ────────────────────────────────────────────────────── */}
      {activeTab === "provas" && (
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Upload className="w-5 h-5" /> Extrair Questões de Arquivo
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Alert className="bg-amber-50 dark:bg-amber-900/10 border-amber-200">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <AlertDescription className="text-xs text-amber-800 dark:text-amber-200">
                  A IA funciona melhor com PDFs digitais. Revise sempre o resultado.
                </AlertDescription>
              </Alert>

              {isFree && (
                <p className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                  <Gift className="w-3 h-3" /> Extração gratuita disponível.
                </p>
              )}

              <div
                className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                  uploadFile ? "border-primary bg-primary/5" : "hover:border-primary/50"
                }`}
                onClick={() => fileRef.current?.click()}
              >
                <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  {uploading
                    ? "Enviando arquivo..."
                    : uploadFile
                    ? `📄 ${uploadFile.name} (${(uploadFile.size / 1024 / 1024).toFixed(1)} MB)`
                    : "Arraste um PDF ou Word aqui, ou clique para selecionar"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">Máximo 10 MB</p>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  className="hidden"
                  data-upload-input
                  onChange={handleFileSelect}
                />
              </div>

              {uploadFile && (
                <div className="flex gap-2 flex-wrap">
                  <Button
                    onClick={() => handleExtract()}
                    disabled={extracting || !canExtract}
                    className="flex-1 min-w-[140px]"
                  >
                    {extracting ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Extraindo... {extractionTime}s
                      </>
                    ) : (
                      <>Extrair com IA</>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => openPreview(uploadFile)}
                  >
                    <Eye className="w-4 h-4 mr-1" /> Visualizar
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setUploadFile(null)}
                    aria-label="Remover arquivo"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Exam history */}
          <div className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">Histórico de Provas Enviadas</h2>
            {loadingUploads ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
              </div>
            ) : pdfUploads.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  Nenhuma prova enviada ainda. Faça o upload de um arquivo acima.
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {pdfUploads.map((p) => (
                  <Card key={p.id}>
                    <CardContent className="p-4 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <FileText className="w-5 h-5 text-muted-foreground shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{p.file_name}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(p.uploaded_at).toLocaleDateString("pt-BR", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                            })}
                            {p.questions_extracted != null && p.questions_extracted > 0 && (
                              <span className="ml-2">• {p.questions_extracted} questão(ões)</span>
                            )}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleReExtract(p)}
                          aria-label="Extrair questões"
                        >
                          Extrair
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handleDeleteUpload(p)}
                          disabled={deletingId === p.id}
                          aria-label="Excluir prova"
                        >
                          {deletingId === p.id ? (
                            <Loader2 className="w-4 h-4 animate-spin text-destructive" />
                          ) : (
                            <Trash2 className="w-4 h-4 text-destructive" />
                          )}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <FilePreviewDialog
        open={previewOpen}
        file={uploadFile}
        objectUrl={previewObjectUrl}
        onOpenChange={(open) => {
          setPreviewOpen(open);
          if (!open && previewObjectUrl) {
            URL.revokeObjectURL(previewObjectUrl);
            setPreviewObjectUrl(null);
          }
        }}
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
