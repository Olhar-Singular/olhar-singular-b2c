export type ExamExtractedQuestion = {
  text: string;
  options?: string[] | null;
  image_url?: string | null;
  /** What the vision extraction saw in the figure; the only real description the text-only adaptation gets. */
  figure_description?: string | null;
};

/**
 * A question label the extraction may copy verbatim from the native PDF text
 * ("1) ", "2. ", "Questão 3:", "Q4 -"), mirroring the numbering patterns listed in
 * the OCR prompt. Bare numbers need a ")" or "." plus whitespace so content such as
 * "10 pessoas" or "1,5 litro" is kept.
 */
const LEADING_QUESTION_LABEL = /^\s*(?:(?:quest[aã]o|q)\s*\d+\s*[.):\-–]?|\d+\s*[.)])\s+/iu;

/**
 * Flatten questions extracted from an uploaded exam (extract-exam-for-adaptation)
 * into the plain-text activity used by adapt-activity, in extraction order.
 *
 * Mirrors the `[IMAGEM: <url>]` marker convention of `buildActivityText.ts` (the
 * bank-picker equivalent): `image_url` is expected to already be a resolved,
 * uploaded URL (figure cropping/upload happens before this call), not a raw
 * bounding box. The extraction's `figure_description` follows the marker as
 * `[DESCRIÇÃO DA IMAGEM: ...]`, since adapt-activity never sees the image and
 * would otherwise invent the alt text. A label already present in `q.text` is dropped so the numbering is
 * not doubled ("1) 1) ...").
 */
export function buildActivityTextFromExtraction(questions: ExamExtractedQuestion[]): string {
  return questions
    .map((q, i) => {
      let text = `${i + 1}) ${q.text.replace(LEADING_QUESTION_LABEL, "")}`;
      if (q.options && Array.isArray(q.options) && q.options.length > 0) {
        text += "\n" + q.options.map((o, j) => `   ${String.fromCharCode(65 + j)}) ${o}`).join("\n");
      }
      if (q.image_url) {
        text += `\n[IMAGEM: ${q.image_url}]`;
        // Brackets are stripped so the description can neither close its own
        // marker early nor forge an [IMAGEM:] marker for imageSourceGuard.
        const description = (q.figure_description ?? "").replace(/[[\]]/g, "").trim();
        if (description) text += `\n[DESCRIÇÃO DA IMAGEM: ${description}]`;
      }
      return text;
    })
    .join("\n\n");
}
