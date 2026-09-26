import { supabase } from "@/integrations/supabase/client";
import { autoCropFromBbox } from "@/lib/utils/extraction-utils";
import { uploadImageDataUrl } from "@/lib/utils/imageUpload";
import { parseInvokeError } from "@/lib/utils/errors";
import type { UploadedExam } from "@/lib/adaptation/wizard/wizardState";
import type { ExamExtractedQuestion } from "./buildActivityTextFromExtraction";

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
  return uploadImageDataUrl(dataUrl, userId);
}

export type ExtractExamQuestionsResult =
  /** `charged`: this call ran (and paid for) the extraction; false when it reused one. */
  | { status: "ok"; questions: ExamExtractedQuestion[]; charged: boolean }
  /** The extraction ran (and was charged) but found no question. */
  | { status: "empty" }
  /** 402: the balance does not cover the extraction; nothing was charged. */
  | { status: "insufficient_credits" };

/**
 * Successful extractions, per attached file. The extraction is charged
 * (EXTRACTION_COST), so "Tentar novamente" after a failed adaptation, the
 * >12-question detour and "Regerar" reuse it instead of paying again. Keyed by
 * the UploadedExam object itself: attaching a file always creates a new one
 * (StepUploadExam), and the WeakMap lets a dropped file take its entry along.
 */
const extractionCache = new WeakMap<UploadedExam, ExamExtractedQuestion[]>();

/**
 * Runs the AI vision extraction (extract-exam-for-adaptation) for a file
 * already parsed locally, and resolves each question's figure (if any) to an
 * uploaded image URL. Charged (EXTRACTION_COST, on top of the adaptation).
 * Called from "Gerar" only, right before adapt-activity, so nothing calls the
 * AI provider until the user actually commits to generating (see uploadedExam
 * on WizardData).
 */
export async function extractExamQuestions(
  exam: UploadedExam,
  userId: string,
  signal?: AbortSignal,
): Promise<ExtractExamQuestionsResult> {
  const cached = extractionCache.get(exam);
  if (cached) return { status: "ok", questions: cached, charged: false };

  const { data: fnResult, error: fnError } = await supabase.functions.invoke("extract-exam-for-adaptation", {
    body: {
      pdfText: exam.text,
      pdfFileName: exam.fileName,
      pageImages: exam.pageImages,
      // Idempotency key of the credit reservation: a replayed request can never
      // be charged twice. Fresh per attempt, since a real retry IS a new charge.
      request_id: crypto.randomUUID(),
    },
    signal,
  });
  if (fnError) {
    if ((fnError as { context?: { status?: number } }).context?.status === 402) {
      return { status: "insufficient_credits" };
    }
    const msg = await parseInvokeError(fnError, "Não foi possível processar o arquivo enviado. Tente novamente.");
    throw new Error(msg);
  }

  const rawQuestions: RawExtractedQuestion[] = fnResult?.questions ?? [];
  if (rawQuestions.length === 0) return { status: "empty" };

  const resolved: ExamExtractedQuestion[] = [];
  for (const q of rawQuestions) {
    const image_url = await resolveImageUrl(exam.fileType, q, exam.pageImages, userId);
    resolved.push({ text: q.text, options: q.options && q.options.length > 0 ? q.options : null, image_url });
  }
  extractionCache.set(exam, resolved);
  return { status: "ok", questions: resolved, charged: true };
}
