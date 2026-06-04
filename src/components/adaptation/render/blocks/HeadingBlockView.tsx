/**
 * HeadingBlockView — read-only render of a canonical heading block. The
 * authored `level` (1/2/3) drives the semantic tag; no heuristic re-derivation.
 */

import type { Block } from "@/lib/adaptation/canonical/schema";
import { nodeStyleToCss } from "../style";
import { RichTextView } from "../RichTextView";

type HeadingBlock = Extract<Block, { type: "heading" }>;

const LEVEL_CLASS: Record<1 | 2 | 3, string> = {
  1: "text-2xl font-bold",
  2: "text-xl font-semibold",
  3: "text-lg font-semibold",
};

export function HeadingBlockView({ block }: { block: HeadingBlock }) {
  const Tag = `h${block.level}` as const;
  return (
    <Tag className={LEVEL_CLASS[block.level]} style={nodeStyleToCss(block.style)}>
      <RichTextView content={block.content} />
    </Tag>
  );
}

export default HeadingBlockView;
