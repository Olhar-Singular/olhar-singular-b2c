/**
 * Transaction builders for the question-card actions that mutate the document
 * structure: moving a top-level block up/down and inserting images (into a
 * question's stem, or as siblings of an image block).
 *
 * These take an `EditorState` and return a `Transaction` (or null) so they can
 * be unit-tested against the real ProseMirror schema without a browser/view —
 * the NodeView just dispatches the result. The position math lives in the pure
 * `blockMove` module.
 */

import type { Node as PMNode } from "@tiptap/pm/model";
import type { EditorState, Transaction } from "@tiptap/pm/state";
import { questionSwapTarget, stemInsertPos, type MoveDirection } from "./blockMove";

/**
 * Build a transaction that swaps the question at `pos` with the nearest question
 * in direction `dir`, skipping any non-question blocks between them. Returns null
 * when no adjacent question exists in that direction.
 *
 * The swap is done in two steps applied to the same transaction:
 *  1. Replace the LATER node with the EARLIER node (high position first, so the
 *     lower position stays valid for step 2).
 *  2. Replace the EARLIER node with the LATER node.
 * Non-question blocks that lie between the two questions remain in place.
 */
export function buildMoveTransaction(
  state: EditorState,
  pos: number,
  dir: MoveDirection,
): Transaction | null {
  const target = questionSwapTarget(state.doc, pos, dir);
  if (!target) return null;

  const { posFirst, nodeFirst, posSecond, nodeSecond } = target;
  const tr = state.tr;
  // Step 1: replace the later node with the earlier node (posSecond > posFirst,
  // so this doesn't shift posFirst).
  tr.replaceWith(posSecond, posSecond + nodeSecond.nodeSize, nodeFirst);
  // Step 2: replace the earlier node with the later node.
  tr.replaceWith(posFirst, posFirst + nodeFirst.nodeSize, nodeSecond);
  return tr;
}

/** Minimal canonical image shape needed to build the PM image node. */
export interface StemImage {
  id: string;
  src: string;
  alt: string;
  alignment: string | null;
}

/** Materialize a batch of canonical images as PM `image` nodes, in order. */
function imageNodes(state: EditorState, images: StemImage[]) {
  return images.map((image) =>
    state.schema.nodes.image.create({
      id: image.id,
      src: image.src,
      alt: image.alt,
      alignment: image.alignment,
    }),
  );
}

/**
 * Build a transaction that appends `images` as the last stem children of the
 * question block at `pos`.
 *
 * Takes the WHOLE batch (achado 0318): the image modal is multi-select from end
 * to end ("Inserir (3)"), so dropping everything past the first silently threw
 * away the user's input.
 */
export function buildStemImagesTransaction(
  state: EditorState,
  pos: number,
  images: StemImage[],
): Transaction {
  return state.tr.insert(stemInsertPos(state.doc, pos), imageNodes(state, images));
}

/**
 * Build a transaction that inserts `images` right after the block at `pos`, as
 * siblings. Used by the image block when the modal returns a batch: the first
 * image replaces the block itself and the remainder lands just below it
 * (achado 0318). Returns null when there is no node at `pos`.
 */
export function buildSiblingImagesTransaction(
  state: EditorState,
  pos: number,
  images: StemImage[],
): Transaction | null {
  const node = state.doc.resolve(pos).nodeAfter;
  if (!node) return null;
  return state.tr.insert(pos + node.nodeSize, imageNodes(state, images));
}

// ---------------------------------------------------------------------------
// fillBlank: manter a lacuna impressa e o gabarito casados (achado 0503)
// ---------------------------------------------------------------------------

/**
 * A lacuna impressa é o texto literal `___` dentro do enunciado; o gabarito é
 * uma entrada de `answer.gaps[]`. O card oferecia `+ Lacuna` / `Remover lacuna`
 * mexendo só no array, então o professor ficava com gabarito a mais (sem lacuna
 * no papel) ou, pior, com os gabaritos seguintes deslocados um `___` para trás.
 * Estes dois builders dão ao card o outro lado da operação: o enunciado.
 */
const BLANK = "___";

/** O nó `question` na posição dada, ou null se ali não houver uma questão. */
function questionAt(doc: PMNode, pos: number): PMNode | null {
  const node = doc.resolve(pos).nodeAfter;
  return node?.type.name === "question" ? node : null;
}

/**
 * Trailing whitespace and sentence punctuation the new blank must stay before
 * (achado 0370: "pela ___ ." virava "pela ___ . ___", lacuna órfã fora da frase).
 */
const TRAILING_PUNCTUATION = /[\s.?!:;…]*$/;

/**
 * Add a printable blank at the end of the question's last stem text block,
 * before its final punctuation. Returns null when the position holds no
 * question, or when the stem has no text block to hold the blank (ex.:
 * enunciado só com imagem).
 */
export function buildAddGapTransaction(state: EditorState, pos: number): Transaction | null {
  const question = questionAt(state.doc, pos);
  if (!question) return null;

  let target: { node: PMNode; offset: number } | null = null;
  question.forEach((child, offset) => {
    if (child.isTextblock) target = { node: child, offset };
  });
  if (!target) return null;

  const { node, offset } = target as { node: PMNode; offset: number };
  // +1 entra na questão, +1 entra no bloco de texto.
  const blockStart = pos + 1 + offset + 1;
  // Only a trailing text run can carry the final punctuation; after an inline
  // formula the blank simply goes at the end.
  const last = node.lastChild;
  const tail = last?.isText ? (last.text as string).match(TRAILING_PUNCTUATION)![0].length : 0;
  const insertAt = blockStart + node.content.size - tail;
  const before = state.doc.textBetween(blockStart, insertAt, "", "\ufffc");
  const separator = before.length > 0 && !/\s$/.test(before) ? " " : "";
  return state.tr.insertText(separator + BLANK, insertAt);
}

/** Every character of the question's stem text, paired with its doc position. */
function stemChars(doc: PMNode, pos: number, question: PMNode): { chars: string; at: number[] } {
  let chars = "";
  const at: number[] = [];
  doc.nodesBetween(pos + 1, pos + question.nodeSize - 1, (node, nodePos) => {
    if (!node.isText) return;
    // `textContent` de um nó de texto é o próprio texto, e é sempre string.
    const text = node.textContent;
    for (let i = 0; i < text.length; i++) {
      chars += text[i];
      at.push(nodePos + i);
    }
  });
  return { chars, at };
}

/**
 * Remove the `index`-th blank (0-based, in reading order) from the question's
 * stem. Returns null when the position holds no question or the stem has fewer
 * blanks than that — o card então só mexe no gabarito, como antes.
 */
export function buildRemoveGapTransaction(
  state: EditorState,
  pos: number,
  index: number,
): Transaction | null {
  const question = questionAt(state.doc, pos);
  if (!question) return null;

  const { chars, at } = stemChars(state.doc, pos, question);
  let found = -1;
  let cursor = 0;
  for (let i = 0; i <= index; i++) {
    found = chars.indexOf(BLANK, cursor);
    if (found === -1) return null;
    cursor = found + BLANK.length;
  }
  return state.tr.delete(at[found], at[found + BLANK.length - 1] + 1);
}
