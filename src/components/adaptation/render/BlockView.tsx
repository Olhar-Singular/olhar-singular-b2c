/**
 * BlockView — dispatches a single canonical block to its read-only view.
 *
 * Kept in its own module (separate from CanonicalRenderer) so QuestionView can
 * import it to render recursive stem blocks without a circular module cycle.
 * The `type` discriminant is exhaustive over the typed Block union.
 */

import type { Block } from "@/lib/adaptation/canonical/schema";
import { HeadingBlockView } from "./blocks/HeadingBlockView";
import { ParagraphBlockView } from "./blocks/ParagraphBlockView";
import { BlockMathView } from "./blocks/BlockMathView";
import { ImageBlockView } from "./blocks/ImageBlockView";
import { ScaffoldingView } from "./blocks/ScaffoldingView";
import { DividerView } from "./blocks/DividerView";
import { QuestionView } from "./blocks/QuestionView";

export function BlockView({ block }: { block: Block }) {
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
      return <QuestionView block={block} />;
  }
}

export default BlockView;
