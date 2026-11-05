/**
 * Automatic question numbering shared by the screen renderer and the PDF.
 *
 * Questions carry no stored `number` — the displayed number is derived purely
 * from each question's position among the document's top-level blocks. Both
 * renderers walk `document.blocks` in order and assign 1, 2, 3, … to question
 * blocks (non-question blocks get `undefined`).
 */

import type { Block } from "@/lib/adaptation/canonical/schema";

/**
 * Map each top-level block (by index) to its 1-based question ordinal, or
 * `undefined` for non-question blocks. The returned array is index-aligned with
 * `blocks`, so callers can pass `numbers[i]` straight to the block view.
 */
export function questionNumbers(blocks: readonly Block[]): Array<number | undefined> {
  let count = 0;
  return blocks.map((block) => {
    if (block.type === "question") {
      count += 1;
      return count;
    }
    return undefined;
  });
}

/**
 * The number the sheet prints for each top-level question, in order: `customNumber`
 * when set, otherwise the ordinal. Used to name a question in a notice the way the
 * teacher sees it.
 */
export function sheetQuestionLabels(blocks: readonly Block[]): string[] {
  const numbers = questionNumbers(blocks);
  return blocks.flatMap((block, i) =>
    block.type === "question" ? [block.customNumber ?? String(numbers[i])] : [],
  );
}
