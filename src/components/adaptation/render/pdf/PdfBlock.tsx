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
 *
 * `blockGap` is the doc-level inter-block gap in pt (resolved from pageStyle).
 * It is passed to leaf mappers as the default marginBottom when the block has
 * no per-block `style.spacingAfter`.
 */

import { View } from "@react-pdf/renderer";
import type { Block } from "@/lib/adaptation/canonical/schema";
import { pageBreakBefore } from "./nodeStyleToPdf";
import { PdfHeading, PdfParagraph, PdfImage, PdfScaffolding, PdfDivider } from "./PdfLeafBlocks";
import { PdfMath } from "./PdfMath";
import { PdfQuestion } from "./PdfQuestion";
import { resolveElementFontSizes, resolvePageStyle, type ElementFontSizesPt } from "../pageStyle";

/** Sizes used when a block is rendered standalone (tests, isolated mappers). */
const DEFAULT_ELEMENT_SIZES = resolveElementFontSizes(resolvePageStyle());

function dispatch(
  block: Block,
  number: number,
  blockGap: number,
  elementSizes: ElementFontSizesPt,
) {
  switch (block.type) {
    case "heading":
      return <PdfHeading block={block} blockGap={blockGap} />;
    case "paragraph":
      return <PdfParagraph block={block} blockGap={blockGap} />;
    case "blockMath":
      return <PdfMath block={block} blockGap={blockGap} />;
    case "image":
      return <PdfImage block={block} elementSizes={elementSizes} />;
    case "scaffolding":
      return <PdfScaffolding block={block} />;
    case "divider":
      return <PdfDivider block={block} />;
    case "question":
      return <PdfQuestion block={block} number={number} elementSizes={elementSizes} />;
  }
}

export function PdfBlock({
  block,
  number = 1,
  blockGap = 12,
  elementSizes = DEFAULT_ELEMENT_SIZES,
}: {
  block: Block;
  number?: number;
  blockGap?: number;
  elementSizes?: ElementFontSizesPt;
}) {
  const node = dispatch(block, number, blockGap, elementSizes);
  if (pageBreakBefore(block.style)) {
    return <View break>{node}</View>;
  }
  return node;
}

export default PdfBlock;
