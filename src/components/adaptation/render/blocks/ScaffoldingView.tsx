/**
 * ScaffoldingView — read-only render of a canonical scaffolding block: an
 * ordered list of plain-text support steps shown in a highlighted callout.
 *
 * As medidas da caixa (recuo interno, margem vertical e recuo do passo) vêm de
 * `pageTokens` para o PDF imprimir a mesma coluna que esta tela mostra
 * (achado 0124), e a cor do fundo e da borda também (achado 0149). O rótulo do
 * topo vem do mesmo lugar (`SCAFFOLDING_LABEL`, achado 0155): sem ele a caixa
 * chega ao aluno como um retângulo bege anônimo.
 */

import type { Block } from "@/lib/adaptation/canonical/schema";
import { nodeStyleToCss } from "../style";
import {
  SCAFFOLDING_PADDING_PX,
  SCAFFOLDING_MARGIN_Y_PX,
  SCAFFOLDING_STEP_INDENT_PX,
  SCAFFOLDING_BG,
  SCAFFOLDING_BORDER,
  SCAFFOLDING_LABEL,
  SCAFFOLDING_RADIUS_PX,
  RULE_WIDTH_PX,
} from "../pageTokens";

type ScaffoldingBlock = Extract<Block, { type: "scaffolding" }>;

export function ScaffoldingView({ block }: { block: ScaffoldingBlock }) {
  return (
    <div
      data-testid="scaffolding"
      className="border text-surface-ink"
      style={{
        backgroundColor: SCAFFOLDING_BG,
        borderColor: SCAFFOLDING_BORDER,
        borderWidth: `${RULE_WIDTH_PX}px`,
        borderRadius: `${SCAFFOLDING_RADIUS_PX}px`,
        padding: `${SCAFFOLDING_PADDING_PX}px`,
        marginTop: `${SCAFFOLDING_MARGIN_Y_PX}px`,
        marginBottom: `${SCAFFOLDING_MARGIN_Y_PX}px`,
        ...nodeStyleToCss(block.style),
      }}
    >
      <p
        data-testid="scaffolding-label"
        className="mb-2 font-semibold uppercase tracking-wide"
        style={{ fontSize: "var(--doc-fs-caption, 0.833em)" }}
      >
        {SCAFFOLDING_LABEL}
      </p>
      <ol className="list-decimal space-y-1" style={{ paddingLeft: `${SCAFFOLDING_STEP_INDENT_PX}px` }}>
        {block.items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ol>
    </div>
  );
}

export default ScaffoldingView;
