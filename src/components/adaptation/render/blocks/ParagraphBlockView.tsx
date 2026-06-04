/**
 * ParagraphBlockView — read-only render of a canonical paragraph block.
 */

import type { Block } from "@/lib/adaptation/canonical/schema";
import { nodeStyleToCss } from "../style";
import { RichTextView } from "../RichTextView";

type ParagraphBlock = Extract<Block, { type: "paragraph" }>;

export function ParagraphBlockView({ block }: { block: ParagraphBlock }) {
  return (
    <p style={nodeStyleToCss(block.style)}>
      <RichTextView content={block.content} />
    </p>
  );
}

export default ParagraphBlockView;
