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
import type { CanonicalDocument } from "@/lib/adaptation/canonical/schema";
import { BlockView } from "./BlockView";

export function CanonicalRenderer({ document }: { document: CanonicalDocument }) {
  return (
    <div data-testid="canonical-renderer" className="space-y-3">
      {document.blocks.map((block) => (
        <BlockView key={block.id} block={block} />
      ))}
    </div>
  );
}

export default CanonicalRenderer;
