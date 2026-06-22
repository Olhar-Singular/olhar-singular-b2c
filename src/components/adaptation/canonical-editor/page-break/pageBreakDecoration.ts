/**
 * Page-break marker for the "Revisar" surface (plano §6.6 / Fase 5b).
 *
 * A ProseMirror plugin paints a widget decoration before every top-level block
 * that carries `style.pageBreakBefore` — a dashed "QUEBRA DE PÁGINA" rule with a
 * hover/focus remove control. The marker lives on the folha as chrome only: it
 * is NOT a document node (it never round-trips) — it is pure decoration over the
 * existing `style.pageBreakBefore` field. Inserting a break stays the inserter's
 * job (Fase 5a); the PDF already honours the field (`PdfBlock` → `<View break>`).
 *
 * The first top-level block is skipped on purpose: a break "before page 1" is a
 * no-op in print, so showing a marker there would be a lying element (D2).
 *
 * All decision logic is pure and unit-testable:
 *  - `pageBreakSpecs` — which positions get a marker.
 *  - `unsetPageBreakById` — a ProseMirror command removing the flag by stable id
 *    (id, not pos, so it survives position shifts between build and click).
 *  - `buildPageBreakDecorations` — the DecorationSet.
 */

import { Plugin, PluginKey, type EditorState, type Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import type { Node as PMNode } from "@tiptap/pm/model";
import { Extension } from "@tiptap/core";
import type { NodeStyle } from "@/lib/adaptation/canonical/schema";

/** Uppercase label rendered on the dashed marker. */
export const PAGE_BREAK_LABEL = "QUEBRA DE PÁGINA";

export interface PageBreakSpec {
  /** Position right before the flagged block (where the widget is placed). */
  pos: number;
  /** Stable block id — the remove control targets this, not the position. */
  id: string;
}

/**
 * Positions + ids of the top-level blocks that should show a page-break marker:
 * every block flagged with `style.pageBreakBefore`, except the first child.
 */
export function pageBreakSpecs(doc: PMNode): PageBreakSpec[] {
  const specs: PageBreakSpec[] = [];
  doc.forEach((node, offset, index) => {
    if (index === 0) return;
    const style = node.attrs.style as NodeStyle | null | undefined;
    if (style?.pageBreakBefore === true && typeof node.attrs.id === "string") {
      specs.push({ pos: offset, id: node.attrs.id });
    }
  });
  return specs;
}

type Command = (state: EditorState, dispatch?: (tr: Transaction) => void) => boolean;

/**
 * ProseMirror command that clears `pageBreakBefore` on the top-level block with
 * the given id. Drops the whole `style` attr when nothing else remains, keeping
 * the canonical round-trip clean (an empty `style` becomes `null` → omitted).
 */
export function unsetPageBreakById(id: string): Command {
  return (state, dispatch) => {
    let targetPos: number | null = null;
    let targetStyle: NodeStyle | null = null;
    state.doc.forEach((node, offset) => {
      if (node.attrs.id === id) {
        targetPos = offset;
        targetStyle = (node.attrs.style as NodeStyle | null) ?? null;
      }
    });
    if (targetPos === null || !targetStyle?.pageBreakBefore) return false;
    if (dispatch) {
      const { pageBreakBefore: _drop, ...rest } = targetStyle;
      const next = Object.keys(rest).length > 0 ? rest : null;
      dispatch(state.tr.setNodeAttribute(targetPos, "style", next));
    }
    return true;
  };
}

/** Build the dashed marker DOM, wiring its remove control to `onRemove`. */
function markerElement(onRemove: () => void): HTMLElement {
  const root = document.createElement("div");
  root.className =
    "adaptar-page-break group relative my-3 flex select-none items-center gap-2";
  root.setAttribute("contenteditable", "false");

  const lineLeft = document.createElement("span");
  lineLeft.className = "h-px flex-1 border-t border-dashed border-surface-line-2";

  const label = document.createElement("span");
  label.className =
    "text-[10px] font-medium uppercase tracking-wider text-surface-ink-faint";
  label.textContent = PAGE_BREAK_LABEL;

  const remove = document.createElement("button");
  remove.type = "button";
  remove.setAttribute("aria-label", "Remover quebra de página");
  remove.className =
    "rounded p-0.5 leading-none text-surface-ink-faint opacity-0 transition-opacity " +
    "hover:text-surface-ink group-hover:opacity-100 focus-visible:opacity-100";
  remove.textContent = "×";
  remove.addEventListener("click", (e) => {
    e.preventDefault();
    onRemove();
  });

  const lineRight = document.createElement("span");
  lineRight.className = "h-px flex-1 border-t border-dashed border-surface-line-2";

  root.append(lineLeft, label, remove, lineRight);
  return root;
}

/** Decorations marking every flagged top-level block on the folha. */
export function buildPageBreakDecorations(state: EditorState): DecorationSet {
  const specs = pageBreakSpecs(state.doc);
  if (specs.length === 0) return DecorationSet.empty;
  return DecorationSet.create(
    state.doc,
    specs.map(({ pos, id }) =>
      Decoration.widget(
        pos,
        (view: EditorView) =>
          markerElement(() => unsetPageBreakById(id)(view.state, view.dispatch)),
        { side: -1, key: `pagebreak-${id}` },
      ),
    ),
  );
}

const pageBreakKey = new PluginKey("adaptar-page-break");

/**
 * Tiptap extension wrapping the marker plugin. Added to the editor via
 * `useCanonicalEditor`'s `extraExtensions` from the Revisar surface only.
 */
export const PageBreakMarker = Extension.create({
  name: "pageBreakMarker",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: pageBreakKey,
        props: {
          decorations(state) {
            return buildPageBreakDecorations(state);
          },
        },
      }),
    ];
  },
});
