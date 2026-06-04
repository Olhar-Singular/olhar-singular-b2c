/**
 * ScaffoldingView — read-only render of a canonical scaffolding block: an
 * ordered list of plain-text support steps shown in a highlighted callout.
 */

import type { Block } from "@/lib/adaptation/canonical/schema";
import { nodeStyleToCss } from "../style";

type ScaffoldingBlock = Extract<Block, { type: "scaffolding" }>;

export function ScaffoldingView({ block }: { block: ScaffoldingBlock }) {
  return (
    <div
      data-testid="scaffolding"
      className="my-3 rounded-md border border-border bg-muted/40 p-3"
      style={nodeStyleToCss(block.style)}
    >
      <ol className="list-decimal space-y-1 pl-5">
        {block.items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ol>
    </div>
  );
}

export default ScaffoldingView;
