import { htmlToText } from "@/lib/utils/htmlText";
import type { SelectedQuestion } from "@/lib/adaptation/wizard/wizardState";

/**
 * Flatten selected bank questions into the plain-text activity used by the AI.
 *
 * A bank question may carry an `image_url`; multimodal isn't used, so the URL is
 * passed through as a text marker `[IMAGEM: <url>]` appended to that question.
 * Questions saved by the Editor Manual are HTML (and old ones stay that way): they go out as
 * text, tags removed and sup/sub written as `^`/`_` (C-32), so the AI and the field the
 * teacher reads see the same thing and an exponent never turns into a digit glued to the base.
 *
 * The AI prompt instructs the model to turn that marker into a canonical image
 * block (same src) and to drop the literal marker from its output.
 */
export function buildActivityText(questions: SelectedQuestion[]): string {
  return questions
    .map((q, i) => {
      let text = `${i + 1}) ${htmlToText(q.text)}`;
      if (q.options && Array.isArray(q.options)) {
        text += "\n" + q.options.map((o: string, j: number) => `   ${String.fromCharCode(65 + j)}) ${htmlToText(o)}`).join("\n");
      }
      if (q.image_url) {
        text += `\n[IMAGEM: ${q.image_url}]`;
      }
      return text;
    })
    .join("\n\n");
}
