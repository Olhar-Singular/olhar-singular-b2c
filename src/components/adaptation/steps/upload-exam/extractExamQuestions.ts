import { supabase } from "@/integrations/supabase/client";
import { autoCropFromBbox, dataUrlToBlob } from "@/lib/utils/extraction-utils";
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

export type ExtractExamQuestionsResult =
  | { status: "ok"; questions: ExamExtractedQuestion[] }
  | { status: "empty" };

/**
 * Runs the AI vision extraction (extract-exam-for-adaptation) for a file
 * already parsed locally, and resolves each question's figure (if any) to an
 * uploaded image URL. Free — no credit charge. Called from "Gerar" only, right
 * before adapt-activity, so nothing calls the AI provider until the user
 * actually commits to generating (see uploadedExam on WizardData).
 */
export async function extractExamQuestions(
  exam: UploadedExam,
  userId: string,
  signal?: AbortSignal,
): Promise<ExtractExamQuestionsResult> {
  const { data: fnResult, error: fnError } = await supabase.functions.invoke("extract-exam-for-adaptation", {
    body: { pdfText: exam.text, pdfFileName: exam.fileName, pageImages: exam.pageImages },
    signal,
  });
  if (fnError) {
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
  return { status: "ok", questions: resolved };
}
