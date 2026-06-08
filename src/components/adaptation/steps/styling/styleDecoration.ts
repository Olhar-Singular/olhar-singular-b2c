/**
 * "Current block" highlight for the Estilo step.
 *
 * A ProseMirror plugin paints a node decoration (a CSS class) on the top-level
 * block holding the selection, so the block being styled is obviously — but
 * minimally — highlighted (soft ring + left accent + subtle bg, see the
 * `.${CURRENT_BLOCK_CLASS}` rule in index.css). This replaces the old
 * `ring-2 ring-primary` on the read-only renderer.
 *
 * The decision — WHICH node range gets the decoration — is the pure
 * `currentBlockDecorationSpec`, unit-tested against the real schema. The plugin
 * is a thin wrapper that rebuilds the set whenever the doc or selection changes.
 * All position reads are defensive (guarded by `currentTopLevelBlock`).
 */

import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { Extension } from "@tiptap/core";
import { currentTopLevelBlock } from "./currentBlock";

/** CSS class applied to the current top-level block node. */
export const CURRENT_BLOCK_CLASS = "adaptar-current-block";

export interface DecorationSpec {
  from: number;
  to: number;
  class: string;
}

/**
 * Range + class for the decoration on the current top-level block, or null when
 * there is no styleable current block.
 */
export function currentBlockDecorationSpec(state: EditorState): DecorationSpec | null {
  const current = currentTopLevelBlock(state);
  if (!current) return null;
  const node = state.doc.nodeAt(current.pos);
  /* v8 ignore next -- currentTopLevelBlock always yields a resolvable node pos */
  if (!node) return null;
  return { from: current.pos, to: current.pos + node.nodeSize, class: CURRENT_BLOCK_CLASS };
}

/** Build the DecorationSet highlighting the current top-level block. */
export function buildCurrentBlockDecorations(state: EditorState): DecorationSet {
  const spec = currentBlockDecorationSpec(state);
  if (!spec) return DecorationSet.empty;
  return DecorationSet.create(state.doc, [
    Decoration.node(spec.from, spec.to, { class: spec.class }),
  ]);
}

const currentBlockKey = new PluginKey("adaptar-current-block");

/**
 * Tiptap extension wrapping the highlight plugin. Added to the editor only in
 * style mode (the Content step does not include it).
 */
export const CurrentBlockHighlight = Extension.create({
  name: "currentBlockHighlight",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: currentBlockKey,
        props: {
          decorations(state) {
            return buildCurrentBlockDecorations(state);
          },
        },
      }),
    ];
  },
});
