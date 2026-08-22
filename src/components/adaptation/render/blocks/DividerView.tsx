/**
 * DividerView — read-only render of a canonical divider block.
 */

import type { Block } from "@/lib/adaptation/canonical/schema";
import { nodeStyleToCss } from "../style";
import { RULE_COLOR, RULE_WIDTH_PX } from "../pageTokens";

type DividerBlock = Extract<Block, { type: "divider" }>;

export function DividerView({ block }: { block: DividerBlock }) {
  return (
    <hr
      data-testid="divider"
      className="my-4"
      /* Cor pelo token de página (`RULE_COLOR`), não pelo `border-border` do
         chrome do app: aquele token dava 1,33:1 sobre o papel e a divisória
         sumia na impressão, além de divergir do traço do PDF (achado 0148). */
      style={{
        borderColor: RULE_COLOR,
        borderTopWidth: `${RULE_WIDTH_PX}px`,
        ...nodeStyleToCss(block.style),
      }}
    />
  );
}

export default DividerView;
