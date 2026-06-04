/**
 * Pure helpers for the canonical-editor toolbar "insert block" actions.
 *
 * Each builder returns a ProseMirror node JSON (`PMNode`) ready to insert into
 * the editor at the current selection. The builders construct a canonical
 * `Block` first and map it through `canonicalToProseMirror`, so the inserted
 * nodes are guaranteed schema-valid (round-trip back to a valid canonical doc).
 *
 * `newId` is injected as `generate` for deterministic unit tests.
 */

import type { Block, QuestionAnswer } from "@/lib/adaptation/canonical/schema";
import { newId } from "@/lib/adaptation/canonical/ids";
import { canonicalToProseMirror, type PMNode } from "@/lib/adaptation/tiptap/fromCanonical";

type Generate = () => string;

export type QuestionKind = QuestionAnswer["kind"];

/** Map a single canonical block to its ProseMirror node JSON. */
function blockToNode(block: Block): PMNode {
  const doc = canonicalToProseMirror({ schemaVersion: 1, blocks: [block] });
  return (doc.content as PMNode[])[0];
}

/** Build an empty, schema-valid answer for the given kind. */
export function emptyAnswer(kind: QuestionKind, generate: Generate = newId): QuestionAnswer {
  switch (kind) {
    case "open":
      return { kind: "open", answerLines: 3 };
    case "multipleChoice":
      return {
        kind: "multipleChoice",
        alternatives: [
          { id: generate(), content: [], correct: true },
          { id: generate(), content: [], correct: false },
        ],
      };
    case "trueFalse":
      return {
        kind: "trueFalse",
        items: [{ id: generate(), content: [], value: true }],
      };
    case "checkbox":
      return {
        kind: "checkbox",
        items: [{ id: generate(), content: [], checked: false }],
      };
    case "matching":
      return {
        kind: "matching",
        pairs: [{ id: generate(), left: [], right: [] }],
      };
    case "ordering":
      return {
        kind: "ordering",
        items: [{ id: generate(), content: [], position: 0 }],
      };
    case "fillBlank":
      return {
        kind: "fillBlank",
        gaps: [{ id: generate(), answer: "" }],
      };
    /* v8 ignore next 2 -- exhaustive switch; QuestionKind admits no other value */
    case "table":
      return { kind: "table", rows: [[[], []]] };
  }
}

/** Build a question PM node seeded with an empty answer and a paragraph stem. */
export function buildQuestionNode(kind: QuestionKind, generate: Generate = newId): PMNode {
  const block: Block = {
    id: generate(),
    type: "question",
    stem: [{ id: generate(), type: "paragraph", content: [] }],
    answer: emptyAnswer(kind, generate),
  };
  return blockToNode(block);
}

/** Build an image PM node from a src (typically a data URL). */
export function buildImageNode(src: string, generate: Generate = newId): PMNode {
  const block: Block = { id: generate(), type: "image", src, alt: "" };
  return blockToNode(block);
}

/** Build a blockMath PM node. Defaults to a placeholder latex when omitted. */
export function buildMathNode(latex: string | undefined, generate: Generate = newId): PMNode {
  const block: Block = {
    id: generate(),
    type: "blockMath",
    latex: latex && latex.length > 0 ? latex : "x",
  };
  return blockToNode(block);
}

/** Build a scaffolding PM node with one starter step. */
export function buildScaffoldNode(generate: Generate = newId): PMNode {
  const block: Block = { id: generate(), type: "scaffolding", items: [""] };
  return blockToNode(block);
}
