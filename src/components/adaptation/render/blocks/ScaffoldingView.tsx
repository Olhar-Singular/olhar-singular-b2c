/**
 * ScaffoldingView — read-only render of a canonical scaffolding block: an
 * ordered list of plain-text support steps shown in a highlighted callout.
 *
 * As medidas da caixa (recuo interno, margem vertical e recuo do passo) vêm de
 * `pageTokens` para o PDF imprimir a mesma coluna que esta tela mostra
 * (achado 0124).
 */

import type { Block } from "@/lib/adaptation/canonical/schema";
import { nodeStyleToCss } from "../style";
import {
  SCAFFOLDING_PADDING_PX,
  SCAFFOLDING_MARGIN_Y_PX,
  SCAFFOLDING_STEP_INDENT_PX,
} from "../pageTokens";

type ScaffoldingBlock = Extract<Block, { type: "scaffolding" }>;

export function ScaffoldingView({ block }: { block: ScaffoldingBlock }) {
  return (
    <div
      data-testid="scaffolding"
      className="rounded-md border border-surface-chrome-line bg-surface-mesa/40 text-surface-ink"
      style={{
        padding: `${SCAFFOLDING_PADDING_PX}px`,
        marginTop: `${SCAFFOLDING_MARGIN_Y_PX}px`,
        marginBottom: `${SCAFFOLDING_MARGIN_Y_PX}px`,
        ...nodeStyleToCss(block.style),
      }}
    >
      <ol className="list-decimal space-y-1" style={{ paddingLeft: `${SCAFFOLDING_STEP_INDENT_PX}px` }}>
        {block.items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ol>
    </div>
  );
}

export default ScaffoldingView;
