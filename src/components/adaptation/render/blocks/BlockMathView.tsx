/**
 * BlockMathView — read-only render of a canonical blockMath node. Rendered in
 * KaTeX display mode with MathML output and an aria-label (the `alt` when
 * present, else the latex) for screen-reader accessibility.
 */

import type { Block } from "@/lib/adaptation/canonical/schema";
import { renderLatexToHtml } from "@/lib/domain/latexRenderer";
import { nodeStyleToCss } from "../style";

type BlockMathBlock = Extract<Block, { type: "blockMath" }>;

export function BlockMathView({ block }: { block: BlockMathBlock }) {
  return (
    <div
      data-testid="block-math"
      role="math"
      aria-label={block.alt ?? block.latex}
      /* Sem margem própria: o vão vem do `rowGap: var(--doc-block-spacing)` do
         `CanonicalRenderer`. O `my-3` daqui era SOMADO a esse gap (gap de flex
         não colapsa com margem), e por ser item de flex o bloco ainda segurava
         dentro de si o `margin: 1em 0` do `.katex-display` em vez de deixá-lo
         colapsar como faz a folha do Revisar: 32 px de altura e 12 px de vão a
         mais que o papel (achado 0189). */
      className="text-center"
      style={nodeStyleToCss(block.style)}
    >
      {/* Achado 0438: o subtree do KaTeX é decoração e sai do texto do
          documento; a descrição entra no lugar dele, como texto. */}
      <span className="sr-only">{block.alt ?? block.latex}</span>
      <div
        aria-hidden="true"
        dangerouslySetInnerHTML={{ __html: renderLatexToHtml(block.latex, true) }}
      />
    </div>
  );
}

export default BlockMathView;
