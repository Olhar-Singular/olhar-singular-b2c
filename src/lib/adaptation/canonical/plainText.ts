/**
 * Pure projection of a CanonicalDocument to plain text, used by the "Copiar"
 * action on the export step. Mirrors the visual reading order of the renderer
 * (stem, instruction, then answers) without any markup.
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
      return answer.items.map(
        (item) => `( ${item.value ? "V" : "F"} ) ${richTextToText(item.content)}`,
      );
    case "checkbox":
      return answer.items.map(
        (item) => `[${item.checked ? "x" : " "}] ${richTextToText(item.content)}`,
      );
    case "matching":
      return answer.pairs.map(
        (pair) => `${richTextToText(pair.left)} — ${richTextToText(pair.right)}`,
      );
    case "ordering":
      return [...answer.items]
        .sort((a, b) => a.position - b.position)
        .map((item, i) => `${i + 1}. ${richTextToText(item.content)}`);
    case "fillBlank":
      return answer.gaps.map((gap, i) => `(${i + 1}) ${gap.answer}`);
    case "table":
      return answer.rows.map((row) => row.map(richTextToText).join(" | "));
  }
}

/**
 * Project a block to plain-text lines. Questions are auto-numbered: `number` is
 * the question's 1-based ordinal in document order, computed by the caller (the
 * block itself stores no number). Non-question blocks ignore `number`.
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
      const prefix = `${number}) `;
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
