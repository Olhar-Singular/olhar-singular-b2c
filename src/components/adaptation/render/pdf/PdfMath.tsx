/**
 * PdfMath — isolated block-math node mapper (v1). Renders the LaTeX source as
 * monospace text so it can be swapped for a high-fidelity renderer later
 * without touching the rest of the PDF mappers (see mathToPdfText TODO).
 */

import { Text } from "@react-pdf/renderer";
import type { Block } from "@/lib/adaptation/canonical/schema";
import { nodeStyleToPdf } from "./nodeStyleToPdf";
import { mathToPdfText, MATH_PDF_STYLE } from "./mathToPdfText";

type BlockMathBlock = Extract<Block, { type: "blockMath" }>;

export function PdfMath({ block }: { block: BlockMathBlock }) {
  return (
    <Text style={{ ...MATH_PDF_STYLE, textAlign: "center", marginVertical: 6, ...nodeStyleToPdf(block.style) }}>
      {mathToPdfText(block.latex)}
    </Text>
  );
}

export default PdfMath;
