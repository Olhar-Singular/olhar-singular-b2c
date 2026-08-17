/**
 * Pure projection of a CanonicalDocument to plain text, used by the "Copiar"
 * action on the export step. Mirrors the visual reading order of the renderer
 * (stem, instruction, then answers) without any markup.
 *
 * THE ANSWER KEY IS HIDDEN, exactly as in every other output surface
 * (AnswerView on screen, PdfAnswer in the PDF, exportDocx in Word): blank
 * markers for trueFalse/checkbox, `ordering` left in AUTHORED order (sorting it
 * by `position` would BE the key), and `fillBlank` rendering nothing (its blanks
 * live inline in the stem). "Copiar" sits next to the two export buttons and is
 * used to paste the sheet into Word or an e-mail — leaking the gabarito here
 * hands it to the students in one click.
 */

import type { Block, CanonicalDocument, QuestionAnswer, RichText } from "./schema.ts";
import { indexToLetter } from "@/components/adaptation/render/letters";

function richTextToText(rt: RichText): string {
  return rt
    .map((node) => (node.type === "text" ? node.text : node.alt ?? node.latex))
    .join("");
}

function answerToLines(answer: QuestionAnswer): string[] {
  switch (answer.kind) {
    case "open":
      return [];
    case "multipleChoice":
      return answer.alternatives.map(
        (alt, i) => `${indexToLetter(i)}) ${richTextToText(alt.content)}`,
      );
    case "trueFalse":
      // Blank markers for the student to fill — never the authored value.
      return answer.items.map((item) => `(  ) V  (  ) F ${richTextToText(item.content)}`);
    case "checkbox":
      // Every box empty, whatever `checked` says.
      return answer.items.map((item) => `[ ] ${richTextToText(item.content)}`);
    case "matching":
      // The pairing is the STRUCTURE of the exercise, not the key (same call the
      // PDF and Word mappers make), so both sides are kept.
      return answer.pairs.map(
        (pair) => `${richTextToText(pair.left)} <-> ${richTextToText(pair.right)}`,
      );
    case "ordering":
      // AUTHORED order, not sorted by `position`: sorting would print the key.
      // A blank slot mirrors the "____" marker of the screen and PDF renderers.
      return answer.items.map((item) => `____ ${richTextToText(item.content)}`);
    case "fillBlank":
      // The blanks live inline in the stem; `gaps` is only the answer key.
      return [];
    case "table":
      return answer.rows.map((row) => row.map(richTextToText).join(" | "));
  }
}

/**
 * Project a block to plain-text lines. Questions are auto-numbered: `number` is
 * the question's 1-based ordinal in document order, computed by the caller (the
 * block itself stores no ordinal), and `block.customNumber` overrides it when
 * the teacher typed one. Non-question blocks ignore `number`.
 */
function blockToLines(block: Block, number: number): string[] {
  switch (block.type) {
    case "heading":
    case "paragraph":
      return [richTextToText(block.content)];
    case "blockMath":
      return [block.alt ?? block.latex];
    case "image":
      return block.caption ? [richTextToText(block.caption)] : [];
    case "scaffolding":
      return block.items.map((item) => `- ${item}`);
    case "divider":
      return ["---"];
    case "question": {
      // Same label the screen (QuestionView), the PDF (PdfQuestion) and Word
      // (exportDocx) print: the authored `customNumber` wins over the ordinal,
      // and the separator is "." so the copied text keeps questions ("1.")
      // visually apart from alternatives ("a)").
      const prefix = `${block.customNumber ?? number}. `;
      let questionCount = 0;
      const stem = block.stem.flatMap((child) =>
        blockToLines(child, child.type === "question" ? ++questionCount : 0),
      );
      if (stem.length > 0) stem[0] = prefix + stem[0];
      const instruction = block.instruction ? [richTextToText(block.instruction)] : [];
      return [...stem, ...instruction, ...answerToLines(block.answer)];
    }
  }
}

/** Project a CanonicalDocument to plain text (blocks separated by blank lines). */
export function documentToPlainText(document: CanonicalDocument): string {
  let questionCount = 0;
  return document.blocks
    .map((block) =>
      blockToLines(block, block.type === "question" ? ++questionCount : 0).join("\n"),
    )
    .join("\n\n");
}
