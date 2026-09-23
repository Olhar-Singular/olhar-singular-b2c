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
import { BASE_BLOCK_SPACING_PX } from "./pageTokens";

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
  // A4 sheet, matching what the editor gets from prosemirror-view. The PDF wraps
  // the same token via the hyphenation callback in pdf/registerFonts.ts (achado
  // 0115) — same content, except textkit marks its break with a "-".
  // Without it the export preview clips it.
  //
  // O vão ENTRE blocos vem de `--doc-block-spacing`, o token que a folha emite a
  // partir de `pageStyle.blockSpacing` (achado 0114). Era `space-y-3` fixo: o
  // controle "Espaçamento" do popover Formato mexia na folha do Revisar e no PDF
  // e não mexia na prévia, que ainda saía 12px onde o papel imprime 16px. Fora de
  // uma folha (visualizador de histórico) o fallback é o default canônico.
  return (
    <div
      data-testid="canonical-renderer"
      className="flex flex-col break-words"
      style={{ rowGap: `var(--doc-block-spacing, ${BASE_BLOCK_SPACING_PX}px)` }}
    >
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
