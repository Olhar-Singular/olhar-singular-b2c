/**
 * RichTextView — renders a canonical `RichText` array read-only.
 *
 * Text runs apply mark classes (bold/italic/underline/strike) and an
 * allowlisted color; inlineMath runs render via KaTeX with MathML output for
 * screen-reader accessibility. All mapping logic lives in the pure
 * `richTextMarks` helper so it stays unit-tested.
 */

import type { RichText } from "@/lib/adaptation/canonical/schema";
import { renderLatexToHtml } from "@/lib/domain/latexRenderer";
import { marksToClassName, textRunStyle } from "./richTextMarks";

export function RichTextView({ content }: { content: RichText }) {
  return (
    <>
      {content.map((run, i) => {
        if (run.type === "inlineMath") {
          return (
            <span
              key={i}
              data-testid="inline-math"
              role="math"
              aria-label={run.alt ?? run.latex}
              dangerouslySetInnerHTML={{ __html: renderLatexToHtml(run.latex) }}
            />
          );
        }
        const className = marksToClassName(run.marks);
        return (
          <span key={i} className={className || undefined} style={textRunStyle(run.color, run.fontSize)}>
            {run.text}
          </span>
        );
      })}
    </>
  );
}

export default RichTextView;
