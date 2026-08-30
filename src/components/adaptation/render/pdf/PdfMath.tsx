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
 *
 * Alinhamento: as duas telas centram SEMPRE o bloco, então o papel centra a
 * CAIXA da fórmula em vez de centrar o texto — centrar o texto punha cada
 * metade da fórmula quebrada num recuo diferente (achado 0431). Mas uma caixa
 * só encolhe ao conteúdo enquanto o conteúdo cabe: com um `<Text>` único mais
 * largo que a coluna o Yoga clampava a caixa na coluna inteira e o
 * `alignItems: "center"` virava no-op, com a fórmula longa saindo colada na
 * margem (achado 0433). Por isso a quebra é decidida por nós
 * (`mathBlockLines`): cada linha é um `<Text>` que cabe, a caixa interna mede a
 * linha mais larga e centra de verdade, e as linhas continuam começando todas
 * na mesma coluna dentro dela. Um `style.align` explícito do nó vence, como
 * vence na tela pelo style inline.
 */

import { View, Text } from "@react-pdf/renderer";
import type { Block } from "@/lib/adaptation/canonical/schema";
import { nodeStyleToPdf } from "./nodeStyleToPdf";
import { mathBlockLines, MATH_PDF_STYLE } from "./mathToPdfText";

type BlockMathBlock = Extract<Block, { type: "blockMath" }>;

/** Onde a caixa da fórmula encosta na coluna, por alinhamento do nó. */
const BOX_ALIGN = {
  left: "flex-start",
  center: "center",
  right: "flex-end",
  justify: "flex-start",
} as const;

export function PdfMath({ block, blockGap = 12 }: { block: BlockMathBlock; blockGap?: number }) {
  const nodeStyle = nodeStyleToPdf(block.style);
  const { marginBottom: nodeMarginBottom, textAlign: nodeTextAlign, ...textStyle } = nodeStyle;
  const marginBottom = nodeMarginBottom ?? blockGap;
  const alignItems = nodeTextAlign ? BOX_ALIGN[nodeTextAlign as keyof typeof BOX_ALIGN] : "center";
  return (
    <View style={{ marginVertical: marginBottom, alignItems }}>
      <View>
        {mathBlockLines(block.latex).map((line, i) => (
          <Text key={i} style={{ ...MATH_PDF_STYLE, textAlign: "left", ...textStyle }}>
            {line}
          </Text>
        ))}
      </View>
    </View>
  );
}

export default PdfMath;
