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
      className="my-3 text-center"
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
