/**
 * BlockView — dispatches a single canonical block to its read-only view.
 *
 * Kept in its own module (separate from CanonicalRenderer) so QuestionView can
 * import it to render recursive stem blocks without a circular module cycle.
 * The `type` discriminant is exhaustive over the typed Block union.
 *
 * `number` is the automatic question ordinal computed by the caller (the
 * renderer walks blocks in order). It is only meaningful for `question` blocks.
 */

import type { Block } from "@/lib/adaptation/canonical/schema";
import { HeadingBlockView } from "./blocks/HeadingBlockView";
import { ParagraphBlockView } from "./blocks/ParagraphBlockView";
import { BlockMathView } from "./blocks/BlockMathView";
import { ImageBlockView } from "./blocks/ImageBlockView";
import { ScaffoldingView } from "./blocks/ScaffoldingView";
import { DividerView } from "./blocks/DividerView";
import { QuestionView } from "./blocks/QuestionView";

export function BlockView({ block, number = 1 }: { block: Block; number?: number }) {
  switch (block.type) {
    case "heading":
      return <HeadingBlockView block={block} />;
    case "paragraph":
      return <ParagraphBlockView block={block} />;
    case "blockMath":
      return <BlockMathView block={block} />;
    case "image":
      return <ImageBlockView block={block} />;
    case "scaffolding":
      return <ScaffoldingView block={block} />;
    case "divider":
      return <DividerView block={block} />;
    case "question":
      return <QuestionView block={block} number={number} />;
  }
}

export default BlockView;
