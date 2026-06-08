/**
 * Document-level style helper for the canonical document.
 *
 * `applyStyleToAllBlocks` merges a `NodeStyle` into EVERY block of the document
 * at once — the "apply to all" control in the Estilo step. The merge walks the
 * full block tree (top-level blocks plus question stems) so the document gets a
 * uniform look in a single edit.
 *
 * Merge semantics mirror the per-block patch in `StylingSurface`: the provided
 * keys override the block's existing style; keys whose value is `undefined`
 * are dropped (clearing that style); a block whose resulting style is empty
 * carries no `style` property at all. Pure and non-mutating.
 */

import type { Block, CanonicalDocument, NodeStyle } from "./schema.ts";

function mergeStyle(existing: NodeStyle | undefined, patch: NodeStyle): NodeStyle | undefined {
  const next: NodeStyle = { ...existing, ...patch };
  for (const key of Object.keys(next) as (keyof NodeStyle)[]) {
    if (next[key] === undefined) delete next[key];
  }
  return Object.keys(next).length > 0 ? next : undefined;
}

function applyToBlock(block: Block, patch: NodeStyle): Block {
  const merged = mergeStyle(block.style, patch);
  const { style: _drop, ...rest } = block as Block & { style?: NodeStyle };
  const base = (merged ? { ...rest, style: merged } : { ...rest }) as Block;

  if (base.type === "question") {
    return { ...base, stem: base.stem.map((b) => applyToBlock(b, patch)) };
  }
  return base;
}

/**
 * Return a new document with `style` merged into every block (top-level and
 * question-stem). The input document is never mutated.
 */
export function applyStyleToAllBlocks(
  document: CanonicalDocument,
  style: NodeStyle,
): CanonicalDocument {
  return {
    ...document,
    blocks: document.blocks.map((b) => applyToBlock(b, style)),
  };
}
