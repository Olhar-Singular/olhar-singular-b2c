/**
 * PdfBlock — PDF analogue of BlockView. Dispatches a single canonical block to
 * its react-pdf mapper. The `type` discriminant is exhaustive over the typed
 * Block union (same parity contract as the screen renderer's BlockView — every
 * block type has a mapper, nothing falls through to a default).
 *
 * A node requesting `pageBreakBefore` is wrapped in a <View break /> so
 * react-pdf paginates before it.
 *
 * `number` is the automatic question ordinal computed by the caller (the PDF
 * walker assigns it from document order). It is only meaningful for `question`
 * blocks.
 */

import { View } from "@react-pdf/renderer";
import type { Block } from "@/lib/adaptation/canonical/schema";
import { pageBreakBefore } from "./nodeStyleToPdf";
import { PdfHeading, PdfParagraph, PdfImage, PdfScaffolding, PdfDivider } from "./PdfLeafBlocks";
import { PdfMath } from "./PdfMath";
import { PdfQuestion } from "./PdfQuestion";

function dispatch(block: Block, number: number) {
  switch (block.type) {
    case "heading":
      return <PdfHeading block={block} />;
    case "paragraph":
      return <PdfParagraph block={block} />;
    case "blockMath":
      return <PdfMath block={block} />;
    case "image":
      return <PdfImage block={block} />;
    case "scaffolding":
      return <PdfScaffolding block={block} />;
    case "divider":
      return <PdfDivider block={block} />;
    case "question":
      return <PdfQuestion block={block} number={number} />;
  }
}

export function PdfBlock({ block, number = 1 }: { block: Block; number?: number }) {
  const node = dispatch(block, number);
  if (pageBreakBefore(block.style)) {
    return <View break>{node}</View>;
  }
  return node;
}

export default PdfBlock;
