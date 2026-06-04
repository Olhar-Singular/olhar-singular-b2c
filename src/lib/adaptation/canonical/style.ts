/**
 * Pure style-mutation helpers for the canonical document.
 *
 * `setBlockStyle` returns a new document with the matching block's `style`
 * replaced. It walks the full block tree (top-level blocks plus question stems
 * and multipleChoice nested blocks) so any block id in the document can be
 * targeted. An empty style object is normalized to "no style".
 */

import type { Block, CanonicalDocument, NodeStyle } from "./schema";

function styleOrUndefined(style: NodeStyle): NodeStyle | undefined {
  return Object.keys(style).length > 0 ? style : undefined;
}

function applyToBlock(block: Block, blockId: string, style: NodeStyle): Block {
  if (block.id === blockId) {
    const next = styleOrUndefined(style);
    const { style: _drop, ...rest } = block as Block & { style?: NodeStyle };
    return (next ? { ...rest, style: next } : { ...rest }) as Block;
  }

  if (block.type === "question") {
    const stem = block.stem.map((b) => applyToBlock(b, blockId, style));
    let answer = block.answer;
    if (answer.kind === "multipleChoice") {
      answer = {
        ...answer,
        alternatives: answer.alternatives.map((alt) =>
          alt.nested
            ? { ...alt, nested: alt.nested.map((b) => applyToBlock(b, blockId, style)) }
            : alt,
        ),
      };
    }
    return { ...block, stem, answer };
  }

  return block;
}

/**
 * Return a new document with the style of the block identified by `blockId`
 * replaced by `style`. If no block matches, the document is returned with new
 * top-level references but identical content.
 */
export function setBlockStyle(
  document: CanonicalDocument,
  blockId: string,
  style: NodeStyle,
): CanonicalDocument {
  return {
    ...document,
    blocks: document.blocks.map((b) => applyToBlock(b, blockId, style)),
  };
}
