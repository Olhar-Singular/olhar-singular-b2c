/**
 * DividerView — read-only render of a canonical divider block.
 */

import type { Block } from "@/lib/adaptation/canonical/schema";
import { nodeStyleToCss } from "../style";

type DividerBlock = Extract<Block, { type: "divider" }>;

export function DividerView({ block }: { block: DividerBlock }) {
  return <hr data-testid="divider" className="my-4 border-border" style={nodeStyleToCss(block.style)} />;
}

export default DividerView;
