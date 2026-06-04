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
import { questionNumbers } from "./questionNumbering";

export function CanonicalRenderer({
  document,
  selectedId,
}: {
  document: CanonicalDocument;
  /** Highlights the matching block in the preview (styling step). */
  selectedId?: string;
}) {
  const numbers = questionNumbers(document.blocks);
  return (
    <div data-testid="canonical-renderer" className="space-y-3">
      {document.blocks.map((block, i) => (
        <BlockView key={block.id} block={block} number={numbers[i]} selectedId={selectedId} />
      ))}
    </div>
  );
}

export default CanonicalRenderer;
