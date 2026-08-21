export type ExamExtractedQuestion = {
  text: string;
  options?: string[] | null;
  image_url?: string | null;
};

/**
 * Flatten questions extracted from an uploaded exam (extract-exam-for-adaptation)
 * into the plain-text activity used by adapt-activity, in extraction order.
 *
 * Mirrors the `[IMAGEM: <url>]` marker convention of `buildActivityText.ts` (the
 * bank-picker equivalent): `image_url` is expected to already be a resolved,
 * uploaded URL (figure cropping/upload happens before this call), not a raw
 * bounding box.
 */
export function buildActivityTextFromExtraction(questions: ExamExtractedQuestion[]): string {
  return questions
    .map((q, i) => {
      let text = `${i + 1}) ${q.text}`;
      if (q.options && Array.isArray(q.options) && q.options.length > 0) {
        text += "\n" + q.options.map((o, j) => `   ${String.fromCharCode(65 + j)}) ${o}`).join("\n");
      }
      if (q.image_url) {
        text += `\n[IMAGEM: ${q.image_url}]`;
      }
      return text;
    })
    .join("\n\n");
}
