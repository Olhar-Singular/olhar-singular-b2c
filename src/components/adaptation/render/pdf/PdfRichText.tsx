/**
 * PdfRichText — PDF analogue of RichTextView. Projects a canonical `RichText`
 * array to react-pdf <Text> runs: text runs apply mark styles (bold/italic/
 * underline/strike) and an allowlisted color; inlineMath runs render as their
 * LaTeX source in a monospace style (v1 — see mathToPdfText).
 */

import { Text } from "@react-pdf/renderer";
import type { RichText } from "@/lib/adaptation/canonical/schema";
import { mathToPdfText, MATH_PDF_STYLE } from "./mathToPdfText";
import { marksToPdfStyle } from "./richTextPdf";

export function PdfRichText({ content }: { content: RichText }) {
  return (
    <>
      {content.map((run, i) => {
        if (run.type === "inlineMath") {
          return (
            <Text key={i} style={MATH_PDF_STYLE}>
              {mathToPdfText(run.latex)}
            </Text>
          );
        }
        return (
          <Text key={i} style={marksToPdfStyle(run.marks, run.color)}>
            {run.text}
          </Text>
        );
      })}
    </>
  );
}

export default PdfRichText;
