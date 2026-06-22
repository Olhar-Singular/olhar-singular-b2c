/**
 * PdfMath — isolated block-math node mapper (v1). Renders the LaTeX source as
 * monospace text so it can be swapped for a high-fidelity renderer later
 * without touching the rest of the PDF mappers (see mathToPdfText TODO).
 *
 * Layout note: the outer <View> carries block spacing so Yoga can account for
 * it correctly when mixed with <View> siblings (same reason as PdfParagraph).
 *
 * `blockGap` (in pt) is the doc-level default inter-block gap resolved from
 * pageStyle. A per-block `style.spacingAfter` overrides it.
 */

import { View, Text } from "@react-pdf/renderer";
import type { Block } from "@/lib/adaptation/canonical/schema";
import { nodeStyleToPdf } from "./nodeStyleToPdf";
import { mathToPdfText, MATH_PDF_STYLE } from "./mathToPdfText";

type BlockMathBlock = Extract<Block, { type: "blockMath" }>;

export function PdfMath({ block, blockGap = 12 }: { block: BlockMathBlock; blockGap?: number }) {
  const nodeStyle = nodeStyleToPdf(block.style);
  const { marginBottom: nodeMarginBottom, ...textStyle } = nodeStyle;
  const marginBottom = nodeMarginBottom ?? blockGap;
  return (
    <View style={{ marginVertical: marginBottom }}>
      <Text style={{ ...MATH_PDF_STYLE, textAlign: "center", ...textStyle }}>
        {mathToPdfText(block.latex)}
      </Text>
    </View>
  );
}

export default PdfMath;
