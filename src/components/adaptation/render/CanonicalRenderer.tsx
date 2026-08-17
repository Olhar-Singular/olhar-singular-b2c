/**
 * CanonicalRenderer — the single read-only renderer that projects a
 * `CanonicalDocument` to React.
 *
 * This is the one visual contract used by both the live styling preview and the
 * read-only viewer (history / shared pages). It renders straight from the typed
 * canonical model — no DSL parsing, no heuristic re-derivation of question type
 * or correct answers. The future PDF mapper (M7) mirrors this projection.
 */

import "katex/dist/katex.min.css";
import { Fragment } from "react";
import type { CanonicalDocument } from "@/lib/adaptation/canonical/schema";
import { BlockView } from "./BlockView";
import { questionNumbers } from "./questionNumbering";
import { perQuestionBreakFlags } from "./perQuestionBreaks";
import { PageBreakMark } from "./PageBreakMark";

export function CanonicalRenderer({
  document,
  selectedId,
  pageBreakPerQuestion = false,
}: {
  document: CanonicalDocument;
  /** Highlights the matching block in the preview (styling step). */
  selectedId?: string;
  /**
   * Espelha o switch "Quebra de página por questão" do Exportar: desenha a régua
   * tracejada onde o PDF vai virar de página. Sem isso o switch mudava o arquivo
   * (2 páginas) e não mudava nada na prévia (achado 0110).
   */
  pageBreakPerQuestion?: boolean;
}) {
  const numbers = questionNumbers(document.blocks);
  const breaks = perQuestionBreakFlags(document.blocks);
  // `break-words` keeps a long token without spaces (URL, OCR artifact) inside the
  // A4 sheet, matching what the editor gets from prosemirror-view and what
  // @react-pdf/renderer does on export. Without it the export preview clips it.
  return (
    <div data-testid="canonical-renderer" className="space-y-3 break-words">
      {document.blocks.map((block, i) => (
        <Fragment key={block.id}>
          {pageBreakPerQuestion && breaks[i] && <PageBreakMark />}
          <BlockView block={block} number={numbers[i]} selectedId={selectedId} />
        </Fragment>
      ))}
    </div>
  );
}

export default CanonicalRenderer;
