/**
 * BlockInserter — the "+" overlay layer over the canonical editor (plano §6.4,
 * Fase 5a). Replaces the old top `CanonicalToolbar`.
 *
 * For every gap between top-level blocks it renders a thin hover zone with a "+"
 * menu (`BlockInserterMenu`). Positions come from `editor.view.coordsAtPos`,
 * measured relative to the overlay layer itself, so the affordances track the
 * blocks without being part of the document. The layer is `pointer-events-none`
 * and absolutely positioned — it never shifts the sheet layout nor intercepts
 * typing; only the thin zones opt back into pointer events. Positions recompute
 * on every editor transaction and on scroll/resize.
 *
 * The component must be placed inside a `position: relative` ancestor that wraps
 * the `EditorContent` (so `inset-0` lines the layer up with the editor DOM).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import { topLevelGaps, type BlockGap } from "./topLevelGaps";
import { runInserterAction } from "./insertAtPos";
import { BlockInserterMenu } from "./BlockInserterMenu";
import type { InserterItem } from "./blockInserterItems";

type GapPosition = { gap: BlockGap; top: number };

export function BlockInserter({ editor }: { editor: Editor }) {
  const layerRef = useRef<HTMLDivElement>(null);
  const [positions, setPositions] = useState<GapPosition[]>([]);

  const recompute = useCallback(() => {
    const layer = layerRef.current;
    /* v8 ignore next -- layer ref is always set after mount */
    if (!layer) return;
    const base = layer.getBoundingClientRect().top;
    const next = topLevelGaps(editor.state.doc).map((gap) => ({
      gap,
      top: editor.view.coordsAtPos(gap.pos).top - base,
    }));
    setPositions(next);
  }, [editor]);

  useEffect(() => {
    recompute();
    editor.on("transaction", recompute);
    window.addEventListener("scroll", recompute, true);
    window.addEventListener("resize", recompute);
    return () => {
      editor.off("transaction", recompute);
      window.removeEventListener("scroll", recompute, true);
      window.removeEventListener("resize", recompute);
    };
  }, [editor, recompute]);

  const handlePick = (gap: BlockGap, item: InserterItem) => {
    runInserterAction(editor, gap, item.action);
  };

  return (
    <div ref={layerRef} className="pointer-events-none absolute inset-0">
      {positions.map(({ gap, top }) => (
        <div
          key={gap.index}
          className="group pointer-events-auto absolute inset-x-0 flex h-4 -translate-y-1/2 items-center gap-1"
          style={{ top }}
        >
          <span className="h-px flex-1 bg-surface-accent opacity-0 transition-opacity group-hover:opacity-40" />
          <span className="opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
            <BlockInserterMenu gap={gap} onPick={(item) => handlePick(gap, item)} />
          </span>
          <span className="h-px flex-1 bg-surface-accent opacity-0 transition-opacity group-hover:opacity-40" />
        </div>
      ))}
    </div>
  );
}

export default BlockInserter;
