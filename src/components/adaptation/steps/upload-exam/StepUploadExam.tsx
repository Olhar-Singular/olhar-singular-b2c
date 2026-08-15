import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ArrowLeft, ArrowRight, CheckCircle2, Clock, FileText, Loader2, Trash2, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { detectFileType } from "@/lib/utils/fileValidation";
import { parsePdf } from "@/lib/utils/pdf-utils";
import { extractDocxWithImages } from "@/lib/utils/docx-utils";
import { autoCropFromBbox, dataUrlToBlob } from "@/lib/utils/extraction-utils";
import { buildActivityTextFromExtraction, type ExamExtractedQuestion } from "./buildActivityTextFromExtraction";
import type { WizardData } from "@/lib/adaptation/wizard/wizardState";

type Props = {
  data: WizardData;
  updateData: (partial: Partial<WizardData>) => void;
  onNext: () => void;
  onPrev: () => void;
  onLoadingChange?: (loading: boolean) => void;
};

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
export const MAX_QUESTIONS = 12;

type RawExtractedQuestion = {
  text: string;
  options?: string[];
  has_figure?: boolean;
  image_page?: number;
  figure_bbox?: { x: number; y: number; width: number; height: number };
};

/** PDF pages are rasterized whole (crop needed); DOCX images are already isolated per-figure. */
async function resolveImageUrl(
  fileType: "pdf" | "docx",
  q: RawExtractedQuestion,
  pageImages: string[],
  userId: string,
): Promise<string | null> {
  if (!q.has_figure || !q.image_page || q.image_page < 1 || q.image_page > pageImages.length) {
    return null;
  }
  const source = pageImages[q.image_page - 1];
  const dataUrl = fileType === "pdf" && q.figure_bbox ? await autoCropFromBbox(source, q.figure_bbox) : source;

  const blob = dataUrlToBlob(dataUrl);
  const path = `${userId}/${Date.now()}_${Math.random().toString(36).slice(2)}.png`;
  const { error: uploadError } = await supabase.storage
    .from("question-images")
    .upload(path, blob, { contentType: "image/png" });
  if (uploadError) {
    console.error("Exam image upload error:", uploadError);
    return null;
  }
  const { data: { publicUrl } } = supabase.storage.from("question-images").getPublicUrl(path);
  return publicUrl;
}

export function StepUploadExam({ updateData, onNext, onLoadingChange }: Props) {
  const { user } = useAuth();
  const [fileName, setFileName] = useState("");
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const [pendingQuestions, setPendingQuestions] = useState<ExamExtractedQuestion[] | null>(null);
  const [totalExtracted, setTotalExtracted] = useState(0);
  // Set once extraction succeeds — the file is "attached": dropzone locks, the
  // file card + Delete appear, and Continuar becomes the explicit trigger to
  // advance (no more auto-advance the moment processing finishes).
  const [readyQuestions, setReadyQuestions] = useState<ExamExtractedQuestion[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Guards against a stray completion after this step is left mid-processing
  // (Voltar is disabled while processing, but the wizard's step pills / sidebar
  // nav are not) — without it, an extraction that finishes AFTER the user has
  // moved on would still fire state updates against a screen they no longer
  // expect to change.
  //
  // The app runs in <StrictMode>, which mounts effects twice (mount → cleanup
  // → mount). Setting the ref only via `useRef(true)` left it permanently
  // `false` after that throwaway first cleanup — every guard below then
  // treated the component as unmounted forever, so a real 200 response would
  // never reach setReadyQuestions/setPendingQuestions, and `finally` would
  // skip setProcessing(false) too: the loading spinner never stopped even
  // though the request had already succeeded. Setting it to `true` INSIDE the
  // effect (not just the initial ref value) makes the second, real mount
  // reset it correctly.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  function finish(questions: ExamExtractedQuestion[]) {
    updateData({ activityText: buildActivityTextFromExtraction(questions) });
    onNext();
  }

  /** Cancels the upload path and returns to the tabs (Colar Texto / Banco de Questões), same step. */
  function backToTabs() {
    updateData({ activityInputMode: "bank" });
  }

  function handleContinue() {
    /* v8 ignore next -- guard: the button only renders while readyQuestions is set */
    if (!readyQuestions) return;
    finish(readyQuestions);
  }

  /** Detaches the current file, re-enabling the dropzone for a new upload. */
  function handleRemoveFile() {
    setFileName("");
    setReadyQuestions(null);
    setError("");
    setTotalExtracted(0);
  }

  async function handleFile(file: File) {
    setError("");
    setFileName(file.name);

    if (file.size > MAX_FILE_SIZE_BYTES) {
      setError("Arquivo muito grande (máximo 10MB).");
      return;
    }

    const bytes = new Uint8Array(await file.slice(0, 4).arrayBuffer());
    const fileType = detectFileType(bytes);
    if (fileType !== "pdf" && fileType !== "docx") {
      setError("Envie um arquivo PDF ou Word (.docx).");
      return;
    }

    setProcessing(true);
    onLoadingChange?.(true);
    try {
      const { text, pageImages } =
        fileType === "pdf"
          ? await parsePdf(file)
          : await extractDocxWithImages(file).then((r) => ({ text: r.text, pageImages: r.images }));

      const { data: fnResult, error: fnError } = await supabase.functions.invoke("extract-exam-for-adaptation", {
        body: { pdfText: text, pdfFileName: file.name, pageImages },
      });
      if (!mountedRef.current) return;
      if (fnError) throw new Error("Não foi possível processar o arquivo enviado. Tente novamente.");

      const rawQuestions: RawExtractedQuestion[] = fnResult?.questions ?? [];
      if (rawQuestions.length === 0) {
        setError("Não foi possível identificar questões neste arquivo. Tente outro arquivo ou use o Banco de Questões.");
        return;
      }

      /* v8 ignore next -- user is always set: this step only renders inside the authenticated wizard */
      const userId = user?.id ?? "";
      const resolved: ExamExtractedQuestion[] = [];
      for (const q of rawQuestions) {
        const image_url = await resolveImageUrl(fileType, q, pageImages, userId);
        resolved.push({ text: q.text, options: q.options && q.options.length > 0 ? q.options : null, image_url });
      }
      if (!mountedRef.current) return;

      if (resolved.length > MAX_QUESTIONS) {
        setTotalExtracted(resolved.length);
        setPendingQuestions(resolved);
        return;
      }

      setReadyQuestions(resolved);
    } catch (e) {
      console.error("Exam upload/extraction error:", e);
      if (!mountedRef.current) return;
      setError(e instanceof Error ? e.message : "Falha ao processar o arquivo. Tente novamente.");
    } finally {
      if (mountedRef.current) {
        setProcessing(false);
        onLoadingChange?.(false);
      }
    }
  }

  function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
    e.target.value = "";
  }

  function confirmTruncate() {
    /* v8 ignore next -- guard: the dialog only renders while pendingQuestions is set */
    if (!pendingQuestions) return;
    const truncated = pendingQuestions.slice(0, MAX_QUESTIONS);
    setPendingQuestions(null);
    setReadyQuestions(truncated);
  }

  function cancelTruncate() {
    setPendingQuestions(null);
    setFileName("");
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Adaptar direto do arquivo</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Envie o arquivo (PDF ou Word) — a atividade é adaptada automaticamente, inteira, preservando a
          ordem das questões e as imagens originais. Você já cai direto na edição da versão adaptada.
        </p>
      </div>

      <div
        onClick={() => {
          if (!readyQuestions) fileRef.current?.click();
        }}
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
          readyQuestions
            ? "cursor-not-allowed opacity-60"
            : "cursor-pointer hover:border-primary hover:bg-primary/5"
        }`}
      >
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="hidden"
          data-upload-input
          disabled={!!readyQuestions}
          onChange={handleFileInputChange}
        />
        {processing ? (
          <div className="flex flex-col items-center gap-3 py-2">
            <Loader2 className="w-12 h-12 animate-spin text-primary" />
            <p className="font-serif text-base text-foreground">"{fileName}"</p>
            <p className="text-sm text-muted-foreground">Lendo a atividade...</p>
            <p className="text-xs text-muted-foreground/70 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              Pode levar alguns minutos — não feche esta aba.
            </p>
          </div>
        ) : readyQuestions ? (
          <div className="flex flex-col items-center gap-2 text-primary">
            <CheckCircle2 className="w-8 h-8" />
            <p className="text-sm font-medium">Arquivo pronto para adaptar</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <Upload className="w-8 h-8 text-muted-foreground" />
            <p className="text-sm font-medium">Arraste um PDF ou Word aqui, ou clique para escolher</p>
          </div>
        )}
      </div>

      {readyQuestions && (
        <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/40 p-3">
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="w-4 h-4 text-primary shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{fileName}</p>
              <p className="text-xs text-muted-foreground">
                {readyQuestions.length} questão(ões) prontas para adaptar
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Remover arquivo"
            className="shrink-0 text-muted-foreground hover:text-destructive"
            onClick={handleRemoveFile}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-destructive">{error}</p>
      )}

      <div className="flex justify-between pt-2">
        <Button variant="outline" onClick={backToTabs} disabled={processing}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Voltar
        </Button>
        {readyQuestions && (
          <Button onClick={handleContinue}>
            Continuar
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        )}
      </div>

      <AlertDialog
        open={!!pendingQuestions}
        onOpenChange={(open) => {
          /* v8 ignore next -- no trigger opens this; Radix only fires open=false */
          if (!open) cancelTruncate();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Atividade com muitas questões</AlertDialogTitle>
            <AlertDialogDescription>
              Sua atividade tem {totalExtracted} questões — o limite para essa adaptação é {MAX_QUESTIONS}. Apenas
              as {MAX_QUESTIONS} primeiras serão adaptadas. Continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={cancelTruncate}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmTruncate}>Continuar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default StepUploadExam;
