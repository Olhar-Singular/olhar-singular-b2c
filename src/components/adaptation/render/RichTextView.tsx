/**
 * RichTextView — renders a canonical `RichText` array read-only.
 *
 * Text runs apply mark classes (bold/italic/underline/strike) and an
 * allowlisted color; inlineMath runs render via KaTeX with MathML output for
 * screen-reader accessibility. All mapping logic lives in the pure
 * `richTextMarks` helper so it stays unit-tested.
 */

import { Fragment } from "react";

import type { RichText } from "@/lib/adaptation/canonical/schema";
import { renderLatexToHtml } from "@/lib/domain/latexRenderer";
import { marksToClassName, textRunStyle } from "./richTextMarks";

/**
 * Achado 0621: the read-only sheet sits in `white-space: normal`, which
 * collapses a "\n" inside a run into a space. Revisar, PDF and Word all keep
 * the break, so emit an explicit <br>. A <br> (instead of `pre-line` on the
 * span) leaves space handling untouched (achado 0453) and cannot override a
 * parent's `nowrap`.
 */
function textWithBreaks(text: string) {
  const lines = text.split("\n");
  if (lines.length === 1) return text;
  return lines.map((line, j) => (
    <Fragment key={j}>
      {j > 0 && <br />}
      {line}
    </Fragment>
  ));
}

export function RichTextView({ content }: { content: RichText }) {
  return (
    <>
      {content.map((run, i) => {
        if (run.type === "inlineMath") {
          return (
            <span key={i} data-testid="inline-math" role="math" aria-label={run.alt ?? run.latex}>
              {/* Achado 0438: o subtree do KaTeX é decoração e sai do texto do
                  documento; a descrição entra no lugar dele, como texto. */}
              <span className="sr-only">{run.alt ?? run.latex}</span>
              <span
                aria-hidden="true"
                dangerouslySetInnerHTML={{ __html: renderLatexToHtml(run.latex) }}
              />
            </span>
          );
        }
        const className = marksToClassName(run.marks);
        return (
          <span key={i} className={className || undefined} style={textRunStyle(run.color, run.fontSize)}>
            {textWithBreaks(run.text)}
          </span>
        );
      })}
    </>
  );
}

export default RichTextView;
