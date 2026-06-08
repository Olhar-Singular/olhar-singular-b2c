/**
 * Pure lookup: the current `NodeStyle` of a block by id, searching top-level
 * blocks and question stems. Returns an empty object when the block has no
 * style or is not found, so the Estilo controls always render against a defined
 * style object.
 */

import type { CanonicalDocument, NodeStyle } from "@/lib/adaptation/canonical/schema";

export function findBlockStyle(document: CanonicalDocument, blockId: string): NodeStyle {
  for (const block of document.blocks) {
    if (block.id === blockId) return block.style ?? {};
    if (block.type === "question") {
      const stem = block.stem.find((s) => s.id === blockId);
      if (stem) return stem.style ?? {};
    }
  }
  return {};
}
