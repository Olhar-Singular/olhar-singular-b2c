import type { SelectedQuestion } from "@/lib/adaptation/wizard/wizardState";

/**
 * Flatten selected bank questions into the plain-text activity used by the AI.
 *
 * A bank question may carry an `image_url`; multimodal isn't used, so the URL is
 * passed through as a text marker `[IMAGEM: <url>]` appended to that question.
 * The AI prompt instructs the model to turn that marker into a canonical image
 * block (same src) and to drop the literal marker from its output.
 */
export function buildActivityText(questions: SelectedQuestion[]): string {
  return questions
    .map((q, i) => {
      let text = `${i + 1}) ${q.text}`;
      if (q.options && Array.isArray(q.options)) {
        text += "\n" + q.options.map((o: string, j: number) => `   ${String.fromCharCode(65 + j)}) ${o}`).join("\n");
      }
      if (q.image_url) {
        text += `\n[IMAGEM: ${q.image_url}]`;
      }
      return text;
    })
    .join("\n\n");
}
