/**
 * PdfRichText — PDF analogue of RichTextView. Projects a canonical `RichText`
 * array to react-pdf <Text> runs: text runs apply mark styles (bold/italic/
 * underline/strike) and an allowlisted color; inlineMath runs render as their
 * LaTeX source in a monospace style (v1 — see mathToPdfText).
 */

import { Text } from "@react-pdf/renderer";
import type { RichText } from "@/lib/adaptation/canonical/schema";
import { mathToPdfText, mathPdfInlineStyle } from "./mathToPdfText";
import { marksToPdfStyle } from "./richTextPdf";
import { BASE_FONT_PT } from "../pageTokens";

export function PdfRichText({
  content,
  fontSize = BASE_FONT_PT,
}: {
  content: RichText;
  /**
   * Corpo (pt) do <Text> que HOSPEDA estes runs: enunciado, instrução, legenda
   * ou o corpo do documento. A fórmula é dimensionada a partir dele, como na
   * tela, onde o `em` do KaTeX mede o mesmo pai — sem isso ela saía carimbada
   * no tamanho de 12 pt em qualquer documento (achado 0402).
   */
  fontSize?: number;
}) {
  const mathStyle = mathPdfInlineStyle(fontSize);
  return (
    <>
      {content.map((run, i) => {
        if (run.type === "inlineMath") {
          return (
            <Text key={i} style={mathStyle}>
              {mathToPdfText(run.latex, run.alt, fontSize)}
            </Text>
          );
        }
        return (
          <Text key={i} style={marksToPdfStyle(run.marks, run.color, run.fontSize)}>
            {run.text}
          </Text>
        );
      })}
    </>
  );
}

export default PdfRichText;
